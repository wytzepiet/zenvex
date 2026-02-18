import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { defineJoinTable, defineRelations } from "zenvex";

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

  tags: defineTable({
    name: v.string(),
  }),

  postsTags: defineJoinTable("posts", "tags"),

  comments: defineTable({
    body: v.string(),
    postId: v.id("posts"),
    authorId: v.id("users"),
  }).index("by_postId", ["postId"]),
});

export default schema;

export const relations = defineRelations(schema, {
  posts: (r) => ({
    author: r.one.users({ by: "authorId" }),
    comments: r.many.comments({ onDelete: "cascade" }),
    tags: r.many.tags({ through: "postsTags" }),
  }),
  comments: (r) => ({
    post: r.one.posts({ by: "postId" }),
    author: r.one.users({ by: "authorId" }),
  }),
  tags: (r) => ({
    posts: r.many.posts({ through: "postsTags" }),
  }),
  users: (r) => ({
    posts: r.many.posts({ onDelete: "cascade" }),
  }),
});

// export const computed = defineComputed(schema, {
//   posts: {
//     url: (post) => `/blog/${post.slug}`,
//     excerpt: (post) => post.content.slice(0, 200),
//   },
// });
