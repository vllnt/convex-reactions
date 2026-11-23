/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api.js";
import { SEED_SCAN_LIMIT } from "./tally.js";
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
    expect(await t.run((ctx) => ctx.db.query("reactionCounts").collect())).toEqual([]);
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

describe("reactionCounts bounded seeding", () => {
  test("a resource with more legacy edges than the seed limit keeps counting from edges", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      for (let i = 0; i <= SEED_SCAN_LIMIT; i++) {
        await ctx.db.insert("reactions", edge(`u${String(i)}`, "like"));
      }
    });
    await t.mutation(api.mutations.react, { authorRef: "new", resourceRef: "post1", kind: "like" });
    await t.mutation(api.mutations.unreact, { authorRef: "u0", resourceRef: "post1", kind: "like" });
    expect(await t.run((ctx) => ctx.db.query("reactionCounts").collect())).toEqual([]);
    expect(await t.query(api.queries.counts, { resourceRef: "post1" })).toEqual([
      { kind: "like", count: SEED_SCAN_LIMIT + 1 },
    ]);
  });

  test("removing the last edge of a kind deletes its tally row", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(api.mutations.react, { authorRef: "u1", resourceRef: "post1", kind: "like" });
    await t.mutation(api.mutations.react, { authorRef: "u1", resourceRef: "post1", kind: "love" });
    await t.mutation(api.mutations.unreact, { authorRef: "u1", resourceRef: "post1", kind: "like" });
    const tallies = await t.run((ctx) => ctx.db.query("reactionCounts").collect());
    expect(tallies.map(({ kind, count }) => ({ kind, count }))).toEqual([{ kind: "love", count: 1 }]);
    await t.mutation(api.mutations.react, { authorRef: "u1", resourceRef: "post1", kind: "love" });
    expect(await t.run((ctx) => ctx.db.query("reactionCounts").collect())).toEqual([]);
    await t.mutation(api.mutations.react, { authorRef: "u2", resourceRef: "post1", kind: "wow" });
    expect(await t.query(api.queries.counts, { resourceRef: "post1" })).toEqual([
      { kind: "wow", count: 1 },
    ]);
  });

  test("seeding on removing the only legacy edge of a kind writes no zero tally", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await ctx.db.insert("reactions", edge("u1", "like"));
      await ctx.db.insert("reactions", edge("u2", "love"));
    });
    await t.mutation(api.mutations.unreact, { authorRef: "u1", resourceRef: "post1", kind: "like" });
    const tallies = await t.run((ctx) => ctx.db.query("reactionCounts").collect());
    expect(tallies.map(({ kind, count }) => ({ kind, count }))).toEqual([{ kind: "love", count: 1 }]);
  });
});
