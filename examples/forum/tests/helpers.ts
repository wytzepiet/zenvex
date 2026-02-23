import type { GenericMutationCtx } from "convex/server";
import type { DataModel } from "../convex/_generated/dataModel";
import { createZen } from "zenvex";
import { relations } from "../convex/schema";

type MutCtx = GenericMutationCtx<DataModel>;

/**
 * Seed the forum database with a standard dataset.
 * Returns all created IDs for use in assertions.
 */
export async function seed(ctx: MutCtx) {
  const zen = createZen(ctx, relations);

  // Users
  const alice = await zen.users.insert({ name: "Alice", email: "alice@example.com" });
  const bob = await zen.users.insert({ name: "Bob", email: "bob@example.com" });
  const charlie = await zen.users.insert({ name: "Charlie", email: "charlie@example.com" });

  // Categories
  const general = await zen.categories.insert({ name: "General", description: "General discussion" });
  const tech = await zen.categories.insert({ name: "Tech", description: "Technology topics" });

  // Threads
  const thread1 = await zen.threads.insert({
    title: "Hello World",
    slug: "hello-world",
    categoryId: general,
    authorId: alice,
    createdAt: 1000,
  });
  const thread2 = await zen.threads.insert({
    title: "TypeScript Tips",
    slug: "typescript-tips",
    categoryId: tech,
    authorId: bob,
    createdAt: 2000,
  });
  const thread3 = await zen.threads.insert({
    title: "Convex Guide",
    slug: "convex-guide",
    categoryId: tech,
    authorId: alice,
    createdAt: 3000,
  });

  // Posts
  const post1 = await zen.posts.insert({
    body: "First post in hello world",
    threadId: thread1,
    authorId: alice,
  });
  const post2 = await zen.posts.insert({
    body: "Reply to hello world",
    threadId: thread1,
    authorId: bob,
    parentId: post1,
  });
  const post3 = await zen.posts.insert({
    body: "TypeScript is great",
    threadId: thread2,
    authorId: bob,
  });
  const post4 = await zen.posts.insert({
    body: "Convex is amazing",
    threadId: thread3,
    authorId: alice,
  });
  const post5 = await zen.posts.insert({
    body: "I agree!",
    threadId: thread3,
    authorId: charlie,
  });

  // Tags
  const tagJs = await zen.tags.insert({ name: "javascript" });
  const tagTs = await zen.tags.insert({ name: "typescript" });
  const tagConvex = await zen.tags.insert({ name: "convex" });

  // Thread-tag join rows
  await ctx.db.insert("threadTags", { threadsId: thread1, tagsId: tagJs, order: 1 });
  await ctx.db.insert("threadTags", { threadsId: thread2, tagsId: tagTs, order: 1 });
  await ctx.db.insert("threadTags", { threadsId: thread2, tagsId: tagJs, order: 2 });
  await ctx.db.insert("threadTags", { threadsId: thread3, tagsId: tagConvex, order: 1 });
  await ctx.db.insert("threadTags", { threadsId: thread3, tagsId: tagTs, order: 2 });

  // User follows: Alice → Bob, Bob → Alice, Charlie → Alice
  await ctx.db.insert("userFollows", { followerId: alice, followeeId: bob, followedAt: 100 });
  await ctx.db.insert("userFollows", { followerId: bob, followeeId: alice, followedAt: 200 });
  await ctx.db.insert("userFollows", { followerId: charlie, followeeId: alice, followedAt: 300 });

  return {
    users: { alice, bob, charlie },
    categories: { general, tech },
    threads: { thread1, thread2, thread3 },
    posts: { post1, post2, post3, post4, post5 },
    tags: { tagJs, tagTs, tagConvex },
  };
}
