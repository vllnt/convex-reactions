# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.1] - Unreleased

### Fixed

- `react` and `unreact` now throw `ConvexError` `INVALID_REF` for an empty `authorRef` or
  `resourceRef` and `INVALID_KIND` for an empty `kind`, instead of storing an edge no real subject,
  resource, or kind can address. Previously accepted input that could never be valid.
- `@vllnt/convex-reactions/test` now type-checks for consumers using `moduleResolution`
  `nodenext` as well as `bundler` (explicit `.js` relative imports, Vite client types reference).

### Changed

- Pin GitHub Actions to commit SHAs, scope workflow permissions, and publish `@latest` only from a
  `vX.Y.Z` tag on `main` through npm trusted publishing with provenance.
- Adopt pnpm 10 with a seven-day release-age gate; update `convex-test` to `^0.0.65`.

### Documentation

- README gains a self-contained "Testing your app" snippet; the error table lists the new codes.
- Add tests that assert counts, reactor rows, and `hasReacted` agree under double react,
  concurrent toggles, and removal of a non-existent reaction.

## [0.1.0] - 2026-09-01

### Added

- First release of `@vllnt/convex-reactions` — reactions, votes, and likes on any
  resource, modeled as the opaque edge `(authorRef, resourceRef, kind)`.
- `react(authorRef, resourceRef, kind)` toggles the edge in one transaction (add
  if absent, remove if present), returning `{ reacted, action }`. One edge per
  subject per kind per resource is enforced inside the mutation transaction.
- `unreact(authorRef, resourceRef, kind)` removes the edge; removing one that does
  not exist is an idempotent no-op returning `false`.
- `counts(resourceRef)` tallies edges per kind (sorted by kind); `reactors(
  resourceRef, kind, paginationOpts)` pages the subjects who reacted oldest-first
  via the standard Convex pagination envelope.
- `hasReacted(authorRef, resourceRef, kind)` and `myReactions(authorRef,
  resourceRef)` expose a subject's own reaction state.
- Configurable reaction vocabulary: `new Reactions(component, { allowedKinds })`
  rejects an unknown `kind` at the client boundary before the component is called.
- Server-sourced time: `createdAt` is stamped from `Date.now()` inside the
  mutation — no caller-supplied clock.
- Opaque refs: `authorRef`, `resourceRef`, and `kind` are plain strings the
  component never de-references; it never reads host or sibling tables.
- Mount-safe: correct under multiple `app.use(component, { name })` mounts — each
  instance is sandboxed.
- `reactors` bounds pagination: `numItems` must be an integer from 1 through 1000
  (otherwise it throws `ConvexError` `INVALID_PAGE_SIZE`), and `maximumRowsRead` is
  validated and capped at 1000 for reactive cursor ranges.
- Requires `convex@^1.45.0`.
