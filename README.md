<!-- Badges -->
[![convex-component](https://img.shields.io/badge/convex-component-EE342F.svg)](https://www.convex.dev/components)
[![npm](https://img.shields.io/npm/v/@vllnt/convex-reactions.svg)](https://www.npmjs.com/package/@vllnt/convex-reactions)
[![CI](https://github.com/vllnt/convex-reactions/actions/workflows/ci.yml/badge.svg)](https://github.com/vllnt/convex-reactions/actions/workflows/ci.yml)
[![license](https://img.shields.io/npm/l/@vllnt/convex-reactions.svg)](./LICENSE)

# @vllnt/convex-reactions

Reactions, votes, and likes on any resource, as a Convex component.

```ts
const reactions = new Reactions(components.reactions);
await reactions.react(ctx, authorRef, resourceRef, "up"); // toggle the edge in one transaction
await reactions.counts(ctx, resourceRef);                 // [{ kind, count }], reactive
await reactions.hasReacted(ctx, authorRef, resourceRef, "up");
```

A reaction is the opaque edge `(authorRef, resourceRef, kind)`. `react` toggles it (add if absent,
remove if present); `counts` tallies a resource per kind; `reactors` pages who reacted. One edge per
subject per kind per resource is enforced in the mutation transaction, so toggles and counts stay
correct under concurrency.

## Features

- **Toggle** — `react(authorRef, resourceRef, kind)` adds the edge if absent and removes it if present in one transaction, returning `{ reacted, action }`.
- **Idempotent remove** — `unreact(authorRef, resourceRef, kind)` deletes the edge; removing an absent one is a safe no-op (`false`).
- **Count by kind** — `counts(resourceRef)` returns `[{ kind, count }, ...]` sorted by kind; no reactions returns `[]`.
- **List reactors** — `reactors(resourceRef, kind, paginationOpts)` pages who reacted with one kind, oldest first. `numItems` must be an integer from 1 through 1000 and `maximumRowsRead` is capped at 1000, including reactive cursor ranges.
- **Per-subject state** — `hasReacted` and `myReactions` give the host the subject's own reaction state for rendering controls.
- **Configurable vocabulary** — `allowedKinds` pins the reaction set (`["up", "down"]`, a fixed emoji list); an unknown kind is rejected at the boundary. Omit for freeform.
- **Server-sourced time** — `createdAt` is stamped from the server clock; a caller can't supply a timestamp.
- **Mount-safe** — correct under multiple named `app.use` mounts; each instance is an isolated sandbox.

## Installation

```bash
pnpm add @vllnt/convex-reactions
```

Peer dependency: `convex@^1.45.0`.

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

export const vote = mutation({
  args: { postId: v.string(), kind: v.string() },
  handler: async (ctx, { postId, kind }) => {
    const userId = await requireUser(ctx); // host auth
    return reactions.react(ctx, userId, postId, kind);
  },
});

export const tally = query({
  args: { postId: v.string() },
  handler: (ctx, { postId }) => reactions.counts(ctx, postId),
});
```

## API Reference

| Method | Kind | Result |
|--------|------|--------|
| `react(ctx, authorRef, resourceRef, kind)` | mutation | `{ reacted, action }` (`action`: `"added" \| "removed"`) |
| `unreact(ctx, authorRef, resourceRef, kind)` | mutation | `boolean` (true if an edge was removed) |
| `counts(ctx, resourceRef)` | query | `{ kind, count }[]` (sorted by kind) |
| `hasReacted(ctx, authorRef, resourceRef, kind)` | query | `boolean` |
| `myReactions(ctx, authorRef, resourceRef)` | query | `string[]` (kinds the subject placed) |
| `reactors(ctx, resourceRef, kind, paginationOpts)` | query | `PaginationResult<ReactionView>`; bounded to 1000 rows read |

Invalid numeric pagination options throw `INVALID_PAGE_SIZE`.

Full reference: [docs/API.md](docs/API.md).

## React

Backend-only — no `./react` entry. A reaction tally or reactor list is an ordinary reactive `useQuery` over the host's own re-exported `counts` / `reactors` refs.

## Security

- Auth-agnostic — the host resolves identity and decides who may react.
- Tables sandboxed — reached only through the exported functions; never touches host or sibling tables.
- Uniqueness is transactional + time is server-sourced; refs and `kind` stay opaque to the component.

See [docs/API.md](docs/API.md).

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
