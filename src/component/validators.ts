import { v } from "convex/values";

/**
 * Public projection of a stored reaction edge returned by {@link reactors}.
 * `authorRef` and `resourceRef` are opaque host references the component never
 * de-references; `kind` is the reaction tag (an emoji, `"up"`/`"down"`, `"like"`
 * — the host decides the vocabulary and may constrain it with an allowlist).
 */
export const reactionView = v.object({
  authorRef: v.string(),
  resourceRef: v.string(),
  kind: v.string(),
  createdAt: v.number(),
});

/**
 * A single `{ kind, count }` tally returned by {@link counts}. The component
 * counts reaction edges per `kind` on a resource; `kind` is host-defined and
 * opaque.
 */
export const kindCount = v.object({
  kind: v.string(),
  count: v.number(),
});

/**
 * The result of a toggle {@link react} call: whether the edge now exists
 * (`reacted`) after the toggle, and the action that produced that state.
 */
export const reactResult = v.object({
  reacted: v.boolean(),
  action: v.union(v.literal("added"), v.literal("removed")),
});
