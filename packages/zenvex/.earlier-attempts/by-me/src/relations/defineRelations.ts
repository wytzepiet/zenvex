import type {
  GenericSchema,
  SchemaDefinition,
  TableDefinition,
} from "convex/server";
import { mapRecord } from "../utils/record";
import { hasForeignKeys, type HasForeignKeys } from "./schemaInfo";
import type { RestrictKeys } from "../utils/types";
import type { If } from "type-fest";
import { createOneBuilder, type OneBuilder } from "./oneBuilder";

type RelationSpec<
  Schema extends Record<TableName, TableDefinition>,
  TableName extends keyof Schema & string,
> = {
  [K in string]: any;
};

type RelationsDefinition<Schema extends GenericSchema> = {
  [K in keyof Schema & string]?: (
    r: RelationBuilder<Schema, K>,
  ) => RelationSpec<Schema, K>;
};

type RelationBuilder<
  Schema extends Record<TableName, TableDefinition>,
  TableName extends keyof Schema & string,
> = {
  many: any;
} & If<
  HasForeignKeys<Schema[TableName]>,
  { one: OneBuilder<Schema, TableName> },
  {}
>;

function createRelationBuilder<
  Schema extends Record<TableName, TableDefinition>,
  TableName extends keyof Schema & string,
>(schema: Schema, tableName: TableName): RelationBuilder<Schema, TableName> {
  const table = schema[tableName];
  const tableHasIdFields = hasForeignKeys(table);
  if (!tableHasIdFields) {
    return { many: 0 } as RelationBuilder<Schema, TableName>;
  }

  return { one: createOneBuilder(schema, tableName), many: 0 };
}

export function defineRelations<
  Schema extends GenericSchema,
  Relations extends RelationsDefinition<Schema>,
>(
  schema: SchemaDefinition<Schema, any>,
  relations: RestrictKeys<Relations, Schema>,
) {
  return mapRecord(relations, (tableName, relationsCallback) => {
    const r = createRelationBuilder(schema.tables, tableName);
    return relationsCallback?.(r);
  });
}
