/* eslint-disable */
/**
 * Generated `ComponentApi` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type { FunctionReference } from "convex/server";

/**
 * A utility for referencing a Convex component's exposed API.
 *
 * Useful when expecting a parameter like `components.myComponent`.
 * Usage:
 * ```ts
 * async function myFunction(ctx: QueryCtx, component: ComponentApi) {
 *   return ctx.runQuery(component.someFile.someQuery, { ...args });
 * }
 * ```
 */
export type ComponentApi<Name extends string | undefined = string | undefined> =
  {
    mutations: {
      react: FunctionReference<
        "mutation",
        "internal",
        { authorRef: string; kind: string; resourceRef: string },
        { action: "added" | "removed"; reacted: boolean },
        Name
      >;
      unreact: FunctionReference<
        "mutation",
        "internal",
        { authorRef: string; kind: string; resourceRef: string },
        boolean,
        Name
      >;
    };
    queries: {
      counts: FunctionReference<
        "query",
        "internal",
        { resourceRef: string },
        Array<{ count: number; kind: string }>,
        Name
      >;
      hasReacted: FunctionReference<
        "query",
        "internal",
        { authorRef: string; kind: string; resourceRef: string },
        boolean,
        Name
      >;
      myReactions: FunctionReference<
        "query",
        "internal",
        { authorRef: string; resourceRef: string },
        Array<string>,
        Name
      >;
      reactors: FunctionReference<
        "query",
        "internal",
        {
          kind: string;
          paginationOpts: {
            cursor: string | null;
            endCursor?: string | null;
            id?: number;
            maximumBytesRead?: number;
            maximumRowsRead?: number;
            numItems: number;
          };
          resourceRef: string;
        },
        {
          continueCursor: string;
          isDone: boolean;
          page: Array<{
            authorRef: string;
            createdAt: number;
            kind: string;
            resourceRef: string;
          }>;
          pageStatus?: "SplitRecommended" | "SplitRequired" | null;
          splitCursor?: string | null;
        },
        Name
      >;
    };
  };
