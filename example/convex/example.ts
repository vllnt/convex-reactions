import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import { components } from "./_generated/api";
import { mutation, query } from "./_generated/server";
import { Reactions } from "../../src/client";

/**
 * Host-app wrappers. The host owns auth: resolve identity here, then pass opaque
 * `authorRef` / `resourceRef` strings and a `kind` into the client. Time is
 * server-sourced inside the component — there is no `createdAt` override.
 */
const reactions = new Reactions(components.reactions);

/** A second client on the named `votes` mount — proves mount-safe isolation. */
const votes = new Reactions(components.votes);

/**
 * A strict client pinned to an up/down vocabulary — proves the `allowedKinds`
 * boundary rejects an unknown kind before the component is called.
 */
const strict = new Reactions(components.reactions, {
  allowedKinds: ["up", "down"],
});

const reactionView = v.object({
  authorRef: v.string(),
  resourceRef: v.string(),
  kind: v.string(),
  createdAt: v.number(),
});

const reactResult = v.object({
  reacted: v.boolean(),
  action: v.union(v.literal("added"), v.literal("removed")),
});

const paginated = v.object({
  page: v.array(reactionView),
  isDone: v.boolean(),
  continueCursor: v.string(),
  splitCursor: v.optional(v.union(v.string(), v.null())),
  pageStatus: v.optional(
    v.union(v.literal("SplitRecommended"), v.literal("SplitRequired"), v.null()),
  ),
});

export const react = mutation({
  args: { authorRef: v.string(), resourceRef: v.string(), kind: v.string() },
  returns: reactResult,
  handler: (ctx, a) => reactions.react(ctx, a.authorRef, a.resourceRef, a.kind),
});

export const unreact = mutation({
  args: { authorRef: v.string(), resourceRef: v.string(), kind: v.string() },
  returns: v.boolean(),
  handler: (ctx, a) =>
    reactions.unreact(ctx, a.authorRef, a.resourceRef, a.kind),
});

export const counts = query({
  args: { resourceRef: v.string() },
  returns: v.array(v.object({ kind: v.string(), count: v.number() })),
  handler: (ctx, a) => reactions.counts(ctx, a.resourceRef),
});

export const hasReacted = query({
  args: { authorRef: v.string(), resourceRef: v.string(), kind: v.string() },
  returns: v.boolean(),
  handler: (ctx, a) =>
    reactions.hasReacted(ctx, a.authorRef, a.resourceRef, a.kind),
});

export const myReactions = query({
  args: { authorRef: v.string(), resourceRef: v.string() },
  returns: v.array(v.string()),
  handler: (ctx, a) => reactions.myReactions(ctx, a.authorRef, a.resourceRef),
});

export const reactors = query({
  args: {
    resourceRef: v.string(),
    kind: v.string(),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginated,
  handler: (ctx, a) =>
    reactions.reactors(ctx, a.resourceRef, a.kind, a.paginationOpts),
});

/** Named-mount variants — prove a second instance is independent. */
export const voteUp = mutation({
  args: { authorRef: v.string(), resourceRef: v.string() },
  returns: reactResult,
  handler: (ctx, a) => votes.react(ctx, a.authorRef, a.resourceRef, "up"),
});

export const voteCounts = query({
  args: { resourceRef: v.string() },
  returns: v.array(v.object({ kind: v.string(), count: v.number() })),
  handler: (ctx, a) => votes.counts(ctx, a.resourceRef),
});

/** Strict-client variants — exercise the allowlist. */
export const reactStrict = mutation({
  args: { authorRef: v.string(), resourceRef: v.string(), kind: v.string() },
  returns: reactResult,
  handler: (ctx, a) => strict.react(ctx, a.authorRef, a.resourceRef, a.kind),
});

export const unreactStrict = mutation({
  args: { authorRef: v.string(), resourceRef: v.string(), kind: v.string() },
  returns: v.boolean(),
  handler: (ctx, a) => strict.unreact(ctx, a.authorRef, a.resourceRef, a.kind),
});

/**
 * Host-side bookmark helper — writes the host's own `bookmarks` table, entirely
 * outside the component's sandbox, proving host/component table isolation.
 */
export const addBookmark = mutation({
  args: { resourceRef: v.string(), label: v.string() },
  returns: v.null(),
  handler: async (ctx, { resourceRef, label }) => {
    await ctx.db.insert("bookmarks", { resourceRef, label });
    return null;
  },
});

export const getBookmark = query({
  args: { resourceRef: v.string() },
  returns: v.union(v.null(), v.string()),
  handler: async (ctx, { resourceRef }) => {
    const row = await ctx.db
      .query("bookmarks")
      .withIndex("by_resource", (q) => q.eq("resourceRef", resourceRef))
      .unique();
    return row?.label ?? null;
  },
});
