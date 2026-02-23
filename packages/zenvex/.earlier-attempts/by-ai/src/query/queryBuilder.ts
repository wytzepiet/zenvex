import type {
  GenericDatabaseReader,
  GenericDataModel,
  GenericTableInfo,
  OrderedQuery,
} from "convex/server";
import { filter as convexFilter } from "convex-helpers/server/filter";
import { isRangeMarker } from "../range";
import type {
  FindManyOptions,
  FindFirstOptions,
  PaginateOptions,
  PaginatedResult,
} from "../types/queryOptions";

// Runtime document shape — actual type safety is enforced by types/zen.ts
type Doc = Record<string, unknown>;

type FieldSelectionOpts = { select?: string[]; omit?: string[] };

/**
 * Minimal interface for the Convex index range builder.
 * We access methods dynamically (cursor[op]) because the op comes from
 * RangeMarker data. Convex's real IndexRangeBuilder narrows on each call
 * (preventing re-assignment), so we use this stable interface instead.
 */
interface IndexCursor {
  eq(field: string, value: unknown): IndexCursor;
  gt(field: string, value: unknown): IndexCursor;
  gte(field: string, value: unknown): IndexCursor;
  lt(field: string, value: unknown): IndexCursor;
  lte(field: string, value: unknown): IndexCursor;
}

function applyFieldSelection(
  doc: Doc | null,
  opts?: FieldSelectionOpts,
): Doc | null {
  if (!doc || (!opts?.select && !opts?.omit)) return doc;

  if (opts.select) {
    const result: Doc = {};
    for (const key of opts.select) {
      if (key in doc) result[key] = doc[key];
    }
    return result;
  }

  if (opts.omit) {
    const omitSet = new Set(opts.omit);
    const result: Doc = {};
    for (const key of Object.keys(doc)) {
      if (!omitSet.has(key)) result[key] = doc[key];
    }
    return result;
  }

  return doc;
}

function applyFieldSelectionArray(
  docs: Doc[],
  opts?: FieldSelectionOpts,
): Doc[] {
  if (!opts?.select && !opts?.omit) return docs;
  return docs.map((doc) => applyFieldSelection(doc, opts) as Doc);
}

/**
 * Creates a query builder that wraps a Convex query with optional index.
 *
 * Type safety for callers is enforced by ZenQueryBuilder in types/zen.ts.
 * Internally we use GenericDataModel — the document type resolves to
 * GenericDocument, which is Record<string, Value>.
 */
export function createQueryBuilder(
  db: GenericDatabaseReader<GenericDataModel>,
  tableName: string,
  indexName: string | null,
  args: unknown[],
  fields: string[],
) {
  function applyIndexArgs(q: IndexCursor): IndexCursor {
    let cursor = q;
    for (let i = 0; i < args.length; i++) {
      const arg = args[i];
      const field = fields[i];
      if (field === undefined) break;

      if (isRangeMarker(arg)) {
        if (arg.lower) {
          cursor = cursor[arg.lower.op](field, arg.lower.value);
        }
        if (arg.upper) {
          cursor = cursor[arg.upper.op](field, arg.upper.value);
        }
        break; // range is always last
      } else {
        cursor = cursor.eq(field, arg);
      }
    }
    return cursor;
  }

  function buildBaseQuery(
    order?: "asc" | "desc",
  ): OrderedQuery<GenericTableInfo> {
    const init = db.query(tableName);
    // SAFETY: Convex's IndexRangeBuilder narrows its type on every call,
    // preventing re-assignment. We use IndexCursor (stable interface) because
    // we build index args dynamically from RangeMarker data.
    const indexed = indexName
      ? init.withIndex(indexName, (q) =>
          applyIndexArgs(q as unknown as IndexCursor) as never,
        )
      : init;
    return order ? indexed.order(order) : indexed;
  }

  return {
    async findMany(
      opts?: FindManyOptions<Doc> | PaginateOptions<Doc>,
    ): Promise<Doc[] | PaginatedResult<Doc>> {
      let query: OrderedQuery<GenericTableInfo> = buildBaseQuery(opts?.order);

      if (opts?.filter) {
        query = convexFilter(query, opts.filter);
      }

      if (opts && "paginate" in opts) {
        const paginationResult = await query.paginate(opts.paginate);
        return {
          data: applyFieldSelectionArray(paginationResult.page, opts),
          cursor: paginationResult.continueCursor,
          hasMore: !paginationResult.isDone,
        };
      }

      let results: Doc[];
      if (opts && "limit" in opts && opts.limit != null) {
        results = await query.take(opts.limit);
      } else {
        results = await query.collect();
      }

      return applyFieldSelectionArray(results, opts);
    },

    async findFirst(opts?: FindFirstOptions<Doc>): Promise<Doc | null> {
      let query: OrderedQuery<GenericTableInfo> = buildBaseQuery(opts?.order);

      if (opts?.filter) {
        query = convexFilter(query, opts.filter);
      }

      const doc: Doc | null = await query.first();
      return applyFieldSelection(doc, opts);
    },
  };
}
