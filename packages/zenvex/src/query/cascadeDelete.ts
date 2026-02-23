// ---------------------------------------------------------------------------
// Cascading delete — enforces onDelete rules from relation descriptors
// ---------------------------------------------------------------------------

import type { GenericDatabaseWriter, GenericDataModel } from "convex/server";
import type { GenericId } from "convex/values";
import type { RelationDescriptor, ManyDescriptor, ThroughDescriptor } from "../relations/types.js";
import type { AllRelations, Doc } from "../types/shared.js";

/**
 * Minimal interface for the Convex index range builder.
 * CAST Kind 3 — Convex internal API (same pattern as resolveRelations.ts).
 * Tested: tests/query/createZen.test.ts
 */
interface IndexCursor {
  eq(field: string, value: unknown): IndexCursor;
}

/**
 * Delete a document and process all onDelete rules defined in its relations.
 *
 * Relation rules:
 * - **one**: No action (FK lives on the deleted doc itself).
 * - **many**: Governed by `onDelete` (default `"restrict"`).
 * - **through**: Join rows are cleaned up by default (no `onDelete` specified).
 *   `onDelete` controls target docs: `"cascade"` also deletes targets,
 *   `"restrict"` blocks if join rows exist, `"noAction"` skips entirely.
 */
export async function cascadeDelete(
  db: GenericDatabaseWriter<GenericDataModel>,
  id: GenericId<string>,
  tableName: string,
  allRelations: AllRelations,
  visited: Set<string> = new Set(),
): Promise<void> {
  // Guard against cycles (e.g. A → B cascade, B → A cascade)
  const key = `${tableName}:${id}`;
  if (visited.has(key)) return;
  visited.add(key);

  const tableRelations = allRelations[tableName];

  if (tableRelations) {
    const descriptors = Object.values(tableRelations);
    for (const descriptor of descriptors) {
      if (descriptor.type === "one") continue;
      if (descriptor.type === "many") {
        await processManyDelete(db, id, descriptor, allRelations, visited);
      } else {
        await processThroughDelete(db, id, descriptor, allRelations, visited);
      }
    }
  }

  await db.delete(id);
}

// ---------------------------------------------------------------------------
// many — onDelete: restrict (default) | cascade | setNull | noAction
// ---------------------------------------------------------------------------

async function processManyDelete(
  db: GenericDatabaseWriter<GenericDataModel>,
  sourceId: GenericId<string>,
  descriptor: ManyDescriptor,
  allRelations: AllRelations,
  visited: Set<string>,
): Promise<void> {
  const action = descriptor.onDelete ?? "restrict";
  if (action === "noAction") return;

  const related = await queryByIndex(
    db,
    descriptor.targetTable,
    descriptor.index,
    descriptor.foreignKey,
    sourceId,
  );

  switch (action) {
    case "restrict":
      if (related.length > 0) {
        throw new Error(
          `[zen] Cannot delete from "${descriptor.targetTable}": ` +
            `${related.length} related doc(s) in "${descriptor.targetTable}" ` +
            `via index "${descriptor.index}" (onDelete: "restrict")`,
        );
      }
      break;

    case "cascade":
      for (const doc of related) {
        await cascadeDelete(
          db,
          doc._id as GenericId<string>,
          descriptor.targetTable,
          allRelations,
          visited,
        );
      }
      break;

    case "setNull":
      for (const doc of related) {
        await db.patch(doc._id as GenericId<string>, {
          [descriptor.foreignKey]: undefined,
        });
      }
      break;
  }
}

// ---------------------------------------------------------------------------
// through — join rows cleaned by default, onDelete controls targets
// ---------------------------------------------------------------------------

async function processThroughDelete(
  db: GenericDatabaseWriter<GenericDataModel>,
  sourceId: GenericId<string>,
  descriptor: ThroughDescriptor,
  allRelations: AllRelations,
  visited: Set<string>,
): Promise<void> {
  const action = descriptor.onDelete ?? undefined;

  // noAction: skip entirely (leave orphaned join rows)
  if (action === "noAction") return;

  const joinRows = await queryByIndex(
    db,
    descriptor.joinTable,
    descriptor.index,
    descriptor.sourceField,
    sourceId,
  );

  // restrict: block if any connections exist
  if (action === "restrict") {
    if (joinRows.length > 0) {
      throw new Error(
        `[zen] Cannot delete: ${joinRows.length} row(s) in join table ` +
          `"${descriptor.joinTable}" reference this document (onDelete: "restrict")`,
      );
    }
    return;
  }

  // cascade: delete targets first, then join rows
  if (action === "cascade") {
    for (const row of joinRows) {
      const targetId = row[descriptor.targetField] as GenericId<string> | undefined;
      if (targetId != null) {
        await cascadeDelete(db, targetId, descriptor.targetTable, allRelations, visited);
      }
    }
  }

  // Default (no onDelete) + cascade + setNull: always clean up join rows
  for (const row of joinRows) {
    await db.delete(row._id as GenericId<string>);
  }
}

// ---------------------------------------------------------------------------
// Shared index query helper
// ---------------------------------------------------------------------------

async function queryByIndex(
  db: GenericDatabaseWriter<GenericDataModel>,
  tableName: string,
  indexName: string,
  fieldName: string,
  value: GenericId<string>,
): Promise<Doc[]> {
  // CAST Kind 3 — Convex IndexRangeBuilder narrows per call, need stable interface.
  // Tested: tests/query/createZen.test.ts
  const results = await db
    .query(tableName)
    .withIndex(indexName, (q) =>
      (q as unknown as IndexCursor).eq(fieldName, value) as never,
    )
    .collect();
  return results as Doc[];
}
