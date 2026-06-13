import type {
  FunctionArgs,
  FunctionReference,
  FunctionReturnType,
  PaginationOptions,
  PaginationResult,
} from "convex/server";
import type {
  KindCount,
  ReactResult,
  ReactionView,
  ReactionsOptions,
} from "./types.js";

/**
 * The reactions component's function references, as exposed on the host via
 * `components.reactions`. The opaque host refs (`authorRef`/`resourceRef`) and
 * the `kind` are plain strings here; the host owns their meaning.
 */
export interface ReactionsComponent {
  mutations: {
    react: FunctionReference<
      "mutation",
      "internal",
      { authorRef: string; resourceRef: string; kind: string },
      ReactResult
    >;
    unreact: FunctionReference<
      "mutation",
      "internal",
      { authorRef: string; resourceRef: string; kind: string },
      boolean
    >;
  };
  queries: {
    counts: FunctionReference<
      "query",
      "internal",
      { resourceRef: string },
      KindCount[]
    >;
    hasReacted: FunctionReference<
      "query",
      "internal",
      { authorRef: string; resourceRef: string; kind: string },
      boolean
    >;
    myReactions: FunctionReference<
      "query",
      "internal",
      { authorRef: string; resourceRef: string },
      string[]
    >;
    reactors: FunctionReference<
      "query",
      "internal",
      { resourceRef: string; kind: string; paginationOpts: PaginationOptions },
      PaginationResult<ReactionView>
    >;
  };
}

interface RunQueryCtx {
  runQuery<Q extends FunctionReference<"query", "internal">>(
    reference: Q,
    args: FunctionArgs<Q>,
  ): Promise<FunctionReturnType<Q>>;
}

interface RunMutationCtx {
  runMutation<M extends FunctionReference<"mutation", "internal">>(
    reference: M,
    args: FunctionArgs<M>,
  ): Promise<FunctionReturnType<M>>;
}

/**
 * Consumer-facing client for reactions / votes / likes on any resource. A
 * reaction is the opaque edge `(authorRef, resourceRef, kind)`: a host subject
 * reacted to a host resource with one reaction kind. One edge per subject per
 * kind per resource is enforced inside the mutation transaction, so `react`
 * toggles (add if absent, remove if present) and counts stay correct under
 * concurrent toggles.
 *
 * The host owns meaning and auth — it resolves identity, decides who may react,
 * and passes opaque `authorRef` / `resourceRef` strings and a `kind`. Pin the
 * reaction vocabulary with `allowedKinds` to reject unknown kinds at the
 * boundary; omit it to accept freeform kinds.
 *
 * @example
 * ```ts
 * const reactions = new Reactions(components.reactions, {
 *   allowedKinds: ["up", "down"],
 * });
 * await reactions.react(ctx, userId, postId, "up");      // toggle a vote
 * const tally = await reactions.counts(ctx, postId);     // [{ kind: "up", count: 1 }]
 * const mine = await reactions.myReactions(ctx, userId, postId); // ["up"]
 * ```
 */
export class Reactions {
  private readonly allowedKinds: ReadonlySet<string> | undefined;

  constructor(
    private readonly component: ReactionsComponent,
    options: ReactionsOptions = {},
  ) {
    this.allowedKinds =
      options.allowedKinds === undefined
        ? undefined
        : new Set(options.allowedKinds);
  }

  /** Reject a `kind` outside the configured allowlist (no-op when unset). */
  private assertKind(kind: string): void {
    if (this.allowedKinds !== undefined && !this.allowedKinds.has(kind)) {
      throw new Error(
        `invalid reaction kind "${kind}": not in the configured allowlist`,
      );
    }
  }

  /**
   * Toggle a subject's reaction on a resource. Adds the
   * `(authorRef, resourceRef, kind)` edge if absent, removes it if present, in
   * one transaction. Returns whether the edge now exists and which side ran.
   * Throws if `kind` is outside the configured allowlist.
   */
  react(
    ctx: RunMutationCtx,
    authorRef: string,
    resourceRef: string,
    kind: string,
  ): Promise<ReactResult> {
    this.assertKind(kind);
    return ctx.runMutation(this.component.mutations.react, {
      authorRef,
      resourceRef,
      kind,
    });
  }

  /**
   * Remove a subject's reaction edge. Idempotent — removing an edge that does
   * not exist returns `false`; a real removal returns `true`. Throws if `kind`
   * is outside the configured allowlist.
   */
  unreact(
    ctx: RunMutationCtx,
    authorRef: string,
    resourceRef: string,
    kind: string,
  ): Promise<boolean> {
    this.assertKind(kind);
    return ctx.runMutation(this.component.mutations.unreact, {
      authorRef,
      resourceRef,
      kind,
    });
  }

  /**
   * Tally reactions per `kind` on a resource — `[{ kind, count }, ...]` sorted
   * by `kind`. Empty when the resource has no reactions.
   */
  counts(ctx: RunQueryCtx, resourceRef: string): Promise<KindCount[]> {
    return ctx.runQuery(this.component.queries.counts, { resourceRef });
  }

  /** Whether a subject holds a `(authorRef, resourceRef, kind)` reaction edge. */
  hasReacted(
    ctx: RunQueryCtx,
    authorRef: string,
    resourceRef: string,
    kind: string,
  ): Promise<boolean> {
    return ctx.runQuery(this.component.queries.hasReacted, {
      authorRef,
      resourceRef,
      kind,
    });
  }

  /** Every reaction `kind` a subject placed on one resource (their own state). */
  myReactions(
    ctx: RunQueryCtx,
    authorRef: string,
    resourceRef: string,
  ): Promise<string[]> {
    return ctx.runQuery(this.component.queries.myReactions, {
      authorRef,
      resourceRef,
    });
  }

  /**
   * Page the subjects who reacted to a resource with one `kind`, oldest first.
   * Returns the standard Convex pagination envelope.
   */
  reactors(
    ctx: RunQueryCtx,
    resourceRef: string,
    kind: string,
    paginationOpts: PaginationOptions,
  ): Promise<PaginationResult<ReactionView>> {
    return ctx.runQuery(this.component.queries.reactors, {
      resourceRef,
      kind,
      paginationOpts,
    });
  }
}

export type { KindCount, ReactResult, ReactionView, ReactionsOptions };
