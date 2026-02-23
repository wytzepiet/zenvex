import { convexTest } from "convex-test";
import { describe, it, expect } from "vitest";
import { createZen } from "zenvex";
import schema, { relations } from "../convex/schema";
import { seed } from "./helpers";

const modules = import.meta.glob("../convex/**/*.ts");

function setup() {
  return convexTest(schema, modules);
}

describe("pagination — basic", () => {
  it("first page with cursor: null returns PaginationResult shape", async () => {
    const t = setup();
    await t.run(async (ctx) => {
      await seed(ctx);
      const zen = createZen(ctx, relations);

      const result = await zen.users.findMany({ take: 2, cursor: null });
      expect(result).toHaveProperty("page");
      expect(result).toHaveProperty("isDone");
      expect(result).toHaveProperty("continueCursor");
      expect(result.page).toHaveLength(2);
    });
  });

  it("next page uses continueCursor", async () => {
    const t = setup();
    await t.run(async (ctx) => {
      await seed(ctx);
      const zen = createZen(ctx, relations);

      // First page: 2 of 3 users
      const page1 = await zen.users.findMany({ take: 2, cursor: null });
      expect(page1.page).toHaveLength(2);
      expect(page1.isDone).toBe(false);

      // Second page: remaining 1 user
      const page2 = await zen.users.findMany({ take: 2, cursor: page1.continueCursor });
      expect(page2.page).toHaveLength(1);
      expect(page2.isDone).toBe(true);
    });
  });

  it("isDone is true when all results fit in one page", async () => {
    const t = setup();
    await t.run(async (ctx) => {
      await seed(ctx);
      const zen = createZen(ctx, relations);

      // 3 users with take: 10 — all fit
      const result = await zen.users.findMany({ take: 10, cursor: null });
      expect(result.page).toHaveLength(3);
      expect(result.isDone).toBe(true);
    });
  });
});

describe("pagination — with relations", () => {
  it("pagination + with", async () => {
    const t = setup();
    await t.run(async (ctx) => {
      await seed(ctx);
      const zen = createZen(ctx, relations);

      const result = await zen.posts.findMany({
        take: 3,
        cursor: null,
        with: { author: true },
      });
      expect(result.page.length).toBeGreaterThan(0);
      result.page.forEach((p: any) => {
        expect(p.author).not.toBeNull();
        expect(p.author.name).toBeDefined();
      });
    });
  });
});

describe("pagination — with select", () => {
  it("pagination + select", async () => {
    const t = setup();
    await t.run(async (ctx) => {
      await seed(ctx);
      const zen = createZen(ctx, relations);

      const result = await zen.users.findMany({
        take: 2,
        cursor: null,
        select: ["_id", "name"],
      });
      expect(result.page).toHaveLength(2);
      result.page.forEach((r: any) => {
        expect(r.name).toBeDefined();
        expect(r._id).toBeDefined();
        expect(r.email).toBeUndefined();
      });
    });
  });
});

describe("pagination — via index query", () => {
  it("paginate on index query builder", async () => {
    const t = setup();
    await t.run(async (ctx) => {
      const { threads } = await seed(ctx);
      const zen = createZen(ctx, relations);

      // thread3 has 2 posts
      const result = await zen.posts.byThread(threads.thread3).findMany({
        take: 1,
        cursor: null,
      });
      expect(result.page).toHaveLength(1);
      expect(result.page[0]!.threadId).toBe(threads.thread3);
      expect(result.isDone).toBe(false);

      // Next page
      const page2 = await zen.posts.byThread(threads.thread3).findMany({
        take: 1,
        cursor: result.continueCursor,
      });
      expect(page2.page).toHaveLength(1);

      // Drain any remaining pages until isDone
      let current = page2;
      while (!current.isDone) {
        current = await zen.posts.byThread(threads.thread3).findMany({
          take: 1,
          cursor: current.continueCursor,
        });
      }
      expect(current.isDone).toBe(true);
    });
  });
});
