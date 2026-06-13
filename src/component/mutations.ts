import { v } from "convex/values";
import { mutation } from "./_generated/server";
import { reactResult } from "./validators";

/**
 * Toggle a reaction edge in one transaction. If the subject has no
 * `(authorRef, resourceRef, kind)` edge it is inserted (`action: "added"`,
 * `reacted: true`); if it already exists the existing edge is deleted
 * (`action: "removed"`, `reacted: false`). The read and the write share the
 * mutation transaction, so two concurrent toggles cannot both insert — the
 * uniqueness invariant (≤1 edge per subject per kind per resource) holds.
 *
 * `createdAt` is stamped from the server clock (`Date.now()` inside the handler
 * — never caller-supplied). `kind` vocabulary and any allowlist are the host's
 * concern, enforced at the client boundary before this call.
 */
export const react = mutation({
  args: {
    authorRef: v.string(),
    resourceRef: v.string(),
    kind: v.string(),
  },
  returns: reactResult,
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("reactions")
      .withIndex("by_author_resource_kind", (q) =>
        q
          .eq("authorRef", args.authorRef)
          .eq("resourceRef", args.resourceRef)
          .eq("kind", args.kind),
      )
      .unique();

    if (existing !== null) {
      await ctx.db.delete(existing._id);
      return { reacted: false, action: "removed" as const };
    }

    await ctx.db.insert("reactions", {
      authorRef: args.authorRef,
      resourceRef: args.resourceRef,
      kind: args.kind,
      createdAt: Date.now(),
    });
    return { reacted: true, action: "added" as const };
  },
});

/**
 * Remove a subject's `(authorRef, resourceRef, kind)` reaction edge. Idempotent:
 * removing an edge that does not exist is a no-op that returns `false`, so a
 * duplicate or replayed `unreact` is safe. Returns `true` only when an edge was
 * actually deleted.
 */
export const unreact = mutation({
  args: {
    authorRef: v.string(),
    resourceRef: v.string(),
    kind: v.string(),
  },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("reactions")
      .withIndex("by_author_resource_kind", (q) =>
        q
          .eq("authorRef", args.authorRef)
          .eq("resourceRef", args.resourceRef)
          .eq("kind", args.kind),
      )
      .unique();
    if (existing === null) {
      return false;
    }
    await ctx.db.delete(existing._id);
    return true;
  },
});
