import type { GenericSchema, SchemaDefinition } from "convex/server";
import type {
  RelationsConfig,
  ResolvedRelations,
  OneDescriptor,
  ManyDescriptor,
  ThroughDescriptor,
  OnDeleteAction,
} from "../types/relations";
import { proxyRecord } from "../utils/proxyRecord";
import {
  resolveManyAutoIndex,
  resolveThroughFields,
  resolveSameTableThrough,
} from "./resolve";

export const ZEN_SCHEMA: unique symbol = Symbol("zenvex.schema");

// ---------------------------------------------------------------------------
// Structural types for schema introspection
// ---------------------------------------------------------------------------

interface IdFieldInfo {
  tableName: string;
  optional: boolean;
}

interface ValidatorField {
  kind: string;
  tableName?: string;
  isOptional?: string;
}

interface IndexEntry {
  indexDescriptor: string;
  fields: string[];
}

interface IntrospectableTable {
  validator?: { fields?: Record<string, ValidatorField> };
  [" indexes"]?: () => IndexEntry[];
}

// ---------------------------------------------------------------------------
// Schema introspection
// ---------------------------------------------------------------------------

/** Filter out Convex system indexes. */
function isUserIndex(idx: IndexEntry): boolean {
  return idx.indexDescriptor !== "by_id" && idx.indexDescriptor !== "by_creation_time";
}

export interface SchemaIntrospection {
  idFields: (tableName: string) => Map<string, IdFieldInfo>;
  indexes: (tableName: string) => IndexEntry[];
  indexesPointingTo: (targetTable: string, sourceTable: string) => string[];
  indexFirstField: (tableName: string, indexName: string) => string | undefined;
  indexByFirstField: (tableName: string, fieldName: string) => string | undefined;
}

function introspect(
  tables: Record<string, IntrospectableTable>,
): SchemaIntrospection {
  return {
    idFields(tableName: string): Map<string, IdFieldInfo> {
      const result = new Map<string, IdFieldInfo>();
      const fields = tables[tableName]?.validator?.fields;
      if (!fields) return result;
      for (const [fieldName, validator] of Object.entries(fields)) {
        if (validator && validator.kind === "id" && typeof validator.tableName === "string") {
          result.set(fieldName, {
            tableName: validator.tableName,
            optional: validator.isOptional === "optional",
          });
        }
      }
      return result;
    },

    indexes(tableName: string): IndexEntry[] {
      const tableDef = tables[tableName];
      if (tableDef && typeof tableDef[" indexes"] === "function") {
        return tableDef[" indexes"]().filter(isUserIndex);
      }
      return [];
    },

    indexesPointingTo(targetTable: string, sourceTable: string): string[] {
      const idFields = this.idFields(targetTable);
      const sourceIdFields = new Set<string>();
      idFields.forEach((info, fieldName) => {
        if (info.tableName === sourceTable) sourceIdFields.add(fieldName);
      });

      const result: string[] = [];
      for (const idx of this.indexes(targetTable)) {
        if (idx.fields.length > 0 && sourceIdFields.has(idx.fields[0]!)) {
          result.push(idx.indexDescriptor);
        }
      }
      return result;
    },

    indexFirstField(tableName: string, indexName: string): string | undefined {
      for (const idx of this.indexes(tableName)) {
        if (idx.indexDescriptor === indexName && idx.fields.length > 0) {
          return idx.fields[0];
        }
      }
      return undefined;
    },

    indexByFirstField(tableName: string, fieldName: string): string | undefined {
      for (const idx of this.indexes(tableName)) {
        if (idx.fields.length > 0 && idx.fields[0] === fieldName) {
          return idx.indexDescriptor;
        }
      }
      return undefined;
    },
  };
}

// ---------------------------------------------------------------------------
// Relation builder
// ---------------------------------------------------------------------------

function buildOneProxy(sourceTable: string, info: SchemaIntrospection) {
  return proxyRecord((targetTable: string, opts: { by: string }): OneDescriptor => {
    const optional = info.idFields(sourceTable).get(opts.by)!.optional;
    return { type: "one", targetTable, foreignKey: opts.by, optional };
  });
}

function buildManyProxy(sourceTable: string, info: SchemaIntrospection) {
  return proxyRecord((targetTable: string, opts?: {
    through?: string;
    sourceIndex?: string;
    targetIndex?: string;
    index?: string;
    onDelete?: OnDeleteAction;
  }): ManyDescriptor | ThroughDescriptor => {
    if (opts?.through) {
      const joinTable = opts.through;

      if (sourceTable === targetTable) {
        resolveSameTableThrough(
          sourceTable, targetTable, joinTable,
          opts.sourceIndex, opts.targetIndex,
        );
        return {
          type: "through",
          targetTable,
          joinTable,
          sourceField: info.indexFirstField(joinTable, opts.sourceIndex!)!,
          targetField: info.indexFirstField(joinTable, opts.targetIndex!)!,
          index: opts.sourceIndex!,
        };
      }

      const resolved = resolveThroughFields(info, sourceTable, targetTable, joinTable);
      return { type: "through", targetTable, joinTable, ...resolved };
    }

    if (opts?.index) {
      return {
        type: "many",
        targetTable,
        index: opts.index,
        foreignKey: info.indexFirstField(targetTable, opts.index)!,
        ...(opts.onDelete != null ? { onDelete: opts.onDelete } : {}),
      };
    }

    const resolved = resolveManyAutoIndex(info, sourceTable, targetTable);
    return {
      type: "many",
      targetTable,
      ...resolved,
      ...(opts?.onDelete != null ? { onDelete: opts.onDelete } : {}),
    };
  });
}

// ---------------------------------------------------------------------------
// defineRelations
// ---------------------------------------------------------------------------

type WithZenSchema = Record<string, Record<string, unknown>> & { [ZEN_SCHEMA]?: unknown };

/**
 * Define relations between tables in your schema.
 * Returns a relations object to pass to `createZen`.
 */
export function defineRelations<
  Schema extends GenericSchema,
  StrictTableTypes extends boolean,
  Config extends RelationsConfig<Schema>,
>(
  schema: SchemaDefinition<Schema, StrictTableTypes>,
  config: Config,
): ResolvedRelations<Config> {
  const tables = schema.tables as Record<string, IntrospectableTable>;
  const info = introspect(tables);
  const result: WithZenSchema = {};

  for (const tableName of Object.keys(config)) {
    const callback = config[tableName as keyof Config] as
      ((r: { one: ReturnType<typeof buildOneProxy>; many: ReturnType<typeof buildManyProxy> }) =>
        Record<string, unknown>) | undefined;
    if (callback) {
      result[tableName] = callback({
        one: buildOneProxy(tableName, info),
        many: buildManyProxy(tableName, info),
      });
    }
  }

  result[ZEN_SCHEMA] = schema;
  return result as ResolvedRelations<Config>;
}
