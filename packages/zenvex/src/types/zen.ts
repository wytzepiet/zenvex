// ---------------------------------------------------------------------------
// Zen type definitions — type-safe query layer over Convex
// ---------------------------------------------------------------------------

import type {
  GenericDataModel,
  GenericDatabaseReader,
  GenericDatabaseWriter,
  GenericSchema,
  SchemaDefinition,
  TableNamesInDataModel,
  DataModelFromSchemaDefinition,
  DocumentByName,
  NamedIndex,
  PaginationResult,
  WithoutSystemFields,
} from "convex/server";
import type { GenericId } from "convex/values";
import type { RangeMarker } from "../query/range.js";
import type {
  FindManyOptions,
  FindFirstOptions,
  FindOptions,
} from "./queryOptions.js";
import type { WithSpec, WithResult } from "./withTypes.js";
import type { ZEN_SCHEMA } from "../relations/defineRelations.js";

// ---------------------------------------------------------------------------
// Schema extraction from relations
// ---------------------------------------------------------------------------

/** Extract the SchemaDefinition embedded in a relations object via ZEN_SCHEMA. */
export type SchemaFromRelations<R> =
  R extends { readonly [K in typeof ZEN_SCHEMA]: infer S } ? S : never;

// ---------------------------------------------------------------------------
// DataModel extraction
// ---------------------------------------------------------------------------

type ExtractDataModel<DB> =
  DB extends GenericDatabaseReader<infer DM> ? DM : never;

type DMFromSchema<S> =
  S extends SchemaDefinition<infer Schema, infer Strict extends boolean>
    ? DataModelFromSchemaDefinition<SchemaDefinition<Schema, Strict>>
    : never;

// ---------------------------------------------------------------------------
// Index type helpers
// ---------------------------------------------------------------------------

/** User-defined index names (excludes system indexes). */
type UserIndexNames<
  DM extends GenericDataModel,
  TN extends TableNamesInDataModel<DM>,
> = Exclude<keyof DM[TN]["indexes"] & string, "by_id" | "by_creation_time">;

/** Get the fields of an index as a string tuple. */
type IndexFields<
  DM extends GenericDataModel,
  TN extends TableNamesInDataModel<DM>,
  IX extends string,
> = IX extends keyof DM[TN]["indexes"]
  ? DM[TN]["indexes"][IX] extends string[]
    ? DM[TN]["indexes"][IX]
    : []
  : [];

/** Safely look up a field type from a document. */
type FieldType<Doc, F extends string> = F extends keyof Doc ? Doc[F] : never;

// ---------------------------------------------------------------------------
// IndexArgs — positional arg tuple for index queries
// ---------------------------------------------------------------------------

/**
 * Build the union of valid arg prefix tuples for an index.
 *
 * For fields [A, B, C] produces:
 *   [] | [A | RM<A>] | [A, B | RM<B>] | [A, B, C | RM<C>]
 */
export type IndexArgs<Doc, Fields extends string[]> =
  | [] // no args — index used for ordering only
  | _BuildArgPrefixes<Doc, Fields>;

type _BuildArgPrefixes<Doc, Fields extends string[]> =
  Fields extends [infer F extends string, ...infer Rest extends string[]]
    ?
        | [FieldType<Doc, F> | RangeMarker<FieldType<Doc, F>>]
        | (Rest extends [string, ...string[]]
            ? [FieldType<Doc, F>, ..._BuildArgPrefixes<Doc, Rest>]
            : never)
    : never;

// ---------------------------------------------------------------------------
// Shared type helpers
// ---------------------------------------------------------------------------

/** Doc with resolved WithResult merged in. */
type DocW<
  DM extends GenericDataModel,
  TN extends TableNamesInDataModel<DM>,
  Relations,
  W,
> = DocumentByName<DM, TN> & WithResult<DM, Relations, TN & string, W>;

/**
 * Conditional return type for findMany:
 * - cursor present (string | null) → PaginationResult
 * - cursor absent (undefined) → array
 */
type FindManyResult<
  Doc,
  C extends string | null | undefined,
> = undefined extends C ? Doc[] : PaginationResult<Doc>;

// ---------------------------------------------------------------------------
// Overload strategy (applies to ZenQueryBuilder, ZenTable, and all methods)
//
// Each method has two overloads split by `with` presence:
//   1. with: W (required) — W has NO default, so TS fully infers it from the
//      call site and uses the WithSpec constraint for contextual typing of
//      nested `add` callbacks.
//   2. without with — no W generic, return type is plain DocumentByName.
//
// Why not a single signature with `W = {}`?  A default on W causes TS to
// short-circuit inference for deeply nested callback parameters — the nested
// `add` inside `with` gets `any` instead of the typed document.  Removing
// the default fixes contextual typing but then callers without `with` would
// get W = the full constraint type (all relations in the return type).
// Overloads solve both: no default when `with` is present, no W at all
// when it's absent.
// ---------------------------------------------------------------------------

export interface ZenQueryBuilder<
  DM extends GenericDataModel,
  TN extends TableNamesInDataModel<DM>,
  Relations = unknown,
> {
  // findMany: with
  findMany<
    W extends WithSpec<DM, Relations, TN & string>,
    A extends Record<string, unknown> = {},
    C extends string | null | undefined = undefined,
  >(
    opts: FindManyOptions<DocumentByName<DM, TN>> & {
      with: W;
      add?: (doc: NoInfer<DocW<DM, TN, Relations, W>>) => A;
      cursor?: C;
    },
  ): Promise<FindManyResult<DocW<DM, TN, Relations, W> & A, C>>;
  // findMany: no with
  findMany<
    A extends Record<string, unknown> = {},
    C extends string | null | undefined = undefined,
  >(
    opts?: FindManyOptions<DocumentByName<DM, TN>> & {
      add?: (doc: NoInfer<DocumentByName<DM, TN>>) => A;
      cursor?: C;
    },
  ): Promise<FindManyResult<DocumentByName<DM, TN> & A, C>>;

  // findFirst: with
  findFirst<
    W extends WithSpec<DM, Relations, TN & string>,
    A extends Record<string, unknown> = {},
  >(
    opts: FindFirstOptions<DocumentByName<DM, TN>> & {
      with: W;
      add?: (doc: NoInfer<DocW<DM, TN, Relations, W>>) => A;
    },
  ): Promise<(DocW<DM, TN, Relations, W> & A) | null>;
  // findFirst: no with
  findFirst<
    A extends Record<string, unknown> = {},
  >(
    opts?: FindFirstOptions<DocumentByName<DM, TN>> & {
      add?: (doc: NoInfer<DocumentByName<DM, TN>>) => A;
    },
  ): Promise<(DocumentByName<DM, TN> & A) | null>;
}

// ---------------------------------------------------------------------------
// Table type — same overload strategy as ZenQueryBuilder (see comment above).
// ---------------------------------------------------------------------------

type ZenIndexMethods<
  DM extends GenericDataModel,
  TN extends TableNamesInDataModel<DM>,
  Relations,
> = {
  [IX in UserIndexNames<DM, TN>]: (
    ...args: IndexArgs<DocumentByName<DM, TN>, IndexFields<DM, TN, IX>>
  ) => ZenQueryBuilder<DM, TN, Relations>;
};

type ZenTable<
  DM extends GenericDataModel,
  TN extends TableNamesInDataModel<DM>,
  Relations = unknown,
> = {
  // find: with
  find<
    W extends WithSpec<DM, Relations, TN & string>,
    A extends Record<string, unknown> = {},
  >(
    id: GenericId<TN>,
    opts: FindOptions<DocumentByName<DM, TN>> & {
      with: W;
      add?: (doc: NoInfer<DocW<DM, TN, Relations, W>>) => A;
    },
  ): Promise<(DocW<DM, TN, Relations, W> & A) | null>;
  // find: no with
  find<
    A extends Record<string, unknown> = {},
  >(
    id: GenericId<TN>,
    opts?: FindOptions<DocumentByName<DM, TN>> & {
      add?: (doc: NoInfer<DocumentByName<DM, TN>>) => A;
    },
  ): Promise<(DocumentByName<DM, TN> & A) | null>;

  // findMany: with
  findMany<
    W extends WithSpec<DM, Relations, TN & string>,
    A extends Record<string, unknown> = {},
    C extends string | null | undefined = undefined,
  >(
    opts: FindManyOptions<DocumentByName<DM, TN>> & {
      with: W;
      add?: (doc: NoInfer<DocW<DM, TN, Relations, W>>) => A;
      cursor?: C;
    },
  ): Promise<FindManyResult<DocW<DM, TN, Relations, W> & A, C>>;
  // findMany: no with
  findMany<
    A extends Record<string, unknown> = {},
    C extends string | null | undefined = undefined,
  >(
    opts?: FindManyOptions<DocumentByName<DM, TN>> & {
      add?: (doc: NoInfer<DocumentByName<DM, TN>>) => A;
      cursor?: C;
    },
  ): Promise<FindManyResult<DocumentByName<DM, TN> & A, C>>;

  // findFirst: with
  findFirst<
    W extends WithSpec<DM, Relations, TN & string>,
    A extends Record<string, unknown> = {},
  >(
    opts: FindFirstOptions<DocumentByName<DM, TN>> & {
      with: W;
      add?: (doc: NoInfer<DocW<DM, TN, Relations, W>>) => A;
    },
  ): Promise<(DocW<DM, TN, Relations, W> & A) | null>;
  // findFirst: no with
  findFirst<
    A extends Record<string, unknown> = {},
  >(
    opts?: FindFirstOptions<DocumentByName<DM, TN>> & {
      add?: (doc: NoInfer<DocumentByName<DM, TN>>) => A;
    },
  ): Promise<(DocumentByName<DM, TN> & A) | null>;
} & ZenIndexMethods<DM, TN, Relations>;

// ---------------------------------------------------------------------------
// Write methods — only available when ctx.db is a GenericDatabaseWriter
// ---------------------------------------------------------------------------

type ZenTableWriter<
  DM extends GenericDataModel,
  TN extends TableNamesInDataModel<DM>,
> = {
  insert(
    doc: WithoutSystemFields<DocumentByName<DM, TN>>,
  ): Promise<GenericId<TN>>;
  patch(
    id: GenericId<TN>,
    fields: Partial<WithoutSystemFields<DocumentByName<DM, TN>>>,
  ): Promise<void>;
  upsert(
    existing: DocumentByName<DM, TN> | null,
    doc: WithoutSystemFields<DocumentByName<DM, TN>>,
  ): Promise<GenericId<TN>>;
  delete(id: GenericId<TN>): Promise<void>;
};

// ---------------------------------------------------------------------------
// Zen — top-level mapped type
// ---------------------------------------------------------------------------

export type Zen<
  Ctx extends { db: GenericDatabaseReader<any> },
  Relations = unknown,
  Schema extends SchemaDefinition<any, any> = SchemaFromRelations<Relations> extends SchemaDefinition<any, any>
    ? SchemaFromRelations<Relations>
    : SchemaDefinition<any, any>,
> = {
  [TN in TableNamesInDataModel<DMFromSchema<Schema>>]: ZenTable<
    DMFromSchema<Schema>,
    TN,
    Relations
  > &
    (Ctx["db"] extends { insert: any; patch: any }
      ? ZenTableWriter<DMFromSchema<Schema>, TN>
      : {});
};
