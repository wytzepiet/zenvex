import { describe, expect, test, mock } from "bun:test";
import { expectTypeOf } from "expect-type";
import { defineSchema, defineTable } from "convex/server";
import type {
  DataModelFromSchemaDefinition,
  GenericDatabaseReader,
  GenericDatabaseWriter,
} from "convex/server";
import type { GenericId } from "convex/values";
import { v } from "convex/values";
import { createZen, defineRelations, defineJoinTable } from "../../src/index.js";
import type { Zen } from "../../src/index.js";

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
// Mock helpers
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
// Runtime tests — add option
//
// Runtime tests use `createZen({ db } as any, ...)` which makes Ctx["db"] = any.
// Callbacks that access relation fields use `any` param annotation since the
// actual type safety is verified in the type tests below.
// ---------------------------------------------------------------------------

describe("add — findMany", () => {
  test("add merges computed fields onto each result", async () => {
    const docs = [
      { _id: "1", _creationTime: 0, name: "Alice", email: "a@b.c" },
      { _id: "2", _creationTime: 0, name: "Bob", email: "b@c.d" },
    ];
    const { db } = createMockDb(docs);
    const zen = createZen({ db } as any, relations);

    const result = await zen.users.findMany({
      add: (user) => ({ nameUpper: user.name.toUpperCase() }),
    });
    expect((result as any)[0].nameUpper).toBe("ALICE");
    expect((result as any)[1].nameUpper).toBe("BOB");
    expect((result as any)[0].name).toBe("Alice");
  });

  test("add with relations computes from loaded data", async () => {
    const category = { _id: "c1", _creationTime: 0, name: "General", description: "General" };
    const threads = [
      { _id: "t1", _creationTime: 0, title: "A", slug: "a", categoryId: "c1", authorId: "u1", createdAt: 1 },
      { _id: "t2", _creationTime: 0, title: "B", slug: "b", categoryId: "c1", authorId: "u1", createdAt: 2 },
    ];

    const db = {
      get: mock((id: string) => {
        if (id === "c1") return Promise.resolve(category);
        return Promise.resolve(null);
      }),
      query: mock((tableName: string) => {
        const chain: any = {
          withIndex: mock(() => chain),
          order: mock(() => chain),
          collect: mock(() => {
            if (tableName === "categories") return Promise.resolve([category]);
            if (tableName === "threads") return Promise.resolve(threads);
            return Promise.resolve([]);
          }),
          first: mock(() => Promise.resolve(tableName === "categories" ? category : null)),
          take: mock((n: number) => Promise.resolve([category].slice(0, n))),
          [Symbol.asyncIterator]() {
            let i = 0;
            const docs = tableName === "categories" ? [category] : [];
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
    const result = await zen.categories.findMany({
      with: { threads: true },
      add: (cat) => ({ threadCount: cat.threads.length }),
    });

    expect((result as any)[0].threadCount).toBe(2);
    expect((result as any)[0].threads).toHaveLength(2);
  });
});

describe("add — findFirst", () => {
  test("add merges computed fields onto single result", async () => {
    const docs = [
      { _id: "1", _creationTime: 0, name: "Alice", email: "a@b.c" },
    ];
    const { db } = createMockDb(docs);
    const zen = createZen({ db } as any, relations);

    const result = await zen.users.findFirst({
      add: (user) => ({ greeting: `Hi ${user.name}` }),
    });
    expect((result as any).greeting).toBe("Hi Alice");
  });

  test("findFirst add returns null when no doc", async () => {
    const { db } = createMockDb([]);
    const zen = createZen({ db } as any, relations);

    const result = await zen.users.findFirst({
      add: (user) => ({ greeting: `Hi ${user.name}` }),
    });
    expect(result).toBeNull();
  });
});

describe("add — find", () => {
  test("find with add merges computed fields", async () => {
    const doc = { _id: "u1", _creationTime: 0, name: "Alice", email: "a@b.c" };
    const { db } = createMockDb([doc]);
    const zen = createZen({ db } as any, relations);

    const result = await zen.users.find("u1" as GenericId<"users">, {
      add: (user) => ({ nameLen: user.name.length }),
    });
    expect((result as any).nameLen).toBe(5);
  });

  test("find with add returns null for missing doc", async () => {
    const { db } = createMockDb([]);
    const zen = createZen({ db } as any, relations);

    const result = await zen.users.find("missing" as GenericId<"users">, {
      add: (user) => ({ nameLen: user.name.length }),
    });
    expect(result).toBeNull();
  });
});

describe("add — pagination", () => {
  test("add works with cursor pagination", async () => {
    const docs = [
      { _id: "1", _creationTime: 0, name: "Alice", email: "a@b.c" },
      { _id: "2", _creationTime: 0, name: "Bob", email: "b@c.d" },
    ];
    const { db } = createMockDb(docs);
    const zen = createZen({ db } as any, relations);

    const result = await zen.users.findMany({
      take: 10,
      cursor: null,
      add: (user) => ({ nameUpper: user.name.toUpperCase() }),
    });
    expect(result.page).toHaveLength(2);
    expect((result.page as any)[0].nameUpper).toBe("ALICE");
    expect((result.page as any)[1].nameUpper).toBe("BOB");
    expect(result.continueCursor).toBe("cursor_abc");
  });
});

describe("add — nested inside with", () => {
  test("nested add on many relation computes per child", async () => {
    const category = { _id: "c1", _creationTime: 0, name: "General", description: "General" };
    const threads = [
      { _id: "t1", _creationTime: 0, title: "Thread A", slug: "a", categoryId: "c1", authorId: "u1", createdAt: 1 },
    ];
    const posts = [
      { _id: "p1", _creationTime: 0, body: "first", threadId: "t1", authorId: "u1" },
      { _id: "p2", _creationTime: 0, body: "second", threadId: "t1", authorId: "u2" },
    ];

    const db = {
      get: mock((id: string) => {
        if (id === "c1") return Promise.resolve(category);
        return Promise.resolve(null);
      }),
      query: mock((tableName: string) => {
        const chain: any = {
          withIndex: mock(() => chain),
          order: mock(() => chain),
          collect: mock(() => {
            if (tableName === "categories") return Promise.resolve([category]);
            if (tableName === "threads") return Promise.resolve(threads);
            if (tableName === "posts") return Promise.resolve(posts);
            return Promise.resolve([]);
          }),
          first: mock(() => Promise.resolve(tableName === "categories" ? category : null)),
          take: mock((n: number) => Promise.resolve([category].slice(0, n))),
          [Symbol.asyncIterator]() {
            let i = 0;
            const docs = tableName === "categories" ? [category] : [];
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
    const result = await zen.categories.findMany({
      with: {
        threads: {
          with: { posts: true },
          add: (thread) => ({ postCount: thread.posts.length }),
        },
      },
      add: (cat) => ({ threadCount: cat.threads.length }),
    });

    expect((result as any)[0].threadCount).toBe(1);
    expect((result as any)[0].threads[0].postCount).toBe(2);
    expect((result as any)[0].threads[0].posts).toHaveLength(2);
  });

  test("nested add on one relation computes on single doc", async () => {
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
      with: {
        author: {
          add: (user) => ({ nameUpper: user.name.toUpperCase() }),
        },
      },
    });

    expect((result as any)[0].author.nameUpper).toBe("ALICE");
    expect((result as any)[0].author.name).toBe("Alice");
  });
});

// ---------------------------------------------------------------------------
// Type tests — add option
//
// Use GenericDatabaseReader<DM> (not `any`) to get proper types.
// With `db: any`, Ctx["db"] extends { insert: ... } distributes as any,
// creating a union that degrades callback typing.
// ---------------------------------------------------------------------------

describe("add — types", () => {
  type DM = DataModelFromSchemaDefinition<typeof schema>;
  type ReaderCtx = { db: GenericDatabaseReader<DM> };
  type Z = Zen<ReaderCtx, typeof schema, typeof relations>;

  test("findMany with add returns Doc & A", () => {
    function callAdd(zen: Z) {
      return zen.users.findMany({
        add: (user) => ({ nameUpper: user.name.toUpperCase() }),
      });
    }
    type Result = Awaited<ReturnType<typeof callAdd>>;
    expectTypeOf<Result[0]>().toHaveProperty("nameUpper");
    expectTypeOf<Result[0]>().toHaveProperty("name");
  });

  test("findMany with add + with returns Doc & WithResult & A", () => {
    function callAddWith(zen: Z) {
      return zen.categories.findMany({
        with: { threads: true },
        add: (cat) => ({ threadCount: cat.threads.length }),
      });
    }
    type Result = Awaited<ReturnType<typeof callAddWith>>;
    expectTypeOf<Result[0]>().toHaveProperty("threadCount");
    expectTypeOf<Result[0]>().toHaveProperty("threads");
    expectTypeOf<Result[0]>().toHaveProperty("name");
  });

  test("findFirst with add returns (Doc & A) | null", () => {
    function callAdd(zen: Z) {
      return zen.users.findFirst({
        add: (user) => ({ greeting: `Hi ${user.name}` }),
      });
    }
    type Result = Awaited<ReturnType<typeof callAdd>>;
    type NonNull = NonNullable<Result>;
    expectTypeOf<NonNull>().toHaveProperty("greeting");
    expectTypeOf<NonNull>().toHaveProperty("name");
  });

  test("find with add returns (Doc & A) | null", () => {
    function callAdd(zen: Z) {
      return zen.users.find("u1" as GenericId<"users">, {
        add: (user) => ({ nameLen: user.name.length }),
      });
    }
    type Result = Awaited<ReturnType<typeof callAdd>>;
    type NonNull = NonNullable<Result>;
    expectTypeOf<NonNull>().toHaveProperty("nameLen");
    expectTypeOf<NonNull>().toHaveProperty("name");
  });

  test("findMany with cursor + add returns PaginationResult with A", () => {
    function callPaginateAdd(zen: Z) {
      return zen.users.findMany({
        take: 10,
        cursor: null,
        add: (user) => ({ nameUpper: user.name.toUpperCase() }),
      });
    }
    type Result = Awaited<ReturnType<typeof callPaginateAdd>>;
    expectTypeOf<Result>().toHaveProperty("page");
    type Page = Result["page"];
    expectTypeOf<Page[0]>().toHaveProperty("nameUpper");
    expectTypeOf<Page[0]>().toHaveProperty("name");
  });

  test("nested add types are reflected in WithResult", () => {
    function callNestedAdd(zen: Z) {
      return zen.categories.findMany({
        with: {
          threads: {
            with: { posts: true },
            add: (thread) => ({ postCount: thread.posts.length }),
          },
        },
        add: (cat) => ({ threadCount: cat.threads.length }),
      });
    }
    type Result = Awaited<ReturnType<typeof callNestedAdd>>;
    expectTypeOf<Result[0]>().toHaveProperty("threadCount");
    expectTypeOf<Result[0]>().toHaveProperty("threads");
    type Thread = Result[0]["threads"][0];
    expectTypeOf<Thread>().toHaveProperty("postCount");
    expectTypeOf<Thread>().toHaveProperty("posts");
  });

  test("nested add callback parameter is typed", () => {
    function callNestedAdd(zen: Z) {
      return zen.categories.findMany({
        with: {
          threads: {
            with: { posts: true },
            add: (thread) => {
              expectTypeOf(thread).not.toBeAny();
              expectTypeOf(thread.posts).toBeArray();
              expectTypeOf(thread).toHaveProperty("title");
              return { postCount: thread.posts.length };
            },
          },
        },
      });
    }
  });

  test("add callback receives doc with loaded relations", () => {
    function callAddWithRelations(zen: Z) {
      return zen.categories.findMany({
        with: { threads: true },
        add: (cat) => {
          expectTypeOf(cat.threads).toBeArray();
          return { count: cat.threads.length };
        },
      });
    }
    type Result = Awaited<ReturnType<typeof callAddWithRelations>>;
    expectTypeOf<Result[0]>().toHaveProperty("count");
  });

  test("writer context also has correct add typing", () => {
    type WriterCtx = { db: GenericDatabaseWriter<DM> };
    type WZ = Zen<WriterCtx, typeof schema, typeof relations>;
    function callAdd(zen: WZ) {
      return zen.categories.findMany({
        with: { threads: true },
        add: (cat) => ({ threadCount: cat.threads.length }),
      });
    }
    type Result = Awaited<ReturnType<typeof callAdd>>;
    expectTypeOf<Result[0]>().toHaveProperty("threadCount");
    expectTypeOf<Result[0]>().toHaveProperty("threads");
  });
});
