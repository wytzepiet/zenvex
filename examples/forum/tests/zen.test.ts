import { convexTest } from "convex-test";
import { describe, it, expect } from "vitest";
import { createZen } from "zenvex";
import schema, { relations } from "../convex/schema";

const modules = import.meta.glob("../convex/**/*.ts");

function setup() {
  return convexTest(schema, modules);
}

// Tests will be added as the library is built out.
// The forum schema covers all relation patterns needed for testing.

describe("smoke test", () => {
  it("can insert and query users", async () => {
    const t = setup();

    await t.run(async (ctx) => {
      await ctx.db.insert("users", { name: "Alice", email: "alice@example.com" });
      await ctx.db.insert("users", { name: "Bob", email: "bob@example.com" });

      const zen = createZen(ctx, relations);
      const users = await zen.users.findMany();
      expect(users).toHaveLength(2);
    });
  });
});
