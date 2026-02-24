import { describe, expect, test, mock } from "bun:test";
import { expectTypeOf } from "expect-type";
import { defineSchema, defineTable } from "convex/server";
import type { GenericDatabaseReader, GenericDatabaseWriter, WithoutSystemFields, DocumentByName, DataModelFromSchemaDefinition } from "convex/server";
import type { GenericId } from "convex/values";
import { v } from "convex/values";
import { createZen, defineRelations, q, ZEN_SCHEMA } from "../../src/index.js";
import type { Zen, ZenQueryBuilder } from "../../src/index.js";
import { defineJoinTable } from "../../src/index.js";

// ---------------------------------------------------------------------------
// Test schema (mirrors forum example)
// ---------------------------------------------------------------------------

const schema = defineSchema({
  users: defineTable({
    name: v.string(),
    email: v.string(),
  }).index("byEmail", ["email"]),

  categories: defineTable({
    name: v.string(),
    description: v.string(),
  }),

  threads: defineTable({
    title: v.string(),
    slug: v.string(),
    categoryId: v.id("categories"),
    authorId: v.id("users"),
    createdAt: v.number(),
  })
    .index("byCategory", ["categoryId"])
    .index("byCategoryCreatedAt", ["categoryId", "createdAt"])
    .index("byAuthor", ["authorId"])
    .index("bySlug", ["slug"]),

  posts: defineTable({
    body: v.string(),
    threadId: v.id("threads"),
    authorId: v.id("users"),
    parentId: v.optional(v.id("posts")),
  })
    .index("byThread", ["threadId"])
    .index("byAuthor", ["authorId"])
    .index("byParent", ["parentId"]),

  tags: defineTable({
    name: v.string(),
  }),

  threadTags: defineJoinTable("threads", "tags", {
    order: v.number(),
  }),

  userFollows: defineTable({
    followerId: v.id("users"),
    followeeId: v.id("users"),
    followedAt: v.number(),
  })
    .index("byFollower", ["followerId"])
    .index("byFollowee", ["followeeId"]),
});

// ---------------------------------------------------------------------------
// Relations config
// ---------------------------------------------------------------------------

const relations = defineRelations(schema, {
  categories: (r) => ({
    threads: r.many.threads({ index: "byCategory" }),
  }),
  threads: (r) => ({
    category: r.one.categories("categoryId"),
    author: r.one.users("authorId"),
    posts: r.many.posts({ onDelete: "cascade" }),
    tags: r.many.tags({ through: "threadTags" }),
  }),
  posts: (r) => ({
    thread: r.one.threads("threadId"),
    author: r.one.users("authorId"),
    parent: r.one.posts("parentId"),
    replies: r.many.posts({ index: "byParent", onDelete: "setNull" }),
  }),
  users: (r) => ({
    threads: r.many.threads({ index: "byAuthor", onDelete: "cascade" }),
    posts: r.many.posts({ index: "byAuthor", onDelete: "cascade" }),
    followers: r.many.users({ through: "userFollows", index: "byFollowee" }),
    following: r.many.users({ through: "userFollows", index: "byFollower" }),
  }),
  tags: (r) => ({
    threads: r.many.threads({ through: "threadTags" }),
  }),
});

// ---------------------------------------------------------------------------
// Mock Convex db
// ---------------------------------------------------------------------------

interface MockChain {
  withIndex: ReturnType<typeof mock>;
  order: ReturnType<typeof mock>;
  collect: ReturnType<typeof mock>;
  first: ReturnType<typeof mock>;
  take: ReturnType<typeof mock>;
  paginate: ReturnType<typeof mock>;
  [Symbol.asyncIterator]: () => AsyncIterator<Record<string, unknown>>;
}

function createMockDb(docs: Record<string, unknown>[] = []) {
  const chain: MockChain = {
    withIndex: mock(() => chain),
    order: mock(() => chain),
    collect: mock(() => Promise.resolve(docs)),
    first: mock(() => Promise.resolve(docs[0] ?? null)),
    take: mock((n: number) => Promise.resolve(docs.slice(0, n))),
    paginate: mock((opts: { numItems: number; cursor: string | null }) =>
      Promise.resolve({
        page: docs.slice(0, opts.numItems),
        isDone: docs.length <= opts.numItems,
        continueCursor: "cursor_abc",
      }),
    ),
    [Symbol.asyncIterator]() {
      let i = 0;
      return {
        async next(): Promise<IteratorResult<Record<string, unknown>>> {
          if (i < docs.length) return { value: docs[i++]!, done: false };
          return { value: undefined, done: true } as IteratorReturnResult<undefined>;
        },
        async return(): Promise<IteratorResult<Record<string, unknown>>> {
          return { value: undefined, done: true } as IteratorReturnResult<undefined>;
        },
      };
    },
  };

  const db = {
    get: mock((id: string) =>
      Promise.resolve(docs.find((d) => d._id === id) ?? null),
    ),
    query: mock((_tableName: string) => ({
      withIndex: chain.withIndex,
      order: chain.order,
      collect: chain.collect,
      first: chain.first,
      take: chain.take,
      paginate: chain.paginate,
      [Symbol.asyncIterator]: chain[Symbol.asyncIterator].bind(chain),
    })),
  };

  return { db, chain };
}

// ---------------------------------------------------------------------------
// Runtime tests — find
// ---------------------------------------------------------------------------

describe("createZen — find", () => {
  test("find returns document by ID", async () => {
    const doc = { _id: "123", _creationTime: 0, body: "hello", threadId: "t1", authorId: "u1" };
    const { db } = createMockDb([doc]);
    const zen = createZen({ db } as any, relations);

    const result = await zen.posts.find("123" as GenericId<"posts">);
    expect(db.get).toHaveBeenCalledWith("123");
    expect(result as any).toEqual(doc);
  });

  test("find returns null for missing document", async () => {
    const { db } = createMockDb([]);
    const zen = createZen({ db } as any, relations);

    const result = await zen.posts.find("missing" as GenericId<"posts">);
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Runtime tests — full table scan
// ---------------------------------------------------------------------------

describe("createZen — full table scan", () => {
  test("findMany returns all documents", async () => {
    const docs = [
      { _id: "1", _creationTime: 0, body: "a", threadId: "t1", authorId: "u1" },
      { _id: "2", _creationTime: 0, body: "b", threadId: "t1", authorId: "u2" },
    ];
    const { db, chain } = createMockDb(docs);
    const zen = createZen({ db } as any, relations);

    const result = await zen.posts.findMany();
    expect(db.query).toHaveBeenCalledWith("posts");
    expect(chain.withIndex).not.toHaveBeenCalled();
    expect(result as any).toEqual(docs);
  });

  test("findFirst returns first document", async () => {
    const docs = [{ _id: "1", _creationTime: 0, body: "a", threadId: "t1", authorId: "u1" }];
    const { db, chain } = createMockDb(docs);
    const zen = createZen({ db } as any, relations);

    const result = await zen.posts.findFirst();
    expect(chain.first).toHaveBeenCalled();
    expect(result as any).toEqual(docs[0]);
  });

  test("findMany with order: desc", async () => {
    const { db, chain } = createMockDb([]);
    const zen = createZen({ db } as any, relations);

    await zen.posts.findMany({ order: "desc" });
    expect(chain.order).toHaveBeenCalledWith("desc");
  });
});

// ---------------------------------------------------------------------------
// Runtime tests — index queries
// ---------------------------------------------------------------------------

describe("createZen — index queries", () => {
  test("index query calls withIndex with correct name", async () => {
    const { db, chain } = createMockDb([]);
    const zen = createZen({ db } as any, relations);

    await zen.posts.byThread("t1" as GenericId<"threads">).findMany();
    expect(chain.withIndex).toHaveBeenCalled();
    const [indexName] = chain.withIndex.mock.calls[0]!;
    expect(indexName).toBe("byThread");
  });

  test("index query with equality arg applies .eq()", async () => {
    const { db, chain } = createMockDb([]);
    const zen = createZen({ db } as any, relations);

    // The withIndex callback receives q and should call q.eq
    let capturedCallback: ((q: any) => any) | undefined;
    chain.withIndex.mockImplementation((name: string, cb: (q: any) => any) => {
      capturedCallback = cb;
      return chain;
    });

    await zen.posts.byThread("t1" as GenericId<"threads">).findMany();

    const mockCursor = {
      eq: mock(function (this: any) { return this; }),
      gt: mock(function (this: any) { return this; }),
      gte: mock(function (this: any) { return this; }),
      lt: mock(function (this: any) { return this; }),
      lte: mock(function (this: any) { return this; }),
    };
    capturedCallback!(mockCursor);
    expect(mockCursor.eq).toHaveBeenCalledWith("threadId", "t1");
  });

  test("range args apply correct bounds", async () => {
    const { db, chain } = createMockDb([]);
    const zen = createZen({ db } as any, relations);

    let capturedCallback: ((q: any) => any) | undefined;
    chain.withIndex.mockImplementation((name: string, cb: (q: any) => any) => {
      capturedCallback = cb;
      return chain;
    });

    await zen.threads
      .byCategoryCreatedAt("c1" as GenericId<"categories">, q.gte(100).lt(200))
      .findMany();

    const mockCursor = {
      eq: mock(function (this: any) { return this; }),
      gt: mock(function (this: any) { return this; }),
      gte: mock(function (this: any) { return this; }),
      lt: mock(function (this: any) { return this; }),
      lte: mock(function (this: any) { return this; }),
    };
    capturedCallback!(mockCursor);
    expect(mockCursor.eq).toHaveBeenCalledWith("categoryId", "c1");
    expect(mockCursor.gte).toHaveBeenCalledWith("createdAt", 100);
    expect(mockCursor.lt).toHaveBeenCalledWith("createdAt", 200);
  });

  test("multi-field index with partial args (equality only)", async () => {
    const { db, chain } = createMockDb([]);
    const zen = createZen({ db } as any, relations);

    let capturedCallback: ((q: any) => any) | undefined;
    chain.withIndex.mockImplementation((name: string, cb: (q: any) => any) => {
      capturedCallback = cb;
      return chain;
    });

    await zen.threads.byCategoryCreatedAt("c1" as GenericId<"categories">).findMany();

    const mockCursor = {
      eq: mock(function (this: any) { return this; }),
      gt: mock(function (this: any) { return this; }),
      gte: mock(function (this: any) { return this; }),
      lt: mock(function (this: any) { return this; }),
      lte: mock(function (this: any) { return this; }),
    };
    capturedCallback!(mockCursor);
    expect(mockCursor.eq).toHaveBeenCalledWith("categoryId", "c1");
    expect(mockCursor.gte).not.toHaveBeenCalled();
    expect(mockCursor.lt).not.toHaveBeenCalled();
  });

  test("index query with order: desc", async () => {
    const { db, chain } = createMockDb([]);
    const zen = createZen({ db } as any, relations);

    await zen.posts.byThread("t1" as GenericId<"threads">).findMany({ order: "desc" });
    expect(chain.order).toHaveBeenCalledWith("desc");
  });

  test("findFirst on index query", async () => {
    const doc = { _id: "1", _creationTime: 0, body: "a", threadId: "t1", authorId: "u1" };
    const { db, chain } = createMockDb([doc]);
    const zen = createZen({ db } as any, relations);

    const result = await zen.posts.byThread("t1" as GenericId<"threads">).findFirst();
    expect(chain.first).toHaveBeenCalled();
    expect(result as any).toEqual(doc);
  });
});

// ---------------------------------------------------------------------------
// Runtime tests — error handling
// ---------------------------------------------------------------------------

describe("createZen — errors", () => {
  test("unknown table throws", () => {
    const { db } = createMockDb([]);
    const zen = createZen({ db } as any, relations);

    expect(() => (zen as any).nonexistent).toThrow(/Unknown table/);
  });

  test("unknown index throws", () => {
    const { db } = createMockDb([]);
    const zen = createZen({ db } as any, relations);

    expect(() => (zen.posts as any).nonexistentIndex).toThrow(/unknown index/);
  });
});

// ---------------------------------------------------------------------------
// Runtime tests — filter
// ---------------------------------------------------------------------------

describe("createZen — filter", () => {
  test("findMany with filter applies JS predicate", async () => {
    const docs = [
      { _id: "1", _creationTime: 0, body: "hello", threadId: "t1", authorId: "u1" },
      { _id: "2", _creationTime: 0, body: "", threadId: "t1", authorId: "u2" },
      { _id: "3", _creationTime: 0, body: "world", threadId: "t1", authorId: "u1" },
    ];
    const { db } = createMockDb(docs);
    const zen = createZen({ db } as any, relations);

    const result = await zen.posts.findMany({
      filter: (post) => post.body.length > 0,
    });
    expect(result).toHaveLength(2);
    expect((result as any)[0]._id).toBe("1");
    expect((result as any)[1]._id).toBe("3");
  });

  test("findFirst with filter returns first matching doc", async () => {
    const docs = [
      { _id: "1", _creationTime: 0, body: "", threadId: "t1", authorId: "u1" },
      { _id: "2", _creationTime: 0, body: "found", threadId: "t1", authorId: "u2" },
    ];
    const { db } = createMockDb(docs);
    const zen = createZen({ db } as any, relations);

    const result = await zen.posts.findFirst({
      filter: (post) => post.body.length > 0,
    });
    expect((result as any)?._id).toBe("2");
  });

  test("findFirst with filter returns null when none match", async () => {
    const docs = [
      { _id: "1", _creationTime: 0, body: "", threadId: "t1", authorId: "u1" },
    ];
    const { db } = createMockDb(docs);
    const zen = createZen({ db } as any, relations);

    const result = await zen.posts.findFirst({
      filter: (post) => post.body.length > 0,
    });
    expect(result).toBeNull();
  });

  test("filter works with index query", async () => {
    const docs = [
      { _id: "1", _creationTime: 0, body: "long", threadId: "t1", authorId: "u1" },
      { _id: "2", _creationTime: 0, body: "", threadId: "t1", authorId: "u2" },
    ];
    const { db } = createMockDb(docs);
    const zen = createZen({ db } as any, relations);

    const result = await zen.posts.byThread("t1" as GenericId<"threads">).findMany({
      filter: (post) => post.body.length > 0,
    });
    expect(result).toHaveLength(1);
    expect((result as any)[0]._id).toBe("1");
  });
});

// ---------------------------------------------------------------------------
// Runtime tests — take
// ---------------------------------------------------------------------------

describe("createZen — take", () => {
  test("findMany with take calls take(n)", async () => {
    const docs = [
      { _id: "1", _creationTime: 0, body: "a", threadId: "t1", authorId: "u1" },
      { _id: "2", _creationTime: 0, body: "b", threadId: "t1", authorId: "u2" },
      { _id: "3", _creationTime: 0, body: "c", threadId: "t1", authorId: "u1" },
    ];
    const { db, chain } = createMockDb(docs);
    const zen = createZen({ db } as any, relations);

    const result = await zen.posts.findMany({ take: 2 });
    expect(chain.take).toHaveBeenCalledWith(2);
    expect(result).toHaveLength(2);
  });

  test("findMany without take calls collect()", async () => {
    const docs = [
      { _id: "1", _creationTime: 0, body: "a", threadId: "t1", authorId: "u1" },
    ];
    const { db, chain } = createMockDb(docs);
    const zen = createZen({ db } as any, relations);

    await zen.posts.findMany();
    expect(chain.collect).toHaveBeenCalled();
    expect(chain.take).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Runtime tests — select/omit
// ---------------------------------------------------------------------------

describe("createZen — select/omit", () => {
  test("findMany with select returns only selected fields", async () => {
    const docs = [
      { _id: "1", _creationTime: 0, body: "hello", threadId: "t1", authorId: "u1" },
    ];
    const { db } = createMockDb(docs);
    const zen = createZen({ db } as any, relations);

    // Return type stays Doc[] — cast to any for partial-field assertions
    const result = await zen.posts.findMany({ select: ["_id", "body"] });
    expect(result as any).toEqual([{ _id: "1", body: "hello" }]);
  });

  test("findMany with omit excludes omitted fields", async () => {
    const docs = [
      { _id: "1", _creationTime: 0, body: "hello", threadId: "t1", authorId: "u1" },
    ];
    const { db } = createMockDb(docs);
    const zen = createZen({ db } as any, relations);

    const result = await zen.posts.findMany({ omit: ["body"] });
    expect(result as any).toEqual([{ _id: "1", _creationTime: 0, threadId: "t1", authorId: "u1" }]);
  });

  test("findFirst with select returns only selected fields", async () => {
    const docs = [
      { _id: "1", _creationTime: 0, body: "hello", threadId: "t1", authorId: "u1" },
    ];
    const { db } = createMockDb(docs);
    const zen = createZen({ db } as any, relations);

    const result = await zen.posts.findFirst({ select: ["_id", "body"] });
    expect(result as any).toEqual({ _id: "1", body: "hello" });
  });

  test("findFirst with omit excludes omitted fields", async () => {
    const docs = [
      { _id: "1", _creationTime: 0, body: "hello", threadId: "t1", authorId: "u1" },
    ];
    const { db } = createMockDb(docs);
    const zen = createZen({ db } as any, relations);

    const result = await zen.posts.findFirst({ omit: ["body", "_creationTime"] });
    expect(result as any).toEqual({ _id: "1", threadId: "t1", authorId: "u1" });
  });

  test("find with select returns only selected fields", async () => {
    const doc = { _id: "123", _creationTime: 0, body: "hello", threadId: "t1", authorId: "u1" };
    const { db } = createMockDb([doc]);
    const zen = createZen({ db } as any, relations);

    const result = await zen.posts.find("123" as GenericId<"posts">, { select: ["_id", "body"] });
    expect(result as any).toEqual({ _id: "123", body: "hello" });
  });

  test("find with omit excludes omitted fields", async () => {
    const doc = { _id: "123", _creationTime: 0, body: "hello", threadId: "t1", authorId: "u1" };
    const { db } = createMockDb([doc]);
    const zen = createZen({ db } as any, relations);

    const result = await zen.posts.find("123" as GenericId<"posts">, { omit: ["body"] });
    expect(result as any).toEqual({ _id: "123", _creationTime: 0, threadId: "t1", authorId: "u1" });
  });

  test("find returns null for missing doc even with options", async () => {
    const { db } = createMockDb([]);
    const zen = createZen({ db } as any, relations);

    const result = await zen.posts.find("missing" as GenericId<"posts">, { select: ["_id"] });
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Runtime tests — combined options
// ---------------------------------------------------------------------------

describe("createZen — combined options", () => {
  test("filter + take + omit", async () => {
    const docs = [
      { _id: "1", _creationTime: 0, body: "hello", threadId: "t1", authorId: "u1" },
      { _id: "2", _creationTime: 0, body: "", threadId: "t1", authorId: "u2" },
      { _id: "3", _creationTime: 0, body: "world", threadId: "t1", authorId: "u1" },
    ];
    const { db } = createMockDb(docs);
    const zen = createZen({ db } as any, relations);

    const result = await zen.posts.findMany({
      filter: (post) => post.body.length > 0,
      take: 1,
      omit: ["_creationTime"],
    });
    // filter(predicate) + take(1) → one result, without _creationTime
    expect(result).toHaveLength(1);
    expect((result as any)[0]).toEqual({ _id: "1", body: "hello", threadId: "t1", authorId: "u1" });
  });

  test("order + select on index query", async () => {
    const docs = [
      { _id: "1", _creationTime: 0, body: "a", threadId: "t1", authorId: "u1" },
    ];
    const { db, chain } = createMockDb(docs);
    const zen = createZen({ db } as any, relations);

    const result = await zen.posts.byThread("t1" as GenericId<"threads">).findMany({
      order: "desc",
      select: ["_id"],
    });
    expect(chain.order).toHaveBeenCalledWith("desc");
    expect(result as any).toEqual([{ _id: "1" }]);
  });
});

// ---------------------------------------------------------------------------
// Runtime tests — with (relation loading)
// ---------------------------------------------------------------------------

describe("createZen — with (one relation)", () => {
  test("findMany with one relation loads related doc", async () => {
    const user = { _id: "u1", _creationTime: 0, name: "Alice", email: "a@b.c" };
    const post = { _id: "p1", _creationTime: 0, body: "hello", threadId: "t1", authorId: "u1" };

    const db = {
      get: mock((id: string) => {
        if (id === "u1") return Promise.resolve(user);
        if (id === "p1") return Promise.resolve(post);
        return Promise.resolve(null);
      }),
      query: mock(() => ({
        withIndex: mock(function (this: any) { return this; }),
        order: mock(function (this: any) { return this; }),
        collect: mock(() => Promise.resolve([post])),
        first: mock(() => Promise.resolve(post)),
        take: mock((n: number) => Promise.resolve([post].slice(0, n))),
        [Symbol.asyncIterator]() {
          let i = 0;
          const docs = [post];
          return {
            async next() {
              if (i < docs.length) return { value: docs[i++], done: false };
              return { value: undefined, done: true };
            },
            async return() { return { value: undefined, done: true }; },
          };
        },
      })),
    };

    const zen = createZen({ db } as any, relations);
    const result = await zen.posts.findMany({ with: { author: true } });

    expect(result).toHaveLength(1);
    expect((result as any)[0].author).toEqual(user);
  });

  test("find with one relation loads related doc", async () => {
    const user = { _id: "u1", _creationTime: 0, name: "Alice", email: "a@b.c" };
    const post = { _id: "p1", _creationTime: 0, body: "hello", threadId: "t1", authorId: "u1" };

    const db = {
      get: mock((id: string) => {
        if (id === "p1") return Promise.resolve(post);
        if (id === "u1") return Promise.resolve(user);
        return Promise.resolve(null);
      }),
      query: mock(() => ({})),
    };

    const zen = createZen({ db } as any, relations);
    const result = await zen.posts.find("p1" as GenericId<"posts">, { with: { author: true } });

    expect((result as any).author).toEqual(user);
  });

  test("optional FK returns null when FK is null", async () => {
    const post = { _id: "p1", _creationTime: 0, body: "hello", threadId: "t1", authorId: "u1", parentId: null };

    const db = {
      get: mock((id: string) => {
        if (id === "p1") return Promise.resolve(post);
        return Promise.resolve(null);
      }),
      query: mock(() => ({
        withIndex: mock(function (this: any) { return this; }),
        order: mock(function (this: any) { return this; }),
        collect: mock(() => Promise.resolve([post])),
        first: mock(() => Promise.resolve(post)),
        take: mock((n: number) => Promise.resolve([post].slice(0, n))),
        [Symbol.asyncIterator]() {
          let i = 0;
          const docs = [post];
          return {
            async next() {
              if (i < docs.length) return { value: docs[i++], done: false };
              return { value: undefined, done: true };
            },
            async return() { return { value: undefined, done: true }; },
          };
        },
      })),
    };

    const zen = createZen({ db } as any, relations);
    const result = await zen.posts.findMany({ with: { parent: true } });

    expect((result as any)[0].parent).toBeNull();
  });

  test("missing target returns null", async () => {
    const post = { _id: "p1", _creationTime: 0, body: "hello", threadId: "t1", authorId: "u_gone" };

    const db = {
      get: mock((id: string) => {
        if (id === "p1") return Promise.resolve(post);
        return Promise.resolve(null); // u_gone doesn't exist
      }),
      query: mock(() => ({
        withIndex: mock(function (this: any) { return this; }),
        order: mock(function (this: any) { return this; }),
        collect: mock(() => Promise.resolve([post])),
        first: mock(() => Promise.resolve(post)),
        take: mock((n: number) => Promise.resolve([post].slice(0, n))),
        [Symbol.asyncIterator]() {
          let i = 0;
          const docs = [post];
          return {
            async next() {
              if (i < docs.length) return { value: docs[i++], done: false };
              return { value: undefined, done: true };
            },
            async return() { return { value: undefined, done: true }; },
          };
        },
      })),
    };

    const zen = createZen({ db } as any, relations);
    const result = await zen.posts.findMany({ with: { author: true } });

    expect((result as any)[0].author).toBeNull();
  });
});

describe("createZen — with (many relation)", () => {
  test("findMany with many relation loads array", async () => {
    const thread = { _id: "t1", _creationTime: 0, title: "Thread", slug: "thread", categoryId: "c1", authorId: "u1", createdAt: 100 };
    const posts = [
      { _id: "p1", _creationTime: 0, body: "first", threadId: "t1", authorId: "u1" },
      { _id: "p2", _creationTime: 0, body: "second", threadId: "t1", authorId: "u2" },
    ];

    const db = {
      get: mock((id: string) => {
        if (id === "t1") return Promise.resolve(thread);
        return Promise.resolve(null);
      }),
      query: mock((tableName: string) => {
        const chain: any = {
          withIndex: mock(() => chain),
          order: mock(() => chain),
          collect: mock(() => {
            if (tableName === "threads") return Promise.resolve([thread]);
            if (tableName === "posts") return Promise.resolve(posts);
            return Promise.resolve([]);
          }),
          first: mock(() => Promise.resolve(tableName === "threads" ? thread : null)),
          take: mock((n: number) => Promise.resolve(tableName === "threads" ? [thread].slice(0, n) : [])),
          [Symbol.asyncIterator]() {
            let i = 0;
            const docs = tableName === "threads" ? [thread] : [];
            return {
              async next() {
                if (i < docs.length) return { value: docs[i++], done: false };
                return { value: undefined, done: true };
              },
              async return() { return { value: undefined, done: true }; },
            };
          },
        };
        return chain;
      }),
    };

    const zen = createZen({ db } as any, relations);
    const result = await zen.threads.findFirst({ with: { posts: true } });

    expect((result as any).posts).toEqual(posts);
  });

  test("many relation returns empty array when none exist", async () => {
    const thread = { _id: "t1", _creationTime: 0, title: "Thread", slug: "thread", categoryId: "c1", authorId: "u1", createdAt: 100 };

    const db = {
      get: mock((id: string) => {
        if (id === "t1") return Promise.resolve(thread);
        return Promise.resolve(null);
      }),
      query: mock((tableName: string) => {
        const chain: any = {
          withIndex: mock(() => chain),
          order: mock(() => chain),
          collect: mock(() => {
            if (tableName === "threads") return Promise.resolve([thread]);
            return Promise.resolve([]); // no posts
          }),
          first: mock(() => Promise.resolve(tableName === "threads" ? thread : null)),
          take: mock((n: number) => Promise.resolve(tableName === "threads" ? [thread].slice(0, n) : [])),
          [Symbol.asyncIterator]() {
            let i = 0;
            const docs = tableName === "threads" ? [thread] : [];
            return {
              async next() {
                if (i < docs.length) return { value: docs[i++], done: false };
                return { value: undefined, done: true };
              },
              async return() { return { value: undefined, done: true }; },
            };
          },
        };
        return chain;
      }),
    };

    const zen = createZen({ db } as any, relations);
    const result = await zen.threads.findFirst({ with: { posts: true } });

    expect((result as any).posts).toEqual([]);
  });
});

describe("createZen — with (through relation)", () => {
  test("through relation loads targets with pivot data", async () => {
    const thread = { _id: "t1", _creationTime: 0, title: "Thread", slug: "thread", categoryId: "c1", authorId: "u1", createdAt: 100 };
    const tag1 = { _id: "tag1", _creationTime: 0, name: "TypeScript" };
    const tag2 = { _id: "tag2", _creationTime: 0, name: "Convex" };
    const joinRows = [
      { _id: "jt1", _creationTime: 0, threadsId: "t1", tagsId: "tag1", order: 1 },
      { _id: "jt2", _creationTime: 0, threadsId: "t1", tagsId: "tag2", order: 2 },
    ];

    const db = {
      get: mock((id: string) => {
        if (id === "t1") return Promise.resolve(thread);
        if (id === "tag1") return Promise.resolve(tag1);
        if (id === "tag2") return Promise.resolve(tag2);
        return Promise.resolve(null);
      }),
      query: mock((tableName: string) => {
        const chain: any = {
          withIndex: mock(() => chain),
          order: mock(() => chain),
          collect: mock(() => {
            if (tableName === "threads") return Promise.resolve([thread]);
            if (tableName === "threadTags") return Promise.resolve(joinRows);
            return Promise.resolve([]);
          }),
          first: mock(() => Promise.resolve(tableName === "threads" ? thread : null)),
          take: mock((n: number) => Promise.resolve(tableName === "threads" ? [thread].slice(0, n) : [])),
          [Symbol.asyncIterator]() {
            let i = 0;
            const docs = tableName === "threads" ? [thread] : [];
            return {
              async next() {
                if (i < docs.length) return { value: docs[i++], done: false };
                return { value: undefined, done: true };
              },
              async return() { return { value: undefined, done: true }; },
            };
          },
        };
        return chain;
      }),
    };

    const zen = createZen({ db } as any, relations);
    const result = await zen.threads.findFirst({ with: { tags: true } });

    expect((result as any).tags).toHaveLength(2);
    expect((result as any).tags[0]).toEqual({ ...tag1, pivot: { order: 1 } });
    expect((result as any).tags[1]).toEqual({ ...tag2, pivot: { order: 2 } });
  });
});

describe("createZen — with (nesting)", () => {
  test("nested with loads two levels deep", async () => {
    const category = { _id: "c1", _creationTime: 0, name: "General", description: "General stuff" };
    const thread = { _id: "t1", _creationTime: 0, title: "Thread", slug: "thread", categoryId: "c1", authorId: "u1", createdAt: 100 };
    const post = { _id: "p1", _creationTime: 0, body: "hello", threadId: "t1", authorId: "u1" };

    const db = {
      get: mock((id: string) => {
        if (id === "c1") return Promise.resolve(category);
        if (id === "t1") return Promise.resolve(thread);
        if (id === "p1") return Promise.resolve(post);
        return Promise.resolve(null);
      }),
      query: mock((tableName: string) => {
        const chain: any = {
          withIndex: mock(() => chain),
          order: mock(() => chain),
          collect: mock(() => {
            if (tableName === "posts") return Promise.resolve([post]);
            return Promise.resolve([]);
          }),
          first: mock(() => Promise.resolve(tableName === "posts" ? post : null)),
          take: mock((n: number) => Promise.resolve(tableName === "posts" ? [post].slice(0, n) : [])),
          [Symbol.asyncIterator]() {
            let i = 0;
            const docs = tableName === "posts" ? [post] : [];
            return {
              async next() {
                if (i < docs.length) return { value: docs[i++], done: false };
                return { value: undefined, done: true };
              },
              async return() { return { value: undefined, done: true }; },
            };
          },
        };
        return chain;
      }),
    };

    const zen = createZen({ db } as any, relations);
    const result = await zen.posts.findMany({
      with: { thread: { with: { category: true } } },
    });

    expect((result as any)[0].thread).toBeDefined();
    expect((result as any)[0].thread.category).toEqual(category);
  });
});

// ---------------------------------------------------------------------------
// Type tests
// ---------------------------------------------------------------------------

describe("createZen — types", () => {
  // Use a typed zen for type assertions only (no runtime calls)
  type TestCtx = { db: { get: any; query: any } };

  test("zen has table properties", () => {
    type Z = Zen<TestCtx & { db: any }, typeof relations>;
    expectTypeOf<Z>().toHaveProperty("posts");
    expectTypeOf<Z>().toHaveProperty("threads");
    expectTypeOf<Z>().toHaveProperty("users");
    expectTypeOf<Z>().toHaveProperty("categories");
    expectTypeOf<Z>().toHaveProperty("tags");
  });

  test("zen.posts has find, findMany, findFirst", () => {
    type Z = Zen<TestCtx & { db: any }, typeof relations>;
    type Posts = Z["posts"];
    expectTypeOf<Posts>().toHaveProperty("find");
    expectTypeOf<Posts>().toHaveProperty("findMany");
    expectTypeOf<Posts>().toHaveProperty("findFirst");
  });

  test("zen.posts has index methods", () => {
    type Z = Zen<TestCtx & { db: any }, typeof relations>;
    type Posts = Z["posts"];
    expectTypeOf<Posts>().toHaveProperty("byThread");
    expectTypeOf<Posts>().toHaveProperty("byAuthor");
    expectTypeOf<Posts>().toHaveProperty("byParent");
  });

  test("zen.threads has multi-field index", () => {
    type Z = Zen<TestCtx & { db: any }, typeof relations>;
    type Threads = Z["threads"];
    expectTypeOf<Threads>().toHaveProperty("byCategoryCreatedAt");
    expectTypeOf<Threads>().toHaveProperty("byCategory");
    expectTypeOf<Threads>().toHaveProperty("byAuthor");
    expectTypeOf<Threads>().toHaveProperty("bySlug");
  });

  test("index method returns ZenQueryBuilder", () => {
    type Z = Zen<TestCtx & { db: any }, typeof relations>;
    type ByThread = Z["posts"]["byThread"];

    // byThread takes a GenericId<"threads"> and returns a ZenQueryBuilder
    type Result = ReturnType<ByThread>;
    expectTypeOf<Result>().toHaveProperty("findMany");
    expectTypeOf<Result>().toHaveProperty("findFirst");
  });

  test("find takes GenericId of correct table", () => {
    type Z = Zen<TestCtx & { db: any }, typeof relations>;
    type FindPosts = Z["posts"]["find"];
    type FindArg = Parameters<FindPosts>[0];
    expectTypeOf<GenericId<"posts">>().toMatchTypeOf<FindArg>();
  });

  test("findMany accepts filter, order, take, select, omit", () => {
    type Z = Zen<TestCtx & { db: any }, typeof relations>;
    type FindMany = Z["posts"]["findMany"];
    type Opts = NonNullable<Parameters<FindMany>[0]>;

    expectTypeOf<{ filter: (p: any) => boolean }>().toMatchTypeOf<Opts>();
    expectTypeOf<{ order: "asc" }>().toMatchTypeOf<Opts>();
    expectTypeOf<{ take: 10 }>().toMatchTypeOf<Opts>();
    expectTypeOf<{ select: ["body", "_id"] }>().toMatchTypeOf<Opts>();
    expectTypeOf<{ omit: ["body"] }>().toMatchTypeOf<Opts>();
  });

  test("findFirst accepts filter, order, select, omit but not take", () => {
    type Z = Zen<TestCtx & { db: any }, typeof relations>;
    type FindFirst = Z["posts"]["findFirst"];
    type Opts = NonNullable<Parameters<FindFirst>[0]>;

    expectTypeOf<{ filter: (p: any) => boolean }>().toMatchTypeOf<Opts>();
    expectTypeOf<{ order: "desc" }>().toMatchTypeOf<Opts>();
    expectTypeOf<{ select: ["_id"] }>().toMatchTypeOf<Opts>();
    // take should NOT be valid
    expectTypeOf<{ take: 5 }>().not.toMatchTypeOf<Opts>();
  });

  test("find accepts select/omit as second arg", () => {
    type Z = Zen<TestCtx & { db: any }, typeof relations>;
    type Find = Z["posts"]["find"];
    type Opts = NonNullable<Parameters<Find>[1]>;

    expectTypeOf<{ select: ["_id"] }>().toMatchTypeOf<Opts>();
    expectTypeOf<{ omit: ["body"] }>().toMatchTypeOf<Opts>();
    // filter/order/take should NOT be valid
    expectTypeOf<{ filter: (p: any) => boolean }>().not.toMatchTypeOf<Opts>();
  });

  test("select and omit are mutually exclusive", () => {
    type Z = Zen<TestCtx & { db: any }, typeof relations>;
    type FindMany = Z["posts"]["findMany"];
    type Opts = NonNullable<Parameters<FindMany>[0]>;

    // select + omit together should not be assignable
    expectTypeOf<{ select: ["_id"]; omit: ["body"] }>().not.toMatchTypeOf<Opts>();
  });

  test("query builder findMany/findFirst accept options", () => {
    type Z = Zen<TestCtx & { db: any }, typeof relations>;
    type QB = ReturnType<Z["posts"]["byThread"]>;
    type FindManyOpts = NonNullable<Parameters<QB["findMany"]>[0]>;
    type FindFirstOpts = NonNullable<Parameters<QB["findFirst"]>[0]>;

    expectTypeOf<{ filter: (p: any) => boolean; take: 5 }>().toMatchTypeOf<FindManyOpts>();
    expectTypeOf<{ select: ["_id"] }>().toMatchTypeOf<FindFirstOpts>();
  });

  test("with accepts valid relation names", () => {
    type Z = Zen<TestCtx & { db: any }, typeof relations>;
    // Test via function call — overloaded findMany selects the with-overload
    function testWith(zen: Z) {
      zen.posts.findMany({ with: { author: true } });
      zen.posts.findMany({ with: { thread: true } });
      zen.posts.findMany({ with: { parent: true } });
      zen.posts.findMany({ with: { replies: true } });
    }
  });

  test("with supports nested spec", () => {
    type Z = Zen<TestCtx & { db: any }, typeof relations>;
    function testNested(zen: Z) {
      zen.posts.findMany({ with: { thread: { with: { category: true } } } });
    }
  });

  test("findMany without with returns plain Doc", () => {
    type Z = Zen<TestCtx & { db: any }, typeof relations>;
    type Result = Awaited<ReturnType<Z["posts"]["findMany"]>>;
    // Result should be Doc[] — no extra relation fields
    expectTypeOf<Result[0]>().toHaveProperty("body");
    expectTypeOf<Result[0]>().toHaveProperty("threadId");
  });

  test("find with relation returns Doc & relation field", () => {
    type Z = Zen<TestCtx & { db: any }, typeof relations>;
    type FindFn = Z["posts"]["find"];
    // When called with { with: { author: true } }, result should have .author
    type ResultWithAuthor = Awaited<ReturnType<typeof callWithAuthor>>;
    function callWithAuthor(zen: Z) {
      return zen.posts.find("p1" as GenericId<"posts">, { with: { author: true } });
    }
    type NonNull = NonNullable<ResultWithAuthor>;
    expectTypeOf<NonNull>().toHaveProperty("author");
    expectTypeOf<NonNull>().toHaveProperty("body");
  });

  test("findMany with cursor returns PaginationResult", () => {
    type Z = Zen<TestCtx & { db: any }, typeof relations>;
    function callPaginate(zen: Z) {
      return zen.posts.findMany({ take: 10, cursor: null });
    }
    type Result = Awaited<ReturnType<typeof callPaginate>>;
    expectTypeOf<Result>().toHaveProperty("page");
    expectTypeOf<Result>().toHaveProperty("isDone");
    expectTypeOf<Result>().toHaveProperty("continueCursor");
  });

  test("findMany without cursor returns Doc[]", () => {
    type Z = Zen<TestCtx & { db: any }, typeof relations>;
    function callNoPaginate(zen: Z) {
      return zen.posts.findMany({ take: 10 });
    }
    type Result = Awaited<ReturnType<typeof callNoPaginate>>;
    // Should be an array, not PaginationResult
    expectTypeOf<Result>().toBeArray();
    expectTypeOf<Result[0]>().toHaveProperty("body");
  });

  test("findMany with cursor + with returns PaginationResult with relations", () => {
    type Z = Zen<TestCtx & { db: any }, typeof relations>;
    function callPaginateWith(zen: Z) {
      return zen.posts.findMany({ take: 10, cursor: null, with: { author: true } });
    }
    type Result = Awaited<ReturnType<typeof callPaginateWith>>;
    expectTypeOf<Result>().toHaveProperty("page");
    type Page = Result["page"];
    expectTypeOf<Page[0]>().toHaveProperty("author");
    expectTypeOf<Page[0]>().toHaveProperty("body");
  });

  test("query builder findMany with cursor returns PaginationResult", () => {
    type Z = Zen<TestCtx & { db: any }, typeof relations>;
    function callQbPaginate(zen: Z) {
      return zen.posts.byThread("t1" as GenericId<"threads">).findMany({ take: 5, cursor: null });
    }
    type Result = Awaited<ReturnType<typeof callQbPaginate>>;
    expectTypeOf<Result>().toHaveProperty("page");
    expectTypeOf<Result>().toHaveProperty("isDone");
  });
});

// ---------------------------------------------------------------------------
// Runtime tests — cursor pagination
// ---------------------------------------------------------------------------

describe("createZen — cursor pagination", () => {
  test("findMany with cursor: null calls paginate", async () => {
    const docs = [
      { _id: "1", _creationTime: 0, body: "a", threadId: "t1", authorId: "u1" },
      { _id: "2", _creationTime: 0, body: "b", threadId: "t1", authorId: "u2" },
    ];
    const { db, chain } = createMockDb(docs);
    const zen = createZen({ db } as any, relations);

    const result = await zen.posts.findMany({ take: 10, cursor: null });
    expect(chain.paginate).toHaveBeenCalledWith({ numItems: 10, cursor: null });
    expect(result.page as any).toEqual(docs);
    expect(result.isDone).toBe(true);
    expect(result.continueCursor).toBe("cursor_abc");
  });

  test("findMany with cursor string calls paginate with cursor", async () => {
    const docs = [
      { _id: "3", _creationTime: 0, body: "c", threadId: "t1", authorId: "u1" },
    ];
    const { db, chain } = createMockDb(docs);
    const zen = createZen({ db } as any, relations);

    const result = await zen.posts.findMany({ take: 5, cursor: "prev_cursor" });
    expect(chain.paginate).toHaveBeenCalledWith({ numItems: 5, cursor: "prev_cursor" });
    expect(result.page as any).toEqual(docs);
  });

  test("paginate with select applies field selection to page", async () => {
    const docs = [
      { _id: "1", _creationTime: 0, body: "hello", threadId: "t1", authorId: "u1" },
    ];
    const { db } = createMockDb(docs);
    const zen = createZen({ db } as any, relations);

    const result = await zen.posts.findMany({ take: 10, cursor: null, select: ["_id", "body"] });
    expect(result.page as any).toEqual([{ _id: "1", body: "hello" }]);
  });

  test("paginate via index query", async () => {
    const docs = [
      { _id: "1", _creationTime: 0, body: "a", threadId: "t1", authorId: "u1" },
    ];
    const { db, chain } = createMockDb(docs);
    const zen = createZen({ db } as any, relations);

    const result = await zen.posts.byThread("t1" as GenericId<"threads">).findMany({
      take: 5,
      cursor: null,
    });
    expect(chain.withIndex).toHaveBeenCalled();
    expect(chain.paginate).toHaveBeenCalledWith({ numItems: 5, cursor: null });
    expect(result.page as any).toEqual(docs);
  });

  test("paginate with relations resolves on page items", async () => {
    const user = { _id: "u1", _creationTime: 0, name: "Alice", email: "a@b.c" };
    const post = { _id: "p1", _creationTime: 0, body: "hello", threadId: "t1", authorId: "u1" };

    const db = {
      get: mock((id: string) => {
        if (id === "u1") return Promise.resolve(user);
        if (id === "p1") return Promise.resolve(post);
        return Promise.resolve(null);
      }),
      query: mock(() => ({
        withIndex: mock(function (this: any) { return this; }),
        order: mock(function (this: any) { return this; }),
        collect: mock(() => Promise.resolve([post])),
        first: mock(() => Promise.resolve(post)),
        take: mock((n: number) => Promise.resolve([post].slice(0, n))),
        paginate: mock(() =>
          Promise.resolve({
            page: [post],
            isDone: true,
            continueCursor: "cursor_xyz",
          }),
        ),
        [Symbol.asyncIterator]() {
          let i = 0;
          const docs = [post];
          return {
            async next() {
              if (i < docs.length) return { value: docs[i++], done: false };
              return { value: undefined, done: true };
            },
            async return() { return { value: undefined, done: true }; },
          };
        },
      })),
    };

    const zen = createZen({ db } as any, relations);
    const result = await zen.posts.findMany({
      take: 10,
      cursor: null,
      with: { author: true },
    });

    expect(result.page).toHaveLength(1);
    expect((result.page as any)[0].author).toEqual(user);
    expect(result.continueCursor).toBe("cursor_xyz");
  });

  test("paginate defaults to 10 items when take is omitted", async () => {
    const docs = [
      { _id: "1", _creationTime: 0, body: "a", threadId: "t1", authorId: "u1" },
    ];
    const { db, chain } = createMockDb(docs);
    const zen = createZen({ db } as any, relations);

    await (zen.posts.findMany as any)({ cursor: null });
    expect(chain.paginate).toHaveBeenCalledWith({ numItems: 10, cursor: null });
  });
});

// ---------------------------------------------------------------------------
// Runtime tests — relation query options (filter/take/order/select/omit on with)
// ---------------------------------------------------------------------------

describe("createZen — relation query options", () => {
  // Helper: creates a db where thread has 3 posts
  function createRelationDb() {
    const thread = { _id: "t1", _creationTime: 0, title: "Thread", slug: "thread", categoryId: "c1", authorId: "u1", createdAt: 100 };
    const posts = [
      { _id: "p1", _creationTime: 10, body: "alpha", threadId: "t1", authorId: "u1" },
      { _id: "p2", _creationTime: 20, body: "beta", threadId: "t1", authorId: "u2" },
      { _id: "p3", _creationTime: 30, body: "gamma", threadId: "t1", authorId: "u1" },
    ];

    const db = {
      get: mock((id: string) => {
        if (id === "t1") return Promise.resolve(thread);
        const post = posts.find((p) => p._id === id);
        return Promise.resolve(post ?? null);
      }),
      query: mock((tableName: string) => {
        const chain: any = {
          withIndex: mock(() => chain),
          order: mock(() => chain),
          collect: mock(() => {
            if (tableName === "threads") return Promise.resolve([thread]);
            if (tableName === "posts") return Promise.resolve(posts);
            return Promise.resolve([]);
          }),
          first: mock(() => Promise.resolve(tableName === "threads" ? thread : null)),
          take: mock((n: number) => Promise.resolve(tableName === "threads" ? [thread].slice(0, n) : [])),
          [Symbol.asyncIterator]() {
            let i = 0;
            const docs = tableName === "threads" ? [thread] : [];
            return {
              async next() {
                if (i < docs.length) return { value: docs[i++], done: false };
                return { value: undefined, done: true };
              },
              async return() { return { value: undefined, done: true }; },
            };
          },
        };
        return chain;
      }),
    };
    return { db, thread, posts };
  }

  test("filter on many relation", async () => {
    const { db } = createRelationDb();
    const zen = createZen({ db } as any, relations);

    const result = await zen.threads.findFirst({
      with: { posts: { filter: (p) => p.authorId === "u1" } },
    });
    expect((result as any).posts).toHaveLength(2);
    expect((result as any).posts[0]._id).toBe("p1");
    expect((result as any).posts[1]._id).toBe("p3");
  });

  test("take on many relation", async () => {
    const { db } = createRelationDb();
    const zen = createZen({ db } as any, relations);

    const result = await zen.threads.findFirst({
      with: { posts: { take: 2 } },
    });
    expect((result as any).posts).toHaveLength(2);
  });

  test("order desc on many relation", async () => {
    const { db } = createRelationDb();
    const zen = createZen({ db } as any, relations);

    const result = await zen.threads.findFirst({
      with: { posts: { order: "desc" } },
    });
    expect((result as any).posts[0]._id).toBe("p3");
    expect((result as any).posts[2]._id).toBe("p1");
  });

  test("filter + take combo", async () => {
    const { db } = createRelationDb();
    const zen = createZen({ db } as any, relations);

    const result = await zen.threads.findFirst({
      with: { posts: { filter: (p) => p.authorId === "u1", take: 1 } },
    });
    expect((result as any).posts).toHaveLength(1);
    expect((result as any).posts[0]._id).toBe("p1");
  });

  test("select on many relation", async () => {
    const { db } = createRelationDb();
    const zen = createZen({ db } as any, relations);

    const result = await zen.threads.findFirst({
      with: { posts: { select: ["_id", "body"] } },
    });
    const firstPost = (result as any).posts[0];
    expect(firstPost._id).toBe("p1");
    expect(firstPost.body).toBe("alpha");
    expect(firstPost.threadId).toBeUndefined();
    expect(firstPost.authorId).toBeUndefined();
  });

  test("omit on many relation", async () => {
    const { db } = createRelationDb();
    const zen = createZen({ db } as any, relations);

    const result = await zen.threads.findFirst({
      with: { posts: { omit: ["body", "_creationTime"] } },
    });
    const firstPost = (result as any).posts[0];
    expect(firstPost._id).toBe("p1");
    expect(firstPost.body).toBeUndefined();
    expect(firstPost._creationTime).toBeUndefined();
    expect(firstPost.threadId).toBe("t1");
  });

  test("select on one relation", async () => {
    const user = { _id: "u1", _creationTime: 0, name: "Alice", email: "a@b.c" };
    const post = { _id: "p1", _creationTime: 0, body: "hello", threadId: "t1", authorId: "u1" };

    const db = {
      get: mock((id: string) => {
        if (id === "u1") return Promise.resolve(user);
        if (id === "p1") return Promise.resolve(post);
        return Promise.resolve(null);
      }),
      query: mock(() => ({
        withIndex: mock(function (this: any) { return this; }),
        order: mock(function (this: any) { return this; }),
        collect: mock(() => Promise.resolve([post])),
        first: mock(() => Promise.resolve(post)),
        take: mock((n: number) => Promise.resolve([post].slice(0, n))),
        [Symbol.asyncIterator]() {
          let i = 0;
          const docs = [post];
          return {
            async next() {
              if (i < docs.length) return { value: docs[i++], done: false };
              return { value: undefined, done: true };
            },
            async return() { return { value: undefined, done: true }; },
          };
        },
      })),
    };

    const zen = createZen({ db } as any, relations);
    const result = await zen.posts.findMany({
      with: { author: { select: ["_id", "name"] } },
    });
    expect((result as any)[0].author._id).toBe("u1");
    expect((result as any)[0].author.name).toBe("Alice");
    expect((result as any)[0].author.email).toBeUndefined();
  });

  test("select/omit + nested with — options apply before nested loading", async () => {
    // This test verifies that select/omit on the outer relation
    // don't interfere with nested relation loading.
    const category = { _id: "c1", _creationTime: 0, name: "General", description: "General stuff" };
    const thread = { _id: "t1", _creationTime: 0, title: "Thread", slug: "thread", categoryId: "c1", authorId: "u1", createdAt: 100 };
    const post = { _id: "p1", _creationTime: 0, body: "hello", threadId: "t1", authorId: "u1" };

    const db = {
      get: mock((id: string) => {
        if (id === "c1") return Promise.resolve(category);
        if (id === "t1") return Promise.resolve(thread);
        if (id === "p1") return Promise.resolve(post);
        return Promise.resolve(null);
      }),
      query: mock((tableName: string) => {
        const chain: any = {
          withIndex: mock(() => chain),
          order: mock(() => chain),
          collect: mock(() => {
            if (tableName === "posts") return Promise.resolve([post]);
            return Promise.resolve([]);
          }),
          first: mock(() => Promise.resolve(tableName === "posts" ? post : null)),
          take: mock((n: number) => Promise.resolve(tableName === "posts" ? [post].slice(0, n) : [])),
          [Symbol.asyncIterator]() {
            let i = 0;
            const docs = tableName === "posts" ? [post] : [];
            return {
              async next() {
                if (i < docs.length) return { value: docs[i++], done: false };
                return { value: undefined, done: true };
              },
              async return() { return { value: undefined, done: true }; },
            };
          },
        };
        return chain;
      }),
    };

    const zen = createZen({ db } as any, relations);
    // select _id on the thread relation, but also load nested category
    const result = await zen.posts.findMany({
      with: { thread: { select: ["_id", "title"], with: { category: true } } },
    });
    const loadedThread = (result as any)[0].thread;
    expect(loadedThread._id).toBe("t1");
    expect(loadedThread.title).toBe("Thread");
    // select pruned these fields
    expect(loadedThread.slug).toBeUndefined();
    // Nested relation still loaded despite select
    expect(loadedThread.category).toEqual(category);
  });
});

// ---------------------------------------------------------------------------
// Type tests — relation query options
// ---------------------------------------------------------------------------

describe("createZen — relation query options types", () => {
  type TestCtx = { db: { get: any; query: any } };
  type DM = DataModelFromSchemaDefinition<typeof schema>;

  test("filter/take/order are available on many relations", () => {
    type Z = Zen<TestCtx & { db: any }, typeof relations>;
    function testManyOpts(zen: Z) {
      zen.threads.findMany({
        with: {
          posts: {
            filter: (p) => p.body.length > 0,
            order: "desc",
            take: 5,
          },
        },
      });
    }
  });

  test("select/omit accept valid field names on many relation", () => {
    type Z = Zen<TestCtx & { db: any }, typeof relations>;
    function testSelectOmit(zen: Z) {
      zen.threads.findMany({
        with: {
          posts: { select: ["_id", "body"] },
        },
      });
      zen.threads.findMany({
        with: {
          posts: { omit: ["body", "_creationTime"] },
        },
      });
    }
  });

  test("select/omit available on one relation", () => {
    type Z = Zen<TestCtx & { db: any }, typeof relations>;
    function testOneSelectOmit(zen: Z) {
      zen.posts.findMany({
        with: {
          author: { select: ["_id", "name"] },
        },
      });
      zen.posts.findMany({
        with: {
          author: { omit: ["email"] },
        },
      });
    }
  });

  test("filter/take/order NOT available on one descriptors", () => {
    type Z = Zen<TestCtx & { db: any }, typeof relations>;
    type PostsWith = NonNullable<Parameters<Z["posts"]["findMany"]>[0]> extends { with?: infer W } ? W : never;
    // The author relation spec should not have filter/take/order
    type AuthorSpec = NonNullable<NonNullable<PostsWith>["author"]>;
    type AuthorObj = Exclude<AuthorSpec, true>;
    // filter, take, order should not be assignable
    expectTypeOf<{ filter: (d: any) => boolean }>().not.toMatchTypeOf<AuthorObj>();
    expectTypeOf<{ take: 5 }>().not.toMatchTypeOf<AuthorObj>();
    expectTypeOf<{ order: "desc" }>().not.toMatchTypeOf<AuthorObj>();
  });
});

// ---------------------------------------------------------------------------
// Mock writer db
// ---------------------------------------------------------------------------

function createMockWriterDb(docs: Record<string, unknown>[] = []) {
  const { db, chain } = createMockDb(docs);
  const writerDb = {
    ...db,
    insert: mock((_tableName: string, _doc: Record<string, unknown>) =>
      Promise.resolve("new_id"),
    ),
    patch: mock((_id: string, _fields: Record<string, unknown>) =>
      Promise.resolve(),
    ),
    delete: mock((_id: string) => Promise.resolve()),
    replace: mock((_id: string, _doc: Record<string, unknown>) =>
      Promise.resolve(),
    ),
  };
  return { db: writerDb, chain };
}

// ---------------------------------------------------------------------------
// Runtime tests — insert
// ---------------------------------------------------------------------------

describe("createZen — insert", () => {
  // Runtime tests use `as any` on ctx (matching existing test pattern),
  // which makes Ctx["db"] = any. Access write methods via `as any` cast
  // since these tests verify runtime behavior, not types.

  test("insert delegates to db.insert with table name", async () => {
    const { db } = createMockWriterDb();
    const zen = createZen({ db } as any, relations);

    await (zen.posts as any).insert({
      body: "hello",
      threadId: "t1",
      authorId: "u1",
    });
    expect(db.insert).toHaveBeenCalledWith("posts", {
      body: "hello",
      threadId: "t1",
      authorId: "u1",
    });
  });

  test("insert returns the new document ID", async () => {
    const { db } = createMockWriterDb();
    db.insert.mockReturnValue(Promise.resolve("new_post_id"));
    const zen = createZen({ db } as any, relations);

    const id = await (zen.posts as any).insert({
      body: "hello",
      threadId: "t1",
      authorId: "u1",
    });
    expect(id).toBe("new_post_id");
  });

  test("insert on different tables uses correct table name", async () => {
    const { db } = createMockWriterDb();
    const zen = createZen({ db } as any, relations);

    await (zen.users as any).insert({ name: "Alice", email: "alice@test.com" });
    expect(db.insert).toHaveBeenCalledWith("users", {
      name: "Alice",
      email: "alice@test.com",
    });
  });

  test("insert throws on read-only context", () => {
    const { db } = createMockDb();
    const zen = createZen({ db } as any, relations);

    expect(() => (zen.posts as any).insert).toThrow(/requires MutationCtx/);
  });
});

// ---------------------------------------------------------------------------
// Runtime tests — patch
// ---------------------------------------------------------------------------

describe("createZen — patch", () => {
  test("patch delegates to db.patch with id and fields", async () => {
    const { db } = createMockWriterDb();
    const zen = createZen({ db } as any, relations);

    await (zen.posts as any).patch("p1", { body: "updated" });
    expect(db.patch).toHaveBeenCalledWith("p1", { body: "updated" });
  });

  test("patch with multiple fields", async () => {
    const { db } = createMockWriterDb();
    const zen = createZen({ db } as any, relations);

    await (zen.users as any).patch("u1", {
      name: "Bob",
      email: "bob@new.com",
    });
    expect(db.patch).toHaveBeenCalledWith("u1", {
      name: "Bob",
      email: "bob@new.com",
    });
  });

  test("patch throws on read-only context", () => {
    const { db } = createMockDb();
    const zen = createZen({ db } as any, relations);

    expect(() => (zen.posts as any).patch).toThrow(/requires MutationCtx/);
  });
});

// ---------------------------------------------------------------------------
// Runtime tests — upsert
// ---------------------------------------------------------------------------

describe("createZen — upsert", () => {
  test("upsert inserts when existing is null", async () => {
    const { db } = createMockWriterDb();
    db.insert.mockReturnValue(Promise.resolve("new_id"));
    const zen = createZen({ db } as any, relations);

    const id = await (zen.posts as any).upsert(null, {
      body: "hello",
      threadId: "t1",
      authorId: "u1",
    });
    expect(db.insert).toHaveBeenCalledWith("posts", {
      body: "hello",
      threadId: "t1",
      authorId: "u1",
    });
    expect(db.patch).not.toHaveBeenCalled();
    expect(id).toBe("new_id");
  });

  test("upsert patches when existing is non-null", async () => {
    const { db } = createMockWriterDb();
    const zen = createZen({ db } as any, relations);

    const existing = { _id: "p1", _creationTime: 0, body: "old", threadId: "t1", authorId: "u1" };
    const id = await (zen.posts as any).upsert(existing, {
      body: "updated",
      threadId: "t1",
      authorId: "u1",
    });
    expect(db.patch).toHaveBeenCalledWith("p1", {
      body: "updated",
      threadId: "t1",
      authorId: "u1",
    });
    expect(db.insert).not.toHaveBeenCalled();
    expect(id).toBe("p1");
  });

  test("upsert strips system fields before patching", async () => {
    const { db } = createMockWriterDb();
    const zen = createZen({ db } as any, relations);

    const existing = { _id: "u1", _creationTime: 0, name: "Alice", email: "a@b.c" };
    await (zen.users as any).upsert(existing, {
      _id: "should_be_stripped",
      _creationTime: 999,
      name: "Bob",
      email: "bob@test.com",
    });
    // System fields should not appear in the patch
    expect(db.patch).toHaveBeenCalledWith("u1", {
      name: "Bob",
      email: "bob@test.com",
    });
  });

  test("upsert throws on read-only context", () => {
    const { db } = createMockDb();
    const zen = createZen({ db } as any, relations);

    expect(() => (zen.posts as any).upsert).toThrow(/requires MutationCtx/);
  });
});

// ---------------------------------------------------------------------------
// Type tests — write methods
// ---------------------------------------------------------------------------

describe("createZen — write method types", () => {
  type DM = DataModelFromSchemaDefinition<typeof schema>;

  // Writer context type — includes insert method to satisfy isWriter check
  type WriterCtx = { db: GenericDatabaseWriter<DM> };
  // Reader context type — no write methods
  type ReaderCtx = { db: GenericDatabaseReader<DM> };

  test("writer context exposes insert, patch, upsert", () => {
    type Z = Zen<WriterCtx, typeof relations>;
    type Posts = Z["posts"];
    expectTypeOf<Posts>().toHaveProperty("insert");
    expectTypeOf<Posts>().toHaveProperty("patch");
    expectTypeOf<Posts>().toHaveProperty("upsert");
  });

  test("reader context does not expose insert, patch, or upsert", () => {
    type Z = Zen<ReaderCtx, typeof relations>;
    type Posts = Z["posts"];
    expectTypeOf<Posts>().not.toHaveProperty("insert");
    expectTypeOf<Posts>().not.toHaveProperty("patch");
    expectTypeOf<Posts>().not.toHaveProperty("upsert");
  });

  test("insert accepts WithoutSystemFields<Doc>", () => {
    type Z = Zen<WriterCtx, typeof relations>;
    type InsertFn = Z["posts"]["insert"];
    type InsertArg = Parameters<InsertFn>[0];
    // Should accept the document without _id and _creationTime
    type Expected = WithoutSystemFields<DocumentByName<DM, "posts">>;
    expectTypeOf<Expected>().toMatchTypeOf<InsertArg>();
    expectTypeOf<InsertArg>().toMatchTypeOf<Expected>();
  });

  test("insert returns Promise<GenericId<table>>", () => {
    type Z = Zen<WriterCtx, typeof relations>;
    type InsertFn = Z["posts"]["insert"];
    type Result = Awaited<ReturnType<InsertFn>>;
    expectTypeOf<Result>().toMatchTypeOf<GenericId<"posts">>();
  });

  test("patch takes id + partial fields", () => {
    type Z = Zen<WriterCtx, typeof relations>;
    type PatchFn = Z["posts"]["patch"];
    type PatchId = Parameters<PatchFn>[0];
    type PatchFields = Parameters<PatchFn>[1];

    expectTypeOf<GenericId<"posts">>().toMatchTypeOf<PatchId>();
    // Should accept partial fields
    expectTypeOf<{ body: string }>().toMatchTypeOf<PatchFields>();
    // Should accept empty object (partial)
    expectTypeOf<{}>().toMatchTypeOf<PatchFields>();
  });

  test("patch returns Promise<void>", () => {
    type Z = Zen<WriterCtx, typeof relations>;
    type PatchFn = Z["posts"]["patch"];
    type Result = Awaited<ReturnType<PatchFn>>;
    expectTypeOf<Result>().toBeVoid();
  });

  test("upsert takes existing Doc | null + WithoutSystemFields<Doc>", () => {
    type Z = Zen<WriterCtx, typeof relations>;
    type UpsertFn = Z["posts"]["upsert"];
    type Existing = Parameters<UpsertFn>[0];
    type Doc = Parameters<UpsertFn>[1];

    // First arg accepts null
    expectTypeOf<null>().toMatchTypeOf<Existing>();
    // First arg accepts full document
    expectTypeOf<DocumentByName<DM, "posts">>().toMatchTypeOf<Existing>();
    // Second arg matches WithoutSystemFields
    type Expected = WithoutSystemFields<DocumentByName<DM, "posts">>;
    expectTypeOf<Expected>().toMatchTypeOf<Doc>();
  });

  test("upsert returns Promise<GenericId<table>>", () => {
    type Z = Zen<WriterCtx, typeof relations>;
    type UpsertFn = Z["posts"]["upsert"];
    type Result = Awaited<ReturnType<UpsertFn>>;
    expectTypeOf<Result>().toMatchTypeOf<GenericId<"posts">>();
  });

  test("writer context still has read methods", () => {
    type Z = Zen<WriterCtx, typeof relations>;
    type Posts = Z["posts"];
    expectTypeOf<Posts>().toHaveProperty("find");
    expectTypeOf<Posts>().toHaveProperty("findMany");
    expectTypeOf<Posts>().toHaveProperty("findFirst");
    expectTypeOf<Posts>().toHaveProperty("byThread");
  });
});
