import type {
  GenericDatabaseReader,
  GenericDatabaseWriter,
  GenericDataModel,
  GenericDocument,
} from "convex/server";
import type { GenericId, Value } from "convex/values";
import { createQueryBuilder } from "./queryBuilder";

/** Index cache: indexName → field names (without trailing _creationTime). */
export type IndexCache = Map<string, string[]>;

const KNOWN_METHODS = new Set([
  "findMany",
  "findFirst",
  "findByIds",
  "insert",
  "patch",
  "delete",
  "upsert",
]);

function isWriter(
  db: GenericDatabaseReader<GenericDataModel>,
): db is GenericDatabaseWriter<GenericDataModel> {
  return typeof (db as GenericDatabaseWriter<GenericDataModel>).insert === "function";
}

export function createTableProxy(
  db: GenericDatabaseReader<GenericDataModel>,
  tableName: string,
  indexCache: IndexCache | undefined,
) {
  const writable = isWriter(db);

  return new Proxy(Object.create(null) as Record<string, unknown>, {
    get(_target, prop: string) {
      // ---------------------------------------------------------------
      // Read methods
      // ---------------------------------------------------------------
      if (prop === "findMany") {
        return (opts?: Record<string, unknown>) =>
          createQueryBuilder(db, tableName, null, [], []).findMany(opts);
      }
      if (prop === "findFirst") {
        return (opts?: Record<string, unknown>) =>
          createQueryBuilder(db, tableName, null, [], []).findFirst(opts);
      }
      if (prop === "findByIds") {
        return async (ids: GenericId<string>[]) => {
          const results = await Promise.all(ids.map((id) => db.get(id)));
          return results.filter((doc) => doc !== null);
        };
      }

      // ---------------------------------------------------------------
      // Write methods (only on writer db)
      // ---------------------------------------------------------------
      if (writable) {
        const writer = db;
        if (prop === "insert") {
          return (value: Record<string, Value>) =>
            writer.insert(tableName, value);
        }
        if (prop === "patch") {
          return (id: GenericId<string>, value: Partial<GenericDocument>) =>
            writer.patch(id, value);
        }
        if (prop === "delete") {
          return (id: GenericId<string>) => writer.delete(id);
        }
        if (prop === "upsert") {
          return async (
            existing: GenericDocument | null,
            value: Record<string, Value>,
          ) => {
            if (existing && existing._id) {
              const { _id, _creationTime, ...fields } = value;
              await writer.patch(
                existing._id as GenericId<string>,
                fields,
              );
              return existing._id;
            }
            return writer.insert(tableName, value);
          };
        }
      }

      // Non-writer accessing write methods → throw
      if (KNOWN_METHODS.has(prop)) {
        return () => {
          throw new Error(`${tableName}.${prop}: Not implemented`);
        };
      }

      // ---------------------------------------------------------------
      // Index access → returns (...args) => QueryBuilder
      // ---------------------------------------------------------------
      const fields = indexCache?.get(prop);
      if (fields) {
        return (...args: unknown[]) =>
          createQueryBuilder(db, tableName, prop, args, fields);
      }

      // Fallback: unknown index (no schema provided) — still dispatch
      // but with empty fields so withIndex callback is a no-op
      return (...args: unknown[]) =>
        createQueryBuilder(db, tableName, prop, args, []);
    },
  });
}
