import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { defineJoinTable } from "zenvex";

export default defineSchema({
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

// export const relations = defineRelations(schema, {
//   posts: (r) => ({
//     author: r.one.users({ by: "authorId" }),
//     comments: r.many.comments.by_postId({ onDelete: "cascade" }),
//   }),
//   comments: (r) => ({
//     post: r.one.posts({ by: "postId" }),
//     author: r.one.users({ by: "authorId" }),
//   }),
//   users: (r) => ({
//     posts: r.many.posts.by_author({ onDelete: "cascade" }),
//   }),
// });
//
// export const computed = defineComputed(schema, {
//   posts: {
//     url: (post) => `/blog/${post.slug}`,
//     excerpt: (post) => post.content.slice(0, 200),
//   },
// });
