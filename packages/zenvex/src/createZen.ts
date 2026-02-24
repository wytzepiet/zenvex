// ---------------------------------------------------------------------------
// createZen — entry point for the query layer
// ---------------------------------------------------------------------------

import type { GenericDatabaseReader, SchemaDefinition } from "convex/server";
import type { Zen } from "./types/zen.js";
import type { AllRelations } from "./types/shared.js";
import { createTableProxy, type IndexCache } from "./query/tableProxy.js";
import { ZEN_SCHEMA } from "./relations/defineRelations.js";
import { type IntrospectableTable, type IndexEntry } from "./relations/introspect.js";
import { makeGetProxy } from "./utils/makeGetProxy.js";

const SYS_INDEXES = new Set(["by_id", "by_creation_time"]);

/**
 * Build a per-table index cache from schema introspection.
 * Map<tableName, Map<indexName, fieldNames[]>>
 */
function buildIndexCache(
  tables: Record<string, Pick<IntrospectableTable, " indexes">>,
): Map<string, IndexCache> {
  return new Map(
    Object.entries(tables).map(([tableName, tableDef]) => [
      tableName,
      new Map(
        tableDef[" indexes"]()
          .filter((idx: IndexEntry) => !SYS_INDEXES.has(idx.indexDescriptor))
          .map((idx: IndexEntry) => [idx.indexDescriptor, idx.fields] as const),
      ),
    ]),
  );
}

// ---------------------------------------------------------------------------
// Extract schema from relations object
// ---------------------------------------------------------------------------

type ExtractSchema<R> =
  R extends { readonly [ZEN_SCHEMA]: infer S extends SchemaDefinition<any, any> }
    ? S
    : never;

// ---------------------------------------------------------------------------
// createZen
// ---------------------------------------------------------------------------

export function createZen<
  // `any` required — GenericDatabaseReader is contravariant in its DataModel
  // parameter, so GenericDatabaseReader<ConcreteDataModel> does not extend
  // GenericDatabaseReader<GenericDataModel>. Using `any` allows concrete ctx types.
  Ctx extends { db: GenericDatabaseReader<any> },
  Relations extends { readonly [ZEN_SCHEMA]: SchemaDefinition<any, any> },
>(ctx: Ctx, relations: Relations): Zen<Ctx, Relations> {
  const { db } = ctx;
  const schema = relations[ZEN_SCHEMA];
  const tables = (schema as unknown as { tables: Record<string, Pick<IntrospectableTable, " indexes">> }).tables;
  const tableIndexCache = buildIndexCache(tables);

  // Extract relation descriptors (all own enumerable string keys)
  const allRelations: AllRelations = Object.fromEntries(
    Object.entries(relations as Record<string, unknown>).filter(
      ([, val]) => val != null && typeof val === "object" && !Array.isArray(val),
    ),
  ) as AllRelations;

  // CAST Kind 1 — Proxy erases mapped table types. The runtime proxy intercepts all
  // property access and returns correctly-typed table proxies. The Zen<Ctx, Schema, Relations>
  // return type is enforced by the generic constraint.
  // Tested: tests/query/createZen.test.ts
  return makeGetProxy<Zen<Ctx, Relations>>((tableName) => {
    const indexCache = tableIndexCache.get(tableName);
    if (!indexCache) {
      throw new Error(`[zen] Unknown table: "${tableName}"`);
    }
    return createTableProxy(db, tableName, indexCache, allRelations);
  });
}
