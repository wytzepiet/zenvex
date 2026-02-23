import type { GenericDatabaseReader } from "convex/server";
import type { Zen } from "./types/zen";
import { ZEN_SCHEMA } from "./relations/defineRelations";
import { createTableProxy, type IndexCache } from "./query/tableProxy";

export type { Zen, ZenQueryBuilder } from "./types/zen";

// ---------------------------------------------------------------------------
// Schema introspection types (structural — matches Convex internal shape)
// ---------------------------------------------------------------------------

interface IndexEntry {
  indexDescriptor: string;
  fields: string[];
}

interface IntrospectableTable {
  [" indexes"]?: () => IndexEntry[];
}

interface IntrospectableSchema {
  tables: Record<string, IntrospectableTable>;
}

// ---------------------------------------------------------------------------
// Schema extraction
// ---------------------------------------------------------------------------

function getSchema(
  input: object,
): IntrospectableSchema | null {
  if ("tables" in input && typeof input.tables === "object" && input.tables !== null) {
    return input as IntrospectableSchema;
  }
  if (ZEN_SCHEMA in input) {
    const stashed = (input as Record<symbol, unknown>)[ZEN_SCHEMA];
    if (stashed && typeof stashed === "object" && "tables" in stashed) {
      return stashed as IntrospectableSchema;
    }
  }
  return null;
}

/**
 * Build a per-table index cache from schema introspection.
 * Map<tableName, Map<indexName, fieldNames[]>>
 */
function buildIndexCache(
  schema: IntrospectableSchema,
): Map<string, IndexCache> {
  const cache = new Map<string, IndexCache>();

  for (const [tableName, tableDef] of Object.entries(schema.tables)) {
    const indexMap: IndexCache = new Map();

    if (typeof tableDef[" indexes"] === "function") {
      const indexes = tableDef[" indexes"]();
      for (const idx of indexes) {
        if (
          idx.indexDescriptor === "by_id" ||
          idx.indexDescriptor === "by_creation_time"
        )
          continue;

        indexMap.set(idx.indexDescriptor, idx.fields);
      }
    }

    cache.set(tableName, indexMap);
  }

  return cache;
}

// ---------------------------------------------------------------------------
// createZen
// ---------------------------------------------------------------------------

export function createZen<
  // SAFETY: `any` required — GenericDatabaseReader is contravariant in its DataModel
  // parameter, so GenericDatabaseReader<ConcreteDataModel> does not extend
  // GenericDatabaseReader<GenericDataModel>. Using `any` allows concrete ctx types.
  Ctx extends { db: GenericDatabaseReader<any> },
  Relations extends object = object,
>(ctx: Ctx, relationsOrSchema: Relations): Zen<Ctx, Relations> {
  const { db } = ctx;

  const schema = getSchema(relationsOrSchema);
  const tableIndexCache = schema ? buildIndexCache(schema) : null;

  return new Proxy(Object.create(null) as Record<string, unknown>, {
    get(_target, tableName: string) {
      const indexCache = tableIndexCache?.get(tableName);
      return createTableProxy(db, tableName, indexCache);
    },
  }) as Zen<Ctx, Relations>;
}
