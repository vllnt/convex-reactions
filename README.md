# @vllnt/convex-reactions

TypeScript Convex component for emoji reactions, up/down votes and likes on any
resource: toggle a reaction, count per kind, page who reacted.

## For coding agents

Docs for the installed version are in `node_modules/@vllnt/convex-reactions/`:
`docs/API.md`, `llms.txt`, `CHANGELOG.md` and the TypeScript `src/`. Read them
before writing code against this package.

## When to use

- Use it when users toggle a reaction (emoji, like, up/down vote) on a post,
  comment or any other record.
- Use it when you show per-kind counts and whether the current user reacted.
- Use it when you list who reacted with one kind, page by page.
- Do not use it when a reaction carries data (a comment, a star rating, a note):
  store it in your own table with `defineTable`.
- Do not use it when one resource gets a very high rate of reactions: each write
  updates one tally row per resource and kind; use `@convex-dev/sharded-counter`.
- Do not use it when you need to sort or rank resources by their reaction count:
  `counts` reads one resource at a time; use `@convex-dev/aggregate`.

## Install

```bash
pnpm add @vllnt/convex-reactions
```

Peer dependency: `convex@^1.45.0`. `@vllnt/convex-reactions@canary` installs the
newest build from `main`.

## Quick start

```ts
// convex/convex.config.ts
import reactions from "@vllnt/convex-reactions/convex.config";
import { defineApp } from "convex/server";

const app = defineApp();
app.use(reactions);
export default app;
```

```ts
// convex/reactions.ts
import { Reactions } from "@vllnt/convex-reactions";
import { ConvexError, v } from "convex/values";

import { components } from "./_generated/api";
import { mutation, query } from "./_generated/server";

const reactions = new Reactions(components.reactions, {
  allowedKinds: ["like", "love", "laugh"],
});

export const toggle = mutation({
  args: { postId: v.id("posts"), kind: v.string() },
  returns: v.object({
    reacted: v.boolean(),
    action: v.union(v.literal("added"), v.literal("removed")),
  }),
  handler: async (ctx, { postId, kind }) => {
    const user = await ctx.auth.getUserIdentity();
    if (user === null) throw new ConvexError("not signed in");
    return reactions.react(ctx, user.tokenIdentifier, postId, kind);
  },
});

export const counts = query({
  args: { postId: v.id("posts") },
  returns: v.array(v.object({ kind: v.string(), count: v.number() })),
  handler: (ctx, { postId }) => reactions.counts(ctx, postId),
});
```

Run `npx convex dev` once to generate `components.reactions`. The component
never reads auth: the host derives `authorRef` (here the user's
`tokenIdentifier`), decides who may react, and passes the resource id as an
opaque string.

## API

Full reference: [docs/API.md](docs/API.md).

| Export                                                                     | Import from                                    | What it does                                                         |
| -------------------------------------------------------------------------- | ---------------------------------------------- | -------------------------------------------------------------------- |
| [`Reactions`](docs/API.md#reactions)                                       | `@vllnt/convex-reactions`                      | Host client: `new Reactions(components.reactions, { allowedKinds })` |
| [`react(ctx, authorRef, resourceRef, kind)`](docs/API.md#react)            | `Reactions` method, mutation                   | Toggle the edge: add if absent, remove if present; `ReactResult`     |
| [`unreact(ctx, authorRef, resourceRef, kind)`](docs/API.md#unreact)        | `Reactions` method, mutation                   | Remove the edge if present; `true` if one was removed                |
| [`counts(ctx, resourceRef)`](docs/API.md#counts)                           | `Reactions` method, query                      | `{ kind, count }[]` for one resource, sorted by kind                 |
| [`hasReacted(ctx, authorRef, resourceRef, kind)`](docs/API.md#hasreacted)  | `Reactions` method, query                      | Whether the subject holds that edge                                  |
| [`myReactions(ctx, authorRef, resourceRef)`](docs/API.md#myreactions)      | `Reactions` method, query                      | Kinds the subject placed on one resource                             |
| [`reactors(ctx, resourceRef, kind, paginationOpts)`](docs/API.md#reactors) | `Reactions` method, query                      | One page of `ReactionView`, oldest first; `numItems` 1 to 1000       |
| [`ReactionsComponent`](docs/API.md#reactionscomponent)                     | `@vllnt/convex-reactions` (type)               | Type of `components.reactions` the client accepts                    |
| [`ReactionsOptions`](docs/API.md#reactionsoptions)                         | `@vllnt/convex-reactions` (type)               | `{ allowedKinds? }`                                                  |
| [`ReactResult`](docs/API.md#reactresult)                                   | `@vllnt/convex-reactions` (type)               | `{ reacted, action: "added" \| "removed" }`                          |
| [`KindCount`](docs/API.md#kindcount)                                       | `@vllnt/convex-reactions` (type)               | `{ kind, count }`                                                    |
| [`ReactionView`](docs/API.md#reactionview)                                 | `@vllnt/convex-reactions` (type)               | `{ authorRef, resourceRef, kind, createdAt }`                        |
| [`default` (component config)](docs/API.md#convexconfig)                   | `@vllnt/convex-reactions/convex.config`        | Pass to `app.use(...)`                                               |
| [`register`](docs/API.md#register)                                         | `@vllnt/convex-reactions/test`                 | Mount the component in a `convex-test` instance                      |
| [`ComponentApi`](docs/API.md#componentapi)                                 | `@vllnt/convex-reactions/_generated/component` | Generated type of the mounted component                              |

## Common tasks

Render a reaction bar: per-kind counts plus the kinds the signed-in user placed.

```ts
// convex/reactionBar.ts
import { Reactions } from "@vllnt/convex-reactions";
import { v } from "convex/values";

import { components } from "./_generated/api";
import { query } from "./_generated/server";

const reactions = new Reactions(components.reactions);

export const reactionBar = query({
  args: { postId: v.id("posts") },
  returns: v.object({
    counts: v.array(v.object({ kind: v.string(), count: v.number() })),
    mine: v.array(v.string()),
  }),
  handler: async (ctx, { postId }) => {
    const user = await ctx.auth.getUserIdentity();
    const counts = await reactions.counts(ctx, postId);
    const mine =
      user === null
        ? []
        : await reactions.myReactions(ctx, user.tokenIdentifier, postId);
    return { counts, mine };
  },
});
```

Up/down votes where a new vote replaces the opposite one. `react` toggles, so
voting the same way twice removes the vote; `unreact` is a no-op when there is
nothing to remove. Both calls run in the host mutation's transaction.

```ts
// convex/votes.ts
import { Reactions } from "@vllnt/convex-reactions";
import { ConvexError, v } from "convex/values";

import { components } from "./_generated/api";
import { mutation } from "./_generated/server";

const votes = new Reactions(components.reactions, {
  allowedKinds: ["up", "down"],
});

export const vote = mutation({
  args: {
    postId: v.id("posts"),
    direction: v.union(v.literal("up"), v.literal("down")),
  },
  returns: v.boolean(),
  handler: async (ctx, { postId, direction }) => {
    const user = await ctx.auth.getUserIdentity();
    if (user === null) throw new ConvexError("not signed in");
    const opposite = direction === "up" ? "down" : "up";
    await votes.unreact(ctx, user.tokenIdentifier, postId, opposite);
    const result = await votes.react(
      ctx,
      user.tokenIdentifier,
      postId,
      direction,
    );
    return result.reacted;
  },
});
```

List who reacted with one kind, page by page (use it with `usePaginatedQuery`):

```ts
// convex/reactors.ts
import { Reactions } from "@vllnt/convex-reactions";
import {
  paginationOptsValidator,
  paginationResultValidator,
} from "convex/server";
import { v } from "convex/values";

import { components } from "./_generated/api";
import { query } from "./_generated/server";

const reactions = new Reactions(components.reactions);

export const whoReacted = query({
  args: {
    postId: v.id("posts"),
    kind: v.string(),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(
    v.object({
      authorRef: v.string(),
      resourceRef: v.string(),
      kind: v.string(),
      createdAt: v.number(),
    }),
  ),
  handler: (ctx, { postId, kind, paginationOpts }) =>
    reactions.reactors(ctx, postId, kind, paginationOpts),
});
```

Keep two vocabularies apart with two named mounts. Each mount has its own
tables; nothing is shared between them.

```ts
// convex/convex.config.ts
import reactions from "@vllnt/convex-reactions/convex.config";
import { defineApp } from "convex/server";

const app = defineApp();
app.use(reactions, { name: "emoji" });
app.use(reactions, { name: "votes" });
export default app;
```

```ts
// convex/clients.ts
import { Reactions } from "@vllnt/convex-reactions";

import { components } from "./_generated/api";

export const emoji = new Reactions(components.emoji);
export const votes = new Reactions(components.votes, {
  allowedKinds: ["up", "down"],
});
```

## Errors and fixes

`react` and `unreact` throw a `ConvexError` whose `data` is `{ code, message }`
for an invalid edge key; `reactors` does the same for invalid pagination
options. Catch it in the host with `error instanceof ConvexError` and read
`error.data.code`.

| Error                                                                      | Thrown by                                          | Cause                                                                                                                      | Fix                                                                                   |
| -------------------------------------------------------------------------- | -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `INVALID_REF`                                                              | `react`, `unreact`                                 | `authorRef` or `resourceRef` is the empty string                                                                           | Pass a non-empty ref (a user id, a row id, a namespaced key)                          |
| `INVALID_KIND`                                                             | `react`, `unreact`                                 | `kind` is the empty string                                                                                                 | Pass a non-empty kind                                                                 |
| `INVALID_PAGE_SIZE`                                                        | `reactors`                                         | `paginationOpts.numItems` is not an integer from 1 to 1000, or `maximumRowsRead` is not a positive integer                 | Keep `numItems` in 1..1000; omit `maximumRowsRead` or pass a positive integer         |
| `Error`: `invalid reaction kind "<kind>": not in the configured allowlist` | `react`, `unreact` on a client with `allowedKinds` | `kind` is not in `allowedKinds`; thrown by the client before the component is called; a plain `Error`, not a `ConvexError` | Pass a listed kind or add it to `allowedKinds`; validate user input in the host first |

Arguments of the wrong type (for example a number `kind`) are rejected by Convex
argument validation before the component runs. Queries do not validate refs or
kinds and do not throw on empty strings.

## Limits and gotchas

- `reactors` takes `numItems` from 1 to 1000. `maximumRowsRead` is capped at
  1000 on the first run of a page. A reactive re-run with an `endCursor` returns
  the whole range between its cursors, and Convex ignores `maximumRowsRead`
  there; only Convex transaction read limits apply. A host that does not need
  reactive pagination can drop `endCursor` from `paginationOpts` in its own
  wrapper before calling `reactors`.
- `react` is a toggle, not an idempotent retry operation: calling it twice with
  the same arguments removes the edge again. Use `unreact` for "ensure absent",
  and `hasReacted` before `react` for "ensure present".
- `allowedKinds` is enforced only in the `Reactions` client, and only for
  `react` and `unreact`. Queries accept any kind, and a direct call to the
  component's functions skips the check. `allowedKinds: []` rejects every write.
- `counts` reads stored tally rows, one per kind. A resource whose reactions
  were written by 0.1.0 (before tallies existed) has no tally rows; `counts`
  counts its edges instead, one read per edge, until all its edges are removed.
- After 0.1.1 has written tally rows, downgrading to 0.1.0 is not supported:
  0.1.0 writes edges without updating tallies, so counts go stale.
- Edges with an empty `authorRef`, `resourceRef` or `kind` written by 0.1.0
  cannot be removed through the API (`react` and `unreact` now throw). The host
  cannot write component tables from code; delete those rows in the Convex
  dashboard: select the component in the dashboard's component dropdown, open
  its `reactions` table in the data view, select the rows and delete them.
- There is no bulk erase. Deleting a resource or a user in your app leaves its
  reactions. Remove them with `unreact`, finding them through `counts` and
  `reactors`; there is no query that lists one subject's reactions across all
  resources.
- Every write on a resource updates its `(resource, kind)` tally row, so many
  concurrent writes on one resource and kind conflict and Convex retries them.
- Refs and kinds are opaque strings with no length limit in the component;
  Convex's own value size limits apply.

## Compatibility

- Peer dependency: `convex@^1.45.0`. The repository's tests run on the locked
  convex version (1.51); `pnpm test:package` type-checks and runs the packed
  package against convex 1.45.0.
- `package.json` `engines.node` is `>=18`. convex itself requires Node.js 20 or
  later (1.45) and 22 or later (1.49 and newer).
- ES modules only. Call the client from host Convex queries and mutations; the
  component's functions run in the default Convex runtime.
- React: not applicable. The package is backend-only and has no `./react`
  entry; call your own host queries with `useQuery`.
- `@vllnt/convex-reactions/test` is TypeScript source. It needs `convex-test`,
  `vitest`, `vite` and `@edge-runtime/vm` in the consuming app: it references
  `vite/client` types and calls `import.meta.glob`, so add `vite` as a direct
  dev dependency.

## Testing

Mount the component in your own `convex-test` suite with `register`. Use the
Vitest settings from the `convex-test` docs (edge runtime, `convex-test` inlined):

```ts
// vitest.config.mts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "edge-runtime",
    server: { deps: { inline: ["convex-test"] } },
  },
});
```

```ts
// convex/schema.ts
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  posts: defineTable({ title: v.string() }),
});
```

```ts
// convex/reactions.test.ts
/// <reference types="vite/client" />
import { register } from "@vllnt/convex-reactions/test";
import { convexTest } from "convex-test";
import { expect, test } from "vitest";

import { api } from "./_generated/api";
import schema from "./schema";

test("a second toggle removes the reaction", async () => {
  const t = convexTest(schema, import.meta.glob("./**/*.ts"));
  register(t);
  const postId = await t.run((ctx) => ctx.db.insert("posts", { title: "Hi" }));
  const user = t.withIdentity({ tokenIdentifier: "user-1" });
  await user.mutation(api.reactions.toggle, { postId, kind: "like" });
  expect(await t.query(api.reactions.counts, { postId })).toEqual([
    { kind: "like", count: 1 },
  ]);
  const again = await user.mutation(api.reactions.toggle, {
    postId,
    kind: "like",
  });
  expect(again).toEqual({ reacted: false, action: "removed" });
});
```

`register(t, name)` takes the mount name when you used
`app.use(reactions, { name })`.

This repository's own tests use the simulated `convex-test` runtime
(`pnpm test:coverage`, 100% coverage enforced). `pnpm test:package` installs
the packed tarball in a temporary app, type-checks every example in this README
and `docs/API.md` against it and runs the test above.

## Security

- The component does not authenticate. The host must authorize every call and
  derive `authorRef` itself (for example from `ctx.auth`); never accept an
  `authorRef` from client arguments.
- Its tables are reachable only through the component's functions; it never
  reads host tables or de-references the refs.
- One edge per `(authorRef, resourceRef, kind)` is enforced inside the mutation
  transaction, and `createdAt` comes from the server clock.

Report vulnerabilities as described in
[SECURITY.md](https://github.com/vllnt/convex-reactions/blob/main/SECURITY.md).

## Related packages

None. This package has no dependency, shared test or example with another
package.

## Contributing

See
[CONTRIBUTING.md](https://github.com/vllnt/convex-reactions/blob/main/CONTRIBUTING.md).

## Links

- Docs and changelog: [oss.vllnt.com/packages/convex-reactions](https://oss.vllnt.com/packages/convex-reactions) · [release feed](https://oss.vllnt.com/packages/convex-reactions/rss.xml)
- All @vllnt packages: [oss.vllnt.com](https://oss.vllnt.com) · [search packages and docs on index.vllnt.com](https://index.vllnt.com)
- Source and issues: [GitHub](https://github.com/vllnt/convex-reactions) · [issues](https://github.com/vllnt/convex-reactions/issues) · [npm](https://www.npmjs.com/package/@vllnt/convex-reactions)
- Questions and updates: [Discord](https://bntvllnt.com/discord) · [X @bntvllnt](https://x.com/bntvllnt)
- Company and author: [vllnt.com](https://vllnt.com) · [bntvllnt.com](https://bntvllnt.com) · [GitHub @bntvllnt](https://github.com/bntvllnt) · [LinkedIn](https://linkedin.com/in/bntvllnt)
- Sponsor: [GitHub Sponsors](https://github.com/sponsors/bntvllnt)

## License

MIT. See [LICENSE](LICENSE).

[![npm version](https://img.shields.io/npm/v/@vllnt/convex-reactions.svg)](https://www.npmjs.com/package/@vllnt/convex-reactions)
[![CI status](https://github.com/vllnt/convex-reactions/actions/workflows/ci.yml/badge.svg)](https://github.com/vllnt/convex-reactions/actions/workflows/ci.yml)

---

Part of [vllnt open source](https://oss.vllnt.com) · [Package page](https://oss.vllnt.com/packages/convex-reactions) · [vllnt.com](https://vllnt.com) · Built by [bntvllnt](https://bntvllnt.com)
