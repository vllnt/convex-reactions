import type { MutationCtx, QueryCtx } from "./_generated/server.js";

export async function tallyEdges(
  ctx: QueryCtx,
  resourceRef: string,
): Promise<Map<string, number>> {
  const rows = await ctx.db
    .query("reactions")
    .withIndex("by_resource_kind", (q) => q.eq("resourceRef", resourceRef))
    .collect();
  const tally = new Map<string, number>();
  for (const row of rows) {
    tally.set(row.kind, (tally.get(row.kind) ?? 0) + 1);
  }
  return tally;
}

export async function adjustCount(
  ctx: MutationCtx,
  resourceRef: string,
  kind: string,
  delta: 1 | -1,
): Promise<void> {
  const counter = await ctx.db
    .query("reactionCounts")
    .withIndex("by_resource_kind", (q) =>
      q.eq("resourceRef", resourceRef).eq("kind", kind),
    )
    .unique();
  if (counter !== null) {
    const count = counter.count + delta;
    if (count > 0) {
      await ctx.db.patch("reactionCounts", counter._id, { count });
    } else {
      await ctx.db.delete("reactionCounts", counter._id);
    }
    return;
  }
  if (delta < 0) {
    return;
  }
  const tracked = await ctx.db
    .query("reactionCounts")
    .withIndex("by_resource_kind", (q) => q.eq("resourceRef", resourceRef))
    .first();
  const legacyEdge =
    tracked === null
      ? await ctx.db
          .query("reactions")
          .withIndex("by_resource_kind", (q) => q.eq("resourceRef", resourceRef))
          .first()
      : null;
  if (legacyEdge === null) {
    await ctx.db.insert("reactionCounts", { resourceRef, kind, count: 1 });
  }
}
