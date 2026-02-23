import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { defineJoinTable, defineRelations } from "zenvex";

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

  // Self-referential join table — defineJoinTable blocks same-table joins
  // (field names would collide), so this is defined manually.
  userFollows: defineTable({
    followerId: v.id("users"),
    followeeId: v.id("users"),
    followedAt: v.number(),
  })
    .index("byFollower", ["followerId"])
    .index("byFollowee", ["followeeId"]),
});

export default schema;

export const relations = defineRelations(schema, {
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
