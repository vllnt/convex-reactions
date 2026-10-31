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
await reactions.counts(ctx, resourceRef); // [{ kind, count }], reactive
await reactions.hasReacted(ctx, authorRef, resourceRef, "up");
```

A reaction is the opaque edge `(authorRef, resourceRef, kind)`. `react` toggles
it (add if absent, remove if present); `counts` tallies a resource per kind;
`reactors` pages who reacted. One edge per subject per kind per resource is
enforced in the mutation transaction, so toggles and counts stay correct under
concurrency.

## Features

- **Toggle** — `react(authorRef, resourceRef, kind)` adds the edge if absent and
  removes it if present in one transaction, returning `{ reacted, action }`.
- **Idempotent remove** — `unreact(authorRef, resourceRef, kind)` deletes the
  edge; removing an absent one is a safe no-op (`false`).
- **Count by kind** — `counts(resourceRef)` returns `[{ kind, count }, ...]`
  sorted by kind; no reactions returns `[]`.
- **List reactors** — `reactors(resourceRef, kind, paginationOpts)` pages who
  reacted with one kind, oldest first. `numItems` must be an integer from 1
  through 1000 and `maximumRowsRead` is capped at 1000, including reactive
  cursor ranges.
- **Per-subject state** — `hasReacted` and `myReactions` give the host the
  subject's own reaction state for rendering controls.
- **Configurable vocabulary** — `allowedKinds` pins the reaction set
  (`["up", "down"]`, a fixed emoji list); an unknown kind is rejected at the
  boundary. Omit for freeform.
- **Server-sourced time** — `createdAt` is stamped from the server clock; a
  caller can't supply a timestamp.
- **Mount-safe** — correct under multiple named `app.use` mounts; each instance
  is an isolated sandbox.

## Installation

```bash
pnpm add @vllnt/convex-reactions convex@^1.45.0
```

Peer dependency: `convex@^1.45.0`. The command installs the latest stable
release; use `@vllnt/convex-reactions@canary` for the newest pre-release build
from `main`, and pin a resolved canary version for reproducible installs.

## Quick start

After mounting, run `pnpm exec convex dev` to generate `components.reactions`.
The example exports internal functions for trusted server callers. Public
wrappers must resolve identity and authorize resource access.

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
import { internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { Reactions } from "@vllnt/convex-reactions";

const reactions = new Reactions(components.reactions, {
  allowedKinds: ["up", "down"], // pin the vocabulary (optional)
});

export const vote = internalMutation({
  args: { authorRef: v.string(), resourceRef: v.string(), kind: v.string() },
  handler: (ctx, { authorRef, resourceRef, kind }) =>
    reactions.react(ctx, authorRef, resourceRef, kind),
});

export const tally = internalQuery({
  args: { postId: v.string() },
  handler: (ctx, { postId }) => reactions.counts(ctx, postId),
});
```

## API Reference

| Method                                             | Kind     | Result                                                      |
| -------------------------------------------------- | -------- | ----------------------------------------------------------- |
| `react(ctx, authorRef, resourceRef, kind)`         | mutation | `{ reacted, action }` (`action`: `"added" \| "removed"`)    |
| `unreact(ctx, authorRef, resourceRef, kind)`       | mutation | `boolean` (true if an edge was removed)                     |
| `counts(ctx, resourceRef)`                         | query    | `{ kind, count }[]` (sorted by kind)                        |
| `hasReacted(ctx, authorRef, resourceRef, kind)`    | query    | `boolean`                                                   |
| `myReactions(ctx, authorRef, resourceRef)`         | query    | `string[]` (kinds the subject placed)                       |
| `reactors(ctx, resourceRef, kind, paginationOpts)` | query    | `PaginationResult<ReactionView>`; bounded to 1000 rows read |

Invalid numeric pagination options throw coded `ConvexError`
`INVALID_PAGE_SIZE`; empty `authorRef`/`resourceRef` in `react`/`unreact` throw
`INVALID_REF` and an empty `kind` throws `INVALID_KIND`. Disallowed kinds in
`react`/`unreact` throw a plain client-side `Error`, not a component error code;
query methods do not apply the allowlist.

Full reference: [docs/API.md](docs/API.md).

## Options and limitations

- `allowedKinds?: readonly string[]` is the sole constructor option. Omit it for
  freeform kinds; an empty list rejects every write kind.
- `counts` scans every edge on a resource and groups by kind; it is not a
  constant-time aggregate and is subject to Convex read limits. `myReactions`
  also collects its matching edges.
- `react` is a toggle, not an idempotent retry operation: calling twice removes
  the edge. Use `unreact` to ensure absence.
- Mount another isolated instance with `app.use(reactions, { name: "votes" })`
  and `new Reactions(components.votes)`.

## Integrations

Backend-only — no `./react` entry. A reaction tally or reactor list is an
ordinary reactive `useQuery` over the host's own re-exported `counts` /
`reactors` refs.

## Security

- Auth-agnostic — the host resolves identity and decides who may react.
- Tables sandboxed — reached only through the exported functions; never touches
  host or sibling tables.
- Uniqueness is transactional + time is server-sourced; refs and `kind` stay
  opaque to the component.

See [docs/API.md](docs/API.md).

## Testing

```bash
pnpm test           # single run
pnpm test:coverage  # enforced 100% on covered files
```

Tests run against the real component runtime via `convex-test`
(`@edge-runtime/vm`), not mocks.

### Testing your app

`@vllnt/convex-reactions/test` exports `register(t, name = "reactions")` to
mount the component in a `convex-test` instance. It needs `convex-test` and
`vitest` (with Vite's `import.meta.glob`) in the consuming app:

```ts
/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { register } from "@vllnt/convex-reactions/test";
import schema from "./schema";

const t = convexTest(schema, import.meta.glob("./**/*.ts"));
register(t);
```

## Documentation

`llms.txt` is the maintained discovery index. `pnpm generate:llms` checks its
heading and local links without generating a source bundle.

[API reference](docs/API.md) · [LLM index](llms.txt) ·
[Security policy](SECURITY.md)

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## Author

Built by [bntvllnt](https://github.com/bntvllnt) ·
[bntvllnt.com](https://bntvllnt.com) · [X @bntvllnt](https://x.com/bntvllnt)

Part of the [@vllnt](https://github.com/vllnt) Convex component fleet —
[vllnt.com](https://vllnt.com)

If this is useful, [sponsor the work](https://github.com/sponsors/bntvllnt).

## License

MIT — see [LICENSE](LICENSE).
