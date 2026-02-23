// ---------------------------------------------------------------------------
// Query builder — wraps a single Convex query with optional index
// ---------------------------------------------------------------------------

import type {
  GenericDatabaseReader,
  GenericDataModel,
  GenericTableInfo,
  OrderedQuery,
  PaginationResult,
} from "convex/server";
import { filter as convexFilter } from "convex-helpers/server/filter";
import { isRangeMarker } from "./range.js";
import { selectFields } from "./selectFields.js";
import type { WithOption } from "../types/queryOptions.js";
import type { Doc, AllRelations } from "../types/shared.js";
import { resolveWith } from "./resolveRelations.js";

/**
 * Minimal interface for the Convex index range builder.
 * Convex's real IndexRangeBuilder narrows its type on each call,
 * preventing re-assignment. We use this stable interface because
 * we build index args dynamically from RangeMarker data.
 *
 * CAST Kind 3 — Convex internal API. Tested: tests/query/createZen.test.ts
 */
interface IndexCursor {
  eq(field: string, value: unknown): IndexCursor;
  gt(field: string, value: unknown): IndexCursor;
  gte(field: string, value: unknown): IndexCursor;
  lt(field: string, value: unknown): IndexCursor;
  lte(field: string, value: unknown): IndexCursor;
}

interface FindManyOpts {
  filter?: (doc: Doc) => boolean;
  order?: "asc" | "desc";
  take?: number;
  cursor?: string | null;
  select?: string[];
  omit?: string[];
  with?: Record<string, unknown>;
  add?: (doc: Doc) => Record<string, unknown>;
}

interface FindFirstOpts {
  filter?: (doc: Doc) => boolean;
  order?: "asc" | "desc";
  select?: string[];
  omit?: string[];
  with?: Record<string, unknown>;
  add?: (doc: Doc) => Record<string, unknown>;
}

function applyIndexArgs(
  cursor: IndexCursor,
  args: unknown[],
  fields: string[],
): IndexCursor {
  let c = cursor;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const field = fields[i];
    if (field === undefined) break;

    if (isRangeMarker(arg)) {
      if (arg.lower) {
        c = c[arg.lower.op](field, arg.lower.value);
      }
      if (arg.upper) {
        c = c[arg.upper.op](field, arg.upper.value);
      }
      break; // range is always last
    } else {
      c = c.eq(field, arg);
    }
  }
  return c;
}

export function createQueryBuilder(
  db: GenericDatabaseReader<GenericDataModel>,
  tableName: string,
  indexName: string | null,
  args: unknown[],
  fields: string[],
  allRelations: AllRelations,
) {
  function buildBaseQuery(
    order?: "asc" | "desc",
  ): OrderedQuery<GenericTableInfo> {
    const init = db.query(tableName);
    const indexed = indexName
      ? init.withIndex(indexName, (q) =>
          // CAST Kind 3 — Convex IndexRangeBuilder narrows per call, need stable interface.
          // Tested: tests/query/createZen.test.ts
          applyIndexArgs(q as unknown as IndexCursor, args, fields) as never,
        )
      : init;
    return order ? indexed.order(order) : indexed;
  }

  return {
    async findMany(opts?: FindManyOpts): Promise<Doc[] | PaginationResult<Doc>> {
      const query = buildBaseQuery(opts?.order);

      const filtered = opts?.filter
        ? convexFilter(query, opts.filter)
        : query;

      if (opts && "cursor" in opts) {
        const numItems = opts.take ?? 10;
        const result = await filtered.paginate({
          numItems,
          cursor: opts.cursor ?? null,
        });

        const selected = (result.page as Doc[]).map((doc) =>
          selectFields(doc, opts.select, opts.omit),
        );

        const withResolved = opts.with
          ? await resolveWith(db, selected, opts.with as WithOption, tableName, allRelations)
          : selected;

        const page = opts.add
          ? withResolved.map((doc) => ({ ...doc, ...opts.add!(doc) }))
          : withResolved;

        return { ...result, page };
      }

      const docs = opts?.take
        ? await filtered.take(opts.take)
        : await filtered.collect();

      const selected = (docs as Doc[]).map((doc) =>
        selectFields(doc, opts?.select, opts?.omit),
      );

      const withResolved = opts?.with
        ? await resolveWith(db, selected, opts.with as WithOption, tableName, allRelations)
        : selected;

      return opts?.add
        ? withResolved.map((doc) => ({ ...doc, ...opts.add!(doc) }))
        : withResolved;
    },

    async findFirst(
      opts?: FindFirstOpts,
    ): Promise<Doc | null> {
      const query = buildBaseQuery(opts?.order);

      const filtered = opts?.filter
        ? convexFilter(query, opts.filter)
        : query;

      const doc = await filtered.first();
      if (!doc) return null;

      const selected = selectFields(
        doc as Record<string, unknown>,
        opts?.select,
        opts?.omit,
      );

      if (!opts?.with && !opts?.add) return selected;

      const resolved = opts?.with
        ? (await resolveWith(db, [selected], opts.with as WithOption, tableName, allRelations))[0] ?? null
        : selected;

      if (!resolved) return null;

      return opts?.add
        ? { ...resolved, ...opts.add(resolved) }
        : resolved;
    },
  };
}
