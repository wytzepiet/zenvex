import { defineTable, type TableDefinition } from "convex/server";
import {
  v,
  type GenericId,
  type GenericValidator,
  type ObjectType,
  type VId,
  type VObject,
} from "convex/values";
import type { Simplify } from "type-fest";

type JoinFields<T1 extends string, T2 extends string> = Simplify<
  {
    [K in `${T1}Id`]: VId<GenericId<T1>>;
  } & {
    [K in `${T2}Id`]: VId<GenericId<T2>>;
  }
>;

export function defineJoinTable<
  TableName1 extends string,
  TableName2 extends string,
  ExtraFields extends Record<string, GenericValidator> = {},
>(
  tableName1: TableName1,
  tableName2: TableName2,
  extraFields?: ExtraFields & {
    [K in `${TableName1}Id` | `${TableName2}Id`]?: never;
  },
): TableDefinition<
  VObject<
    ObjectType<NoInfer<ExtraFields> & JoinFields<TableName1, TableName2>>,
    NoInfer<ExtraFields> & JoinFields<TableName1, TableName2>
  >,
  {
    [K in TableName1 | TableName2 as `by_${K}Id`]: [`${K}Id`, "_creationTime"];
  },
  {},
  {}
> {
  const field1 = `${tableName1}Id` as const;
  const field2 = `${tableName2}Id` as const;

  return defineTable({
    ...extraFields,
    [field1]: v.id(tableName1),
    [field2]: v.id(tableName2),
  } as any)
    .index(`by_${field1}`, [field1])
    .index(`by_${field2}`, [field2]);
}
