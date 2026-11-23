import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api.js";
import schema from "./schema.js";

const modules = import.meta.glob("./**/*.ts");

function edge(authorRef: string, kind: string, resourceRef = "post1") {
  return { authorRef, resourceRef, kind, createdAt: 0 };
}

async function tallies(t: ReturnType<typeof convexTest>) {
  const rows = await t.run((ctx) => ctx.db.query("reactionCounts").collect());
  return rows.map(({ resourceRef, kind, count }) => ({ resourceRef, kind, count }));
}

describe("reactionCounts tallies", () => {
  test("a resource created after upgrade is tallied and counted from tallies", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(api.mutations.react, { authorRef: "u1", resourceRef: "post1", kind: "like" });
    await t.mutation(api.mutations.react, { authorRef: "u2", resourceRef: "post1", kind: "like" });
    await t.mutation(api.mutations.react, { authorRef: "u1", resourceRef: "post1", kind: "love" });
    expect(await tallies(t)).toEqual([
      { resourceRef: "post1", kind: "like", count: 2 },
      { resourceRef: "post1", kind: "love", count: 1 },
    ]);
    await t.run(async (ctx) => {
      await ctx.db.insert("reactions", edge("u9", "like"));
    });
    expect(await t.query(api.queries.counts, { resourceRef: "post1" })).toEqual([
      { kind: "like", count: 2 },
      { kind: "love", count: 1 },
    ]);
  });

  test("a legacy resource is never scanned by writes and keeps counting from edges", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await ctx.db.insert("reactions", edge("u1", "like"));
      await ctx.db.insert("reactions", edge("u2", "like"));
      await ctx.db.insert("reactions", edge("u3", "love"));
    });
    await t.mutation(api.mutations.react, { authorRef: "u4", resourceRef: "post1", kind: "wow" });
    await t.mutation(api.mutations.unreact, { authorRef: "u1", resourceRef: "post1", kind: "like" });
    await t.mutation(api.mutations.react, { authorRef: "u3", resourceRef: "post1", kind: "love" });
    expect(await tallies(t)).toEqual([]);
    expect(await t.query(api.queries.counts, { resourceRef: "post1" })).toEqual([
      { kind: "like", count: 1 },
      { kind: "wow", count: 1 },
    ]);
  });

  test("a legacy resource emptied of edges starts being tallied", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await ctx.db.insert("reactions", edge("u1", "like"));
    });
    await t.mutation(api.mutations.unreact, { authorRef: "u1", resourceRef: "post1", kind: "like" });
    await t.mutation(api.mutations.react, { authorRef: "u2", resourceRef: "post1", kind: "love" });
    expect(await tallies(t)).toEqual([{ resourceRef: "post1", kind: "love", count: 1 }]);
  });

  test("removing the last edge of a kind deletes its tally row", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(api.mutations.react, { authorRef: "u1", resourceRef: "post1", kind: "like" });
    await t.mutation(api.mutations.react, { authorRef: "u1", resourceRef: "post1", kind: "love" });
    await t.mutation(api.mutations.unreact, { authorRef: "u1", resourceRef: "post1", kind: "like" });
    expect(await tallies(t)).toEqual([{ resourceRef: "post1", kind: "love", count: 1 }]);
    await t.mutation(api.mutations.react, { authorRef: "u1", resourceRef: "post1", kind: "love" });
    expect(await tallies(t)).toEqual([]);
    expect(await t.query(api.queries.counts, { resourceRef: "post1" })).toEqual([]);
  });

  test("a no-op unreact leaves tallies untouched", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(api.mutations.react, { authorRef: "u1", resourceRef: "post1", kind: "like" });
    expect(
      await t.mutation(api.mutations.unreact, { authorRef: "u2", resourceRef: "post1", kind: "like" }),
    ).toBe(false);
    expect(await tallies(t)).toEqual([{ resourceRef: "post1", kind: "like", count: 1 }]);
  });
});
