import { describe, expect, test } from "bun:test";
import { expectTypeOf } from "expect-type";
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { defineJoinTable, defineRelations, ZEN_SCHEMA } from "../../src/index.js";
import type { OneDescriptor, ManyDescriptor, ThroughDescriptor } from "../../src/index.js";

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
// Runtime tests — one
// ---------------------------------------------------------------------------

describe("defineRelations — one", () => {
  test("produces OneDescriptor with correct fields", () => {
    const relations = defineRelations(schema, {
      posts: (r) => ({
        thread: r.one.threads("threadId"),
        author: r.one.users("authorId"),
      }),
    });

    expect(relations.posts.thread).toEqual({
      type: "one",
      targetTable: "threads",
      foreignKey: "threadId",
      optional: false,
    });
    expect(relations.posts.author).toEqual({
      type: "one",
      targetTable: "users",
      foreignKey: "authorId",
      optional: false,
    });
  });

  test("detects optional FK fields", () => {
    const relations = defineRelations(schema, {
      posts: (r) => ({
        parent: r.one.posts("parentId"),
      }),
    });

    expect(relations.posts.parent).toEqual({
      type: "one",
      targetTable: "posts",
      foreignKey: "parentId",
      optional: true,
    });
  });

  test("validates FK field exists", () => {
    expect(() =>
      defineRelations(schema, {
        posts: (r) => ({
          // @ts-expect-error — nonExistent is not a field
          bad: r.one.users("nonExistent"),
        }),
      }),
    ).toThrow("field not found");
  });

  test("validates FK field points to correct table", () => {
    expect(() =>
      defineRelations(schema, {
        posts: (r) => ({
          // @ts-expect-error — threadId points to threads, not users
          bad: r.one.users("threadId"),
        }),
      }),
    ).toThrow('points to "threads", not "users"');
  });
});

// ---------------------------------------------------------------------------
// Runtime tests — many
// ---------------------------------------------------------------------------

describe("defineRelations — many", () => {
  test("auto-resolves index when exactly one matches", () => {
    const relations = defineRelations(schema, {
      threads: (r) => ({
        posts: r.many.posts(),
      }),
    });

    expect(relations.threads.posts).toEqual({
      type: "many",
      targetTable: "posts",
      index: "byThread",
      foreignKey: "threadId",
    });
  });

  test("explicit index works", () => {
    const relations = defineRelations(schema, {
      users: (r) => ({
        threads: r.many.threads({ index: "byAuthor" }),
      }),
    });

    expect(relations.users.threads).toEqual({
      type: "many",
      targetTable: "threads",
      index: "byAuthor",
      foreignKey: "authorId",
    });
  });

  test("onDelete is included when specified", () => {
    const relations = defineRelations(schema, {
      threads: (r) => ({
        posts: r.many.posts({ onDelete: "cascade" }),
      }),
    });

    expect(relations.threads.posts.onDelete).toBe("cascade");
  });

  test("onDelete is omitted when not specified", () => {
    const relations = defineRelations(schema, {
      threads: (r) => ({
        posts: r.many.posts(),
      }),
    });

    expect(relations.threads.posts).not.toHaveProperty("onDelete");
  });

  test("throws when no matching index exists", () => {
    expect(() =>
      defineRelations(schema, {
        users: (r) => ({
          // @ts-expect-error — tags has no index pointing to users, so index is required
          tags: r.many.tags(),
        }),
      }),
    ).toThrow('no index on "tags" has a v.id("users")');
  });

  test("throws when multiple indexes match (ambiguous)", () => {
    expect(() =>
      defineRelations(schema, {
        categories: (r) => ({
          // @ts-expect-error — ambiguous: byCategory and byCategoryCreatedAt both match
          threads: r.many.threads(),
        }),
      }),
    ).toThrow("multiple indexes");
  });

  test("explicit index resolves ambiguity", () => {
    const relations = defineRelations(schema, {
      categories: (r) => ({
        threads: r.many.threads({ index: "byCategory" }),
      }),
    });

    expect(relations.categories.threads.index).toBe("byCategory");
  });
});

// ---------------------------------------------------------------------------
// Runtime tests — through
// ---------------------------------------------------------------------------

describe("defineRelations — through", () => {
  test("produces ThroughDescriptor with correct fields", () => {
    const relations = defineRelations(schema, {
      threads: (r) => ({
        tags: r.many.tags({ through: "threadTags" }),
      }),
    });

    expect(relations.threads.tags).toEqual({
      type: "through",
      targetTable: "tags",
      joinTable: "threadTags",
      sourceField: "threadsId",
      targetField: "tagsId",
      index: "byThreadsId",
    });
  });

  test("same-table through with explicit index", () => {
    const relations = defineRelations(schema, {
      users: (r) => ({
        followers: r.many.users({ through: "userFollows", index: "byFollowee" }),
        following: r.many.users({ through: "userFollows", index: "byFollower" }),
      }),
    });

    expect(relations.users.followers).toEqual({
      type: "through",
      targetTable: "users",
      joinTable: "userFollows",
      sourceField: "followeeId",
      targetField: "followerId",
      index: "byFollowee",
    });

    expect(relations.users.following).toEqual({
      type: "through",
      targetTable: "users",
      joinTable: "userFollows",
      sourceField: "followerId",
      targetField: "followeeId",
      index: "byFollower",
    });
  });

  test("same-table through throws without index", () => {
    expect(() =>
      defineRelations(schema, {
        users: (r) => ({
          followers: r.many.users({ through: "userFollows" }),
        }),
      }),
    ).toThrow("same-table through requires");
  });

  test("throws when join table has no source field", () => {
    expect(() =>
      defineRelations(schema, {
        categories: (r) => ({
          tags: r.many.tags({ through: "threadTags" }),
        }),
      }),
    ).toThrow('no v.id("categories")');
  });

  test("onDelete is included when specified", () => {
    const relations = defineRelations(schema, {
      threads: (r) => ({
        tags: r.many.tags({ through: "threadTags", onDelete: "cascade" }),
      }),
    });

    expect(relations.threads.tags.onDelete).toBe("cascade");
  });
});

// ---------------------------------------------------------------------------
// Full forum schema test
// ---------------------------------------------------------------------------

describe("defineRelations — full forum schema", () => {
  test("forum example produces correct descriptors", () => {
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

    expect(relations.threads.category.type).toBe("one");
    expect(relations.threads.tags.type).toBe("through");
    expect(relations.posts.replies.type).toBe("many");
    expect(relations.posts.replies.onDelete).toBe("setNull");
    expect(relations.users.followers.type).toBe("through");
    expect(relations.users.following.type).toBe("through");
    expect(relations.users.followers.sourceField).toBe("followeeId");
    expect(relations.users.following.sourceField).toBe("followerId");
  });
});

// ---------------------------------------------------------------------------
// Type tests
// ---------------------------------------------------------------------------

describe("defineRelations — types", () => {
  test("OneDescriptor has correct literal type params", () => {
    const relations = defineRelations(schema, {
      posts: (r) => ({
        author: r.one.users("authorId"),
      }),
    });

    expectTypeOf(relations.posts.author).toMatchTypeOf<OneDescriptor>();
    expectTypeOf(relations.posts.author.targetTable).toEqualTypeOf<"users">();
    expectTypeOf(relations.posts.author.foreignKey).toEqualTypeOf<"authorId">();
  });

  test("ManyDescriptor has correct target table type", () => {
    const relations = defineRelations(schema, {
      threads: (r) => ({
        posts: r.many.posts(),
      }),
    });

    expectTypeOf(relations.threads.posts).toMatchTypeOf<ManyDescriptor>();
    expectTypeOf(relations.threads.posts.targetTable).toEqualTypeOf<"posts">();
  });

  test("ThroughDescriptor has correct types", () => {
    const relations = defineRelations(schema, {
      threads: (r) => ({
        tags: r.many.tags({ through: "threadTags" }),
      }),
    });

    expectTypeOf(relations.threads.tags).toMatchTypeOf<ThroughDescriptor>();
    expectTypeOf(relations.threads.tags.targetTable).toEqualTypeOf<"tags">();
  });

  test("invalid FK is a type error (also caught at runtime)", () => {
    expect(() =>
      defineRelations(schema, {
        posts: (r) => ({
          // @ts-expect-error — "body" is not a v.id("users") field
          author: r.one.users("body"),
        }),
      }),
    ).toThrow();
  });

  test("invalid table name on one is a type error (also caught at runtime)", () => {
    expect(() =>
      defineRelations(schema, {
        posts: (r) => ({
          // @ts-expect-error — "nonExistent" is not a table
          bad: r.one.nonExistent("authorId"),
        }),
      }),
    ).toThrow();
  });

  test("r.one only accepts FK fields pointing to the target table", () => {
    expect(() =>
      defineRelations(schema, {
        posts: (r) => ({
          // @ts-expect-error — threadId points to threads, not users
          bad: r.one.users("threadId"),
        }),
      }),
    ).toThrow();
  });

  test("r.many requires explicit index when ambiguous", () => {
    // categories → threads has two indexes starting with categoryId
    // byCategory and byCategoryCreatedAt — auto-resolution fails
    expect(() =>
      defineRelations(schema, {
        categories: (r) => ({
          // @ts-expect-error — ambiguous: must provide index
          threads: r.many.threads(),
        }),
      }),
    ).toThrow("multiple indexes");
  });

  test("ZEN_SCHEMA symbol is present on return value", () => {
    const relations = defineRelations(schema, {
      posts: (r) => ({
        author: r.one.users("authorId"),
      }),
    });

    expect(relations[ZEN_SCHEMA]).toBe(schema);
  });

  test("ZEN_SCHEMA has correct type", () => {
    const relations = defineRelations(schema, {
      posts: (r) => ({
        author: r.one.users("authorId"),
      }),
    });

    expectTypeOf(relations[ZEN_SCHEMA]).toEqualTypeOf(schema);
  });
});
