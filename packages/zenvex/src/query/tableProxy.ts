// ---------------------------------------------------------------------------
// Per-table proxy — find, findMany, findFirst, index methods
// ---------------------------------------------------------------------------

import type {
  GenericDatabaseReader,
  GenericDatabaseWriter,
  GenericDataModel,
  GenericDocument,
} from "convex/server";
import type { GenericId, Value } from "convex/values";
import { createQueryBuilder } from "./queryBuilder.js";
import { selectFields } from "./selectFields.js";
import type { WithOption } from "../types/queryOptions.js";
import type { AllRelations } from "../types/shared.js";
import { resolveWith } from "./resolveRelations.js";
import { cascadeDelete } from "./cascadeDelete.js";
import { makeGetProxy } from "../utils/makeGetProxy.js";

function isWriter(
  db: GenericDatabaseReader<GenericDataModel>,
): db is GenericDatabaseWriter<GenericDataModel> {
  return "insert" in db;
}

/** Index cache: indexName → field names (without trailing _creationTime). */
export type IndexCache = Map<string, string[]>;

interface FindOpts {
  select?: string[];
  omit?: string[];
  with?: Record<string, unknown>;
  add?: (doc: Record<string, unknown>) => Record<string, unknown>;
}

export function createTableProxy(
  db: GenericDatabaseReader<GenericDataModel>,
  tableName: string,
  indexCache: IndexCache | undefined,
  allRelations: AllRelations,
) {
  return makeGetProxy<Record<string, unknown>>((prop) => {
    if (prop === "find") {
      return async (id: GenericId<string>, opts?: FindOpts) => {
        const doc = await db.get(id);
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
      };
    }

    if (prop === "findMany") {
      return (opts?: Record<string, unknown>) =>
        createQueryBuilder(db, tableName, null, [], [], allRelations).findMany(opts);
    }

    if (prop === "findFirst") {
      return (opts?: Record<string, unknown>) =>
        createQueryBuilder(db, tableName, null, [], [], allRelations).findFirst(opts);
    }

    // Write methods — only available when db is a writer
    if (prop === "insert") {
      if (!isWriter(db))
        throw new Error(`[zen] ${tableName}.insert requires MutationCtx`);
      const writer = db;
      return (doc: Record<string, Value>) => writer.insert(tableName, doc);
    }

    if (prop === "patch") {
      if (!isWriter(db))
        throw new Error(`[zen] ${tableName}.patch requires MutationCtx`);
      const writer = db;
      return (id: GenericId<string>, fields: Partial<GenericDocument>) =>
        writer.patch(id, fields);
    }

    if (prop === "upsert") {
      if (!isWriter(db))
        throw new Error(`[zen] ${tableName}.upsert requires MutationCtx`);
      const writer = db;
      return async (
        existing: GenericDocument | null,
        doc: Record<string, Value>,
      ) => {
        if (existing) {
          const { _id, _creationTime, ...fields } = doc;
          await writer.patch(
            existing._id as GenericId<string>,
            fields as Partial<GenericDocument>,
          );
          return existing._id;
        }
        return writer.insert(tableName, doc);
      };
    }

    if (prop === "delete") {
      if (!isWriter(db))
        throw new Error(`[zen] ${tableName}.delete requires MutationCtx`);
      const writer = db;
      return (id: GenericId<string>) =>
        cascadeDelete(writer, id, tableName, allRelations);
    }

    // Index access → returns (...args) => QueryBuilder
    const fields = indexCache?.get(prop);
    if (fields) {
      return (...args: unknown[]) =>
        createQueryBuilder(db, tableName, prop, args, fields, allRelations);
    }

    throw new Error(
      `[zen] ${tableName}.${prop}: unknown index. Available: ${
        indexCache ? [...indexCache.keys()].join(", ") : "none"
      }`,
    );
  });
}
