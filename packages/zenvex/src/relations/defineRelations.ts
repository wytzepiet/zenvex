import type {
  GenericSchema,
  SchemaDefinition,
  TableDefinition,
} from "convex/server";
import type { GenericId, VId, VObject } from "convex/values";
import { introspect, type SchemaIntrospection } from "./introspect.js";
import type {
  ManyDescriptor,
  OnDeleteAction,
  OneDescriptor,
  RelationDescriptor,
  ThroughDescriptor,
} from "./types.js";
import { makeGetProxy } from "../utils/makeGetProxy.js";

/** Symbol key for embedding the schema reference on defineRelations output. */
export const ZEN_SCHEMA: unique symbol = Symbol("zenvex.schema");

// ---------------------------------------------------------------------------
// Type-level schema extraction
// ---------------------------------------------------------------------------

type ExtractFields<T> =
  T extends TableDefinition<infer V, any, any, any>
    ? V extends VObject<any, infer Fields, any, any>
      ? Fields
      : never
    : never;

type ExtractIndexes<T> =
  T extends TableDefinition<any, infer I, any, any> ? I : never;

// ---------------------------------------------------------------------------
// Type-level helpers
// ---------------------------------------------------------------------------

/** Field names on SourceTable that are v.id(TargetTable) — required or optional. */
type IdFieldsFor<
  Schema,
  SourceTable extends keyof Schema & string,
  TargetTable extends string,
> = {
  [K in keyof ExtractFields<Schema[SourceTable]> & string]:
    ExtractFields<Schema[SourceTable]>[K] extends VId<infer IdType, any>
      ? GenericId<TargetTable> extends IdType ? K : never
      : never;
}[keyof ExtractFields<Schema[SourceTable]> & string];

/** User-defined index names for a table. */
type UserIndexes<Schema, TN extends keyof Schema & string> = Exclude<
  keyof ExtractIndexes<Schema[TN]> & string,
  "by_id" | "by_creation_time"
>;

/** Index names on TargetTable whose first field is v.id(SourceTable). */
type IndexesPointingTo<
  Schema,
  TargetTable extends keyof Schema & string,
  SourceTable extends string,
> = {
  [IX in UserIndexes<Schema, TargetTable>]:
    ExtractIndexes<Schema[TargetTable]>[IX] extends [infer First, ...unknown[]]
      ? First extends IdFieldsFor<Schema, TargetTable, SourceTable>
        ? IX
        : never
      : never;
}[UserIndexes<Schema, TargetTable>];

/** True when T is a union of two or more members. */
type IsUnion<T, Copy = T> = [T] extends [never]
  ? false
  : T extends unknown
    ? [Copy] extends [T] ? false : true
    : never;

type CanAutoResolve<
  Schema,
  SourceTable extends keyof Schema & string,
  TargetTable extends keyof Schema & string,
> = [IndexesPointingTo<Schema, TargetTable, SourceTable>] extends [never]
  ? false
  : true extends IsUnion<IndexesPointingTo<Schema, TargetTable, SourceTable>>
    ? false
    : true;

// ---------------------------------------------------------------------------
// r.one proxy type
// ---------------------------------------------------------------------------

type ROneProxy<Schema, SourceTable extends keyof Schema & string> = {
  [TT in keyof Schema & string]: (
    foreignKey: IdFieldsFor<Schema, SourceTable, TT>,
  ) => OneDescriptor<TT, IdFieldsFor<Schema, SourceTable, TT>>;
};

// ---------------------------------------------------------------------------
// r.many proxy type
// ---------------------------------------------------------------------------

type ManyThroughOpts = {
  through: string;
  index?: string;
  onDelete?: OnDeleteAction;
};

type RManyFn<
  Schema,
  SourceTable extends keyof Schema & string,
  TargetTable extends keyof Schema & string,
> = {
  (opts: ManyThroughOpts): ThroughDescriptor<TargetTable, string>;
} & (
  true extends CanAutoResolve<Schema, SourceTable, TargetTable>
    ? {
        (opts?: { index?: IndexesPointingTo<Schema, TargetTable, SourceTable>; onDelete?: OnDeleteAction }): ManyDescriptor<TargetTable>;
        (): ManyDescriptor<TargetTable>;
      }
    : {
        (opts: { index: IndexesPointingTo<Schema, TargetTable, SourceTable>; onDelete?: OnDeleteAction }): ManyDescriptor<TargetTable>;
      }
);

type RManyProxy<Schema, SourceTable extends keyof Schema & string> = {
  [TT in keyof Schema & string]: RManyFn<Schema, SourceTable, TT>;
};

// ---------------------------------------------------------------------------
// RBuilder — the full r object passed to each table's callback
// ---------------------------------------------------------------------------

type RBuilder<Schema, SourceTable extends keyof Schema & string> = {
  one: ROneProxy<Schema, SourceTable>;
  many: RManyProxy<Schema, SourceTable>;
};

// ---------------------------------------------------------------------------
// Config and return types
// ---------------------------------------------------------------------------

type RelationsConfig<Schema> = {
  [TN in keyof Schema & string]?: (
    r: RBuilder<Schema, TN>,
  ) => Record<string, RelationDescriptor>;
};

type ResolvedRelations<Config> = {
  [K in keyof Config]: Config[K] extends (...args: any[]) => infer R ? R : never;
};

// ---------------------------------------------------------------------------
// Runtime: build r.one proxy (resolves at call time)
// ---------------------------------------------------------------------------

function buildOneProxy(
  sourceTable: string,
  info: SchemaIntrospection,
): Record<string, (fk: string) => OneDescriptor> {
  return makeGetProxy<Record<string, (fk: string) => OneDescriptor>>((targetTable) => {
    return (foreignKey: string): OneDescriptor => {
      const idFields = info.idFields(sourceTable);
      const field = idFields.get(foreignKey);
      if (!field) {
        throw new Error(
          `[defineRelations] ${sourceTable}.${foreignKey}: field not found or is not a v.id() field`,
        );
      }
      if (field.tableName !== targetTable) {
        throw new Error(
          `[defineRelations] ${sourceTable}.${foreignKey}: field points to "${field.tableName}", not "${targetTable}"`,
        );
      }
      return {
        type: "one",
        targetTable,
        foreignKey,
        optional: field.optional,
      };
    };
  });
}

// ---------------------------------------------------------------------------
// Runtime: build r.many proxy (resolves at call time)
// ---------------------------------------------------------------------------

function buildManyProxy(
  sourceTable: string,
  info: SchemaIntrospection,
): Record<string, (opts?: Record<string, unknown>) => ManyDescriptor | ThroughDescriptor> {
  return makeGetProxy<Record<string, (opts?: Record<string, unknown>) => ManyDescriptor | ThroughDescriptor>>((targetTable) => {
    return (opts?: Record<string, unknown>): ManyDescriptor | ThroughDescriptor => {
      if (opts?.through) {
        return resolveThrough(info, sourceTable, targetTable, opts);
      }
      return resolveDirect(info, sourceTable, targetTable, opts);
    };
  });
}

function resolveDirect(
  info: SchemaIntrospection,
  sourceTable: string,
  targetTable: string,
  opts?: Record<string, unknown>,
): ManyDescriptor {
  const explicitIndex = opts?.index as string | undefined;
  const onDelete = opts?.onDelete as OnDeleteAction | undefined;

  if (explicitIndex) {
    const fk = info.indexFirstField(targetTable, explicitIndex);
    if (!fk) {
      throw new Error(
        `[defineRelations] ${sourceTable} → many.${targetTable}({ index: "${explicitIndex}" }): index not found on table "${targetTable}"`,
      );
    }
    return {
      type: "many",
      targetTable,
      index: explicitIndex,
      foreignKey: fk,
      ...(onDelete != null ? { onDelete } : {}),
    };
  }

  // Auto-resolve
  const matching = info.indexesPointingTo(targetTable, sourceTable);
  if (matching.length === 0) {
    throw new Error(
      `[defineRelations] ${sourceTable} → many.${targetTable}(): no index on "${targetTable}" has a v.id("${sourceTable}") as its first field. Use { index: "..." }`,
    );
  }
  if (matching.length > 1) {
    throw new Error(
      `[defineRelations] ${sourceTable} → many.${targetTable}(): multiple indexes on "${targetTable}" point to "${sourceTable}": ${matching.map((n) => `"${n}"`).join(", ")}. Use { index: "..." }`,
    );
  }
  const index = matching[0]!;
  const foreignKey = info.indexFirstField(targetTable, index)!;
  return {
    type: "many",
    targetTable,
    index,
    foreignKey,
    ...(onDelete != null ? { onDelete } : {}),
  };
}

function resolveThrough(
  info: SchemaIntrospection,
  sourceTable: string,
  targetTable: string,
  opts: Record<string, unknown>,
): ThroughDescriptor {
  const joinTable = opts.through as string;
  const explicitIndex = opts.index as string | undefined;
  const onDelete = opts.onDelete as OnDeleteAction | undefined;
  const joinIdFields = info.idFields(joinTable);

  // Same-table through — explicit index disambiguates source vs target
  if (sourceTable === targetTable) {
    if (!explicitIndex) {
      throw new Error(
        `[defineRelations] ${sourceTable} → many.${targetTable}({ through: "${joinTable}" }): same-table through requires { index: "..." } to disambiguate source vs target field`,
      );
    }
    const sourceField = info.indexFirstField(joinTable, explicitIndex);
    if (!sourceField) {
      throw new Error(
        `[defineRelations] ${sourceTable} → many.${targetTable}({ through: "${joinTable}", index: "${explicitIndex}" }): index not found on join table`,
      );
    }
    const targetField = [...joinIdFields.entries()].find(
      ([field, fieldInfo]) => fieldInfo.tableName === targetTable && field !== sourceField,
    )?.[0];
    if (!targetField) {
      throw new Error(
        `[defineRelations] ${sourceTable} → many.${targetTable}({ through: "${joinTable}" }): could not find second v.id("${targetTable}") field on join table`,
      );
    }
    return {
      type: "through",
      targetTable,
      joinTable,
      sourceField,
      targetField,
      index: explicitIndex,
      ...(onDelete != null ? { onDelete } : {}),
    };
  }

  // Different-table through — auto-resolve source/target fields
  const entries = [...joinIdFields.entries()];
  const sourceField = entries.find(([, info]) => info.tableName === sourceTable)?.[0];
  const targetField = entries.find(([, info]) => info.tableName === targetTable)?.[0];
  if (!sourceField) {
    throw new Error(
      `[defineRelations] ${sourceTable} → many.${targetTable}({ through: "${joinTable}" }): join table has no v.id("${sourceTable}") field`,
    );
  }
  if (!targetField) {
    throw new Error(
      `[defineRelations] ${sourceTable} → many.${targetTable}({ through: "${joinTable}" }): join table has no v.id("${targetTable}") field`,
    );
  }
  const index = explicitIndex ?? info.indexByFirstField(joinTable, sourceField);
  if (!index) {
    throw new Error(
      `[defineRelations] ${sourceTable} → many.${targetTable}({ through: "${joinTable}" }): no index on join table starts with "${sourceField}"`,
    );
  }
  return {
    type: "through",
    targetTable,
    joinTable,
    sourceField,
    targetField,
    index,
    ...(onDelete != null ? { onDelete } : {}),
  };
}

// ---------------------------------------------------------------------------
// defineRelations
// ---------------------------------------------------------------------------

export function defineRelations<
  Schema extends GenericSchema,
  StrictTableTypes extends boolean,
  Config extends RelationsConfig<Schema>,
>(
  schema: SchemaDefinition<Schema, StrictTableTypes>,
  config: Config,
): ResolvedRelations<Config> & { readonly [ZEN_SCHEMA]: SchemaDefinition<Schema, StrictTableTypes> } {
  const tables = schema.tables as Record<string, unknown>;
  const info = introspect(tables as Parameters<typeof introspect>[0]);

  // CAST Kind 1 — Proxy erases mapped types at the value level. The runtime proxy
  // intercepts all property access and returns correctly-typed descriptors.
  // The RBuilder<Schema, TN> type is enforced by the Config constraint.
  // Tested: tests/relations/defineRelations.test.ts
  const result = Object.fromEntries(
    Object.entries(config)
      .filter((entry): entry is [string, Function] => typeof entry[1] === "function")
      .map(([tableName, callback]) => {
        const r = {
          one: buildOneProxy(tableName, info),
          many: buildManyProxy(tableName, info),
        } as unknown as RBuilder<Schema, keyof Schema & string>;
        return [tableName, callback(r) as Record<string, RelationDescriptor>];
      }),
  );

  // Embed schema reference for createZen to read
  (result as any)[ZEN_SCHEMA] = schema;

  // CAST Kind 1 — result is Record<string, ...> but return type preserves exact callback shapes.
  // Now intersected with { [ZEN_SCHEMA]: SchemaDefinition }.
  // Tested: tests/relations/defineRelations.test.ts
  return result as ResolvedRelations<Config> & { readonly [ZEN_SCHEMA]: SchemaDefinition<Schema, StrictTableTypes> };
}
