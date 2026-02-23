import { v } from "convex/values";
import { query } from "./functions";

export const listCategories = query({
  args: {},
  handler: async ({ zen }) => {
    return zen.categories.findMany({
      with: { threads: true },
      add: (cat) => ({ threadCount: cat.threads.length }),
    });
  },
});

export const listCategoriesWithRecentThreads = query({
  args: {},
  handler: async ({ zen }) => {
    return zen.categories.findMany({
      with: { threads: { take: 3, order: "desc" } },
    });
  },
});

export const getCategory = query({
  args: { id: v.id("categories") },
  handler: async ({ zen }, { id }) => {
    return zen.categories.find(id);
  },
});

export const listThreads = query({
  args: {
    categoryId: v.id("categories"),
    cursor: v.union(v.string(), v.null()),
  },
  handler: async ({ zen }, { categoryId, cursor }) => {
    return zen.threads.byCategoryCreatedAt(categoryId).findMany({
      with: { author: true, tags: true, posts: true },
      add: (thread) => ({ postCount: thread.posts.length }),
      order: "desc",
      take: 5,
      cursor,
    });
  },
});

export const getThread = query({
  args: { id: v.id("threads") },
  handler: async ({ zen }, { id }) => {
    return zen.threads.find(id, {
      with: { author: true, category: true, tags: true },
    });
  },
});

export const listPosts = query({
  args: {
    threadId: v.id("threads"),
    cursor: v.union(v.string(), v.null()),
  },
  handler: async ({ zen }, { threadId, cursor }) => {
    return zen.posts.byThread(threadId).findMany({
      with: { author: true, replies: { with: { author: true } } },
      take: 3,
      cursor,
    });
  },
});

export const listUsers = query({
  args: {},
  handler: async ({ zen }) => {
    return zen.users.findMany();
  },
});

export const getUser = query({
  args: { id: v.id("users") },
  handler: async ({ zen }, { id }) => {
    return zen.users.find(id, {
      with: { threads: true, posts: true, followers: true, following: true },
      add: (user) => ({
        threadCount: user.threads.length,
        postCount: user.posts.length,
        followerCount: user.followers.length,
        followingCount: user.following.length,
      }),
    });
  },
});

export const getUserThreads = query({
  args: { userId: v.id("users") },
  handler: async ({ zen }, { userId }) => {
    return zen.threads.byAuthor(userId).findMany({
      with: { category: true, tags: true, posts: true },
      add: (thread) => ({ postCount: thread.posts.length }),
      order: "desc",
    });
  },
});

export const isFollowing = query({
  args: { followerId: v.id("users"), followeeId: v.id("users") },
  handler: async ({ zen }, { followerId, followeeId }) => {
    const follows = await zen.userFollows.byFollower(followerId).findMany({
      filter: (row) => row.followeeId === followeeId,
    });
    return follows.length > 0;
  },
});
