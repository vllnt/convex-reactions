import { ConvexError, v } from "convex/values";
import { mutation } from "./_generated/server.js";
import { reactResult } from "./validators.js";

const MAX_REF_LENGTH = 512;
const MAX_KIND_LENGTH = 128;

function assertEdgeSize(args: { authorRef: string; resourceRef: string; kind: string }): void {
  if (args.authorRef.length > MAX_REF_LENGTH || args.resourceRef.length > MAX_REF_LENGTH) {
    throw new ConvexError({
      code: "INVALID_REF",
      message: `authorRef and resourceRef must be at most ${String(MAX_REF_LENGTH)} characters`,
    });
  }
  if (args.kind.length > MAX_KIND_LENGTH) {
    throw new ConvexError({
      code: "INVALID_KIND",
      message: `kind must be at most ${String(MAX_KIND_LENGTH)} characters`,
    });
  }
}

/**
 * Reject empty refs and kind. An empty ref or kind is never a valid edge key and
 * would silently create rows no real subject, resource, or kind can address.
 */
function assertEdgeKey(args: {
  authorRef: string;
  resourceRef: string;
  kind: string;
}): void {
  if (args.authorRef === "" || args.resourceRef === "") {
    throw new ConvexError({
      code: "INVALID_REF",
      message: "authorRef and resourceRef must be non-empty",
    });
  }
  if (args.kind === "") {
    throw new ConvexError({
      code: "INVALID_KIND",
      message: "kind must be non-empty",
    });
  }
}

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
 *
 * @throws `ConvexError({ code: "INVALID_REF" })` when `authorRef` or `resourceRef`
 *   is empty.
 * @throws `ConvexError({ code: "INVALID_KIND" })` when `kind` is empty.
 */
export const react = mutation({
  args: {
    authorRef: v.string(),
    resourceRef: v.string(),
    kind: v.string(),
  },
  returns: reactResult,
  handler: async (ctx, args) => {
    assertEdgeKey(args);
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
      await ctx.db.delete("reactions", existing._id);
      return { reacted: false, action: "removed" as const };
    }

    assertEdgeSize(args);
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
 * actually deleted. Throws the same `INVALID_REF` / `INVALID_KIND` errors as
 * {@link react} for empty arguments.
 */
export const unreact = mutation({
  args: {
    authorRef: v.string(),
    resourceRef: v.string(),
    kind: v.string(),
  },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    assertEdgeKey(args);
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
    await ctx.db.delete("reactions", existing._id);
    return true;
  },
});
