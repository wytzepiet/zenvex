import type { GenericSchema, SchemaDefinition } from "convex/server";
import type {
  RelationsConfig,
  ResolvedRelations,
  OneDescriptor,
  ManyDescriptor,
  ThroughDescriptor,
  OnDeleteAction,
} from "./types";

interface SchemaIntrospection {
  tableNames: Set<string>;
  /** field name → target table name, for v.id() fields */
  idFields: (tableName: string) => Map<string, string>;
  /** user-defined index names (excludes system indexes) */
  indexNames: (tableName: string) => Set<string>;
  /** first field of each index → set of first-field names */
  indexFirstFields: (tableName: string) => Set<string>;
  /** index names on targetTable whose first field is a v.id() pointing to sourceTable */
  indexesPointingTo: (targetTable: string, sourceTable: string) => string[];
}

function introspect(schema: SchemaDefinition<any, any>): SchemaIntrospection {
  const tables: Record<string, any> = schema.tables;
  const tableNames = new Set(Object.keys(tables));

  const idFieldsCache = new Map<string, Map<string, string>>();
  const indexNamesCache = new Map<string, Set<string>>();
  const indexFirstFieldsCache = new Map<string, Set<string>>();
  const indexesPointingToCache = new Map<string, string[]>();

  function getIndexes(tableName: string): { indexDescriptor: string; fields: string[] }[] {
    const tableDef = tables[tableName];
    if (tableDef && typeof tableDef[" indexes"] === "function") {
      return tableDef[" indexes"]();
    }
    return [];
  }

  const self: SchemaIntrospection = {
    tableNames,

    idFields(tableName: string): Map<string, string> {
      let cached = idFieldsCache.get(tableName);
      if (cached) return cached;

      cached = new Map();
      const tableDef = tables[tableName];
      if (tableDef?.validator?.fields) {
        const fields: Record<string, any> = tableDef.validator.fields;
        for (const [fieldName, validator] of Object.entries(fields)) {
          if (validator && validator.kind === "id" && typeof validator.tableName === "string") {
            cached.set(fieldName, validator.tableName);
          }
        }
      }
      idFieldsCache.set(tableName, cached);
      return cached;
    },

    indexNames(tableName: string): Set<string> {
      let cached = indexNamesCache.get(tableName);
      if (cached) return cached;

      cached = new Set<string>();
      const indexes = getIndexes(tableName);
      for (const idx of indexes) {
        if (idx.indexDescriptor !== "by_id" && idx.indexDescriptor !== "by_creation_time") {
          cached.add(idx.indexDescriptor);
        }
      }
      indexNamesCache.set(tableName, cached);
      return cached;
    },

    indexFirstFields(tableName: string): Set<string> {
      let cached = indexFirstFieldsCache.get(tableName);
      if (cached) return cached;

      cached = new Set<string>();
      const indexes = getIndexes(tableName);
      for (const idx of indexes) {
        if (idx.fields.length > 0 && idx.indexDescriptor !== "by_id" && idx.indexDescriptor !== "by_creation_time") {
          cached.add(idx.fields[0]!);
        }
      }
      indexFirstFieldsCache.set(tableName, cached);
      return cached;
    },

    indexesPointingTo(targetTable: string, sourceTable: string): string[] {
      const cacheKey = `${targetTable}:${sourceTable}`;
      let cached = indexesPointingToCache.get(cacheKey);
      if (cached) return cached;

      const idFields = self.idFields(targetTable);
      // Find field names on targetTable that are v.id() pointing to sourceTable
      const sourceIdFields = new Set<string>();
      idFields.forEach((pointsTo, fieldName) => {
        if (pointsTo === sourceTable) sourceIdFields.add(fieldName);
      });

      cached = [];
      const indexes = getIndexes(targetTable);
      for (const idx of indexes) {
        if (idx.indexDescriptor === "by_id" || idx.indexDescriptor === "by_creation_time") continue;
        if (idx.fields.length > 0 && sourceIdFields.has(idx.fields[0]!)) {
          cached.push(idx.indexDescriptor);
        }
      }
      indexesPointingToCache.set(cacheKey, cached);
      return cached;
    },
  };

  return self;
}

function buildOneProxy(
  sourceTable: string,
  info: SchemaIntrospection,
): object {
  return new Proxy(Object.create(null), {
    get(_target, targetTable: string) {
      if (!info.tableNames.has(targetTable)) {
        throw new Error(
          `[defineRelations] ${sourceTable}.r.one.${targetTable}: table "${targetTable}" does not exist in schema`,
        );
      }

      return (opts: { by: string }): OneDescriptor => {
        const idFields = info.idFields(sourceTable);
        const field = opts.by;

        if (!idFields.has(field)) {
          throw new Error(
            `[defineRelations] ${sourceTable}.r.one.${targetTable}({ by: "${field}" }): field "${field}" is not a v.id() field on table "${sourceTable}"`,
          );
        }

        const pointsTo = idFields.get(field)!;
        if (pointsTo !== targetTable) {
          throw new Error(
            `[defineRelations] ${sourceTable}.r.one.${targetTable}({ by: "${field}" }): field "${field}" is v.id("${pointsTo}"), not v.id("${targetTable}")`,
          );
        }

        return { type: "one", targetTable, foreignKey: field };
      };
    },
  });
}

function buildManyProxy(
  sourceTable: string,
  info: SchemaIntrospection,
): object {
  return new Proxy(Object.create(null), {
    get(_target, targetTable: string) {
      if (!info.tableNames.has(targetTable)) {
        throw new Error(
          `[defineRelations] ${sourceTable}.r.many.${targetTable}: table "${targetTable}" does not exist in schema`,
        );
      }

      // Return a function: r.many.<targetTable>(opts?)
      return (opts?: {
        through?: string;
        index?: string;
        onDelete?: OnDeleteAction;
      }): ManyDescriptor | ThroughDescriptor => {
        // through path
        if (opts?.through) {
          const joinTable = opts.through;

          if (!info.tableNames.has(joinTable)) {
            throw new Error(
              `[defineRelations] ${sourceTable}.r.many.${targetTable}({ through: "${joinTable}" }): table "${joinTable}" does not exist in schema`,
            );
          }

          const joinIdFields = info.idFields(joinTable);

          // Must have a v.id() field pointing to source table
          let sourceFieldName: string | undefined;
          joinIdFields.forEach((target, field) => {
            if (target === sourceTable) sourceFieldName = field;
          });
          if (!sourceFieldName) {
            throw new Error(
              `[defineRelations] ${sourceTable}.r.many.${targetTable}({ through: "${joinTable}" }): join table "${joinTable}" has no v.id("${sourceTable}") field`,
            );
          }

          // Must have a v.id() field pointing to target table
          let targetFieldName: string | undefined;
          joinIdFields.forEach((target, field) => {
            if (target === targetTable) targetFieldName = field;
          });
          if (!targetFieldName) {
            throw new Error(
              `[defineRelations] ${sourceTable}.r.many.${targetTable}({ through: "${joinTable}" }): join table "${joinTable}" has no v.id("${targetTable}") field`,
            );
          }

          // Must have an index whose first field is the source id field
          const firstFields = info.indexFirstFields(joinTable);
          if (!firstFields.has(sourceFieldName)) {
            throw new Error(
              `[defineRelations] ${sourceTable}.r.many.${targetTable}({ through: "${joinTable}" }): join table "${joinTable}" has no index starting with "${sourceFieldName}" (needed to query by ${sourceTable})`,
            );
          }

          return { type: "through", targetTable, joinTable };
        }

        // one-to-many path
        if (opts?.index) {
          // Explicit index
          const indexName = opts.index;
          const indexes = info.indexNames(targetTable);
          if (!indexes.has(indexName)) {
            throw new Error(
              `[defineRelations] ${sourceTable}.r.many.${targetTable}({ index: "${indexName}" }): index "${indexName}" does not exist on table "${targetTable}"`,
            );
          }

          // Validate the index's first field points back to source
          const pointingIndexes = info.indexesPointingTo(targetTable, sourceTable);
          if (!pointingIndexes.includes(indexName)) {
            throw new Error(
              `[defineRelations] ${sourceTable}.r.many.${targetTable}({ index: "${indexName}" }): index "${indexName}" on table "${targetTable}" does not have a v.id("${sourceTable}") as its first field`,
            );
          }

          return {
            type: "many",
            targetTable,
            index: indexName,
            ...(opts.onDelete != null ? { onDelete: opts.onDelete } : {}),
          };
        }

        // Auto-resolve: find indexes on target whose first field is v.id(sourceTable)
        const matching = info.indexesPointingTo(targetTable, sourceTable);

        if (matching.length === 0) {
          throw new Error(
            `[defineRelations] ${sourceTable}.r.many.${targetTable}(): no index on table "${targetTable}" has a v.id("${sourceTable}") as its first field. Specify an explicit index with { index: "..." }`,
          );
        }

        if (matching.length > 1) {
          throw new Error(
            `[defineRelations] ${sourceTable}.r.many.${targetTable}(): multiple indexes on table "${targetTable}" point to "${sourceTable}": ${matching.map((n) => `"${n}"`).join(", ")}. Specify an explicit index with { index: "..." }`,
          );
        }

        return {
          type: "many",
          targetTable,
          index: matching[0]!,
          ...(opts?.onDelete != null ? { onDelete: opts.onDelete } : {}),
        };
      };
    },
  });
}

function buildRBuilder(sourceTable: string, info: SchemaIntrospection): object {
  return {
    one: buildOneProxy(sourceTable, info),
    many: buildManyProxy(sourceTable, info),
  };
}

export function defineRelations<
  Schema extends GenericSchema,
  StrictTableTypes extends boolean,
  Config extends RelationsConfig<Schema>,
>(
  schema: SchemaDefinition<Schema, StrictTableTypes>,
  config: Config,
): ResolvedRelations<Config> {
  const info = introspect(schema);
  const result: Record<string, Record<string, unknown>> = {};

  for (const [tableName, callback] of Object.entries(config)) {
    if (!info.tableNames.has(tableName)) {
      throw new Error(
        `[defineRelations] table "${tableName}" does not exist in schema`,
      );
    }
    if (typeof callback === "function") {
      result[tableName] = callback(buildRBuilder(tableName, info) as any);
    }
  }

  return result as ResolvedRelations<Config>;
}
