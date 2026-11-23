/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api.js";
import schema from "./schema.js";

const modules = import.meta.glob("./**/*.ts");

function edge(authorRef: string, kind: string, resourceRef = "post1") {
  return { authorRef, resourceRef, kind, createdAt: 0 };
}

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
