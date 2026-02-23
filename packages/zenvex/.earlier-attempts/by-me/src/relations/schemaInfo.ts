import type { TableDefinition } from "convex/server";
import { filterRecord, mapRecord } from "../utils/record";
import type { OptionalProperty, VObject } from "convex/values";
import type { ConditionalPick, IsEmptyObject } from "type-fest";
import type { Not } from "../utils/types";

const SYS_INDEXES = ["by_id", "by_creation_time"];

export type ForeignKey<
  TableName extends string = string,
  Optional extends OptionalProperty = OptionalProperty,
  FieldName extends string = string,
> = {
  kind: "id";
  tableName: TableName;
  isOptional: Optional;
  fieldName: FieldName;
};

type ExtractFields<T> =
  T extends TableDefinition<VObject<any, infer Fields>, any, any, any>
    ? Fields
    : never;

type RawForeignKeys<T extends TableDefinition> = ConditionalPick<
  ExtractFields<T>,
  { kind: "id"; tableName: string }
>;

export type ForeignKeys<T extends TableDefinition> = {
  [K in keyof RawForeignKeys<T>]: RawForeignKeys<T>[K] extends {
    tableName: infer Table extends string;
    isOptional: infer Opt extends OptionalProperty;
  }
    ? ForeignKey<Table, Opt, K & string>
    : never;
};

export type HasForeignKeys<T extends TableDefinition> = Not<
  IsEmptyObject<ForeignKeys<T>>
>;

export function hasForeignKeys<T extends TableDefinition>(
  table: T,
): HasForeignKeys<T> {
  const idFieldNames = Object.keys(extractForeignKeys(table));
  return (idFieldNames.length > 0) as HasForeignKeys<T>;
}

export function extractForeignKeys<T extends TableDefinition>({
  validator,
}: T): ForeignKeys<T> {
  if (!("fields" in validator)) return {} as ForeignKeys<T>;
  const idFields = filterRecord(validator.fields, (_, v) => v.kind === "id");
  return mapRecord(idFields, (name, v) => ({
    kind: v.kind,
    tableName: v.tableName,
    isOptional: v.isOptional,
    fieldName: name,
  })) as ForeignKeys<T>;
}

export function extractUserIndexes({ [" indexes"]: indexes }: TableDefinition) {
  return indexes().filter((i) => !SYS_INDEXES.includes(i.indexDescriptor));
}
