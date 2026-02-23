import { convexTest } from "convex-test";
import { describe, it, expect } from "vitest";
import { createZen } from "zenvex";
import schema, { relations } from "../convex/schema";
import { seed } from "./helpers";

const modules = import.meta.glob("../convex/**/*.ts");

function setup() {
  return convexTest(schema, modules);
}

describe("relations — one", () => {
  it("loads post.author", async () => {
    const t = setup();
    await t.run(async (ctx) => {
      const { posts, users } = await seed(ctx);
      const zen = createZen(ctx, relations);

      const post = await zen.posts.find(posts.post1, { with: { author: true } });
      expect(post).not.toBeNull();
      expect((post as any).author).not.toBeNull();
      expect((post as any).author.name).toBe("Alice");
      expect((post as any).author._id).toBe(users.alice);
    });
  });

  it("loads thread.category", async () => {
    const t = setup();
    await t.run(async (ctx) => {
      const { threads, categories } = await seed(ctx);
      const zen = createZen(ctx, relations);

      const thread = await zen.threads.find(threads.thread2, { with: { category: true } });
      expect(thread).not.toBeNull();
      expect((thread as any).category.name).toBe("Tech");
      expect((thread as any).category._id).toBe(categories.tech);
    });
  });

  it("optional FK — post.parent is null when no parent", async () => {
    const t = setup();
    await t.run(async (ctx) => {
      const { posts } = await seed(ctx);
      const zen = createZen(ctx, relations);

      // post1 has no parent
      const post = await zen.posts.find(posts.post1, { with: { parent: true } });
      expect(post).not.toBeNull();
      expect((post as any).parent).toBeNull();
    });
  });

  it("optional FK — post.parent is present when set", async () => {
    const t = setup();
    await t.run(async (ctx) => {
      const { posts } = await seed(ctx);
      const zen = createZen(ctx, relations);

      // post2 has parentId = post1
      const post = await zen.posts.find(posts.post2, { with: { parent: true } });
      expect(post).not.toBeNull();
      expect((post as any).parent).not.toBeNull();
      expect((post as any).parent._id).toBe(posts.post1);
    });
  });
});

describe("relations — many", () => {
  it("loads thread.posts", async () => {
    const t = setup();
    await t.run(async (ctx) => {
      const { threads } = await seed(ctx);
      const zen = createZen(ctx, relations);

      const thread = await zen.threads.find(threads.thread1, { with: { posts: true } });
      expect(thread).not.toBeNull();
      expect((thread as any).posts).toHaveLength(2);
    });
  });

  it("returns empty array when none exist", async () => {
    const t = setup();
    await t.run(async (ctx) => {
      await seed(ctx);
      const zen = createZen(ctx, relations);

      // Create a thread with no posts
      const catId = (await zen.categories.findFirst())!._id;
      const userId = (await zen.users.findFirst())!._id;
      const emptyThread = await zen.threads.insert({
        title: "Empty",
        slug: "empty",
        categoryId: catId,
        authorId: userId,
        createdAt: 9999,
      });

      const thread = await zen.threads.find(emptyThread, { with: { posts: true } });
      expect(thread).not.toBeNull();
      expect((thread as any).posts).toEqual([]);
    });
  });
});

describe("relations — through", () => {
  it("loads thread.tags with pivot data", async () => {
    const t = setup();
    await t.run(async (ctx) => {
      const { threads } = await seed(ctx);
      const zen = createZen(ctx, relations);

      const thread = await zen.threads.find(threads.thread2, { with: { tags: true } });
      expect(thread).not.toBeNull();
      const tags = (thread as any).tags;
      expect(tags).toHaveLength(2);

      // Each tag should have pivot data with order field
      tags.forEach((tag: any) => {
        expect(tag.pivot).toBeDefined();
        expect(typeof tag.pivot.order).toBe("number");
        expect(tag.name).toBeDefined();
      });
    });
  });

  it("self-referential through — user.followers", async () => {
    const t = setup();
    await t.run(async (ctx) => {
      const { users } = await seed(ctx);
      const zen = createZen(ctx, relations);

      // Alice is followed by Bob and Charlie
      const alice = await zen.users.find(users.alice, { with: { followers: true } });
      expect(alice).not.toBeNull();
      const followers = (alice as any).followers;
      expect(followers).toHaveLength(2);

      const followerIds = followers.map((f: any) => f._id);
      expect(followerIds).toContain(users.bob);
      expect(followerIds).toContain(users.charlie);
    });
  });

  it("self-referential through — user.following", async () => {
    const t = setup();
    await t.run(async (ctx) => {
      const { users } = await seed(ctx);
      const zen = createZen(ctx, relations);

      // Alice follows Bob
      const alice = await zen.users.find(users.alice, { with: { following: true } });
      expect(alice).not.toBeNull();
      const following = (alice as any).following;
      expect(following).toHaveLength(1);
      expect(following[0]._id).toBe(users.bob);
    });
  });
});

describe("relations — nested with", () => {
  it("post → thread → category (two levels deep)", async () => {
    const t = setup();
    await t.run(async (ctx) => {
      const { posts, categories } = await seed(ctx);
      const zen = createZen(ctx, relations);

      const post = await zen.posts.find(posts.post3, {
        with: { thread: { with: { category: true } } },
      });
      expect(post).not.toBeNull();
      expect((post as any).thread).not.toBeNull();
      expect((post as any).thread.category).not.toBeNull();
      expect((post as any).thread.category.name).toBe("Tech");
      expect((post as any).thread.category._id).toBe(categories.tech);
    });
  });
});

describe("relations — query options on relations", () => {
  it("take on many relation limits results", async () => {
    const t = setup();
    await t.run(async (ctx) => {
      const { threads } = await seed(ctx);
      const zen = createZen(ctx, relations);

      const thread = await zen.threads.find(threads.thread1, {
        with: { posts: { take: 1 } },
      });
      expect(thread).not.toBeNull();
      expect((thread as any).posts).toHaveLength(1);
    });
  });

  it("filter + take on many relation", async () => {
    const t = setup();
    await t.run(async (ctx) => {
      const { threads, users } = await seed(ctx);
      const zen = createZen(ctx, relations);

      // thread3 has 2 posts: one by alice, one by charlie
      const thread = await zen.threads.find(threads.thread3, {
        with: {
          posts: {
            filter: (p) => p.authorId === users.alice,
            take: 1,
          },
        },
      });
      expect(thread).not.toBeNull();
      expect((thread as any).posts).toHaveLength(1);
      expect((thread as any).posts[0].body).toBe("Convex is amazing");
    });
  });

  it("order desc on many relation reverses results", async () => {
    const t = setup();
    await t.run(async (ctx) => {
      const { threads } = await seed(ctx);
      const zen = createZen(ctx, relations);

      const threadAsc = await zen.threads.find(threads.thread1, {
        with: { posts: true },
      });
      const threadDesc = await zen.threads.find(threads.thread1, {
        with: { posts: { order: "desc" } },
      });
      expect(threadAsc).not.toBeNull();
      expect(threadDesc).not.toBeNull();
      const ascIds = (threadAsc as any).posts.map((p: any) => p._id);
      const descIds = (threadDesc as any).posts.map((p: any) => p._id);
      expect(descIds).toEqual([...ascIds].reverse());
    });
  });

  it("select on through relation", async () => {
    const t = setup();
    await t.run(async (ctx) => {
      const { threads } = await seed(ctx);
      const zen = createZen(ctx, relations);

      const thread = await zen.threads.find(threads.thread2, {
        with: { tags: { select: ["_id", "name"] } },
      });
      expect(thread).not.toBeNull();
      const tags = (thread as any).tags;
      expect(tags).toHaveLength(2);
      tags.forEach((tag: any) => {
        expect(tag._id).toBeDefined();
        expect(tag.name).toBeDefined();
        expect(tag._creationTime).toBeUndefined();
      });
    });
  });

  it("select on one relation prunes fields", async () => {
    const t = setup();
    await t.run(async (ctx) => {
      const { posts } = await seed(ctx);
      const zen = createZen(ctx, relations);

      const post = await zen.posts.find(posts.post1, {
        with: { author: { select: ["_id", "name"] } },
      });
      expect(post).not.toBeNull();
      expect((post as any).author._id).toBeDefined();
      expect((post as any).author.name).toBe("Alice");
      expect((post as any).author.email).toBeUndefined();
    });
  });
});

describe("relations — with + select/omit", () => {
  it("with + select", async () => {
    const t = setup();
    await t.run(async (ctx) => {
      const { posts } = await seed(ctx);
      const zen = createZen(ctx, relations);

      const post = await zen.posts.find(posts.post1, {
        with: { author: true },
        select: ["_id", "body", "authorId"],
      });
      expect(post).not.toBeNull();
      expect((post as any).body).toBeDefined();
      expect((post as any)._id).toBeDefined();
      expect((post as any).threadId).toBeUndefined();
      // Relation should still be loaded
      expect((post as any).author).not.toBeNull();
      expect((post as any).author.name).toBe("Alice");
    });
  });

  it("with + omit", async () => {
    const t = setup();
    await t.run(async (ctx) => {
      const { posts } = await seed(ctx);
      const zen = createZen(ctx, relations);

      const post = await zen.posts.find(posts.post1, {
        with: { author: true },
        omit: ["_creationTime"],
      });
      expect(post).not.toBeNull();
      expect((post as any)._creationTime).toBeUndefined();
      expect((post as any).body).toBeDefined();
      expect((post as any).author).not.toBeNull();
    });
  });
});

describe("relations — with on findMany/findFirst", () => {
  it("findMany with relations", async () => {
    const t = setup();
    await t.run(async (ctx) => {
      const { threads } = await seed(ctx);
      const zen = createZen(ctx, relations);

      const posts = await zen.posts.byThread(threads.thread1).findMany({
        with: { author: true },
      });
      expect(posts).toHaveLength(2);
      posts.forEach((p: any) => {
        expect(p.author).not.toBeNull();
        expect(p.author.name).toBeDefined();
      });
    });
  });

  it("findFirst with relations", async () => {
    const t = setup();
    await t.run(async (ctx) => {
      await seed(ctx);
      const zen = createZen(ctx, relations);

      const thread = await zen.threads.findFirst({ with: { category: true } });
      expect(thread).not.toBeNull();
      expect((thread as any).category).not.toBeNull();
      expect((thread as any).category.name).toBeDefined();
    });
  });
});
