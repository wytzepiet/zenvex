import { convexTest } from "convex-test";
import { describe, it, expect } from "vitest";
import { createZen } from "zenvex";
import schema, { relations } from "../convex/schema";
import { seed } from "./helpers";

const modules = import.meta.glob("../convex/**/*.ts");

function setup() {
  return convexTest(schema, modules);
}

describe("query options — filter", () => {
  it("findMany with filter", async () => {
    const t = setup();
    await t.run(async (ctx) => {
      await seed(ctx);
      const zen = createZen(ctx, relations);

      const results = await zen.users.findMany({
        filter: (u) => u.name.startsWith("A"),
      });
      expect(results).toHaveLength(1);
      expect(results[0]!.name).toBe("Alice");
    });
  });

  it("findFirst with filter", async () => {
    const t = setup();
    await t.run(async (ctx) => {
      await seed(ctx);
      const zen = createZen(ctx, relations);

      const result = await zen.users.findFirst({
        filter: (u) => u.name === "Bob",
      });
      expect(result).not.toBeNull();
      expect(result!.name).toBe("Bob");
    });
  });

  it("index query + filter", async () => {
    const t = setup();
    await t.run(async (ctx) => {
      const { threads } = await seed(ctx);
      const zen = createZen(ctx, relations);

      const results = await zen.posts.byThread(threads.thread3).findMany({
        filter: (p) => p.body.includes("amazing"),
      });
      expect(results).toHaveLength(1);
      expect(results[0]!.body).toBe("Convex is amazing");
    });
  });
});

describe("query options — select", () => {
  it("findMany with select", async () => {
    const t = setup();
    await t.run(async (ctx) => {
      await seed(ctx);
      const zen = createZen(ctx, relations);

      const results = await zen.users.findMany({ select: ["_id", "name"] });
      expect(results.length).toBeGreaterThan(0);
      results.forEach((r: any) => {
        expect(r.name).toBeDefined();
        expect(r._id).toBeDefined();
        expect(r.email).toBeUndefined();
      });
    });
  });

  it("findFirst with select", async () => {
    const t = setup();
    await t.run(async (ctx) => {
      await seed(ctx);
      const zen = createZen(ctx, relations);

      const result = await zen.users.findFirst({ select: ["name"] });
      expect(result).not.toBeNull();
      expect((result as any).name).toBeDefined();
      expect((result as any).email).toBeUndefined();
      expect((result as any)._id).toBeUndefined();
    });
  });

  it("find with select", async () => {
    const t = setup();
    await t.run(async (ctx) => {
      const { users } = await seed(ctx);
      const zen = createZen(ctx, relations);

      const result = await zen.users.find(users.alice, { select: ["name", "email"] });
      expect(result).not.toBeNull();
      expect((result as any).name).toBe("Alice");
      expect((result as any).email).toBe("alice@example.com");
      expect((result as any)._id).toBeUndefined();
    });
  });
});

describe("query options — omit", () => {
  it("findMany with omit", async () => {
    const t = setup();
    await t.run(async (ctx) => {
      await seed(ctx);
      const zen = createZen(ctx, relations);

      const results = await zen.users.findMany({ omit: ["email"] });
      expect(results.length).toBeGreaterThan(0);
      results.forEach((r: any) => {
        expect(r.name).toBeDefined();
        expect(r._id).toBeDefined();
        expect(r.email).toBeUndefined();
      });
    });
  });

  it("findFirst with omit", async () => {
    const t = setup();
    await t.run(async (ctx) => {
      await seed(ctx);
      const zen = createZen(ctx, relations);

      const result = await zen.users.findFirst({ omit: ["email", "_creationTime"] });
      expect(result).not.toBeNull();
      expect((result as any).name).toBeDefined();
      expect((result as any).email).toBeUndefined();
      expect((result as any)._creationTime).toBeUndefined();
    });
  });

  it("find with omit", async () => {
    const t = setup();
    await t.run(async (ctx) => {
      const { users } = await seed(ctx);
      const zen = createZen(ctx, relations);

      const result = await zen.users.find(users.alice, { omit: ["email"] });
      expect(result).not.toBeNull();
      expect((result as any).name).toBe("Alice");
      expect((result as any)._id).toBeDefined();
      expect((result as any).email).toBeUndefined();
    });
  });
});

describe("query options — take", () => {
  it("findMany with take", async () => {
    const t = setup();
    await t.run(async (ctx) => {
      await seed(ctx);
      const zen = createZen(ctx, relations);

      const results = await zen.users.findMany({ take: 2 });
      expect(results).toHaveLength(2);
    });
  });
});

describe("query options — order", () => {
  it("asc on full table", async () => {
    const t = setup();
    await t.run(async (ctx) => {
      await seed(ctx);
      const zen = createZen(ctx, relations);

      const results = await zen.threads.findMany({ order: "asc" });
      for (let i = 1; i < results.length; i++) {
        expect(results[i]!._creationTime).toBeGreaterThanOrEqual(results[i - 1]!._creationTime);
      }
    });
  });

  it("desc on full table", async () => {
    const t = setup();
    await t.run(async (ctx) => {
      await seed(ctx);
      const zen = createZen(ctx, relations);

      const results = await zen.threads.findMany({ order: "desc" });
      for (let i = 1; i < results.length; i++) {
        expect(results[i]!._creationTime).toBeLessThanOrEqual(results[i - 1]!._creationTime);
      }
    });
  });

  it("desc on index query", async () => {
    const t = setup();
    await t.run(async (ctx) => {
      const { categories } = await seed(ctx);
      const zen = createZen(ctx, relations);

      const results = await zen.threads
        .byCategory(categories.tech)
        .findMany({ order: "desc" });
      expect(results).toHaveLength(2);
      expect(results[0]!._creationTime).toBeGreaterThanOrEqual(results[1]!._creationTime);
    });
  });
});

describe("query options — combined", () => {
  it("filter + take + omit", async () => {
    const t = setup();
    await t.run(async (ctx) => {
      await seed(ctx);
      const zen = createZen(ctx, relations);

      const results = await zen.posts.findMany({
        filter: (p) => p.body.length > 10,
        take: 2,
        omit: ["_creationTime"],
      });
      expect(results.length).toBeLessThanOrEqual(2);
      results.forEach((r: any) => {
        expect(r.body.length).toBeGreaterThan(10);
        expect(r._creationTime).toBeUndefined();
      });
    });
  });

  it("order + select on index query", async () => {
    const t = setup();
    await t.run(async (ctx) => {
      const { categories } = await seed(ctx);
      const zen = createZen(ctx, relations);

      const results = await zen.threads
        .byCategory(categories.tech)
        .findMany({ order: "desc", select: ["_id", "title"] });
      expect(results).toHaveLength(2);
      results.forEach((r: any) => {
        expect(r.title).toBeDefined();
        expect(r._id).toBeDefined();
        expect(r.categoryId).toBeUndefined();
      });
    });
  });
});
