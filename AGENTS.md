<!-- convex-ai-start -->

This project uses [Convex](https://convex.dev) as its backend.

When working on Convex code, **always read
`example/convex/_generated/ai/guidelines.md` first** for important guidelines on
how to correctly use Convex APIs and patterns. The file contains rules that
override what you may have learned about Convex from training data.

Convex agent skills for common tasks can be installed by running
`npx convex ai-files install`.

<!-- convex-ai-end -->

That guidelines file is generated and not committed (`.gitignore` ignores
`example/convex/_generated/ai/`), so a fresh clone lacks it. Create it with
`curl -fsSL --create-dirs -o example/convex/_generated/ai/guidelines.md https://version.convex.dev/v1/guidelines`
(network, no deployment). That is the download
`pnpm exec convex ai-files install` does, but that command also installs agent
skills and writes a `CLAUDE.md`, which `pnpm check:agents` rejects. If the
download fails, use https://docs.convex.dev or proceed without the file.

# @vllnt/convex-reactions

Reactions, votes, and likes on any resource, as a Convex component. A reaction
is the opaque edge `(authorRef, resourceRef, kind)`; `react` toggles it (add if
absent, remove if present), `counts` tallies a resource per kind, `reactors`
pages who reacted. It follows the vllnt Component Standard (see the
`oss-packages` hub `AGENTS.md`).

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
    ├── schema.ts           # sandboxed tables: reactions (edges), reactionCounts (per-kind tallies)
    ├── convex.config.ts    # defineComponent("reactions")
    ├── mutations.ts        # react (toggle), unreact (idempotent remove)
    ├── queries.ts          # counts, hasReacted, myReactions, reactors
    ├── tally.ts            # adjustCount (keeps tallies in step), tallyEdges (legacy edge count)
    └── validators.ts       # shared validators (reactionView, kindCount, reactResult)
```

Sandboxed tables:

- `reactions` — one row per edge `{ authorRef, resourceRef, kind, createdAt }`,
  indexed `by_author_resource_kind` (uniqueness / toggle / dedup key; its
  `(authorRef, resourceRef)` prefix serves `myReactions`) and `by_resource_kind`
  (`resourceRef`, `kind`, `createdAt`: reactor listing and the legacy edge
  count).
- `reactionCounts` — one tally row per `{ resourceRef, kind, count }`, indexed
  `by_resource_kind` (`resourceRef`, `kind`); `counts` reads it.

No host tables are touched. The refs and `kind` are opaque to the component.

## Ownership boundary

**Component owns:**

- The reaction edges (`reactions` table) — toggle, remove, count, list
- The per-kind tallies (`reactionCounts` table), kept in step with the edges
- The uniqueness invariant: at most one `(authorRef, resourceRef, kind)` edge
  per subject, enforced inside the mutation transaction
- Server-sourced time — `Date.now()` inside `react` stamps `createdAt`; no
  caller clock
- The per-kind tally and the paginated reactor listing

**Host owns:**

- The subject and the resource being reacted to (and their domain meaning) —
  passed as opaque `authorRef` / `resourceRef` strings
- The reaction vocabulary (`kind`) — freeform, or pinned via the client's
  `allowedKinds`
- Auth and authorization — whether a caller may react to a given resource
- Namespacing the opaque refs (a user id, a row id, a tenant-prefixed key)

**Auth:** the component is completely auth-agnostic. The host resolves identity,
decides access, and passes opaque refs. There is no built-in scope dimension —
the host namespaces refs itself, or mounts a second instance
(`app.use(component, { name })`) for a static partition (e.g. emoji vs votes).

## Key design decisions

- **Transactional uniqueness (the core invariant):** `react` reads the
  `(authorRef, resourceRef, kind)` edge via the `by_author_resource_kind` unique
  index and inserts-or-deletes in the same mutation transaction. Two concurrent
  toggles run in serializable transactions, so a duplicate edge can never exist
  and counts stay exact — this is what makes the toggle safe.

- **`react` is a toggle, `unreact` is an explicit idempotent remove:** `react`
  flips the edge and returns `{ reacted, action }` so the host knows which side
  ran; `unreact` is the unconditional remove (returns `false` on a no-op) for a
  host that wants "ensure absent" semantics rather than a flip.

- **Server-sourced time:** `react` stamps `createdAt` from `Date.now()`
  internally; no API surface accepts a caller-supplied timestamp, so reactor
  ordering cannot be skewed by a client clock.

- **Opaque refs, no `v.any()`:** `authorRef`, `resourceRef`, and `kind` are
  plain typed `v.string()` args — the component never de-references them and
  never reads host tables. There is no arbitrary-data payload, so no `jsonValue`
  escape hatch is needed.

- **Configurable vocabulary at the client boundary:** `allowedKinds` lets the
  host pin its reaction set (votes `["up","down"]`, a fixed emoji list) and is
  enforced in the `Reactions` client before the component is called — the
  component itself stays vocabulary-agnostic (any `kind` is a valid edge).

- **Stored per-kind tallies, no aggregate child:** `react` and `unreact` adjust
  one `reactionCounts` row per `(resourceRef, kind)` in the same transaction as
  the edge write (`adjustCount` in `tally.ts`), and delete it when its count
  reaches zero, so `counts` reads O(kinds) rows instead of every edge. A
  resource whose edges predate the table has no tally rows; writes never start a
  tally for it (no migration, no edge scan on write), and `counts` keeps
  counting its edges via `by_resource_kind` (`tallyEdges`) until all its edges
  are removed. Trade-off: every write on a resource updates its
  `(resource, kind)` row, so very high write rates on one row contend.

- **Backend-only (no `./react` entry):** a reaction tally / reactor list is an
  ordinary reactive `useQuery` over the host's own re-exported `counts` /
  `reactors` refs — a dedicated hook would wrap the host's `api` with no added
  value. Re-run the analysis when a real management-surface consumer appears.

## Conventions

- Mutations in `mutations.ts`, queries in `queries.ts` (enforced by
  `@vllnt/eslint-config/convex`).
- Explicit `args` + `returns` on every Convex function.
- Opaque refs as typed `v.string()` — never `v.any()` dumps; the component holds
  no arbitrary host data.
- 100% test coverage is BLOCKING (`vitest.config.mts` thresholds: statements,
  branches, functions, lines).
- Runtime deps: only official `@convex-dev/*` + `@vllnt/*`.

## Docs sync

| Changed                                                                      | Update in the same commit                                                                                                                                  |
| ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public API (react/unreact/counts/hasReacted/myReactions/reactors signatures) | README `## API` table and `## Common tasks`, `docs/API.md` headings, `llms.txt` context                                                                    |
| Config options / defaults (allowedKinds)                                     | README `## Limits and gotchas`, `docs/API.md` `## Client` section                                                                                          |
| Schema / table / indexes                                                     | Architecture above, `docs/API.md` `## Tables` (checked by `pnpm check:docs`, see below)                                                                    |
| Error model                                                                  | README `## Errors and fixes` table, `docs/API.md` `## Error codes`                                                                                         |
| `peerDependencies.convex` version                                            | `llms.txt` context line (`convex@^X.Y.Z`), `docs/API.md` Compatibility line, README `## Install` and `## Compatibility`                                    |
| Uniqueness / toggle semantics                                                | `docs/API.md` mutation sections, Key design decisions above                                                                                                |
| Shipped docs (`package.json` `files`)                                        | `required` list in `scripts/check-package-files.mjs`, `paths` in `.github/workflows/publish.yml`; relative `./` links in `llms.txt` only for shipped files |
| Any change                                                                   | `pnpm generate:llms` to validate the `llms.txt` index (it generates nothing)                                                                               |

`pnpm check:docs` reads `src/component/schema.ts` and fails when AGENTS.md or
`docs/API.md` does not mention every table and index name in backticks, or when
AGENTS.md, `docs/API.md`, README.md, or `llms.txt` names a backticked `by_*`
index the schema does not define. It does not flag unknown table names.

`pnpm check:documentation` (in `pnpm lint`) enforces the agent-first docs
contract: README `##` sections and their order, install and first example in the
first 40 lines, tagged and complete `ts` examples, resolving relative links,
every public export (TSDoc summary, README `## API` row, `docs/API.md` heading)
and every error code and `Error` message documented, the shared Links, footer
and `llms.txt` Ecosystem blocks, and the `package.json` description and
keywords. `pnpm test:package` (after `pnpm build`) reruns it on the installed
tarball and type-checks every README and `docs/API.md` `ts` example against the
built package.

Grep old values before committing (e.g. after a `peerDependencies.convex` bump,
`git grep "1.41.0"` → only the new range survives).

## Generated code

- Every `**/_generated/**` file is owned exclusively by Convex CLI codegen.
- Never create, edit, lint, or format generated files manually.
- Run `pnpm codegen` to regenerate them and commit the generated output
  unchanged.
