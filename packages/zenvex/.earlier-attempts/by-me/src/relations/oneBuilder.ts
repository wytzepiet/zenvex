import type { TableDefinition } from "convex/server";
import {
  extractForeignKeys,
  type ForeignKey,
  type ForeignKeys,
} from "./schemaInfo";
import { remapRecord } from "../utils/record";

type OneOptions<Field extends ForeignKey = ForeignKey> = {
  field: Field["fieldName"];
};

export type OneDescriptor = {
  type: "one";
  targetTable: string;
  field: string;
};

export type OneBuilder<
  Schema extends Record<TableName, TableDefinition>,
  TableName extends keyof Schema & string,
> = {
  [K in keyof ForeignKeys<Schema[TableName]> as ForeignKeys<
    Schema[TableName]
  >[K] extends {
    tableName: infer Table extends string;
  }
    ? Table
    : never]: (
    options: OneOptions<Extract<ForeignKeys<Schema[TableName]>[K], ForeignKey>>,
  ) => OneDescriptor;
};

export function createOneBuilder<
  Schema extends Record<TableName, TableDefinition>,
  TableName extends keyof Schema & string,
>(schema: Schema, tableName: TableName): OneBuilder<Schema, TableName> {
  const fks = extractForeignKeys(schema[tableName]);
  return remapRecord(fks, (_, fk) => [
    fk.tableName,
    ({ field }: OneOptions): OneDescriptor => ({
      type: "one",
      targetTable: fk.tableName,
      field,
    }),
  ]) as unknown as OneBuilder<Schema, TableName>;
}
