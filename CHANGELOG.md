# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.1] - Unreleased

### Upgrading

- Downgrading to 0.1.0 is not supported once 0.1.1 has written `reactionCounts`
  tally rows: 0.1.0 writes edges without updating tallies, so upgrading again
  would leave stale counts.
- Edges with an empty `authorRef`, `resourceRef`, or `kind` stored under 0.1.0
  can no longer be removed through `react` or `unreact` (they now throw
  `INVALID_REF` or `INVALID_KIND` first). If you have such rows, remove them
  yourself; a resource that holds one keeps counting from edges.

### Fixed

- `react` and `unreact` now throw `ConvexError` `INVALID_REF` for an empty
  `authorRef` or `resourceRef` and `INVALID_KIND` for an empty `kind`, instead
  of storing an edge no real subject, resource, or kind can address. Previously
  accepted input that could never be valid.
- `@vllnt/convex-reactions/test` now type-checks for consumers using
  `moduleResolution` `nodenext` as well as `bundler` (explicit `.js` relative
  imports, Vite client types reference).
- `register(t)` from `@vllnt/convex-reactions/test` accepts a `convexTest`
  instance built from the host app's own schema; it was typed for the
  component's schema only, so a host schema with its own tables failed to
  type-check (TS2345). No runtime change.

### Changed

- `counts` reads one `reactionCounts` tally row per kind instead of every edge
  on the resource: O(kinds) reads instead of O(edges). Tallies cover every
  resource whose first reaction came after upgrade; a resource with earlier
  edges keeps the edge scan (no migration, and writes never scan legacy edges).
  A tally row is deleted when its count reaches zero.
- `myReactions` uses the `by_author_resource_kind` prefix; the redundant
  `by_author_resource` index is removed (one less index write per
  `react`/`unreact`).
- Development and test toolchain: pnpm 10 with a seven-day release-age gate,
  `convex` 1.51, `convex-test` 0.0.73, Vitest 5.1.1, ESLint 10, and
  `@vllnt/typescript` 3 (stricter type-check flags for this repo's own build;
  emitted JavaScript and `.d.ts` files are identical to a build with the 2.0.0
  flags). The `convex` peer range stays `^1.45.0`.
- Pin GitHub Actions to commit SHAs, scope workflow permissions, and publish
  `@latest` only from a `vX.Y.Z` tag on `main` through npm trusted publishing
  with provenance. CI now also type-checks the component and every test file and
  checks formatting.

### Documentation

- The npm package now ships `docs/API.md`, `CHANGELOG.md`, and `llms.txt` next
  to `README.md`, so the docs under `node_modules/@vllnt/convex-reactions/`
  match the installed version. `llms.txt` links shipped files relatively and
  repository-only files by URL; `docs/API.md` lists every entry point and the
  component's tables. `pnpm lint` fails when a required doc is missing from the
  tarball, a contributor file, internal doc, or test ships, or an `llms.txt`
  link points outside it.
- `reactors` docs no longer claim the 1000-row `maximumRowsRead` cap covers
  reactive cursor ranges: with an `endCursor`, Convex returns the whole range
  between the cursors and ignores `maximumRowsRead` (only its transaction read
  limits apply), so the README states the limit as `numItems` 1 to 1000.
  Behavior is unchanged.
- README gains a self-contained "Testing your app" snippet; the error table
  lists the new codes.
- The npm `homepage` now points to
  <https://oss.vllnt.com/packages/convex-reactions>.

## [0.1.0] - 2026-09-01

### Added

- First release of `@vllnt/convex-reactions` — reactions, votes, and likes on
  any resource, modeled as the opaque edge `(authorRef, resourceRef, kind)`.
- `react(authorRef, resourceRef, kind)` toggles the edge in one transaction (add
  if absent, remove if present), returning `{ reacted, action }`. One edge per
  subject per kind per resource is enforced inside the mutation transaction.
- `unreact(authorRef, resourceRef, kind)` removes the edge; removing one that
  does not exist is an idempotent no-op returning `false`.
- `counts(resourceRef)` tallies edges per kind (sorted by kind);
  `reactors( resourceRef, kind, paginationOpts)` pages the subjects who reacted
  oldest-first via the standard Convex pagination envelope.
- `hasReacted(authorRef, resourceRef, kind)` and
  `myReactions(authorRef, resourceRef)` expose a subject's own reaction state.
- Configurable reaction vocabulary: `new Reactions(component, { allowedKinds })`
  rejects an unknown `kind` at the client boundary before the component is
  called.
- Server-sourced time: `createdAt` is stamped from `Date.now()` inside the
  mutation — no caller-supplied clock.
- Opaque refs: `authorRef`, `resourceRef`, and `kind` are plain strings the
  component never de-references; it never reads host or sibling tables.
- Mount-safe: correct under multiple `app.use(component, { name })` mounts —
  each instance is sandboxed.
- `reactors` bounds pagination: `numItems` must be an integer from 1 through
  1000 (otherwise it throws `ConvexError` `INVALID_PAGE_SIZE`), and
  `maximumRowsRead` is validated and capped at 1000 for reactive cursor ranges.
- Requires `convex@^1.45.0`.
