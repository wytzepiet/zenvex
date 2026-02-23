import type { GenericId, VId, VObject } from "convex/values";
import type { TableDefinition } from "convex/server";

// ---------------------------------------------------------------------------
// Descriptor types (the output shapes from defineRelations)
// ---------------------------------------------------------------------------

export type OnDeleteAction = "cascade" | "setNull" | "restrict";

export interface OneDescriptor<
  TargetTable extends string = string,
  ForeignKey extends string = string,
> {
  readonly type: "one";
  readonly targetTable: TargetTable;
  readonly foreignKey: ForeignKey;
}

export interface ManyDescriptor<
  TargetTable extends string = string,
  IndexName extends string = string,
> {
  readonly type: "many";
  readonly targetTable: TargetTable;
  readonly index: IndexName;
  readonly onDelete?: OnDeleteAction;
}

export interface ThroughDescriptor<
  TargetTable extends string = string,
  JoinTable extends string = string,
> {
  readonly type: "through";
  readonly targetTable: TargetTable;
  readonly joinTable: JoinTable;
}

export type RelationDescriptor =
  | OneDescriptor
  | ManyDescriptor
  | ThroughDescriptor;

// ---------------------------------------------------------------------------
// Schema extraction utilities
// ---------------------------------------------------------------------------

/** Extract the Fields record from a TableDefinition (the validator's fields map). */
type ExtractTableFields<T> =
  T extends TableDefinition<infer V, any, any, any>
    ? V extends VObject<any, infer Fields, any, any>
      ? Fields
      : never
    : never;

/** Extract the Indexes record from a TableDefinition. */
type ExtractTableIndexes<T> =
  T extends TableDefinition<any, infer I, any, any> ? I : never;

/**
 * Find field names on SourceTable that are v.id() pointing to TargetTable.
 * Only matches required (non-optional) VId fields.
 */
type IdFieldsPointingTo<Fields, TargetTable extends string> = {
  [K in keyof Fields & string]: Fields[K] extends VId<
    GenericId<TargetTable>,
    "required"
  >
    ? K
    : never;
}[keyof Fields & string];

/** Get the user-defined index names for a table (excluding system indexes). */
type IndexNamesOf<Schema, TN extends keyof Schema & string> = Exclude<
  keyof ExtractTableIndexes<Schema[TN]> & string,
  "by_id" | "by_creation_time"
>;

/** Get the first field name from any index on a table. */
type FirstFieldOfAnyIndex<Indexes> = {
  [K in keyof Indexes]: Indexes[K] extends [infer First, ...any[]]
    ? First
    : never;
}[keyof Indexes];

/**
 * Filter to table names that are valid join tables between SourceTable and TargetTable.
 * A valid join table must have:
 * 1. A v.id() field pointing to SourceTable
 * 2. A v.id() field pointing to TargetTable
 * 3. An index whose first field is the source v.id() field (for querying by source)
 */
type ValidJoinTable<
  Schema,
  SourceTable extends string,
  TargetTable extends string,
> = {
  [JT in keyof Schema & string]: [ // Must have a v.id() field pointing to source
    IdFieldsPointingTo<ExtractTableFields<Schema[JT]>, SourceTable>,
  ] extends [never]
    ? never
    : // Must have a v.id() field pointing to target
      [
          IdFieldsPointingTo<ExtractTableFields<Schema[JT]>, TargetTable>,
        ] extends [never]
      ? never
      : // Must have an index whose first field is a source id field
        [
            FirstFieldOfAnyIndex<ExtractTableIndexes<Schema[JT]>> &
              IdFieldsPointingTo<ExtractTableFields<Schema[JT]>, SourceTable>,
          ] extends [never]
        ? never
        : JT;
}[keyof Schema & string];

/** Index names on TargetTable whose first field is a v.id() pointing to SourceTable. */
type IndexesPointingTo<
  Schema,
  TargetTable extends keyof Schema & string,
  SourceTable extends string,
> = {
  [IX in IndexNamesOf<Schema, TargetTable>]: ExtractTableIndexes<
    Schema[TargetTable]
  >[IX] extends [infer FirstField, ...any[]]
    ? FirstField extends IdFieldsPointingTo<
        ExtractTableFields<Schema[TargetTable]>,
        SourceTable
      >
      ? IX
      : never
    : never;
}[IndexNamesOf<Schema, TargetTable>];

// ---------------------------------------------------------------------------
// r builder types (what the user interacts with)
// ---------------------------------------------------------------------------

/** r.one.<TargetTable>({ by: <valid v.id() field> }) */
type ROneProxy<Schema, SourceTable extends keyof Schema & string> = {
  [TT in keyof Schema & string]: <
    FK extends IdFieldsPointingTo<ExtractTableFields<Schema[SourceTable]>, TT>,
  >(opts: {
    by: FK;
  }) => OneDescriptor<TT, FK>;
};

/** r.many.<TargetTable>(opts?) — function call with options union */
type RManyProxy<Schema, SourceTable extends keyof Schema & string> = {
  [TT in keyof Schema & string]: RManyFn<Schema, SourceTable, TT>;
};

/** True when T is a union of two or more members. */
type IsUnion<T, Copy = T> = [T] extends [never]
  ? false
  : T extends any
    ? [Copy] extends [T]
      ? false
      : true
    : never;

/** True when exactly one index on TargetTable points back to SourceTable (auto-resolvable). */
type CanAutoResolve<
  Schema,
  SourceTable extends keyof Schema & string,
  TargetTable extends keyof Schema & string,
> = [IndexesPointingTo<Schema, TargetTable, SourceTable>] extends [never]
  ? false
  : true extends IsUnion<IndexesPointingTo<Schema, TargetTable, SourceTable>>
    ? false
    : true;

/** One-to-many call signature — `index` optional when auto-resolvable, required otherwise. */
type ManyCallSignature<
  Schema,
  SourceTable extends keyof Schema & string,
  TargetTable extends keyof Schema & string,
> =
  true extends CanAutoResolve<Schema, SourceTable, TargetTable>
    ? {
        (opts?: {
          index?: IndexesPointingTo<Schema, TargetTable, SourceTable>;
          onDelete?: OnDeleteAction;
        }): ManyDescriptor<TargetTable, string>;
      }
    : {
        (opts: {
          index: IndexesPointingTo<Schema, TargetTable, SourceTable>;
          onDelete?: OnDeleteAction;
        }): ManyDescriptor<TargetTable, string>;
      };

/** Overloaded function type for r.many.<TargetTable>(...) */
type RManyFn<
  Schema,
  SourceTable extends keyof Schema & string,
  TargetTable extends keyof Schema & string,
> = {
  (opts: {
    through: ValidJoinTable<Schema, SourceTable, TargetTable>;
  }): ThroughDescriptor<
    TargetTable,
    ValidJoinTable<Schema, SourceTable, TargetTable> & string
  >;
} & ManyCallSignature<Schema, SourceTable, TargetTable>;

/** The full r builder passed to each table's callback. */
export type RBuilder<Schema, SourceTable extends keyof Schema & string> = {
  one: ROneProxy<Schema, SourceTable>;
  many: RManyProxy<Schema, SourceTable>;
};

// ---------------------------------------------------------------------------
// Config and return types
// ---------------------------------------------------------------------------

export type RelationsConfig<Schema> = {
  [TN in keyof Schema & string]?: (
    r: RBuilder<Schema, TN>,
  ) => Record<string, RelationDescriptor>;
};

export type ResolvedRelations<Config> = {
  [K in keyof Config]: Config[K] extends (r: any) => infer R ? R : never;
};
