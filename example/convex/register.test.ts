import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api } from "./_generated/api.js";
import schema from "./schema.js";
import { register } from "../../src/test.js";

const modules = import.meta.glob("./**/*.ts");

/**
 * `register` must accept a `convexTest` instance built from the HOST schema
 * (here with its own `bookmarks` table), not only the component's schema. This
 * file is type-checked by `pnpm typecheck:ci`, so a too-narrow `register`
 * signature fails CI with TS2345 before any test runs.
 */
test("register mounts on a host-schema convexTest under the default and a named mount", async () => {
  const t = convexTest(schema, modules);
  register(t);
  register(t, "votes");

  await t.run(async (ctx) => {
    await ctx.db.insert("bookmarks", { resourceRef: "post1", label: "host" });
  });
  await t.mutation(api.example.react, {
    authorRef: "u1",
    resourceRef: "post1",
    kind: "like",
  });
  await t.mutation(api.example.voteUp, { authorRef: "u1", resourceRef: "post1" });

  expect(await t.query(api.example.getBookmark, { resourceRef: "post1" })).toBe(
    "host",
  );
  expect(await t.query(api.example.counts, { resourceRef: "post1" })).toEqual([
    { kind: "like", count: 1 },
  ]);
  expect(await t.query(api.example.voteCounts, { resourceRef: "post1" })).toEqual(
    [{ kind: "up", count: 1 }],
  );
});
