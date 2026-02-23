import { describe, it, expect, mock } from "bun:test";
import { createZen } from "../src/createZen";
import { q, isRangeMarker, RANGE_BRAND } from "../src/range";

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

/**
 * Creates a mock index builder that records eq/gt/gte/lt/lte calls.
 * Mimics Convex's withIndex callback builder.
 */
function createMockIndexBuilder() {
  const calls: { method: string; field: string; value: unknown }[] = [];

  const builder: any = new Proxy(
    {},
    {
      get(_target, prop: string) {
        if (prop === "_calls") return calls;
        return (field: string, value: unknown) => {
          calls.push({ method: prop, field, value });
          return builder; // chainable
        };
      },
    },
  );

  return builder;
}

/**
 * Creates a mock query chain that supports order, collect, first, take,
 * paginate, and async iteration (for convex-helpers filter).
 */
function createMockQueryChain(docs: any[]) {
  const calls: { method: string; args: any[] }[] = [];

  const chain: any = {
    _calls: calls,
    order(direction: string) {
      calls.push({ method: "order", args: [direction] });
      return chain;
    },
    collect() {
      calls.push({ method: "collect", args: [] });
      return Promise.resolve([...docs]);
    },
    first() {
      calls.push({ method: "first", args: [] });
      return Promise.resolve(docs[0] ?? null);
    },
    take(n: number) {
      calls.push({ method: "take", args: [n] });
      return Promise.resolve(docs.slice(0, n));
    },
    paginate(opts: any) {
      calls.push({ method: "paginate", args: [opts] });
      return Promise.resolve({
        page: docs,
        isDone: true,
        continueCursor: "cursor-abc",
      });
    },
    withIndex(indexName: string, callback: (q: any) => any) {
      calls.push({ method: "withIndex", args: [indexName] });
      const ib = createMockIndexBuilder();
      callback(ib);
      (chain as any)._lastIndexBuilder = ib;
      return chain;
    },
    // Support async iteration (required by convex-helpers filter)
    [Symbol.asyncIterator]() {
      let i = 0;
      return {
        next() {
          if (i < docs.length) {
            return Promise.resolve({ value: docs[i++], done: false });
          }
          return Promise.resolve({ value: undefined, done: true });
        },
        return() {
          return Promise.resolve({ value: undefined, done: true });
        },
      };
    },
  };

  return chain;
}

function createMockReader(docs?: any[]) {
  const defaultDocs = docs ?? [{ _id: "1", title: "Post 1" }];
  let lastChain: any = null;

  const queryFn = mock((_table: string) => {
    lastChain = createMockQueryChain(defaultDocs);
    return lastChain;
  });
  const getFn = mock((id: string) =>
    Promise.resolve(id === "missing" ? null : { _id: id, title: `Doc ${id}` }),
  );

  return {
    db: { query: queryFn, get: getFn, normalizeId: () => null },
    spies: { queryFn, getFn },
    getLastChain: () => lastChain,
    getLastIndexBuilder: () => lastChain?._lastIndexBuilder,
  };
}

function createMockWriter(docs?: any[]) {
  const reader = createMockReader(docs);
  const insertFn = mock((_table: string, _value: any) =>
    Promise.resolve("new-id"),
  );
  const patchFn = mock((_id: string, _value: any) => Promise.resolve());
  const deleteFn = mock((_id: string) => Promise.resolve());

  return {
    db: { ...reader.db, insert: insertFn, patch: patchFn, delete: deleteFn },
    spies: { ...reader.spies, insertFn, patchFn, deleteFn },
    getLastChain: reader.getLastChain,
    getLastIndexBuilder: reader.getLastIndexBuilder,
  };
}

/**
 * Creates a minimal mock schema with index metadata,
 * matching the shape Convex uses internally.
 */
function createMockSchema() {
  return {
    tables: {
      posts: {
        validator: {
          fields: {
            title: { kind: "string" },
            slug: { kind: "string" },
            authorId: { kind: "id", tableName: "users" },
          },
        },
        [" indexes"]() {
          return [
            { indexDescriptor: "by_id", fields: ["_id"] },
            {
              indexDescriptor: "by_creation_time",
              fields: ["_creationTime"],
            },
            {
              indexDescriptor: "by_author",
              fields: ["authorId", "_creationTime"],
            },
            { indexDescriptor: "by_slug", fields: ["slug", "_creationTime"] },
            {
              indexDescriptor: "by_author_slug",
              fields: ["authorId", "slug", "_creationTime"],
            },
          ];
        },
      },
      users: {
        validator: {
          fields: {
            name: { kind: "string" },
            email: { kind: "string" },
          },
        },
        [" indexes"]() {
          return [
            { indexDescriptor: "by_id", fields: ["_id"] },
            {
              indexDescriptor: "by_creation_time",
              fields: ["_creationTime"],
            },
            {
              indexDescriptor: "by_email",
              fields: ["email", "_creationTime"],
            },
          ];
        },
      },
    },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("createZen", () => {
  it("returns a proxy object", () => {
    const { db } = createMockReader();
    const zen = createZen({ db } as any, {});
    expect(zen).toBeDefined();
    expect(typeof zen).toBe("object");
  });

  it("zen.<table> returns a table proxy", () => {
    const { db } = createMockReader();
    const zen = createZen({ db } as any, {});
    expect(zen.posts).toBeDefined();
    expect(typeof zen.posts).toBe("object");
  });

  it("different table names return different proxies", () => {
    const { db } = createMockReader();
    const zen = createZen({ db } as any, {});
    expect(zen.posts).not.toBe(zen.users);
  });
});

describe("read methods", () => {
  it("findMany() calls db.query(table).collect()", async () => {
    const { db, spies, getLastChain } = createMockReader();
    const zen = createZen({ db } as any, {});

    const result = await zen.posts.findMany();

    expect(spies.queryFn).toHaveBeenCalledWith("posts");
    const calls = getLastChain()._calls;
    expect(calls.some((c: any) => c.method === "collect")).toBe(true);
    expect(result).toEqual([{ _id: "1", title: "Post 1" }]);
  });

  it("findFirst() calls db.query(table).first()", async () => {
    const { db, spies, getLastChain } = createMockReader();
    const zen = createZen({ db } as any, {});

    const result = await zen.posts.findFirst();

    expect(spies.queryFn).toHaveBeenCalledWith("posts");
    const calls = getLastChain()._calls;
    expect(calls.some((c: any) => c.method === "first")).toBe(true);
    expect(result).toEqual({ _id: "1", title: "Post 1" });
  });

  it("findByIds() calls db.get for each id and filters nulls", async () => {
    const { db, spies } = createMockReader();
    const zen = createZen({ db } as any, {});

    const result = await zen.posts.findByIds(["a", "missing", "b"]);

    expect(spies.getFn).toHaveBeenCalledTimes(3);
    expect(result).toEqual([
      { _id: "a", title: "Doc a" },
      { _id: "b", title: "Doc b" },
    ]);
  });

  it("findByIds() with empty array returns empty array", async () => {
    const { db } = createMockReader();
    const zen = createZen({ db } as any, {});

    const result = await zen.posts.findByIds([]);
    expect(result).toEqual([]);
  });
});

describe("write methods", () => {
  it("insert() calls db.insert(table, value)", async () => {
    const { db, spies } = createMockWriter();
    const zen = createZen({ db } as any, {});

    const id = await zen.posts.insert({ title: "New", slug: "new" });

    expect(spies.insertFn).toHaveBeenCalledWith("posts", {
      title: "New",
      slug: "new",
    });
    expect(id).toBe("new-id");
  });

  it("patch() calls db.patch(id, value)", async () => {
    const { db, spies } = createMockWriter();
    const zen = createZen({ db } as any, {});

    await zen.posts.patch("post-1", { title: "Updated" });

    expect(spies.patchFn).toHaveBeenCalledWith("post-1", {
      title: "Updated",
    });
  });

  it("delete() calls db.delete(id)", async () => {
    const { db, spies } = createMockWriter();
    const zen = createZen({ db } as any, {});

    await zen.posts.delete("post-1");

    expect(spies.deleteFn).toHaveBeenCalledWith("post-1");
  });

  it("upsert() inserts when existing is null", async () => {
    const { db, spies } = createMockWriter();
    const zen = createZen({ db } as any, {});

    const id = await zen.posts.upsert(null, { title: "New", slug: "new" });

    expect(spies.insertFn).toHaveBeenCalledWith("posts", {
      title: "New",
      slug: "new",
    });
    expect(id).toBe("new-id");
  });

  it("upsert() patches when existing has _id", async () => {
    const { db, spies } = createMockWriter();
    const zen = createZen({ db } as any, {});

    const existing = {
      _id: "post-1",
      _creationTime: 123,
      title: "Old",
      slug: "old",
    };
    const id = await zen.posts.upsert(existing, {
      title: "Updated",
      slug: "updated",
    });

    expect(spies.patchFn).toHaveBeenCalledWith("post-1", {
      title: "Updated",
      slug: "updated",
    });
    expect(spies.insertFn).not.toHaveBeenCalled();
    expect(id).toBe("post-1");
  });
});

describe("write methods on reader context", () => {
  it("write methods throw Not implemented on reader db", () => {
    const { db } = createMockReader();
    const zen = createZen({ db } as any, {});

    expect(() => zen.posts.insert({})).toThrow("Not implemented");
    expect(() => zen.posts.patch("id", {})).toThrow("Not implemented");
    expect(() => zen.posts.delete("id")).toThrow("Not implemented");
    expect(() => zen.posts.upsert(null, {})).toThrow("Not implemented");
  });
});

// ---------------------------------------------------------------------------
// Index proxy + query builder (with schema)
// ---------------------------------------------------------------------------

describe("index proxy with schema", () => {
  it("unknown property returns a function (index proxy)", () => {
    const { db } = createMockReader();
    const schema = createMockSchema();
    const zen = createZen({ db } as any, schema as any);

    expect(typeof zen.posts.by_author).toBe("function");
  });

  it("index function returns query builder with findMany/findFirst", () => {
    const { db } = createMockReader();
    const schema = createMockSchema();
    const zen = createZen({ db } as any, schema as any);

    const qb = zen.posts.by_author("someUserId");
    expect(typeof qb.findMany).toBe("function");
    expect(typeof qb.findFirst).toBe("function");
  });

  it("findMany() with index calls withIndex then collect", async () => {
    const { db, spies, getLastChain } = createMockReader();
    const schema = createMockSchema();
    const zen = createZen({ db } as any, schema as any);

    const result = await zen.posts.by_author("user-1").findMany();

    expect(spies.queryFn).toHaveBeenCalledWith("posts");
    const calls = getLastChain()._calls;
    expect(calls[0]).toEqual({ method: "withIndex", args: ["by_author"] });
    expect(calls.some((c: any) => c.method === "collect")).toBe(true);
    expect(result).toEqual([{ _id: "1", title: "Post 1" }]);
  });

  it("findFirst() with index calls withIndex then first", async () => {
    const { db, spies, getLastChain } = createMockReader();
    const schema = createMockSchema();
    const zen = createZen({ db } as any, schema as any);

    const result = await zen.posts.by_slug("hello").findFirst();

    expect(spies.queryFn).toHaveBeenCalledWith("posts");
    const calls = getLastChain()._calls;
    expect(calls[0]).toEqual({ method: "withIndex", args: ["by_slug"] });
    expect(calls.some((c: any) => c.method === "first")).toBe(true);
    expect(result).toEqual({ _id: "1", title: "Post 1" });
  });

  it("equality arg is passed to .eq() on the index builder", async () => {
    const { db, getLastIndexBuilder } = createMockReader();
    const schema = createMockSchema();
    const zen = createZen({ db } as any, schema as any);

    await zen.posts.by_author("user-1").findMany();

    const calls = getLastIndexBuilder()._calls;
    expect(calls).toEqual([{ method: "eq", field: "authorId", value: "user-1" }]);
  });

  it("no args → withIndex callback returns builder unchanged", async () => {
    const { db, getLastIndexBuilder } = createMockReader();
    const schema = createMockSchema();
    const zen = createZen({ db } as any, schema as any);

    await zen.posts.by_author().findMany();

    const calls = getLastIndexBuilder()._calls;
    expect(calls).toEqual([]);
  });

  it("multi-field index with two equality args", async () => {
    const { db, getLastIndexBuilder } = createMockReader();
    const schema = createMockSchema();
    const zen = createZen({ db } as any, schema as any);

    await zen.posts.by_author_slug("user-1", "hello").findMany();

    const calls = getLastIndexBuilder()._calls;
    expect(calls).toEqual([
      { method: "eq", field: "authorId", value: "user-1" },
      { method: "eq", field: "slug", value: "hello" },
    ]);
  });

  it("partial prefix of multi-field index", async () => {
    const { db, getLastIndexBuilder } = createMockReader();
    const schema = createMockSchema();
    const zen = createZen({ db } as any, schema as any);

    await zen.posts.by_author_slug("user-1").findMany();

    const calls = getLastIndexBuilder()._calls;
    expect(calls).toEqual([
      { method: "eq", field: "authorId", value: "user-1" },
    ]);
  });
});

// ---------------------------------------------------------------------------
// Range queries
// ---------------------------------------------------------------------------

describe("range queries via q builder", () => {
  it("q.gt() creates a range marker with lower bound", async () => {
    const { db, getLastIndexBuilder } = createMockReader();
    const schema = createMockSchema();
    const zen = createZen({ db } as any, schema as any);

    await zen.posts.by_slug(q.gt("a")).findMany();

    const calls = getLastIndexBuilder()._calls;
    expect(calls).toEqual([{ method: "gt", field: "slug", value: "a" }]);
  });

  it("q.gte().lte() creates range with both bounds", async () => {
    const { db, getLastIndexBuilder } = createMockReader();
    const schema = createMockSchema();
    const zen = createZen({ db } as any, schema as any);

    await zen.posts.by_slug(q.gte("a").lte("z")).findMany();

    const calls = getLastIndexBuilder()._calls;
    expect(calls).toEqual([
      { method: "gte", field: "slug", value: "a" },
      { method: "lte", field: "slug", value: "z" },
    ]);
  });

  it("q.lt() creates upper bound only", async () => {
    const { db, getLastIndexBuilder } = createMockReader();
    const schema = createMockSchema();
    const zen = createZen({ db } as any, schema as any);

    await zen.posts.by_slug(q.lt("m")).findFirst();

    const calls = getLastIndexBuilder()._calls;
    expect(calls).toEqual([{ method: "lt", field: "slug", value: "m" }]);
  });

  it("multi-field index with equality + range on last field", async () => {
    const { db, getLastIndexBuilder } = createMockReader();
    const schema = createMockSchema();
    const zen = createZen({ db } as any, schema as any);

    await zen.posts.by_author_slug("user-1", q.gte("a").lt("z")).findMany();

    const calls = getLastIndexBuilder()._calls;
    expect(calls).toEqual([
      { method: "eq", field: "authorId", value: "user-1" },
      { method: "gte", field: "slug", value: "a" },
      { method: "lt", field: "slug", value: "z" },
    ]);
  });
});

// ---------------------------------------------------------------------------
// q builder standalone tests
// ---------------------------------------------------------------------------

describe("q range builder", () => {
  it("q.gt creates a valid RangeMarker", () => {
    const marker = q.gt(5);
    expect(isRangeMarker(marker)).toBe(true);
    expect(marker.lower).toEqual({ op: "gt", value: 5 });
    expect(marker.upper).toBeUndefined();
  });

  it("q.gte creates a valid RangeMarker", () => {
    const marker = q.gte(10);
    expect(isRangeMarker(marker)).toBe(true);
    expect(marker.lower).toEqual({ op: "gte", value: 10 });
  });

  it("q.lt creates a valid RangeMarker", () => {
    const marker = q.lt(100);
    expect(isRangeMarker(marker)).toBe(true);
    expect(marker.upper).toEqual({ op: "lt", value: 100 });
    expect(marker.lower).toBeUndefined();
  });

  it("q.lte creates a valid RangeMarker", () => {
    const marker = q.lte(50);
    expect(isRangeMarker(marker)).toBe(true);
    expect(marker.upper).toEqual({ op: "lte", value: 50 });
  });

  it("q.gt().lt() chains lower and upper bounds", () => {
    const marker = q.gt(1).lt(10);
    expect(isRangeMarker(marker)).toBe(true);
    expect(marker.lower).toEqual({ op: "gt", value: 1 });
    expect(marker.upper).toEqual({ op: "lt", value: 10 });
  });

  it("q.gte().lte() chains lower and upper bounds", () => {
    const marker = q.gte(0).lte(99);
    expect(isRangeMarker(marker)).toBe(true);
    expect(marker.lower).toEqual({ op: "gte", value: 0 });
    expect(marker.upper).toEqual({ op: "lte", value: 99 });
  });

  it("q.lt().gte() chains upper and lower bounds", () => {
    const marker = q.lt(100).gte(50);
    expect(isRangeMarker(marker)).toBe(true);
    expect(marker.upper).toEqual({ op: "lt", value: 100 });
    expect(marker.lower).toEqual({ op: "gte", value: 50 });
  });

  it("isRangeMarker returns false for non-markers", () => {
    expect(isRangeMarker(null)).toBe(false);
    expect(isRangeMarker(undefined)).toBe(false);
    expect(isRangeMarker("string")).toBe(false);
    expect(isRangeMarker(42)).toBe(false);
    expect(isRangeMarker({})).toBe(false);
    expect(isRangeMarker({ lower: { op: "gt", value: 1 } })).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Schema extraction (relations with stashed schema)
// ---------------------------------------------------------------------------

describe("schema extraction from relations", () => {
  it("works when relations have ZEN_SCHEMA stashed", async () => {
    const { db, getLastIndexBuilder } = createMockReader();
    const schema = createMockSchema();

    // Simulate what defineRelations does
    const { ZEN_SCHEMA } = await import("../src/relations/defineRelations");
    const relations: any = { posts: {}, users: {} };
    relations[ZEN_SCHEMA] = schema;

    const zen = createZen({ db } as any, relations);

    await zen.posts.by_slug("hello").findFirst();

    const calls = getLastIndexBuilder()._calls;
    expect(calls).toEqual([{ method: "eq", field: "slug", value: "hello" }]);
  });
});

// ---------------------------------------------------------------------------
// Fallback without schema
// ---------------------------------------------------------------------------

describe("index proxy without schema", () => {
  it("unknown property still returns a function", () => {
    const { db } = createMockReader();
    const zen = createZen({ db } as any, {});

    expect(typeof zen.posts.byAuthor).toBe("function");
  });

  it("index function returns query builder that calls withIndex", async () => {
    const { db, spies, getLastChain } = createMockReader();
    const zen = createZen({ db } as any, {});

    const result = await zen.posts.byAuthor("someId").findMany();

    const calls = getLastChain()._calls;
    expect(calls[0]).toEqual({ method: "withIndex", args: ["byAuthor"] });
    expect(result).toEqual([{ _id: "1", title: "Post 1" }]);
  });

  it("without schema, args are ignored (no field names to map)", async () => {
    const { db, getLastIndexBuilder } = createMockReader();
    const zen = createZen({ db } as any, {});

    await zen.posts.byAuthor("someId").findMany();

    // No field names → no eq/range calls
    const calls = getLastIndexBuilder()._calls;
    expect(calls).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Query options
// ---------------------------------------------------------------------------

describe("query options: order", () => {
  it("findMany({ order: 'desc' }) calls .order('desc')", async () => {
    const { db, getLastChain } = createMockReader();
    const zen = createZen({ db } as any, {});

    await zen.posts.findMany({ order: "desc" });

    const calls = getLastChain()._calls;
    expect(calls.some((c: any) => c.method === "order" && c.args[0] === "desc")).toBe(true);
  });

  it("findFirst({ order: 'desc' }) calls .order('desc')", async () => {
    const { db, getLastChain } = createMockReader();
    const zen = createZen({ db } as any, {});

    await zen.posts.findFirst({ order: "desc" });

    const calls = getLastChain()._calls;
    expect(calls.some((c: any) => c.method === "order" && c.args[0] === "desc")).toBe(true);
  });

  it("index query with order", async () => {
    const { db, getLastChain } = createMockReader();
    const schema = createMockSchema();
    const zen = createZen({ db } as any, schema as any);

    await zen.posts.by_author("user-1").findMany({ order: "asc" });

    const calls = getLastChain()._calls;
    expect(calls.some((c: any) => c.method === "order" && c.args[0] === "asc")).toBe(true);
  });
});

describe("query options: limit", () => {
  it("findMany({ limit: 5 }) calls .take(5)", async () => {
    const { db, getLastChain } = createMockReader();
    const zen = createZen({ db } as any, {});

    await zen.posts.findMany({ limit: 5 });

    const calls = getLastChain()._calls;
    expect(calls.some((c: any) => c.method === "take" && c.args[0] === 5)).toBe(true);
  });

  it("limit with index query", async () => {
    const { db, getLastChain } = createMockReader();
    const schema = createMockSchema();
    const zen = createZen({ db } as any, schema as any);

    await zen.posts.by_author("user-1").findMany({ limit: 3 });

    const calls = getLastChain()._calls;
    expect(calls.some((c: any) => c.method === "take" && c.args[0] === 3)).toBe(true);
  });
});

describe("query options: filter", () => {
  it("findMany with filter returns only matching docs", async () => {
    const docs = [
      { _id: "1", title: "Hello", likes: 5 },
      { _id: "2", title: "World", likes: 15 },
      { _id: "3", title: "Foo", likes: 20 },
    ];
    const { db } = createMockReader(docs);
    const zen = createZen({ db } as any, {});

    const result = await zen.posts.findMany({
      filter: (doc: any) => doc.likes > 10,
    });

    expect(result).toEqual([
      { _id: "2", title: "World", likes: 15 },
      { _id: "3", title: "Foo", likes: 20 },
    ]);
  });

  it("findFirst with filter returns first matching doc", async () => {
    const docs = [
      { _id: "1", title: "Hello", likes: 5 },
      { _id: "2", title: "World", likes: 15 },
      { _id: "3", title: "Foo", likes: 20 },
    ];
    const { db } = createMockReader(docs);
    const zen = createZen({ db } as any, {});

    const result = await zen.posts.findFirst({
      filter: (doc: any) => doc.likes > 10,
    });

    expect(result).toEqual({ _id: "2", title: "World", likes: 15 });
  });
});

describe("query options: select", () => {
  it("findMany with select returns only selected fields", async () => {
    const docs = [
      { _id: "1", title: "Hello", slug: "hello", content: "long text" },
    ];
    const { db } = createMockReader(docs);
    const zen = createZen({ db } as any, {});

    const result = await zen.posts.findMany({ select: ["_id", "title"] });

    expect(result).toEqual([{ _id: "1", title: "Hello" }]);
  });

  it("findFirst with select returns only selected fields", async () => {
    const docs = [
      { _id: "1", title: "Hello", slug: "hello", content: "long text" },
    ];
    const { db } = createMockReader(docs);
    const zen = createZen({ db } as any, {});

    const result = await zen.posts.findFirst({ select: ["_id", "title"] });

    expect(result).toEqual({ _id: "1", title: "Hello" });
  });
});

describe("query options: omit", () => {
  it("findMany with omit removes omitted fields", async () => {
    const docs = [
      { _id: "1", title: "Hello", slug: "hello", content: "long text" },
    ];
    const { db } = createMockReader(docs);
    const zen = createZen({ db } as any, {});

    const result = await zen.posts.findMany({ omit: ["content", "slug"] });

    expect(result).toEqual([{ _id: "1", title: "Hello" }]);
  });

  it("findFirst with omit removes omitted fields", async () => {
    const docs = [
      { _id: "1", title: "Hello", slug: "hello", content: "long text" },
    ];
    const { db } = createMockReader(docs);
    const zen = createZen({ db } as any, {});

    const result = await zen.posts.findFirst({ omit: ["content"] });

    expect(result).toEqual({ _id: "1", title: "Hello", slug: "hello" });
  });
});

describe("query options: paginate", () => {
  it("findMany with paginate returns PaginatedResult", async () => {
    const docs = [
      { _id: "1", title: "Post 1" },
      { _id: "2", title: "Post 2" },
    ];
    const { db, getLastChain } = createMockReader(docs);
    const zen = createZen({ db } as any, {});

    const result = await zen.posts.findMany({
      paginate: { cursor: null, numItems: 20 },
    });

    expect(result).toEqual({
      data: docs,
      cursor: "cursor-abc",
      hasMore: false,
    });

    const calls = getLastChain()._calls;
    expect(calls.some((c: any) => c.method === "paginate")).toBe(true);
  });

  it("paginate with select applies field selection to data", async () => {
    const docs = [
      { _id: "1", title: "Post 1", slug: "post-1" },
    ];
    const { db } = createMockReader(docs);
    const zen = createZen({ db } as any, {});

    const result = await zen.posts.findMany({
      select: ["_id", "title"],
      paginate: { cursor: null, numItems: 10 },
    });

    expect(result).toEqual({
      data: [{ _id: "1", title: "Post 1" }],
      cursor: "cursor-abc",
      hasMore: false,
    });
  });
});

describe("query options: combinations", () => {
  it("order + limit", async () => {
    const { db, getLastChain } = createMockReader();
    const zen = createZen({ db } as any, {});

    await zen.posts.findMany({ order: "desc", limit: 5 });

    const calls = getLastChain()._calls;
    expect(calls.some((c: any) => c.method === "order" && c.args[0] === "desc")).toBe(true);
    expect(calls.some((c: any) => c.method === "take" && c.args[0] === 5)).toBe(true);
  });

  it("filter + select", async () => {
    const docs = [
      { _id: "1", title: "Hello", likes: 5 },
      { _id: "2", title: "World", likes: 15 },
    ];
    const { db } = createMockReader(docs);
    const zen = createZen({ db } as any, {});

    const result = await zen.posts.findMany({
      filter: (doc: any) => doc.likes > 10,
      select: ["_id", "title"],
    });

    expect(result).toEqual([{ _id: "2", title: "World" }]);
  });

  it("findFirst with filter + omit", async () => {
    const docs = [
      { _id: "1", title: "Hello", likes: 5, slug: "hello" },
      { _id: "2", title: "World", likes: 15, slug: "world" },
    ];
    const { db } = createMockReader(docs);
    const zen = createZen({ db } as any, {});

    const result = await zen.posts.findFirst({
      filter: (doc: any) => doc.likes > 10,
      omit: ["slug"],
    });

    expect(result).toEqual({ _id: "2", title: "World", likes: 15 });
  });

  it("findFirst with no matching filter returns null", async () => {
    const docs = [
      { _id: "1", title: "Hello", likes: 5 },
    ];
    const { db } = createMockReader(docs);
    const zen = createZen({ db } as any, {});

    const result = await zen.posts.findFirst({
      filter: (doc: any) => doc.likes > 100,
    });

    expect(result).toBeNull();
  });

  it("select on null findFirst returns null", async () => {
    const { db } = createMockReader([]);
    const zen = createZen({ db } as any, {});

    const result = await zen.posts.findFirst({ select: ["_id"] });

    expect(result).toBeNull();
  });
});
