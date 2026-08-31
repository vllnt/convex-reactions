# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- Treat Convex `_generated` output as CLI-owned, exclude it from formatting, and expose a
  dedicated codegen script.
- Refresh all direct dependencies to their latest compatible releases for canary validation.
- Require `convex@^1.45.0` and update `convex-test` to `^0.0.56`.

## [0.1.0] - 2026-06-14

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
