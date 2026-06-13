<!-- Badges -->
[![convex-component](https://img.shields.io/badge/convex-component-EE342F.svg)](https://www.convex.dev/components)
[![npm](https://img.shields.io/npm/v/@vllnt/convex-reactions.svg)](https://www.npmjs.com/package/@vllnt/convex-reactions)
[![CI](https://github.com/vllnt/convex-reactions/actions/workflows/ci.yml/badge.svg)](https://github.com/vllnt/convex-reactions/actions/workflows/ci.yml)
[![license](https://img.shields.io/npm/l/@vllnt/convex-reactions.svg)](./LICENSE)

# @vllnt/convex-reactions

Reactions, votes, and likes on any resource, as a Convex component.

A reaction is the opaque edge `(authorRef, resourceRef, kind)`: a host subject
reacted to a host resource with one reaction kind. `react` toggles the edge (add
if absent, remove if present); `counts` tallies a resource per kind; `reactors`
pages who reacted. Domain-neutral: emoji on a social post, up/down votes on a
comment, a heart on a game clip, a like on an article — the `kind` vocabulary is
the host's. One edge per subject per kind per resource is enforced inside the
mutation transaction, so toggles and counts stay correct under concurrency. The
host owns the subject, the resource, the vocabulary, and auth; this component
owns only the reaction edges.

## Features

- **Toggle** — `react(authorRef, resourceRef, kind)` adds the edge if absent and removes it if present in one transaction, returning `{ reacted, action }`. One subject holds at most one edge per kind per resource.
- **Idempotent remove** — `unreact(authorRef, resourceRef, kind)` deletes the edge; removing one that does not exist is a safe no-op returning `false`.
- **Count by kind** — `counts(resourceRef)` returns `[{ kind, count }, ...]` sorted by kind; a resource with no reactions returns `[]`.
- **List reactors** — `reactors(resourceRef, kind, paginationOpts)` pages the subjects who reacted with one kind, oldest first, via the standard Convex pagination envelope. Reactive in a Convex query.
- **Per-subject state** — `hasReacted(authorRef, resourceRef, kind)` and `myReactions(authorRef, resourceRef)` give the host the subject's own reaction state for rendering controls.
- **Configurable vocabulary** — pass `allowedKinds` to pin the reaction set (e.g. `["up", "down"]` or a fixed emoji list); an unknown `kind` is rejected at the boundary before the component is called. Omit it for freeform kinds.
- **Server-sourced time** — `createdAt` is stamped from the server clock inside the handler; a caller can never supply a timestamp.
- **Opaque refs** — `authorRef`, `resourceRef`, and `kind` are plain strings the component never de-references; it never reads host or sibling tables.
- **Mount-safe** — runs correctly under multiple named `app.use` mounts; each instance is an isolated sandbox.

## Architecture

```
src/
├── shared.ts              # the component id / default mount name
├── test.ts                # convex-test register() helper
├── client/                # Reactions class (the public API)
└── component/             # schema (reactions) + mutations + queries
```

Sandboxed table: `reactions {authorRef, resourceRef, kind, createdAt}` — indexed
for the uniqueness / toggle key (`by_author_resource_kind`), per-resource counts
and reactor listing (`by_resource_kind`), and a subject's own reactions
(`by_author_resource`). No host tables are touched.

## Installation

```bash
pnpm add @vllnt/convex-reactions
```

Peer dependency: `convex@^1.41.0`.

## Usage

```ts
// convex/convex.config.ts
import { defineApp } from "convex/server";
import reactions from "@vllnt/convex-reactions/convex.config";

const app = defineApp();
app.use(reactions);
export default app;
```

```ts
// convex/reactions.ts — host owns auth; pass opaque refs in.
import { components } from "./_generated/api";
import { mutation, query } from "./_generated/server";
import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import { Reactions } from "@vllnt/convex-reactions";

const reactions = new Reactions(components.reactions, {
  allowedKinds: ["up", "down"], // pin the vocabulary (optional)
});

// Toggle a vote — the host resolves identity, the component stores the edge.
export const vote = mutation({
  args: { postId: v.string(), kind: v.string() },
  handler: async (ctx, { postId, kind }) => {
    const userId = await requireUser(ctx); // host auth
    return reactions.react(ctx, userId, postId, kind);
  },
});

// Read the tally (reactively, in a Convex query).
export const tally = query({
  args: { postId: v.string() },
  handler: (ctx, { postId }) => reactions.counts(ctx, postId),
});

// Page who reacted with a kind.
export const whoReacted = query({
  args: { postId: v.string(), kind: v.string(), paginationOpts: paginationOptsValidator },
  handler: (ctx, { postId, kind, paginationOpts }) =>
    reactions.reactors(ctx, postId, kind, paginationOpts),
});
```

## API Reference

See [docs/API.md](docs/API.md). Summary:

| Method | Kind | Result |
|--------|------|--------|
| `react(ctx, authorRef, resourceRef, kind)` | mutation | `{ reacted, action }` (`action`: `"added" \| "removed"`) |
| `unreact(ctx, authorRef, resourceRef, kind)` | mutation | `boolean` (true if an edge was removed) |
| `counts(ctx, resourceRef)` | query | `{ kind, count }[]` (sorted by kind) |
| `hasReacted(ctx, authorRef, resourceRef, kind)` | query | `boolean` |
| `myReactions(ctx, authorRef, resourceRef)` | query | `string[]` (kinds the subject placed) |
| `reactors(ctx, resourceRef, kind, paginationOpts)` | query | `PaginationResult<ReactionView>` |

Client options: `new Reactions(component, { allowedKinds? })`.

## Security Model

The component is **auth-agnostic**: it never authenticates or authorizes. The host
resolves identity, decides whether a caller may react, and passes opaque
`authorRef` / `resourceRef` strings and a `kind`. Component tables are sandboxed —
the host reaches them only through the exported functions, and the component never
reads host or sibling tables. The refs and `kind` are opaque; the component never
inspects or de-references them.

**Uniqueness is transactional**: the read and write share the mutation
transaction, so concurrent toggles cannot create a duplicate edge. **Time is
server-sourced** — `createdAt` comes from `Date.now()` inside the handler, never
from the caller. The host may pin the reaction vocabulary with `allowedKinds`,
enforced at the client boundary before the call.

## Testing

```bash
pnpm test           # single run
pnpm test:coverage  # enforced 100% on covered files
```

Tests run against the real component runtime via `convex-test` (`@edge-runtime/vm`), not mocks.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## Author

Built by [bntvllnt](https://github.com/bntvllnt) · [bntvllnt.com](https://bntvllnt.com) · [X @bntvllnt](https://x.com/bntvllnt)

Part of the [@vllnt](https://github.com/vllnt) Convex component fleet — [vllnt.com](https://vllnt.com)

If this is useful, [sponsor the work](https://github.com/sponsors/bntvllnt).

## License

MIT — see [LICENSE](LICENSE).
