<!-- convex-ai-start -->
This project uses [Convex](https://convex.dev) as its backend.

When working on Convex code, **always read `example/convex/_generated/ai/guidelines.md` first** for
important guidelines on how to correctly use Convex APIs and patterns. The file contains rules that
override what you may have learned about Convex from training data.

Convex agent skills for common tasks can be installed by running `npx convex ai-files install`.
<!-- convex-ai-end -->

# @vllnt/convex-reactions

Reactions, votes, and likes on any resource, as a Convex component. A reaction is the opaque edge
`(authorRef, resourceRef, kind)`; `react` toggles it (add if absent, remove if present), `counts`
tallies a resource per kind, `reactors` pages who reacted. It follows the vllnt Component Standard
(see the `oss-packages` hub `AGENTS.md`).

## Agent instructions

`AGENTS.md` is the sole agent-instruction source for this repository. Do not add
`CLAUDE.md` or `.claude` content.

## Architecture

```
src/
├── shared.ts              # the component id / default mount name
├── test.ts                # convex-test register() helper
├── client/
│   ├── index.ts           # Reactions class (consumer-facing API)
│   └── types.ts           # public TypeScript interfaces
└── component/
    ├── schema.ts           # sandboxed table: reactions {authorRef, resourceRef, kind, createdAt}
    ├── convex.config.ts    # defineComponent("reactions")
    ├── mutations.ts        # react (toggle), unreact (idempotent remove)
    ├── queries.ts          # counts, hasReacted, myReactions, reactors
    └── validators.ts       # shared validators (reactionView, kindCount, reactResult)
```

Sandboxed table: `reactions` — indexed `by_author_resource_kind` (uniqueness / toggle / dedup key),
`by_resource_kind` (per-resource counts + reactor listing), and `by_author_resource` (a subject's own
reactions). No host tables are touched. The refs and `kind` are opaque to the component.

## Ownership boundary

**Component owns:**

- The reaction edges (`reactions` table) — toggle, remove, count, list
- The uniqueness invariant: at most one `(authorRef, resourceRef, kind)` edge per subject, enforced
  inside the mutation transaction
- Server-sourced time — `Date.now()` inside `react` stamps `createdAt`; no caller clock
- The per-kind tally and the paginated reactor listing

**Host owns:**

- The subject and the resource being reacted to (and their domain meaning) — passed as opaque
  `authorRef` / `resourceRef` strings
- The reaction vocabulary (`kind`) — freeform, or pinned via the client's `allowedKinds`
- Auth and authorization — whether a caller may react to a given resource
- Namespacing the opaque refs (a user id, a row id, a tenant-prefixed key)

**Auth:** the component is completely auth-agnostic. The host resolves identity, decides access, and
passes opaque refs. There is no built-in scope dimension — the host namespaces refs itself, or mounts a
second instance (`app.use(component, { name })`) for a static partition (e.g. emoji vs votes).

## Key design decisions

- **Transactional uniqueness (the core invariant):** `react` reads the `(authorRef, resourceRef, kind)`
  edge via the `by_author_resource_kind` unique index and inserts-or-deletes in the same mutation
  transaction. Two concurrent toggles run in serializable transactions, so a duplicate edge can never
  exist and counts stay exact — this is what makes the toggle safe.

- **`react` is a toggle, `unreact` is an explicit idempotent remove:** `react` flips the edge and
  returns `{ reacted, action }` so the host knows which side ran; `unreact` is the unconditional remove
  (returns `false` on a no-op) for a host that wants "ensure absent" semantics rather than a flip.

- **Server-sourced time:** `react` stamps `createdAt` from `Date.now()` internally; no API surface
  accepts a caller-supplied timestamp, so reactor ordering cannot be skewed by a client clock.

- **Opaque refs, no `v.any()`:** `authorRef`, `resourceRef`, and `kind` are plain typed `v.string()`
  args — the component never de-references them and never reads host tables. There is no arbitrary-data
  payload, so no `jsonValue` escape hatch is needed.

- **Configurable vocabulary at the client boundary:** `allowedKinds` lets the host pin its reaction set
  (votes `["up","down"]`, a fixed emoji list) and is enforced in the `Reactions` client before the
  component is called — the component itself stays vocabulary-agnostic (any `kind` is a valid edge).

- **Counts by index scan, no aggregate child (yet):** `counts` reads a resource's edges via the
  `by_resource_kind` index and tallies in memory — minimal and correct for the 0.1 surface. A future
  version composing `@convex-dev/aggregate` for O(1) counts is the documented growth path (see IDEAS).

- **Backend-only (no `./react` entry):** a reaction tally / reactor list is an ordinary reactive
  `useQuery` over the host's own re-exported `counts` / `reactors` refs — a dedicated hook would wrap the
  host's `api` with no added value. Re-run the analysis when a real management-surface consumer appears.

## Conventions

- Mutations in `mutations.ts`, queries in `queries.ts` (enforced by `@vllnt/eslint-config/convex`).
- Explicit `args` + `returns` on every Convex function.
- Opaque refs as typed `v.string()` — never `v.any()` dumps; the component holds no arbitrary host data.
- 100% test coverage is BLOCKING (`vitest.config.mts` thresholds: statements, branches, functions, lines).
- Runtime deps: only official `@convex-dev/*` + `@vllnt/*`.

## Docs sync

| Changed | Update in the same commit |
|---------|--------------------------|
| Public API (react/unreact/counts/hasReacted/myReactions/reactors signatures) | README API Reference table, `docs/API.md`, `llms.txt` context, regenerate `llms-full.txt` |
| Config options / defaults (allowedKinds) | README API Reference, `docs/API.md` constructor section |
| Schema / table / indexes | README Architecture, `docs/API.md` |
| Error model | `docs/API.md` → `## Error codes` section |
| `peerDependencies.convex` version | `llms.txt` context line (`convex@^X.Y.Z`), `docs/API.md` Compatibility line, README Installation peer note |
| Uniqueness / toggle semantics | `docs/API.md` mutation sections, Key design decisions above |
| Any change | `pnpm generate:llms` to keep `llms-full.txt` current |

Grep old values before committing (e.g. after a `peerDependencies.convex` bump, `git grep "1.41.0"` → only the new range survives).

## Generated code

- Every `**/_generated/**` file is owned exclusively by Convex CLI codegen.
- Never create, edit, lint, or format generated files manually.
- Run `pnpm codegen` to regenerate them and commit the generated output unchanged.
