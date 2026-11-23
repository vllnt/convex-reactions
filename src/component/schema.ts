import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

/**
 * Sandboxed table — one reaction edge per row. An edge is the opaque triple
 * `(authorRef, resourceRef, kind)`: a host subject reacted to a host resource
 * with one reaction kind. `createdAt` is stamped from the server clock. The
 * component never de-references the opaque refs and never reads host tables.
 *
 * Indexes:
 * - `by_author_resource_kind` — the uniqueness / toggle / dedup key. A
 *   `(authorRef, resourceRef, kind)` lookup is `.unique()`, so one subject can
 *   hold at most one edge per kind on a resource (enforced in the mutation
 *   transaction).
 * - `by_resource_kind` — count edges of one kind on a resource and page its
 *   reactors oldest-first.
 * - `by_author_resource_kind` also serves `myReactions` through its
 *   `(authorRef, resourceRef)` prefix.
 *
 * `reactionCounts` holds one live tally per `(resourceRef, kind)`, kept in step
 * by `react` / `unreact`, so `counts` reads one row per kind instead of every
 * edge. A resource with no tally rows predates the table and is counted from
 * its edges until its next write creates the tallies.
 */
export default defineSchema({
  reactions: defineTable({
    authorRef: v.string(),
    resourceRef: v.string(),
    kind: v.string(),
    createdAt: v.number(),
  })
    .index("by_author_resource_kind", ["authorRef", "resourceRef", "kind"])
    .index("by_resource_kind", ["resourceRef", "kind", "createdAt"]),
  reactionCounts: defineTable({
    resourceRef: v.string(),
    kind: v.string(),
    count: v.number(),
  }).index("by_resource_kind", ["resourceRef", "kind"]),
});
