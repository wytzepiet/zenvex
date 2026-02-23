import { describe, expect, test } from "bun:test";
import { expectTypeOf } from "expect-type";
import type { TableDefinition } from "convex/server";
import type { GenericId, VFloat64, VId } from "convex/values";
import { v } from "convex/values";
import { defineJoinTable } from "../../src/schema/defineJoinTable.js";

// Helper to access the (space-prefixed) indexes method on TableDefinition.
// Convex exposes it as `" indexes"()` to keep it out of normal autocompletion.
const getIndexes = (table: TableDefinition) =>
  (table as any)[" indexes"]() as { indexDescriptor: string; fields: string[] }[];

// ---------------------------------------------------------------------------
// Runtime tests
// ---------------------------------------------------------------------------

describe("defineJoinTable", () => {
  test("creates ID fields for both tables", () => {
    const table = defineJoinTable("threads", "tags");
    const fields = table.validator.fields;

    expect(fields).toHaveProperty("threadsId");
    expect(fields).toHaveProperty("tagsId");
    expect(fields.threadsId.kind).toBe("id");
    expect(fields.tagsId.kind).toBe("id");
  });

  test("includes extra fields", () => {
    const table = defineJoinTable("threads", "tags", {
      order: v.number(),
    });
    const fields = table.validator.fields;

    expect(fields).toHaveProperty("threadsId");
    expect(fields).toHaveProperty("tagsId");
    expect(fields).toHaveProperty("order");
  });

  test("creates camelCase index names", () => {
    const table = defineJoinTable("threads", "tags");
    const indexes = getIndexes(table);

    const indexNames = indexes.map((idx) => idx.indexDescriptor);
    expect(indexNames).toContain("byThreadsId");
    expect(indexNames).toContain("byTagsId");
  });

  test("indexes reference the correct fields", () => {
    const table = defineJoinTable("threads", "tags");
    const indexes = getIndexes(table);

    const byThreads = indexes.find(
      (idx) => idx.indexDescriptor === "byThreadsId",
    );
    const byTags = indexes.find(
      (idx) => idx.indexDescriptor === "byTagsId",
    );

    // _creationTime is appended by Convex at deploy time, not at definition time
    expect(byThreads?.fields).toEqual(["threadsId"]);
    expect(byTags?.fields).toEqual(["tagsId"]);
  });

  test("works with no extra fields", () => {
    const table = defineJoinTable("users", "groups");
    const fields = table.validator.fields;

    expect(Object.keys(fields).sort()).toEqual(["groupsId", "usersId"]);
  });
});

// ---------------------------------------------------------------------------
// Type tests
// ---------------------------------------------------------------------------

describe("defineJoinTable types", () => {
  test("return type has correct ID field validators", () => {
    const table = defineJoinTable("threads", "tags");

    type Fields = (typeof table)["validator"]["fields"];

    expectTypeOf<Fields>().toHaveProperty("threadsId");
    expectTypeOf<Fields>().toHaveProperty("tagsId");
    expectTypeOf<Fields["threadsId"]>().toEqualTypeOf<
      VId<GenericId<"threads">>
    >();
    expectTypeOf<Fields["tagsId"]>().toEqualTypeOf<VId<GenericId<"tags">>>();
  });

  test("return type includes extra fields", () => {
    const table = defineJoinTable("threads", "tags", {
      order: v.number(),
    });

    type Fields = (typeof table)["validator"]["fields"];

    expectTypeOf<Fields>().toHaveProperty("order");
    expectTypeOf<Fields["order"]>().toEqualTypeOf<VFloat64>();
  });

  test("return type is a TableDefinition", () => {
    const table = defineJoinTable("threads", "tags");

    expectTypeOf(table).toMatchTypeOf<TableDefinition>();
  });

  test("same-table join is a type error", () => {
    // @ts-expect-error — EnsureDifferent blocks same-table joins
    defineJoinTable("users", "users");
  });

  test("extra fields colliding with ID names are a type error", () => {
    // @ts-expect-error — threadsId collides with generated field
    defineJoinTable("threads", "tags", { threadsId: v.string() });
  });

  // CAST validation — ensures the Kind 1 cast in defineJoinTable is sound.
  // If the cast were wrong, these field/index types would mismatch.
  test("cast produces correct index types", () => {
    const table = defineJoinTable("threads", "tags");

    // The index type should include byThreadsId and byTagsId
    type Indexes = (typeof table) extends TableDefinition<any, infer I>
      ? I
      : never;

    expectTypeOf<Indexes>().toHaveProperty("byThreadsId");
    expectTypeOf<Indexes>().toHaveProperty("byTagsId");
  });
});
