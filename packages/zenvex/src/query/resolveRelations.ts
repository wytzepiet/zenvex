// ---------------------------------------------------------------------------
// Runtime relation resolution — resolves `with` option at query time
// ---------------------------------------------------------------------------

import type { GenericDatabaseReader, GenericDataModel } from "convex/server";
import type { RelationDescriptor } from "../relations/types.js";
import type { WithOption } from "../types/queryOptions.js";
import type { Doc, AllRelations } from "../types/shared.js";
import { selectFields } from "./selectFields.js";

/**
 * Minimal interface for the Convex index range builder.
 * CAST Kind 3 — Convex internal API (same pattern as queryBuilder.ts).
 * Tested: tests/query/createZen.test.ts
 */
interface IndexCursor {
  eq(field: string, value: unknown): IndexCursor;
}

const JOIN_META_FIELDS = new Set(["_id", "_creationTime"]);

/**
 * Resolve `with` spec on an array of documents, returning new documents
 * with relation data merged in. Does not mutate the input array.
 */
export async function resolveWith(
  db: GenericDatabaseReader<GenericDataModel>,
  docs: Doc[],
  withSpec: WithOption,
  tableName: string,
  allRelations: AllRelations,
): Promise<Doc[]> {
  if (docs.length === 0) return docs;

  const tableRelations = allRelations[tableName];
  if (!tableRelations) return docs;

  const entries = Object.entries(withSpec);

  // Resolve all relations in parallel, collecting per-relation arrays
  const resolved = await Promise.all(
    entries.map(async ([relationName, spec]) => {
      const descriptor = tableRelations[relationName];
      if (!descriptor) {
        throw new Error(
          `[zen] ${tableName}.${relationName}: unknown relation. Available: ${Object.keys(tableRelations).join(", ")}`,
        );
      }

      const values = await resolveRelation(db, docs, descriptor);

      // Apply filter → order → take (before nested loading to reduce work)
      const afterFilterTake = spec !== true
        ? applyRelationFilterOrderTake(values, spec, descriptor)
        : values;

      // Recurse into nested with
      const nestedSpec = spec !== true && spec.with ? spec.with : undefined;
      const afterNested = nestedSpec
        ? await resolveNested(db, afterFilterTake, descriptor, nestedSpec, allRelations)
        : afterFilterTake;

      // Apply select/omit after nested loading (nested resolution needs full docs)
      // Preserve relation keys added by nested with so select doesn't strip them
      const nestedKeys = nestedSpec ? Object.keys(nestedSpec) : [];
      const afterSelect = spec !== true
        ? applyRelationSelectOmit(afterNested, spec, descriptor, nestedKeys)
        : afterNested;

      // Apply nested add
      const addFn = spec !== true && spec.add ? spec.add : undefined;
      const nestedValues = addFn
        ? applyNestedAdd(afterSelect, addFn, descriptor)
        : afterSelect;

      return { relationName, values: nestedValues };
    }),
  );

  // Merge all resolved relations into new doc objects
  return docs.map((doc, i) => ({
    ...doc,
    ...Object.fromEntries(resolved.map(({ relationName, values }) => [relationName, values[i]])),
  }));
}

// ---------------------------------------------------------------------------
// Per-descriptor resolution — returns one value per input doc
// ---------------------------------------------------------------------------

type RelationValue = Doc | Doc[] | null;

async function resolveRelation(
  db: GenericDatabaseReader<GenericDataModel>,
  docs: Doc[],
  descriptor: RelationDescriptor,
): Promise<RelationValue[]> {
  switch (descriptor.type) {
    case "one":
      return resolveOne(db, docs, descriptor);
    case "many":
      return resolveMany(db, docs, descriptor);
    case "through":
      return resolveThrough(db, docs, descriptor);
  }
}

async function resolveOne(
  db: GenericDatabaseReader<GenericDataModel>,
  docs: Doc[],
  descriptor: { foreignKey: string },
): Promise<(Doc | null)[]> {
  return Promise.all(
    docs.map(async (doc) => {
      const fkValue = doc[descriptor.foreignKey];
      if (fkValue == null) return null;
      const related = await db.get(fkValue as any);
      return (related as Doc) ?? null;
    }),
  );
}

async function resolveMany(
  db: GenericDatabaseReader<GenericDataModel>,
  docs: Doc[],
  descriptor: { targetTable: string; index: string; foreignKey: string },
): Promise<Doc[][]> {
  return Promise.all(
    docs.map(async (doc) => {
      // CAST Kind 3 — Convex IndexRangeBuilder narrows per call, need stable interface.
      // Tested: tests/query/createZen.test.ts
      const results = await db
        .query(descriptor.targetTable)
        .withIndex(descriptor.index, (q) =>
          (q as unknown as IndexCursor).eq(descriptor.foreignKey, doc._id) as never,
        )
        .collect();
      return results as Doc[];
    }),
  );
}

async function resolveThrough(
  db: GenericDatabaseReader<GenericDataModel>,
  docs: Doc[],
  descriptor: {
    targetTable: string;
    joinTable: string;
    sourceField: string;
    targetField: string;
    index: string;
  },
): Promise<Doc[][]> {
  return Promise.all(
    docs.map(async (doc) => {
      // CAST Kind 3 — Convex IndexRangeBuilder narrows per call, need stable interface.
      // Tested: tests/query/createZen.test.ts
      const joinRows = await db
        .query(descriptor.joinTable)
        .withIndex(descriptor.index, (q) =>
          (q as unknown as IndexCursor).eq(descriptor.sourceField, doc._id) as never,
        )
        .collect();

      const results = await Promise.all(
        (joinRows as Doc[]).map(async (row) => {
          const targetId = row[descriptor.targetField];
          const target = targetId != null ? await db.get(targetId as any) : null;
          if (!target) return null;

          // Extract pivot fields — everything except meta and FK fields
          const pivotEntries = Object.entries(row).filter(
            ([key]) =>
              !JOIN_META_FIELDS.has(key) &&
              key !== descriptor.sourceField &&
              key !== descriptor.targetField,
          );

          return pivotEntries.length > 0
            ? { ...(target as Doc), pivot: Object.fromEntries(pivotEntries) }
            : (target as Doc);
        }),
      );

      return results.filter((r): r is Doc => r != null);
    }),
  );
}

// ---------------------------------------------------------------------------
// Relation options — filter, order, take, select/omit on relation results
// ---------------------------------------------------------------------------

function applyRelationFilterOrderTake(
  values: RelationValue[],
  spec: {
    filter?: (doc: any) => boolean;
    order?: "asc" | "desc";
    take?: number;
  },
  _descriptor: RelationDescriptor,
): RelationValue[] {
  const { filter, order, take } = spec;
  if (!filter && !order && take == null) return values;

  return values.map((value) => {
    if (value == null) return null;

    // One descriptor: filter/order/take don't apply
    if (!Array.isArray(value)) return value;

    // Many/Through: filter → order → take
    let result = value;
    if (filter) result = result.filter(filter);
    if (order === "desc") result = [...result].reverse();
    if (take != null) result = result.slice(0, take);
    return result;
  });
}

function applyRelationSelectOmit(
  values: RelationValue[],
  spec: { select?: string[]; omit?: string[] },
  _descriptor: RelationDescriptor,
  preserveKeys: string[],
): RelationValue[] {
  const { select, omit } = spec;
  if (!select && !omit) return values;

  // When select is specified, also preserve relation keys added by nested with
  const effectiveSelect = select && preserveKeys.length > 0
    ? [...select, ...preserveKeys]
    : select;

  return values.map((value) => {
    if (value == null) return null;

    // One descriptor: apply select/omit to single doc
    if (!Array.isArray(value)) {
      return selectFields(value, effectiveSelect, omit);
    }

    // Many/Through: apply select/omit to each doc
    return value.map((doc) => selectFields(doc, effectiveSelect, omit));
  });
}

// ---------------------------------------------------------------------------
// Nested resolution — recurse into loaded relation values
// ---------------------------------------------------------------------------

async function resolveNested(
  db: GenericDatabaseReader<GenericDataModel>,
  values: RelationValue[],
  descriptor: RelationDescriptor,
  nestedSpec: WithOption,
  allRelations: AllRelations,
): Promise<RelationValue[]> {
  return Promise.all(
    values.map(async (value) => {
      if (value == null) return null;
      if (Array.isArray(value)) {
        return resolveWith(db, value, nestedSpec, descriptor.targetTable, allRelations);
      }
      const [resolved] = await resolveWith(db, [value], nestedSpec, descriptor.targetTable, allRelations);
      return resolved ?? null;
    }),
  );
}

// ---------------------------------------------------------------------------
// Nested add — applies `add` callback to relation values
// ---------------------------------------------------------------------------

function applyNestedAdd(
  values: RelationValue[],
  addFn: (doc: Record<string, unknown>) => Record<string, unknown>,
  descriptor: RelationDescriptor,
): RelationValue[] {
  return values.map((value) => {
    if (value == null) return null;
    if (Array.isArray(value)) {
      return value.map((doc) => ({ ...doc, ...addFn(doc) }));
    }
    return { ...value, ...addFn(value) };
  });
}
