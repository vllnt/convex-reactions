import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { query } from "./_generated/server";
import { kindCount, reactionView } from "./validators";
import type { Doc } from "./_generated/dataModel";

/** Project a stored reaction row to its public view (drops internal fields). */
function view(row: Doc<"reactions">) {
  return {
    authorRef: row.authorRef,
    resourceRef: row.resourceRef,
    kind: row.kind,
    createdAt: row.createdAt,
  };
}

/**
 * Tally reaction edges per `kind` on one resource. Reads every edge for
 * `resourceRef` via the `by_resource_kind` index (which is prefixed by
 * `resourceRef`, so a `resourceRef`-only range spans all kinds) and groups them
 * into `{ kind, count }` rows, sorted by `kind` for a stable order. A resource
 * with no reactions returns an empty array.
 */
export const counts = query({
  args: { resourceRef: v.string() },
  returns: v.array(kindCount),
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("reactions")
      .withIndex("by_resource_kind", (q) => q.eq("resourceRef", args.resourceRef))
      .collect();
    const tally = new Map<string, number>();
    for (const row of rows) {
      tally.set(row.kind, (tally.get(row.kind) ?? 0) + 1);
    }
    // Sort by kind for a stable, deterministic order. `localeCompare` is a
    // single expression (no comparator branch), so coverage stays exact.
    return [...tally.entries()]
      .map(([kind, count]) => ({ kind, count }))
      .sort((a, b) => a.kind.localeCompare(b.kind));
  },
});

/**
 * Whether a subject holds a `(authorRef, resourceRef, kind)` reaction edge. A
 * unique point read over `by_author_resource_kind` — the per-subject toggle
 * state the host renders next to a reaction control.
 */
export const hasReacted = query({
  args: {
    authorRef: v.string(),
    resourceRef: v.string(),
    kind: v.string(),
  },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const edge = await ctx.db
      .query("reactions")
      .withIndex("by_author_resource_kind", (q) =>
        q
          .eq("authorRef", args.authorRef)
          .eq("resourceRef", args.resourceRef)
          .eq("kind", args.kind),
      )
      .unique();
    return edge !== null;
  },
});

/**
 * Every reaction kind a subject placed on one resource (their own reaction
 * state across kinds), via the `by_author_resource` index. Returns the list of
 * `kind` strings; empty when the subject has not reacted to the resource.
 */
export const myReactions = query({
  args: { authorRef: v.string(), resourceRef: v.string() },
  returns: v.array(v.string()),
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("reactions")
      .withIndex("by_author_resource", (q) =>
        q.eq("authorRef", args.authorRef).eq("resourceRef", args.resourceRef),
      )
      .collect();
    return rows.map((row) => row.kind);
  },
});

/**
 * Page the subjects who reacted to `resourceRef` with one `kind`, oldest first
 * via the `by_resource_kind` index. Takes the standard Convex `paginationOpts`
 * and returns the standard paginated envelope (`page`, `isDone`,
 * `continueCursor`) so the host can list reactors reactively.
 */
export const reactors = query({
  args: {
    resourceRef: v.string(),
    kind: v.string(),
    paginationOpts: paginationOptsValidator,
  },
  returns: v.object({
    page: v.array(reactionView),
    isDone: v.boolean(),
    continueCursor: v.string(),
    splitCursor: v.optional(v.union(v.string(), v.null())),
    pageStatus: v.optional(
      v.union(
        v.literal("SplitRecommended"),
        v.literal("SplitRequired"),
        v.null(),
      ),
    ),
  }),
  handler: async (ctx, args) => {
    const result = await ctx.db
      .query("reactions")
      .withIndex("by_resource_kind", (q) =>
        q.eq("resourceRef", args.resourceRef).eq("kind", args.kind),
      )
      .order("asc")
      .paginate(args.paginationOpts);
    return { ...result, page: result.page.map(view) };
  },
});
