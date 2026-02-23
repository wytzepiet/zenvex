import type { SchemaIntrospection } from "./defineRelations";

// ---------------------------------------------------------------------------
// r.many auto-resolution
// ---------------------------------------------------------------------------

interface ResolvedManyIndex {
  index: string;
  foreignKey: string;
}

/** Finds exactly one matching index or throws with guidance. */
export function resolveManyAutoIndex(
  info: SchemaIntrospection,
  sourceTable: string,
  targetTable: string,
): ResolvedManyIndex {
  const matching = info.indexesPointingTo(targetTable, sourceTable);

  if (matching.length === 0) {
    throw new Error(
      `[defineRelations] ${sourceTable}.r.many.${targetTable}(): no index on table "${targetTable}" has a v.id("${sourceTable}") as its first field. Specify an explicit index with { index: "..." }`,
    );
  }

  if (matching.length > 1) {
    throw new Error(
      `[defineRelations] ${sourceTable}.r.many.${targetTable}(): multiple indexes on table "${targetTable}" point to "${sourceTable}": ${matching.map((n) => `"${n}"`).join(", ")}. Specify an explicit index with { index: "..." }`,
    );
  }

  return {
    index: matching[0]!,
    foreignKey: info.indexFirstField(targetTable, matching[0]!)!,
  };
}

// ---------------------------------------------------------------------------
// r.many.through resolution
// ---------------------------------------------------------------------------

interface ResolvedThrough {
  sourceField: string;
  targetField: string;
  index: string;
}

/** Scans the join table for source/target v.id() fields and resolves the index. */
export function resolveThroughFields(
  info: SchemaIntrospection,
  sourceTable: string,
  targetTable: string,
  joinTable: string,
): ResolvedThrough {
  const joinIdFields = info.idFields(joinTable);

  let sourceField: string | undefined;
  let targetField: string | undefined;
  joinIdFields.forEach((fieldInfo, field) => {
    if (fieldInfo.tableName === sourceTable) sourceField = field;
    if (fieldInfo.tableName === targetTable) targetField = field;
  });

  return {
    sourceField: sourceField!,
    targetField: targetField!,
    index: info.indexByFirstField(joinTable, sourceField!)!,
  };
}

/** Same-table through — requires explicit sourceIndex/targetIndex to disambiguate. */
export function resolveSameTableThrough(
  sourceTable: string,
  targetTable: string,
  joinTable: string,
  sourceIndex: string | undefined,
  targetIndex: string | undefined,
): void {
  if (!sourceIndex || !targetIndex) {
    throw new Error(
      `[defineRelations] ${sourceTable}.r.many.${targetTable}({ through: "${joinTable}" }): same-table through requires explicit "sourceIndex" and "targetIndex" options`,
    );
  }

  if (sourceIndex === targetIndex) {
    throw new Error(
      `[defineRelations] ${sourceTable}.r.many.${targetTable}({ through: "${joinTable}" }): "sourceIndex" and "targetIndex" must be different indexes`,
    );
  }
}
