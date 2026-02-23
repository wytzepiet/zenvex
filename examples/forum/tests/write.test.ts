import { convexTest } from "convex-test";
import { describe, it, expect } from "vitest";
import { createZen } from "zenvex";
import schema, { relations } from "../convex/schema";

const modules = import.meta.glob("../convex/**/*.ts");

function setup() {
  return convexTest(schema, modules);
}

describe("write — insert", () => {
  it("returns the new document ID", async () => {
    const t = setup();
    await t.run(async (ctx) => {
      const zen = createZen(ctx, relations);

      const id = await zen.users.insert({ name: "Dave", email: "dave@example.com" });
      expect(id).toBeDefined();
      expect(typeof id).toBe("string");

      // Verify the doc exists
      const user = await zen.users.find(id);
      expect(user).not.toBeNull();
      expect(user!.name).toBe("Dave");
    });
  });

  // Note: "throws on read-only context" is tested in the unit tests
  // (packages/zenvex/tests/query/createZen.test.ts). convex-test always
  // provides a MutationCtx, so we can't test this in integration tests.
});

describe("write — patch", () => {
  it("updates fields and persists changes", async () => {
    const t = setup();
    await t.run(async (ctx) => {
      const zen = createZen(ctx, relations);

      const id = await zen.users.insert({ name: "Eve", email: "eve@example.com" });
      await zen.users.patch(id, { name: "Eve Updated", email: "eve2@example.com" });

      const user = await zen.users.find(id);
      expect(user).not.toBeNull();
      expect(user!.name).toBe("Eve Updated");
      expect(user!.email).toBe("eve2@example.com");
    });
  });

  it("partial patch updates only specified fields", async () => {
    const t = setup();
    await t.run(async (ctx) => {
      const zen = createZen(ctx, relations);

      const id = await zen.users.insert({ name: "Frank", email: "frank@example.com" });
      await zen.users.patch(id, { name: "Franklin" });

      const user = await zen.users.find(id);
      expect(user!.name).toBe("Franklin");
      expect(user!.email).toBe("frank@example.com"); // unchanged
    });
  });
});

describe("write — upsert", () => {
  it("inserts when existing is null", async () => {
    const t = setup();
    await t.run(async (ctx) => {
      const zen = createZen(ctx, relations);

      const id = await zen.users.upsert(null, { name: "Grace", email: "grace@example.com" });
      expect(id).toBeDefined();

      const user = await zen.users.find(id);
      expect(user).not.toBeNull();
      expect(user!.name).toBe("Grace");
    });
  });

  it("patches when existing is provided", async () => {
    const t = setup();
    await t.run(async (ctx) => {
      const zen = createZen(ctx, relations);

      const id = await zen.users.insert({ name: "Hank", email: "hank@example.com" });
      const existing = await zen.users.find(id);

      const resultId = await zen.users.upsert(existing!, { name: "Hank Updated", email: "hank2@example.com" });
      expect(resultId).toBe(id);

      const user = await zen.users.find(id);
      expect(user!.name).toBe("Hank Updated");
      expect(user!.email).toBe("hank2@example.com");
    });
  });
});
