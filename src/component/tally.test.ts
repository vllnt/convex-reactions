/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api.js";
import schema from "./schema.js";

const modules = import.meta.glob("./**/*.ts");

function edge(authorRef: string, kind: string, resourceRef = "post1") {
  return { authorRef, resourceRef, kind, createdAt: 0 };
}

describe("reactionCounts tallies", () => {
  test("counts a resource without tallies from its edges, then seeds tallies on the next write", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await ctx.db.insert("reactions", edge("u1", "like"));
      await ctx.db.insert("reactions", edge("u2", "like"));
      await ctx.db.insert("reactions", edge("u3", "love"));
      await ctx.db.insert("reactions", edge("u1", "like", "post2"));
    });
    expect(await t.query(api.queries.counts, { resourceRef: "post1" })).toEqual([
      { kind: "like", count: 2 },
      { kind: "love", count: 1 },
    ]);
    expect(await t.run((ctx) => ctx.db.query("reactionCounts").collect())).toEqual([]);

    await t.mutation(api.mutations.react, { authorRef: "u4", resourceRef: "post1", kind: "wow" });

    const tallies = await t.run((ctx) => ctx.db.query("reactionCounts").collect());
    expect(
      tallies.map(({ resourceRef, kind, count }) => ({ resourceRef, kind, count })),
    ).toEqual([
      { resourceRef: "post1", kind: "like", count: 2 },
      { resourceRef: "post1", kind: "love", count: 1 },
      { resourceRef: "post1", kind: "wow", count: 1 },
    ]);
    expect(await t.query(api.queries.counts, { resourceRef: "post1" })).toEqual([
      { kind: "like", count: 2 },
      { kind: "love", count: 1 },
      { kind: "wow", count: 1 },
    ]);
  });

  test("seeding on a removal counts the removed edge once", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await ctx.db.insert("reactions", edge("u1", "like"));
      await ctx.db.insert("reactions", edge("u2", "like"));
    });
    expect(
      await t.mutation(api.mutations.unreact, { authorRef: "u1", resourceRef: "post1", kind: "like" }),
    ).toBe(true);
    expect(await t.query(api.queries.counts, { resourceRef: "post1" })).toEqual([
      { kind: "like", count: 1 },
    ]);
    await t.mutation(api.mutations.react, { authorRef: "u2", resourceRef: "post1", kind: "like" });
    expect(await t.query(api.queries.counts, { resourceRef: "post1" })).toEqual([]);
    const tallies = await t.run((ctx) => ctx.db.query("reactionCounts").collect());
    expect(tallies.map((row) => row.count)).toEqual([0]);
  });

  test("counts reads one tally row per kind, not the edges", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(api.mutations.react, { authorRef: "u1", resourceRef: "post1", kind: "like" });
    await t.mutation(api.mutations.react, { authorRef: "u2", resourceRef: "post1", kind: "like" });
    await t.mutation(api.mutations.react, { authorRef: "u1", resourceRef: "post1", kind: "love" });
    await t.run(async (ctx) => {
      await ctx.db.insert("reactions", edge("u9", "like"));
    });
    expect(await t.query(api.queries.counts, { resourceRef: "post1" })).toEqual([
      { kind: "like", count: 2 },
      { kind: "love", count: 1 },
    ]);
  });

  test("a no-op unreact leaves tallies untouched", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(api.mutations.react, { authorRef: "u1", resourceRef: "post1", kind: "like" });
    expect(
      await t.mutation(api.mutations.unreact, { authorRef: "u2", resourceRef: "post1", kind: "like" }),
    ).toBe(false);
    const tallies = await t.run((ctx) => ctx.db.query("reactionCounts").collect());
    expect(tallies.map((row) => row.count)).toEqual([1]);
  });
});

describe("edge size limits", () => {
  test("react rejects oversized refs and kinds", async () => {
    const t = convexTest(schema, modules);
    await expect(
      t.mutation(api.mutations.react, { authorRef: "a".repeat(513), resourceRef: "p", kind: "like" }),
    ).rejects.toThrow(/INVALID_REF/);
    await expect(
      t.mutation(api.mutations.react, { authorRef: "a", resourceRef: "p".repeat(513), kind: "like" }),
    ).rejects.toThrow(/INVALID_REF/);
    await expect(
      t.mutation(api.mutations.react, { authorRef: "a", resourceRef: "p", kind: "k".repeat(129) }),
    ).rejects.toThrow(/INVALID_KIND/);
    expect(
      await t.mutation(api.mutations.react, {
        authorRef: "a".repeat(512),
        resourceRef: "p".repeat(512),
        kind: "k".repeat(128),
      }),
    ).toEqual({ reacted: true, action: "added" });
  });

  test("an oversized edge stored before the limit can still be removed", async () => {
    const t = convexTest(schema, modules);
    const big = edge("u1", "k".repeat(200));
    await t.run(async (ctx) => {
      await ctx.db.insert("reactions", big);
      await ctx.db.insert("reactions", edge("u2", big.kind));
    });
    expect(await t.mutation(api.mutations.react, { authorRef: "u1", resourceRef: "post1", kind: big.kind })).toEqual({
      reacted: false,
      action: "removed",
    });
    expect(
      await t.mutation(api.mutations.unreact, { authorRef: "u2", resourceRef: "post1", kind: big.kind }),
    ).toBe(true);
    expect(await t.query(api.queries.counts, { resourceRef: "post1" })).toEqual([]);
  });
});
