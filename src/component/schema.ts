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
 * - `by_author_resource` — list every kind a subject placed on a resource
 *   (`myReactions`).
 */
export default defineSchema({
  reactions: defineTable({
    authorRef: v.string(),
    resourceRef: v.string(),
    kind: v.string(),
    createdAt: v.number(),
  })
    .index("by_author_resource_kind", ["authorRef", "resourceRef", "kind"])
    .index("by_resource_kind", ["resourceRef", "kind", "createdAt"])
    .index("by_author_resource", ["authorRef", "resourceRef"]),
});
