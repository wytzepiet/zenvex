import { convexTest } from "convex-test";
import { describe, it, expect } from "vitest";
import { createZen } from "zenvex";
import schema, { relations } from "../convex/schema";
import { seed } from "./helpers";

const modules = import.meta.glob("../convex/**/*.ts");

function setup() {
  return convexTest(schema, modules);
}

describe("read — find", () => {
  it("returns document by ID", async () => {
    const t = setup();
    await t.run(async (ctx) => {
      const { users } = await seed(ctx);
      const zen = createZen(ctx, relations);

      const alice = await zen.users.find(users.alice);
      expect(alice).not.toBeNull();
      expect(alice!.name).toBe("Alice");
      expect(alice!.email).toBe("alice@example.com");
    });
  });

  it("returns null for missing ID", async () => {
    const t = setup();
    await t.run(async (ctx) => {
      const { users } = await seed(ctx);
      const zen = createZen(ctx, relations);

      // Delete alice then try to find her
      await zen.users.delete(users.alice);
      const result = await zen.users.find(users.alice);
      expect(result).toBeNull();
    });
  });
});

describe("read — findFirst", () => {
  it("returns first document", async () => {
    const t = setup();
    await t.run(async (ctx) => {
      await seed(ctx);
      const zen = createZen(ctx, relations);

      const user = await zen.users.findFirst();
      expect(user).not.toBeNull();
      expect(user!.name).toBeDefined();
    });
  });

  it("returns null on empty table", async () => {
    const t = setup();
    await t.run(async (ctx) => {
      const zen = createZen(ctx, relations);

      const result = await zen.tags.findFirst();
      expect(result).toBeNull();
    });
  });
});

describe("read — findMany", () => {
  it("returns all documents", async () => {
    const t = setup();
    await t.run(async (ctx) => {
      await seed(ctx);
      const zen = createZen(ctx, relations);

      const users = await zen.users.findMany();
      expect(users).toHaveLength(3);
    });
  });

  it("respects order asc", async () => {
    const t = setup();
    await t.run(async (ctx) => {
      await seed(ctx);
      const zen = createZen(ctx, relations);

      const threads = await zen.threads.findMany({ order: "asc" });
      expect(threads.length).toBeGreaterThan(1);
      // Asc order by _creationTime — first inserted comes first
      for (let i = 1; i < threads.length; i++) {
        expect(threads[i]!._creationTime).toBeGreaterThanOrEqual(threads[i - 1]!._creationTime);
      }
    });
  });

  it("respects order desc", async () => {
    const t = setup();
    await t.run(async (ctx) => {
      await seed(ctx);
      const zen = createZen(ctx, relations);

      const threads = await zen.threads.findMany({ order: "desc" });
      expect(threads.length).toBeGreaterThan(1);
      for (let i = 1; i < threads.length; i++) {
        expect(threads[i]!._creationTime).toBeLessThanOrEqual(threads[i - 1]!._creationTime);
      }
    });
  });
});

describe("read — index queries", () => {
  it("byEmail (users)", async () => {
    const t = setup();
    await t.run(async (ctx) => {
      await seed(ctx);
      const zen = createZen(ctx, relations);

      const results = await zen.users.byEmail("alice@example.com").findMany();
      expect(results).toHaveLength(1);
      expect(results[0]!.name).toBe("Alice");
    });
  });

  it("byCategory (threads)", async () => {
    const t = setup();
    await t.run(async (ctx) => {
      const { categories } = await seed(ctx);
      const zen = createZen(ctx, relations);

      const results = await zen.threads.byCategory(categories.tech).findMany();
      expect(results).toHaveLength(2);
      results.forEach((thread) => {
        expect(thread.categoryId).toBe(categories.tech);
      });
    });
  });

  it("byAuthor (threads)", async () => {
    const t = setup();
    await t.run(async (ctx) => {
      const { users } = await seed(ctx);
      const zen = createZen(ctx, relations);

      const results = await zen.threads.byAuthor(users.alice).findMany();
      expect(results).toHaveLength(2);
      results.forEach((thread) => {
        expect(thread.authorId).toBe(users.alice);
      });
    });
  });

  it("bySlug (threads)", async () => {
    const t = setup();
    await t.run(async (ctx) => {
      await seed(ctx);
      const zen = createZen(ctx, relations);

      const results = await zen.threads.bySlug("typescript-tips").findMany();
      expect(results).toHaveLength(1);
      expect(results[0]!.title).toBe("TypeScript Tips");
    });
  });

  it("byThread (posts)", async () => {
    const t = setup();
    await t.run(async (ctx) => {
      const { threads } = await seed(ctx);
      const zen = createZen(ctx, relations);

      const results = await zen.posts.byThread(threads.thread1).findMany();
      expect(results).toHaveLength(2);
      results.forEach((post) => {
        expect(post.threadId).toBe(threads.thread1);
      });
    });
  });

  it("byAuthor (posts)", async () => {
    const t = setup();
    await t.run(async (ctx) => {
      const { users } = await seed(ctx);
      const zen = createZen(ctx, relations);

      const results = await zen.posts.byAuthor(users.bob).findMany();
      expect(results).toHaveLength(2);
      results.forEach((post) => {
        expect(post.authorId).toBe(users.bob);
      });
    });
  });

  it("byParent (posts)", async () => {
    const t = setup();
    await t.run(async (ctx) => {
      const { posts } = await seed(ctx);
      const zen = createZen(ctx, relations);

      const replies = await zen.posts.byParent(posts.post1).findMany();
      expect(replies).toHaveLength(1);
      expect(replies[0]!.body).toBe("Reply to hello world");
    });
  });

  it("byCategoryCreatedAt — equality only", async () => {
    const t = setup();
    await t.run(async (ctx) => {
      const { categories } = await seed(ctx);
      const zen = createZen(ctx, relations);

      const results = await zen.threads.byCategoryCreatedAt(categories.tech).findMany();
      expect(results).toHaveLength(2);
      results.forEach((thread) => {
        expect(thread.categoryId).toBe(categories.tech);
      });
    });
  });

  it("byCategoryCreatedAt — with range (q.gte / q.lt)", async () => {
    const t = setup();
    await t.run(async (ctx) => {
      const { q } = await import("zenvex");
      const { categories } = await seed(ctx);
      const zen = createZen(ctx, relations);

      // thread2 has createdAt=2000, thread3 has createdAt=3000
      const results = await zen.threads
        .byCategoryCreatedAt(categories.tech, q.gte(2000).lt(3000))
        .findMany();
      expect(results).toHaveLength(1);
      expect(results[0]!.title).toBe("TypeScript Tips");
    });
  });

  it("findFirst on index query", async () => {
    const t = setup();
    await t.run(async (ctx) => {
      const { threads } = await seed(ctx);
      const zen = createZen(ctx, relations);

      const post = await zen.posts.byThread(threads.thread1).findFirst();
      expect(post).not.toBeNull();
      expect(post!.threadId).toBe(threads.thread1);
    });
  });
});
