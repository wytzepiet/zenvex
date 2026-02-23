// ---------------------------------------------------------------------------
// Schema introspection — runtime helpers for inspecting Convex schema
// ---------------------------------------------------------------------------

const SYS_INDEXES = new Set(["by_id", "by_creation_time"]);

interface IdFieldInfo {
  tableName: string;
  optional: boolean;
}

export interface IndexEntry {
  indexDescriptor: string;
  fields: string[];
}

// Structural type — matches Convex's runtime TableDefinition shape
export interface IntrospectableTable {
  validator: { fields: Record<string, { kind: string; tableName?: string; isOptional?: string }> };
  [" indexes"](): IndexEntry[];
}

export interface SchemaIntrospection {
  idFields(tableName: string): Map<string, IdFieldInfo>;
  indexes(tableName: string): IndexEntry[];
  indexesPointingTo(targetTable: string, sourceTable: string): string[];
  indexFirstField(tableName: string, indexName: string): string | undefined;
  indexByFirstField(tableName: string, fieldName: string): string | undefined;
}

export function introspect(
  tables: Record<string, IntrospectableTable>,
): SchemaIntrospection {
  return {
    idFields(tableName: string): Map<string, IdFieldInfo> {
      const fields = tables[tableName]?.validator?.fields;
      if (!fields) return new Map();
      return new Map(
        Object.entries(fields)
          .filter(([, v]) => v.kind === "id" && typeof v.tableName === "string")
          .map(([name, v]) => [
            name,
            { tableName: v.tableName!, optional: v.isOptional === "optional" },
          ]),
      );
    },

    indexes(tableName: string): IndexEntry[] {
      const table = tables[tableName];
      if (!table) return [];
      return table[" indexes"]().filter((i) => !SYS_INDEXES.has(i.indexDescriptor));
    },

    indexesPointingTo(targetTable: string, sourceTable: string): string[] {
      const sourceFields = new Set(
        [...this.idFields(targetTable).entries()]
          .filter(([, info]) => info.tableName === sourceTable)
          .map(([field]) => field),
      );
      return this.indexes(targetTable)
        .filter((idx) => idx.fields.length > 0 && sourceFields.has(idx.fields[0]!))
        .map((idx) => idx.indexDescriptor);
    },

    indexFirstField(tableName: string, indexName: string): string | undefined {
      return this.indexes(tableName)
        .find((idx) => idx.indexDescriptor === indexName && idx.fields.length > 0)
        ?.fields[0];
    },

    indexByFirstField(tableName: string, fieldName: string): string | undefined {
      return this.indexes(tableName)
        .find((idx) => idx.fields.length > 0 && idx.fields[0] === fieldName)
        ?.indexDescriptor;
    },
  };
}
