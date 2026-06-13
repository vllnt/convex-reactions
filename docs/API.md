# API Reference — @vllnt/convex-reactions

**Compatibility:** `convex@^1.41.0`

Construct the client with the mounted component and optional config:

```ts
import { Reactions } from "@vllnt/convex-reactions";

const reactions = new Reactions(components.reactions, {
  allowedKinds: ["up", "down"], // optional — pin the reaction vocabulary
});
```

All methods take the host `ctx` (a query or mutation context) as the first
argument. `authorRef`, `resourceRef`, and `kind` are opaque strings the host owns
— the component never de-references them.

**Time is server-sourced.** `react` stamps `createdAt` from `Date.now()` itself;
no method accepts a caller-supplied clock.

**Vocabulary.** When `allowedKinds` is set, `react` and `unreact` throw before
calling the component if `kind` is not in the list. Omit it to accept any freeform
`kind`.

## Mutations

### `react(ctx, authorRef, resourceRef, kind) → { reacted, action }`

Toggle a subject's reaction edge in one transaction. If the
`(authorRef, resourceRef, kind)` edge is absent it is inserted (`reacted: true`,
`action: "added"`); if it already exists it is deleted (`reacted: false`,
`action: "removed"`). The read and write share the transaction, so two concurrent
toggles cannot both insert — one edge per subject per kind per resource holds.

`createdAt` is stamped from the server clock. A `kind` outside the configured
`allowedKinds` throws before storage.

### `unreact(ctx, authorRef, resourceRef, kind) → boolean`

Remove a subject's `(authorRef, resourceRef, kind)` edge. Returns `true` when an
edge was deleted, `false` when none existed. Idempotent — a duplicate or replayed
`unreact` is a safe no-op. A `kind` outside `allowedKinds` throws.

## Queries

### `counts(ctx, resourceRef) → { kind, count }[]`

Tally reaction edges per `kind` on one resource, sorted by `kind`. `count` is the
number of distinct subjects that reacted with that kind. A resource with no
reactions returns `[]`.

### `hasReacted(ctx, authorRef, resourceRef, kind) → boolean`

Whether a subject holds a `(authorRef, resourceRef, kind)` edge — the per-subject
toggle state the host renders next to a reaction control.

### `myReactions(ctx, authorRef, resourceRef) → string[]`

Every reaction `kind` a subject placed on one resource. Empty when the subject has
not reacted to the resource.

### `reactors(ctx, resourceRef, kind, paginationOpts) → PaginationResult<ReactionView>`

Page the subjects who reacted to `resourceRef` with one `kind`, oldest first via
the `by_resource_kind` index. Takes the standard Convex `paginationOpts` and
returns the standard paginated envelope (`page`, `isDone`, `continueCursor`).
`ReactionView` is `{ authorRef, resourceRef, kind, createdAt }`.

## Error codes

The component throws no coded `ConvexError`s — `react`/`unreact` are total over
valid string args (toggle and idempotent remove never reject on state). The only
boundary rejection is a client-side `Error("invalid reaction kind ... not in the
configured allowlist")` thrown by the `Reactions` client when `allowedKinds` is
set and `kind` is not in it — raised before the component is called.
