<<<<<<< Updated upstream
import { describe, test, expect } from "bun:test";
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { defineRelations, defineJoinTable } from "../../src/index";

const schema = defineSchema({
  users: defineTable({
    firstName: v.string(),
    lastName: v.string(),
    email: v.string(),
  }).index("by_email", ["email"]),

  posts: defineTable({
    title: v.string(),
    slug: v.string(),
    content: v.string(),
    authorId: v.id("users"),
  })
    .index("by_author", ["authorId"])
    .index("by_slug", ["slug"]),
=======
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
>>>>>>> Stashed changes

  tags: defineTable({
    name: v.string(),
  }),

<<<<<<< Updated upstream
  postsTags: defineJoinTable("posts", "tags"),

  comments: defineTable({
    body: v.string(),
    postId: v.id("posts"),
    authorId: v.id("users"),
  }).index("by_postId", ["postId"]),
});

// ---------------------------------------------------------------------------
// Runtime tests
// ---------------------------------------------------------------------------

describe("defineRelations", () => {
  test("produces OneDescriptor for r.one", () => {
    const relations = defineRelations(schema, {
      posts: (r) => ({
        author: r.one.users({ by: "authorId" }),
      }),
    });

=======
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
>>>>>>> Stashed changes
    expect(relations.posts.author).toEqual({
      type: "one",
      targetTable: "users",
      foreignKey: "authorId",
<<<<<<< Updated upstream
    });
  });

  test("produces ManyDescriptor with auto-resolved index", () => {
    const relations = defineRelations(schema, {
      posts: (r) => ({
        comments: r.many.comments({ onDelete: "cascade" }),
      }),
    });

    expect(relations.posts.comments).toEqual({
      type: "many",
      targetTable: "comments",
      index: "by_postId",
      onDelete: "cascade",
    });
  });

  test("produces ManyDescriptor with explicit index", () => {
    const relations = defineRelations(schema, {
      posts: (r) => ({
        comments: r.many.comments({ index: "by_postId", onDelete: "cascade" }),
      }),
    });

    expect(relations.posts.comments).toEqual({
      type: "many",
      targetTable: "comments",
      index: "by_postId",
      onDelete: "cascade",
    });
  });

  test("produces ManyDescriptor without onDelete when omitted", () => {
    const relations = defineRelations(schema, {
      posts: (r) => ({
        comments: r.many.comments(),
      }),
    });

    expect(relations.posts.comments).toEqual({
      type: "many",
      targetTable: "comments",
      index: "by_postId",
    });

    expect(relations.posts.comments).not.toHaveProperty("onDelete");
  });

  test("produces ThroughDescriptor for r.many with through option", () => {
    const relations = defineRelations(schema, {
      posts: (r) => ({
        tags: r.many.tags({ through: "postsTags" }),
      }),
    });

    expect(relations.posts.tags).toEqual({
      type: "through",
      targetTable: "tags",
      joinTable: "postsTags",
    });
  });

  test("handles multiple tables with multiple relations", () => {
    const relations = defineRelations(schema, {
      posts: (r) => ({
        author: r.one.users({ by: "authorId" }),
        comments: r.many.comments({ onDelete: "cascade" }),
        tags: r.many.tags({ through: "postsTags" }),
      }),
      comments: (r) => ({
        post: r.one.posts({ by: "postId" }),
        author: r.one.users({ by: "authorId" }),
      }),
      users: (r) => ({
        posts: r.many.posts({ onDelete: "cascade" }),
      }),
    });

    // posts
    expect(relations.posts.author.type).toBe("one");
    expect(relations.posts.comments.type).toBe("many");
    expect(relations.posts.tags.type).toBe("through");

    // comments
    expect(relations.comments.post.type).toBe("one");
    expect(relations.comments.author.type).toBe("one");
    expect(relations.comments.author.targetTable).toBe("users");

    // users
    expect(relations.users.posts.type).toBe("many");
    expect(relations.users.posts.index).toBe("by_author");
  });

  test("returns empty object for tables with no relations defined", () => {
    const relations = defineRelations(schema, {});
    expect(relations).toEqual({});
  });

  test("supports all onDelete actions", () => {
    const relations = defineRelations(schema, {
      posts: (r) => ({
        cascadeComments: r.many.comments({ onDelete: "cascade" }),
        setNullComments: r.many.comments({ onDelete: "setNull" }),
        restrictComments: r.many.comments({ onDelete: "restrict" }),
      }),
    });

    expect(relations.posts.cascadeComments.onDelete).toBe("cascade");
    expect(relations.posts.setNullComments.onDelete).toBe("setNull");
    expect(relations.posts.restrictComments.onDelete).toBe("restrict");
=======
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
>>>>>>> Stashed changes
  });
});

// ---------------------------------------------------------------------------
<<<<<<< Updated upstream
// Auto-resolution tests
// ---------------------------------------------------------------------------

describe("defineRelations auto-resolution", () => {
  test("auto-resolves index when exactly one index points to source", () => {
    const relations = defineRelations(schema, {
      posts: (r) => ({
        comments: r.many.comments(),
      }),
    });

    expect(relations.posts.comments).toEqual({
      type: "many",
      targetTable: "comments",
      index: "by_postId",
    });
  });

  test("auto-resolves with onDelete option", () => {
    const relations = defineRelations(schema, {
      users: (r) => ({
=======
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
>>>>>>> Stashed changes
        posts: r.many.posts({ onDelete: "cascade" }),
      }),
    });

<<<<<<< Updated upstream
    expect(relations.users.posts).toEqual({
      type: "many",
      targetTable: "posts",
      index: "by_author",
      onDelete: "cascade",
    });
  });

  test("throws when no index on target table points to source", () => {
    expect(() =>
      defineRelations(schema, {
        users: (r) => ({
          // tags has no v.id("users") field or index pointing to users
          tags: r.many.tags(),
        }),
      }),
    ).toThrow('no index on table "tags" has a v.id("users")');
  });

  test("throws when multiple indexes on target table point to source", () => {
    const ambiguousSchema = defineSchema({
      users: defineTable({ name: v.string() }),
      posts: defineTable({
        authorId: v.id("users"),
        editorId: v.id("users"),
      })
        .index("by_author", ["authorId"])
        .index("by_editor", ["editorId"]),
    });

    expect(() =>
      defineRelations(ambiguousSchema, {
        users: (r) => ({
          posts: r.many.posts(),
        }),
      }),
    ).toThrow('multiple indexes on table "posts" point to "users"');
  });

  test("explicit index works when auto-resolution would be ambiguous", () => {
    const ambiguousSchema = defineSchema({
      users: defineTable({ name: v.string() }),
      posts: defineTable({
        authorId: v.id("users"),
        editorId: v.id("users"),
      })
        .index("by_author", ["authorId"])
        .index("by_editor", ["editorId"]),
    });

    const relations = defineRelations(ambiguousSchema, {
      users: (r) => ({
        authoredPosts: r.many.posts({ index: "by_author" }),
        editedPosts: r.many.posts({ index: "by_editor" }),
      }),
    });

    expect(relations.users.authoredPosts.index).toBe("by_author");
    expect(relations.users.editedPosts.index).toBe("by_editor");
  });

  test("throws for explicit index that doesn't point back to source", () => {
    expect(() =>
      defineRelations(schema, {
        users: (r) => ({
          // by_slug is an index on posts, but its first field is "slug" not v.id("users")
          posts: r.many.posts({ index: "by_slug" }),
        }),
      }),
    ).toThrow('index "by_slug" on table "posts" does not have a v.id("users") as its first field');
=======
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
>>>>>>> Stashed changes
  });
});

// ---------------------------------------------------------------------------
<<<<<<< Updated upstream
// Runtime validation tests
// ---------------------------------------------------------------------------

describe("defineRelations runtime validation", () => {
  test("throws for nonexistent table in config keys", () => {
    expect(() =>
      defineRelations(schema, {
        // @ts-expect-error — table doesn't exist
        fakePosts: (r: any) => ({}),
      }),
    ).toThrow('table "fakePosts" does not exist in schema');
  });

  test("throws for r.one targeting nonexistent table", () => {
    expect(() =>
      defineRelations(schema, {
        posts: (r) => ({
          // @ts-expect-error
          bad: r.one.nonExistent({ by: "authorId" }),
        }),
      }),
    ).toThrow('table "nonExistent" does not exist in schema');
  });

  test("throws for r.one with field that is not v.id()", () => {
    expect(() =>
      defineRelations(schema, {
        posts: (r) => ({
          // @ts-expect-error
          author: r.one.users({ by: "title" }),
        }),
      }),
    ).toThrow('"title" is not a v.id() field on table "posts"');
  });

  test("throws for r.one with nonexistent field", () => {
    expect(() =>
      defineRelations(schema, {
        posts: (r) => ({
          // @ts-expect-error
          author: r.one.users({ by: "nope" }),
        }),
      }),
    ).toThrow('"nope" is not a v.id() field on table "posts"');
  });

  test("throws for r.one with v.id() pointing to wrong table", () => {
    expect(() =>
      defineRelations(schema, {
        comments: (r) => ({
          // @ts-expect-error
          author: r.one.users({ by: "postId" }),
        }),
      }),
    ).toThrow('"postId" is v.id("posts"), not v.id("users")');
  });

  test("throws for r.many targeting nonexistent table", () => {
    expect(() =>
      defineRelations(schema, {
        posts: (r) => ({
          // @ts-expect-error
          bad: r.many.nonExistent(),
        }),
      }),
    ).toThrow('table "nonExistent" does not exist in schema');
  });

  test("throws for r.many with nonexistent explicit index", () => {
    expect(() =>
      defineRelations(schema, {
        posts: (r) => ({
          // @ts-expect-error
          comments: r.many.comments({ index: "fakeIndex" }),
        }),
      }),
    ).toThrow('index "fakeIndex" does not exist on table "comments"');
  });

  test("throws for r.many through with nonexistent join table", () => {
    expect(() =>
      defineRelations(schema, {
        posts: (r) => ({
          // @ts-expect-error
          tags: r.many.tags({ through: "nonExistent" }),
        }),
      }),
    ).toThrow('table "nonExistent" does not exist in schema');
  });

  test("throws for through() when join table has no v.id() field for source", () => {
    const badSchema = defineSchema({
      users: defineTable({ name: v.string() }),
      groups: defineTable({ name: v.string() }),
      // Missing v.id("users") — only has v.id("groups")
      badJoin: defineTable({
        groupsId: v.id("groups"),
      }).index("by_groupsId", ["groupsId"]),
    });

    expect(() =>
      defineRelations(badSchema, {
        users: (r) => ({
          // @ts-expect-error — badJoin is not a valid join table between users and groups
          groups: r.many.groups({ through: "badJoin" }),
        }),
      }),
    ).toThrow('join table "badJoin" has no v.id("users") field');
  });

  test("throws for through() when join table has no v.id() field for target", () => {
    const badSchema = defineSchema({
      users: defineTable({ name: v.string() }),
      groups: defineTable({ name: v.string() }),
      // Missing v.id("groups") — only has v.id("users")
      badJoin: defineTable({
        usersId: v.id("users"),
      }).index("by_usersId", ["usersId"]),
    });

    expect(() =>
      defineRelations(badSchema, {
        users: (r) => ({
          // @ts-expect-error — badJoin is not a valid join table between users and groups
          groups: r.many.groups({ through: "badJoin" }),
        }),
      }),
    ).toThrow('join table "badJoin" has no v.id("groups") field');
  });

  test("throws for through() when join table has no index starting with source id field", () => {
    const badSchema = defineSchema({
      users: defineTable({ name: v.string() }),
      groups: defineTable({ name: v.string() }),
      // Has both id fields but only an index on groupsId, not usersId
      badJoin: defineTable({
        usersId: v.id("users"),
        groupsId: v.id("groups"),
      }).index("by_groupsId", ["groupsId"]),
    });

    expect(() =>
      defineRelations(badSchema, {
        users: (r) => ({
          // @ts-expect-error — badJoin has no index starting with usersId
          groups: r.many.groups({ through: "badJoin" }),
        }),
      }),
    ).toThrow('no index starting with "usersId"');
  });

  test("through() accepts a valid join table", () => {
    // postsTags (from defineJoinTable) has both id fields and both indexes
    const relations = defineRelations(schema, {
      posts: (r) => ({
        tags: r.many.tags({ through: "postsTags" }),
      }),
    });

    expect(relations.posts.tags).toEqual({
      type: "through",
      targetTable: "tags",
      joinTable: "postsTags",
    });
  });
});

// ---------------------------------------------------------------------------
// Type-level tests
// ---------------------------------------------------------------------------

describe("defineRelations type safety", () => {
  test("r.one.users({ by }) only accepts v.id('users') fields", () => {
    // Valid: authorId is v.id("users") on posts
    defineRelations(schema, {
      posts: (r) => ({
        author: r.one.users({ by: "authorId" }),
      }),
    });

    // Valid: postId is v.id("posts") on comments
    defineRelations(schema, {
      comments: (r) => ({
        post: r.one.posts({ by: "postId" }),
      }),
    });

    expect(() =>
      defineRelations(schema, {
        // @ts-expect-error — "title" is v.string(), not v.id("users")
        posts: (r) => ({ author: r.one.users({ by: "title" }) }),
      }),
    ).toThrow();

    expect(() =>
      defineRelations(schema, {
        // @ts-expect-error — "nonExistent" is not a field on posts at all
        posts: (r) => ({ author: r.one.users({ by: "nonExistent" }) }),
      }),
    ).toThrow();

    expect(() =>
      defineRelations(schema, {
        // @ts-expect-error — "postId" points to "posts", not "users"
        comments: (r) => ({ author: r.one.users({ by: "postId" }) }),
      }),
    ).toThrow();
  });

  test("r.many.<table>() auto-resolves or accepts explicit index", () => {
    // Valid: auto-resolve (comments has by_postId pointing to posts)
    defineRelations(schema, {
      posts: (r) => ({
        comments: r.many.comments(),
      }),
    });

    // Valid: explicit index
    defineRelations(schema, {
      posts: (r) => ({
        comments: r.many.comments({ index: "by_postId" }),
      }),
    });

    expect(() =>
      defineRelations(schema, {
        // @ts-expect-error — "nonExistentIndex" is not an index on comments
        posts: (r) => ({ comments: r.many.comments({ index: "nonExistentIndex" }) }),
      }),
    ).toThrow();
  });

  test("r.many requires explicit index when ambiguous (multiple indexes point to source)", () => {
    const ambiguousSchema = defineSchema({
      users: defineTable({ name: v.string() }),
      posts: defineTable({
        authorId: v.id("users"),
        editorId: v.id("users"),
      })
        .index("by_author", ["authorId"])
        .index("by_editor", ["editorId"]),
    });

    // Valid: explicit index disambiguates
    defineRelations(ambiguousSchema, {
      users: (r) => ({
        authored: r.many.posts({ index: "by_author" }),
        edited: r.many.posts({ index: "by_editor" }),
      }),
    });

    expect(() =>
      defineRelations(ambiguousSchema, {
        // @ts-expect-error — ambiguous: must provide index
        users: (r) => ({
          posts: r.many.posts(),
        }),
      }),
    ).toThrow();

    expect(() =>
      defineRelations(ambiguousSchema, {
        // @ts-expect-error — ambiguous: must provide index (not just onDelete)
        users: (r) => ({
          posts: r.many.posts({ onDelete: "cascade" }),
        }),
      }),
    ).toThrow();
  });

  test("r.many.through accepts valid join table names", () => {
    // Valid: postsTags is a valid join table
    defineRelations(schema, {
      posts: (r) => ({
        tags: r.many.tags({ through: "postsTags" }),
      }),
    });

    expect(() =>
      defineRelations(schema, {
        // @ts-expect-error — "nonExistentTable" is not a table in the schema
        posts: (r) => ({ tags: r.many.tags({ through: "nonExistentTable" }) }),
      }),
    ).toThrow();
  });

  test("only tables in schema are valid as relation targets", () => {
    expect(() =>
      defineRelations(schema, {
        // @ts-expect-error — "nonExistentTable" is not a table
        posts: (r) => ({ bad: r.one.nonExistentTable({ by: "authorId" }) }),
      }),
    ).toThrow();
=======
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
>>>>>>> Stashed changes
  });
});
