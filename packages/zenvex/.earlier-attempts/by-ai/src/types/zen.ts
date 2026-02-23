import type {
  GenericDataModel,
  GenericDatabaseReader,
  GenericDatabaseWriter,
  TableNamesInDataModel,
  DocumentByName,
  WithoutSystemFields,
} from "convex/server";
import type { GenericId } from "convex/values";
import type { RangeMarker } from "../range";
import type {
  FindManyOptions,
  FindFirstOptions,
  PaginateOptions,
  PaginatedResult,
} from "./queryOptions";

// ---------------------------------------------------------------------------
// Index type helpers
// ---------------------------------------------------------------------------

export type ExtractDataModel<DB> =
  DB extends GenericDatabaseReader<infer DM> ? DM : never;

/** User-defined index names (excludes system indexes). */
export type UserIndexNames<
  DM extends GenericDataModel,
  TN extends TableNamesInDataModel<DM>,
> = Exclude<keyof DM[TN]["indexes"] & string, "by_id" | "by_creation_time">;

/** Get the fields of an index as a string tuple. */
export type IndexFields<
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
// Query builder type (returned by index proxy calls)
// ---------------------------------------------------------------------------

export interface ZenQueryBuilder<
  DM extends GenericDataModel,
  TN extends TableNamesInDataModel<DM>,
> {
  findMany(
    opts: PaginateOptions<DocumentByName<DM, TN>>,
  ): Promise<PaginatedResult<DocumentByName<DM, TN>>>;
  findMany(
    opts?: FindManyOptions<DocumentByName<DM, TN>>,
  ): Promise<DocumentByName<DM, TN>[]>;
  findFirst(
    opts?: FindFirstOptions<DocumentByName<DM, TN>>,
  ): Promise<DocumentByName<DM, TN> | null>;
}

// ---------------------------------------------------------------------------
// Table types
// ---------------------------------------------------------------------------

export type PatchValue<T> = {
  [P in keyof T]?: undefined extends T[P] ? T[P] | undefined : T[P];
};

type ZenTableBase<
  DM extends GenericDataModel,
  TN extends TableNamesInDataModel<DM>,
> = {
  findMany(
    opts: PaginateOptions<DocumentByName<DM, TN>>,
  ): Promise<PaginatedResult<DocumentByName<DM, TN>>>;
  findMany(
    opts?: FindManyOptions<DocumentByName<DM, TN>>,
  ): Promise<DocumentByName<DM, TN>[]>;
  findFirst(
    opts?: FindFirstOptions<DocumentByName<DM, TN>>,
  ): Promise<DocumentByName<DM, TN> | null>;
  findByIds(ids: GenericId<TN>[]): Promise<DocumentByName<DM, TN>[]>;
};

type ZenIndexMethods<
  DM extends GenericDataModel,
  TN extends TableNamesInDataModel<DM>,
> = {
  [IX in UserIndexNames<DM, TN>]: (
    ...args: IndexArgs<DocumentByName<DM, TN>, IndexFields<DM, TN, IX>>
  ) => ZenQueryBuilder<DM, TN>;
};

type ZenTableReader<
  DM extends GenericDataModel,
  TN extends TableNamesInDataModel<DM>,
> = ZenTableBase<DM, TN> & ZenIndexMethods<DM, TN>;

type ZenTableWriter<
  DM extends GenericDataModel,
  TN extends TableNamesInDataModel<DM>,
> = ZenTableReader<DM, TN> & {
  insert(
    value: WithoutSystemFields<DocumentByName<DM, TN>>,
  ): Promise<GenericId<TN>>;
  patch(
    id: GenericId<TN>,
    value: PatchValue<WithoutSystemFields<DocumentByName<DM, TN>>>,
  ): Promise<void>;
  delete(id: GenericId<TN>): Promise<void>;
  upsert(
    existing: DocumentByName<DM, TN> | null,
    value: WithoutSystemFields<DocumentByName<DM, TN>>,
  ): Promise<GenericId<TN>>;
};

// ---------------------------------------------------------------------------
// Zen type
// ---------------------------------------------------------------------------

export type Zen<
  Ctx extends { db: GenericDatabaseReader<any> },
  _Relations = unknown,
> = {
  [TN in TableNamesInDataModel<
    ExtractDataModel<Ctx["db"]>
  >]: Ctx["db"] extends GenericDatabaseWriter<any>
    ? ZenTableWriter<ExtractDataModel<Ctx["db"]>, TN>
    : ZenTableReader<ExtractDataModel<Ctx["db"]>, TN>;
};
