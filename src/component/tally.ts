import type { MutationCtx, QueryCtx } from "./_generated/server.js";

export const SEED_SCAN_LIMIT = 1000;

export async function tallyEdges(
  ctx: QueryCtx,
  resourceRef: string,
  limit?: number,
): Promise<Map<string, number>> {
  const range = ctx.db
    .query("reactions")
    .withIndex("by_resource_kind", (q) => q.eq("resourceRef", resourceRef));
  const rows = limit === undefined ? await range.collect() : await range.take(limit);
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
  const seeded = await ctx.db
    .query("reactionCounts")
    .withIndex("by_resource_kind", (q) => q.eq("resourceRef", resourceRef))
    .first();
  if (seeded !== null) {
    await ctx.db.insert("reactionCounts", { resourceRef, kind, count: delta });
    return;
  }
  const tally = await tallyEdges(ctx, resourceRef, SEED_SCAN_LIMIT + 1);
  let edges = 0;
  for (const count of tally.values()) {
    edges += count;
  }
  if (edges > SEED_SCAN_LIMIT) {
    return;
  }
  tally.set(kind, (tally.get(kind) ?? 0) + delta);
  for (const [tallyKind, count] of tally) {
    if (count > 0) {
      await ctx.db.insert("reactionCounts", { resourceRef, kind: tallyKind, count });
    }
  }
}
