/** Public TypeScript surface for the reactions client. */

/** A single reaction edge as returned by {@link Reactions.reactors}. */
export interface ReactionView {
  /** The opaque host subject reference that placed the reaction. */
  authorRef: string;
  /** The opaque host resource reference the reaction is on. */
  resourceRef: string;
  /** The reaction kind (host-defined: an emoji, `"up"`/`"down"`, `"like"`). */
  kind: string;
  /** Absolute ms timestamp the edge was created (server clock). */
  createdAt: number;
}

/** A per-kind tally returned by {@link Reactions.counts}. */
export interface KindCount {
  /** The reaction kind. */
  kind: string;
  /** The number of distinct subjects that reacted with this kind. */
  count: number;
}

/** The outcome of a toggle {@link Reactions.react} call. */
export interface ReactResult {
  /** Whether the subject now holds the edge (true after add, false after remove). */
  reacted: boolean;
  /** Which side of the toggle ran. */
  action: "added" | "removed";
}

/** Construction options for the {@link Reactions} client. */
export interface ReactionsOptions {
  /**
   * Optional allowlist of permitted reaction `kind` values. When set, `react`
   * and `unreact` throw before calling the component if `kind` is not in the
   * list — the host pins its reaction vocabulary (e.g. `["up", "down"]` or a
   * fixed emoji set). Omit to accept any freeform `kind`.
   */
  allowedKinds?: readonly string[];
}
