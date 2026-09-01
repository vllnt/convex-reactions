import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { register } from "../../src/test";

const modules = import.meta.glob("./**/*.ts");

function setup() {
  const t = convexTest(schema, modules);
  register(t); // default "reactions" mount
  register(t, "votes"); // second named mount — proves mount-safety
  return t;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(0);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("reactions — react (toggle)", () => {
  test("react adds an edge, re-react removes it (toggle)", async () => {
    const t = setup();
    const added = await t.mutation(api.example.react, {
      authorRef: "u1",
      resourceRef: "post1",
      kind: "like",
    });
    expect(added).toEqual({ reacted: true, action: "added" });
    expect(
      await t.query(api.example.hasReacted, {
        authorRef: "u1",
        resourceRef: "post1",
        kind: "like",
      }),
    ).toBe(true);

    const removed = await t.mutation(api.example.react, {
      authorRef: "u1",
      resourceRef: "post1",
      kind: "like",
    });
    expect(removed).toEqual({ reacted: false, action: "removed" });
    expect(
      await t.query(api.example.hasReacted, {
        authorRef: "u1",
        resourceRef: "post1",
        kind: "like",
      }),
    ).toBe(false);
  });

  test("createdAt is stamped from the server clock, not the caller", async () => {
    const t = setup();
    vi.setSystemTime(5_000);
    await t.mutation(api.example.react, {
      authorRef: "u1",
      resourceRef: "post1",
      kind: "up",
    });
    const page = await t.query(api.example.reactors, {
      resourceRef: "post1",
      kind: "up",
      paginationOpts: { cursor: null, numItems: 10 },
    });
    expect(page.page[0].createdAt).toBe(5_000);
  });

  test("one subject can hold different kinds on the same resource", async () => {
    const t = setup();
    await t.mutation(api.example.react, {
      authorRef: "u1",
      resourceRef: "post1",
      kind: "up",
    });
    await t.mutation(api.example.react, {
      authorRef: "u1",
      resourceRef: "post1",
      kind: "love",
    });
    const mine = await t.query(api.example.myReactions, {
      authorRef: "u1",
      resourceRef: "post1",
    });
    expect([...mine].sort()).toEqual(["love", "up"]);
  });
});

describe("reactions — unreact (idempotent remove)", () => {
  test("unreact removes an existing edge and returns true", async () => {
    const t = setup();
    await t.mutation(api.example.react, {
      authorRef: "u1",
      resourceRef: "post1",
      kind: "like",
    });
    expect(
      await t.mutation(api.example.unreact, {
        authorRef: "u1",
        resourceRef: "post1",
        kind: "like",
      }),
    ).toBe(true);
    expect(
      await t.query(api.example.hasReacted, {
        authorRef: "u1",
        resourceRef: "post1",
        kind: "like",
      }),
    ).toBe(false);
  });

  test("unreact on a nonexistent edge is a no-op returning false", async () => {
    const t = setup();
    expect(
      await t.mutation(api.example.unreact, {
        authorRef: "ghost",
        resourceRef: "post1",
        kind: "like",
      }),
    ).toBe(false);
  });
});

describe("reactions — uniqueness under concurrency", () => {
  test("two concurrent toggles of the same edge yield exactly one edge state", async () => {
    const t = setup();
    const results = await Promise.allSettled([
      t.mutation(api.example.react, {
        authorRef: "u1",
        resourceRef: "post1",
        kind: "like",
      }),
      t.mutation(api.example.react, {
        authorRef: "u1",
        resourceRef: "post1",
        kind: "like",
      }),
    ]);
    // Both calls run in serializable transactions; the net result is a single
    // consistent edge state (present or absent), never a duplicate row.
    const fulfilled = results.filter((r) => r.status === "fulfilled");
    expect(fulfilled.length).toBeGreaterThanOrEqual(1);
    const counts = await t.query(api.example.counts, { resourceRef: "post1" });
    const likeCount = counts.find((c) => c.kind === "like")?.count ?? 0;
    expect(likeCount).toBeLessThanOrEqual(1);
  });
});

describe("reactions — counts", () => {
  test("tallies distinct subjects per kind, sorted by kind", async () => {
    const t = setup();
    await t.mutation(api.example.react, {
      authorRef: "u1",
      resourceRef: "post1",
      kind: "up",
    });
    await t.mutation(api.example.react, {
      authorRef: "u2",
      resourceRef: "post1",
      kind: "up",
    });
    await t.mutation(api.example.react, {
      authorRef: "u1",
      resourceRef: "post1",
      kind: "love",
    });
    // a reaction on a different resource must not bleed in
    await t.mutation(api.example.react, {
      authorRef: "u3",
      resourceRef: "other",
      kind: "up",
    });
    const counts = await t.query(api.example.counts, { resourceRef: "post1" });
    expect(counts).toEqual([
      { kind: "love", count: 1 },
      { kind: "up", count: 2 },
    ]);
  });

  test("counts on a resource with no reactions is empty", async () => {
    const t = setup();
    expect(await t.query(api.example.counts, { resourceRef: "empty" })).toEqual(
      [],
    );
  });
});

describe("reactions — reactors (paginated)", () => {
  test("pages reactors of one kind oldest first", async () => {
    const t = setup();
    for (let i = 0; i < 3; i++) {
      vi.setSystemTime(i);
      await t.mutation(api.example.react, {
        authorRef: `u${i}`,
        resourceRef: "post1",
        kind: "up",
      });
    }
    const first = await t.query(api.example.reactors, {
      resourceRef: "post1",
      kind: "up",
      paginationOpts: { cursor: null, numItems: 2 },
    });
    expect(first.page.map((r) => r.authorRef)).toEqual(["u0", "u1"]);
    expect(first.isDone).toBe(false);
    const second = await t.query(api.example.reactors, {
      resourceRef: "post1",
      kind: "up",
      paginationOpts: { cursor: first.continueCursor, numItems: 2 },
    });
    expect(second.page.map((r) => r.authorRef)).toEqual(["u2"]);
    expect(second.isDone).toBe(true);
  });

  test("reactors of a kind with none returns an empty done page", async () => {
    const t = setup();
    const r = await t.query(api.example.reactors, {
      resourceRef: "post1",
      kind: "down",
      paginationOpts: { cursor: null, numItems: 10 },
    });
    expect(r.page).toEqual([]);
    expect(r.isDone).toBe(true);
  });

  test.each([0, 1001, 1.5, Number.POSITIVE_INFINITY])(
    "rejects an invalid bounded page size (%s)",
    async (numItems) => {
      const t = setup();
      await expect(
        t.query(api.example.reactors, {
          resourceRef: "post1",
          kind: "up",
          paginationOpts: { cursor: null, numItems },
        }),
      ).rejects.toMatchObject({ data: { code: "INVALID_PAGE_SIZE" } });
    },
  );

  test.each([0, 1.5, Number.POSITIVE_INFINITY])(
    "rejects an invalid maximumRowsRead (%s)",
    async (maximumRowsRead) => {
      const t = setup();
      await expect(
        t.query(api.example.reactors, {
          resourceRef: "post1",
          kind: "up",
          paginationOpts: {
            cursor: null,
            numItems: 1,
            maximumRowsRead,
          },
        }),
      ).rejects.toMatchObject({ data: { code: "INVALID_PAGE_SIZE" } });
    },
  );

  test("accepts the maximum page size", async () => {
    const t = setup();
    const result = await t.query(api.example.reactors, {
      resourceRef: "post1",
      kind: "up",
      paginationOpts: { cursor: null, numItems: 1000 },
    });
    expect(result.page).toEqual([]);
  });

  test("caps an explicit reactive cursor range at 1000 rows", async () => {
    const t = setup();
    for (let i = 0; i < 1001; i++) {
      await t.mutation(api.example.react, {
        authorRef: `bounded-${i}`,
        resourceRef: "bounded-post",
        kind: "up",
      });
    }
    const first = await t.query(api.example.reactors, {
      resourceRef: "bounded-post",
      kind: "up",
      paginationOpts: { cursor: null, numItems: 1000 },
    });
    const tail = await t.query(api.example.reactors, {
      resourceRef: "bounded-post",
      kind: "up",
      paginationOpts: { cursor: first.continueCursor, numItems: 1 },
    });
    const bounded = await t.query(api.example.reactors, {
      resourceRef: "bounded-post",
      kind: "up",
      paginationOpts: {
        cursor: null,
        endCursor: tail.continueCursor,
        numItems: 1,
        maximumRowsRead: 5000,
      },
    });
    expect(bounded.page).toHaveLength(1000);
  });
});

describe("reactions — myReactions", () => {
  test("returns every kind a subject placed on a resource", async () => {
    const t = setup();
    await t.mutation(api.example.react, {
      authorRef: "u1",
      resourceRef: "post1",
      kind: "up",
    });
    await t.mutation(api.example.react, {
      authorRef: "u1",
      resourceRef: "post1",
      kind: "love",
    });
    const mine = await t.query(api.example.myReactions, {
      authorRef: "u1",
      resourceRef: "post1",
    });
    expect([...mine].sort()).toEqual(["love", "up"]);
  });

  test("returns empty when the subject has not reacted", async () => {
    const t = setup();
    expect(
      await t.query(api.example.myReactions, {
        authorRef: "u1",
        resourceRef: "post1",
      }),
    ).toEqual([]);
  });
});

describe("reactions — allowlist (strict client)", () => {
  test("an allowed kind round-trips through the strict client", async () => {
    const t = setup();
    const r = await t.mutation(api.example.reactStrict, {
      authorRef: "u1",
      resourceRef: "post1",
      kind: "up",
    });
    expect(r).toEqual({ reacted: true, action: "added" });
  });

  test("react with a kind outside the allowlist is rejected before storage", async () => {
    const t = setup();
    await expect(
      t.mutation(api.example.reactStrict, {
        authorRef: "u1",
        resourceRef: "post1",
        kind: "love",
      }),
    ).rejects.toThrow(/not in the configured allowlist/);
    expect(await t.query(api.example.counts, { resourceRef: "post1" })).toEqual(
      [],
    );
  });

  test("unreact with a kind outside the allowlist is rejected", async () => {
    const t = setup();
    await expect(
      t.mutation(api.example.unreactStrict, {
        authorRef: "u1",
        resourceRef: "post1",
        kind: "love",
      }),
    ).rejects.toThrow(/not in the configured allowlist/);
  });
});

describe("reactions — mount-safety (independent named mount)", () => {
  test("the same edge in two mounts is independent", async () => {
    const t = setup();
    await t.mutation(api.example.react, {
      authorRef: "u1",
      resourceRef: "post1",
      kind: "like",
    });
    await t.mutation(api.example.voteUp, {
      authorRef: "u1",
      resourceRef: "post1",
    });
    // default mount holds the "like"; the votes mount holds the "up"
    expect(await t.query(api.example.counts, { resourceRef: "post1" })).toEqual([
      { kind: "like", count: 1 },
    ]);
    expect(
      await t.query(api.example.voteCounts, { resourceRef: "post1" }),
    ).toEqual([{ kind: "up", count: 1 }]);
  });
});

describe("reactions — host/component table isolation", () => {
  test("a host bookmark lives in the host table, separate from the component", async () => {
    const t = setup();
    await t.mutation(api.example.react, {
      authorRef: "u1",
      resourceRef: "post1",
      kind: "like",
    });
    await t.mutation(api.example.addBookmark, {
      resourceRef: "post1",
      label: "read later",
    });
    // the host bookmark is readable from the host table
    expect(
      await t.query(api.example.getBookmark, { resourceRef: "post1" }),
    ).toBe("read later");
    // the component reaction is unaffected
    expect(await t.query(api.example.counts, { resourceRef: "post1" })).toEqual([
      { kind: "like", count: 1 },
    ]);
    // a bookmark for a resource with no reactions is fine — fully decoupled
    await t.mutation(api.example.addBookmark, {
      resourceRef: "orphan",
      label: "x",
    });
    expect(
      await t.query(api.example.getBookmark, { resourceRef: "orphan" }),
    ).toBe("x");
    expect(await t.query(api.example.counts, { resourceRef: "orphan" })).toEqual(
      [],
    );
  });
});
