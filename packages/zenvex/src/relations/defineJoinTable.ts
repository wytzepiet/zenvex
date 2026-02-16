import {
  defineTable,
  type IndexTiebreakerField,
  type TableDefinition,
} from "convex/server";
import {
  v,
  type GenericId,
  type GenericValidator,
  type ObjectType,
  type VId,
  type VObject,
} from "convex/values";

type JoinFields<T1 extends string, T2 extends string> = {
  [K in `${T1}Id`]: VId<GenericId<T1>>;
} & {
  [K in `${T2}Id`]: VId<GenericId<T2>>;
};

type JoinTableIndexes<T1 extends string, T2 extends string> = Record<
  `by_${T1}Id`,
  [`${T1}Id`, IndexTiebreakerField]
> &
  Record<`by_${T2}Id`, [`${T2}Id`, IndexTiebreakerField]>;

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
    ObjectType<ExtraFields & JoinFields<TableName1, TableName2>>,
    ExtraFields & JoinFields<TableName1, TableName2>
  >,
  JoinTableIndexes<TableName1, TableName2>,
  {},
  {}
> {
  const field1 = `${tableName1}Id` as const;
  const field2 = `${tableName2}Id` as const;

  // Implementation uses `as any` — the return type annotation above
  // provides full type safety at call sites.
  return defineTable({
    ...extraFields,
    [field1]: v.id(tableName1),
    [field2]: v.id(tableName2),
  } as any)
    .index(`by_${field1}`, [field1])
    .index(`by_${field2}`, [field2]);
}
