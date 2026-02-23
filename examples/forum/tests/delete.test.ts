import { convexTest } from "convex-test";
import { describe, it, expect } from "vitest";
import { createZen } from "zenvex";
import schema, { relations } from "../convex/schema";

const modules = import.meta.glob("../convex/**/*.ts");

function setup() {
  return convexTest(schema, modules);
}

describe("zen.delete", () => {
  // -----------------------------------------------------------------------
  // cascade — deleting a thread cascades to its posts
  // -----------------------------------------------------------------------
  describe("cascade", () => {
    it("deletes related docs via one-to-many cascade", async () => {
      const t = setup();
      await t.run(async (ctx) => {
        const zen = createZen(ctx, relations);

        const catId = await zen.categories.insert({
          name: "General",
          description: "General discussion",
        });
        const userId = await zen.users.insert({
          name: "Alice",
          email: "alice@example.com",
        });
        const threadId = await zen.threads.insert({
          title: "Hello",
          slug: "hello",
          categoryId: catId,
          authorId: userId,
          createdAt: Date.now(),
        });
        await zen.posts.insert({
          body: "First post",
          threadId,
          authorId: userId,
        });
        await zen.posts.insert({
          body: "Second post",
          threadId,
          authorId: userId,
        });

        await zen.threads.delete(threadId);

        // Thread gone
        expect(await zen.threads.find(threadId)).toBeNull();
        // Posts cascaded
        const posts = await zen.posts.findMany();
        expect(posts).toHaveLength(0);
      });
    });

    it("cascades through multiple levels (user → threads → posts)", async () => {
      const t = setup();
      await t.run(async (ctx) => {
        const zen = createZen(ctx, relations);

        const catId = await zen.categories.insert({
          name: "General",
          description: "General discussion",
        });
        const userId = await zen.users.insert({
          name: "Alice",
          email: "alice@example.com",
        });
        const t1 = await zen.threads.insert({
          title: "Thread 1",
          slug: "thread-1",
          categoryId: catId,
          authorId: userId,
          createdAt: 1,
        });
        const t2 = await zen.threads.insert({
          title: "Thread 2",
          slug: "thread-2",
          categoryId: catId,
          authorId: userId,
          createdAt: 2,
        });
        await zen.posts.insert({ body: "Post in T1", threadId: t1, authorId: userId });
        await zen.posts.insert({ body: "Post in T2", threadId: t2, authorId: userId });

        // Deleting user should cascade: user → threads → posts
        await zen.users.delete(userId);

        expect(await zen.users.find(userId)).toBeNull();
        expect(await zen.threads.findMany()).toHaveLength(0);
        expect(await zen.posts.findMany()).toHaveLength(0);
      });
    });
  });

  // -----------------------------------------------------------------------
  // setNull — deleting a post sets parentId to null on its replies
  // -----------------------------------------------------------------------
  describe("setNull", () => {
    it("nullifies FK on related docs", async () => {
      const t = setup();
      await t.run(async (ctx) => {
        const zen = createZen(ctx, relations);

        const catId = await zen.categories.insert({
          name: "General",
          description: "General discussion",
        });
        const userId = await zen.users.insert({
          name: "Alice",
          email: "alice@example.com",
        });
        const threadId = await zen.threads.insert({
          title: "Thread",
          slug: "thread",
          categoryId: catId,
          authorId: userId,
          createdAt: Date.now(),
        });
        const parentPost = await zen.posts.insert({
          body: "Parent",
          threadId,
          authorId: userId,
        });
        const replyId = await zen.posts.insert({
          body: "Reply",
          threadId,
          authorId: userId,
          parentId: parentPost,
        });

        await zen.posts.delete(parentPost);

        // Parent gone
        expect(await zen.posts.find(parentPost)).toBeNull();
        // Reply still exists with parentId nullified
        const reply = await zen.posts.find(replyId);
        expect(reply).not.toBeNull();
        expect(reply!.parentId).toBeUndefined();
      });
    });
  });

  // -----------------------------------------------------------------------
  // restrict — default for categories.threads (no onDelete specified)
  // -----------------------------------------------------------------------
  describe("restrict", () => {
    it("throws when related docs exist", async () => {
      const t = setup();
      await t.run(async (ctx) => {
        const zen = createZen(ctx, relations);

        const catId = await zen.categories.insert({
          name: "General",
          description: "General discussion",
        });
        const userId = await zen.users.insert({
          name: "Alice",
          email: "alice@example.com",
        });
        await zen.threads.insert({
          title: "Thread",
          slug: "thread",
          categoryId: catId,
          authorId: userId,
          createdAt: Date.now(),
        });

        await expect(zen.categories.delete(catId)).rejects.toThrow(
          /onDelete: "restrict"/,
        );

        // Category still exists
        expect(await zen.categories.find(catId)).not.toBeNull();
      });
    });

    it("allows delete when no related docs exist", async () => {
      const t = setup();
      await t.run(async (ctx) => {
        const zen = createZen(ctx, relations);

        const catId = await zen.categories.insert({
          name: "Empty",
          description: "No threads",
        });

        await zen.categories.delete(catId);
        expect(await zen.categories.find(catId)).toBeNull();
      });
    });
  });

  // -----------------------------------------------------------------------
  // through — join table rows cleaned up
  // -----------------------------------------------------------------------
  describe("through (join table cleanup)", () => {
    it("deletes join table rows when source is deleted", async () => {
      const t = setup();
      await t.run(async (ctx) => {
        const zen = createZen(ctx, relations);

        const catId = await zen.categories.insert({
          name: "General",
          description: "General discussion",
        });
        const userId = await zen.users.insert({
          name: "Alice",
          email: "alice@example.com",
        });
        const threadId = await zen.threads.insert({
          title: "Thread",
          slug: "thread",
          categoryId: catId,
          authorId: userId,
          createdAt: Date.now(),
        });
        const tagId = await zen.tags.insert({ name: "javascript" });

        // Create join row manually (threadTags)
        await ctx.db.insert("threadTags", {
          threadsId: threadId,
          tagsId: tagId,
          order: 1,
        });

        // Verify join row exists
        const joinRowsBefore = await ctx.db.query("threadTags").collect();
        expect(joinRowsBefore).toHaveLength(1);

        await zen.threads.delete(threadId);

        // Thread gone
        expect(await zen.threads.find(threadId)).toBeNull();
        // Join rows cleaned up
        const joinRowsAfter = await ctx.db.query("threadTags").collect();
        expect(joinRowsAfter).toHaveLength(0);
        // Tag still exists (not cascaded by default)
        expect(await zen.tags.find(tagId)).not.toBeNull();
      });
    });

    it("cleans up self-referential join rows (userFollows)", async () => {
      const t = setup();
      await t.run(async (ctx) => {
        const zen = createZen(ctx, relations);

        const alice = await zen.users.insert({
          name: "Alice",
          email: "alice@example.com",
        });
        const bob = await zen.users.insert({
          name: "Bob",
          email: "bob@example.com",
        });

        // Alice follows Bob, Bob follows Alice
        await ctx.db.insert("userFollows", {
          followerId: alice,
          followeeId: bob,
          followedAt: Date.now(),
        });
        await ctx.db.insert("userFollows", {
          followerId: bob,
          followeeId: alice,
          followedAt: Date.now(),
        });

        await zen.users.delete(alice);

        // Alice gone
        expect(await zen.users.find(alice)).toBeNull();
        // All follow rows involving Alice cleaned up
        const followRows = await ctx.db.query("userFollows").collect();
        expect(followRows).toHaveLength(0);
        // Bob still exists
        expect(await zen.users.find(bob)).not.toBeNull();
      });
    });
  });

  // -----------------------------------------------------------------------
  // Combined — cascade chain + through + setNull in one delete
  // -----------------------------------------------------------------------
  describe("combined cascade chain", () => {
    it("user delete cascades threads+posts and cleans join/follow rows", async () => {
      const t = setup();
      await t.run(async (ctx) => {
        const zen = createZen(ctx, relations);

        const catId = await zen.categories.insert({
          name: "General",
          description: "General discussion",
        });
        const alice = await zen.users.insert({
          name: "Alice",
          email: "alice@example.com",
        });
        const bob = await zen.users.insert({
          name: "Bob",
          email: "bob@example.com",
        });

        // Alice creates a thread with tags
        const threadId = await zen.threads.insert({
          title: "Thread",
          slug: "thread",
          categoryId: catId,
          authorId: alice,
          createdAt: Date.now(),
        });
        const tagId = await zen.tags.insert({ name: "test" });
        await ctx.db.insert("threadTags", {
          threadsId: threadId,
          tagsId: tagId,
          order: 1,
        });

        // Posts on Alice's thread (by both users)
        const alicePost = await zen.posts.insert({
          body: "Alice post",
          threadId,
          authorId: alice,
        });
        await zen.posts.insert({
          body: "Bob reply",
          threadId,
          authorId: bob,
          parentId: alicePost,
        });

        // Alice follows Bob
        await ctx.db.insert("userFollows", {
          followerId: alice,
          followeeId: bob,
          followedAt: Date.now(),
        });

        // Delete Alice — should cascade threads → posts, clean up follows
        await zen.users.delete(alice);

        expect(await zen.users.find(alice)).toBeNull();
        expect(await zen.threads.findMany()).toHaveLength(0);
        expect(await zen.posts.findMany()).toHaveLength(0);
        expect(await ctx.db.query("threadTags").collect()).toHaveLength(0);
        expect(await ctx.db.query("userFollows").collect()).toHaveLength(0);
        // Tag and Bob survive
        expect(await zen.tags.find(tagId)).not.toBeNull();
        expect(await zen.users.find(bob)).not.toBeNull();
      });
    });
  });
});
