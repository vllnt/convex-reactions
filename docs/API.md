# API reference: @vllnt/convex-reactions

**Compatibility:** `convex@^1.45.0`

## Entry points

| Import                                         | Exports                                                                                                       |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `@vllnt/convex-reactions`                      | `Reactions` class; types `ReactionsComponent`, `ReactionsOptions`, `ReactResult`, `KindCount`, `ReactionView` |
| `@vllnt/convex-reactions/convex.config`        | the component definition (default export) for `app.use(...)`                                                  |
| `@vllnt/convex-reactions/_generated/component` | type `ComponentApi` (types only)                                                                              |
| `@vllnt/convex-reactions/test`                 | `register(t, name = "reactions")` to mount the component in a `convex-test` instance                          |

The `.js`-suffixed subpaths (`/convex.config.js`, `/_generated/component.js`)
resolve to the same files.

## Client

### `Reactions`

```ts
// convex/client.ts
import { Reactions } from "@vllnt/convex-reactions";

import { components } from "./_generated/api";

export const reactions = new Reactions(components.reactions, {
  allowedKinds: ["up", "down"],
});
```

`new Reactions(component: ReactionsComponent, options?: ReactionsOptions)`. Pass
the mounted component (`components.reactions`, or `components.<name>` for a
named mount).

All methods take the host `ctx` as the first argument: mutations need
`ctx.runMutation`, queries need `ctx.runQuery`. `authorRef`, `resourceRef`, and
`kind` are opaque strings the host owns; the component never de-references them.

**Time is server-sourced.** `react` stamps `createdAt` from `Date.now()` inside
the component mutation; no method accepts a caller-supplied timestamp.

### `ReactionsOptions`

`{ allowedKinds?: readonly string[] }`, the only constructor option.

When `allowedKinds` is set, `react` and `unreact` throw a plain `Error` before
calling the component if `kind` is not in the list. Omit it to accept any
non-empty `kind`. An empty list rejects every write. The allowlist does not
restrict queries, and direct component calls bypass this client-only check.

## Mutations

### `react`

`react(ctx, authorRef, resourceRef, kind): Promise<ReactResult>`

Toggle a subject's reaction edge in one transaction. If the
`(authorRef, resourceRef, kind)` edge is absent it is inserted (`reacted: true`,
`action: "added"`); if it already exists it is deleted (`reacted: false`,
`action: "removed"`). The read and write share the transaction, so two
concurrent toggles cannot both insert: one edge per subject per kind per
resource holds. The resource's tally row for `kind` is updated in the same
transaction.

`react` is a toggle, so replaying it reverses the first call. Throws
`INVALID_REF` for an empty `authorRef` or `resourceRef`, `INVALID_KIND` for an
empty `kind`, and the client allowlist `Error` for a kind outside
`allowedKinds`.

### `unreact`

`unreact(ctx, authorRef, resourceRef, kind): Promise<boolean>`

Remove a subject's `(authorRef, resourceRef, kind)` edge. Returns `true` when an
edge was deleted, `false` when none existed, so a duplicate or replayed
`unreact` changes nothing. Throws the same errors as `react`.

## Queries

### `counts`

`counts(ctx, resourceRef): Promise<KindCount[]>`

Reactions per `kind` on one resource, sorted by `kind` (`localeCompare`).
`count` is the number of distinct subjects that reacted with that kind. A
resource with no reactions returns `[]`. It reads one stored tally row per kind,
which `react` and `unreact` keep in step. A resource with reactions written by
0.1.0 (before tallies existed) has no tally rows and is counted from its edges,
one read per edge, until all its edges are removed.

### `hasReacted`

`hasReacted(ctx, authorRef, resourceRef, kind): Promise<boolean>`

Whether a subject holds a `(authorRef, resourceRef, kind)` edge: the per-subject
toggle state the host renders next to a reaction control.

### `myReactions`

`myReactions(ctx, authorRef, resourceRef): Promise<string[]>`

Every reaction `kind` a subject placed on one resource. Empty when the subject
has not reacted to the resource.

### `reactors`

`reactors(ctx, resourceRef, kind, paginationOpts): Promise<PaginationResult<ReactionView>>`

Page the subjects who reacted to `resourceRef` with one `kind`, oldest first via
the `by_resource_kind` index. Takes the standard Convex `paginationOpts`; its
`numItems` must be an integer from 1 through 1000. `maximumRowsRead`, when
provided, must be a positive finite integer and is capped at 1000 (1000 when
omitted). With an `endCursor` (a reactive re-run of a loaded page), Convex
returns the whole range between the two cursors and ignores `maximumRowsRead`;
only Convex's transaction read limits bound it. Returns the standard paginated
envelope (`page`, `isDone`, `continueCursor`, and optional `splitCursor` and
`pageStatus`); validate it in a host query with
`paginationResultValidator(itemValidator)` from `convex/server`.

## Types

### `ReactionsComponent`

The shape of `components.reactions` the client accepts: `mutations.react`,
`mutations.unreact`, `queries.counts`, `queries.hasReacted`,
`queries.myReactions`, `queries.reactors`, each an internal function reference.

### `ReactResult`

`{ reacted: boolean; action: "added" | "removed" }`, returned by `react`.
`reacted` is whether the subject holds the edge after the call.

### `KindCount`

`{ kind: string; count: number }`, one entry of `counts`.

### `ReactionView`

`{ authorRef: string; resourceRef: string; kind: string; createdAt: number }`,
one row of `reactors`. `createdAt` is milliseconds since the epoch, from the
server clock.

## Component config

### `convex.config`

The default export of `@vllnt/convex-reactions/convex.config` is the component
definition. Mount it with `app.use(reactions)` (default name `reactions`) or
`app.use(reactions, { name: "votes" })` for another isolated instance.

### `ComponentApi`

Generated type of the mounted component, exported from
`@vllnt/convex-reactions/_generated/component` (types only). The host's
generated `components.reactions` has this shape.

## Testing

### `register`

`register(t, name = "reactions"): void` from `@vllnt/convex-reactions/test`
registers the component on a `convexTest(hostSchema, modules)` instance under
`name`. Any host schema works. The entry is TypeScript source that references
`vite/client` types and calls `import.meta.glob`, so the consuming app needs
`convex-test`, `vitest`, `vite` (as a direct dev dependency) and
`@edge-runtime/vm` (for Vitest `environment: "edge-runtime"`). Run the tests on
the Node.js version your Vitest requires (Vitest 5 needs Node.js `^22.12.0`,
`^24.0.0` or `>=26.0.0`).

## Tables

The component's sandboxed tables, reached only through the functions above:

- `reactions`: one row per edge `{ authorRef, resourceRef, kind, createdAt }`.
  Indexes: `by_author_resource_kind` (`authorRef`, `resourceRef`, `kind`; the
  uniqueness key, whose prefix `myReactions` reads) and `by_resource_kind`
  (`resourceRef`, `kind`, `createdAt`; reactor paging and the legacy edge
  count).
- `reactionCounts`: one tally row per resource and kind
  `{ resourceRef, kind, count }`, index `by_resource_kind` (`resourceRef`,
  `kind`). A row is deleted when its count reaches zero.

The host cannot read or write these tables from code. To inspect or delete rows
by hand, select the component in the Convex dashboard's component dropdown and
open the table in the data view.

## Error codes

Component errors are `ConvexError` values whose `data` is `{ code, message }`.

- `INVALID_REF`: `react` or `unreact` got an empty `authorRef` or `resourceRef`.
- `INVALID_KIND`: `react` or `unreact` got an empty `kind`.
- `INVALID_PAGE_SIZE`: `reactors` got a `paginationOpts.numItems` outside 1
  through 1000 or not an integer, or a `maximumRowsRead` that is not a positive
  finite integer.

The mutations never reject on state: toggle and idempotent remove are total over
valid arguments. The `Reactions` client throws a plain
`Error('invalid reaction kind "<kind>": not in the configured allowlist')` when
`allowedKinds` is set and `kind` is not in it, before the component is called.
Queries do not validate refs or kinds.
