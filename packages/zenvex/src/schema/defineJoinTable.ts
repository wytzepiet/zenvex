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

type EnsureDifferent<T1 extends string, T2 extends string> = T1 extends T2
  ? never
  : T2;

type Capitalize<S extends string> = S extends `${infer F}${infer R}`
  ? `${Uppercase<F>}${R}`
  : S;

export function defineJoinTable<
  TableName1 extends string,
  TableName2 extends string,
  ExtraFields extends Record<string, GenericValidator> = {},
>(
  tableName1: TableName1,
  tableName2: EnsureDifferent<TableName1, TableName2>,
  extraFields?: ExtraFields & {
    [K in `${TableName1}Id` | `${TableName2}Id`]?: never;
  },
): TableDefinition<
  VObject<
    ObjectType<NoInfer<ExtraFields> & JoinFields<TableName1, TableName2>>,
    NoInfer<ExtraFields> & JoinFields<TableName1, TableName2>
  >,
  {
    [K in TableName1 | TableName2 as `by${Capitalize<K>}Id`]: [
      `${K}Id`,
      "_creationTime",
    ];
  },
  {},
  {}
> {
  const field1 = `${tableName1}Id` as const;
  const field2 = `${tableName2}Id` as const;

  const indexName1 = `by${tableName1[0]!.toUpperCase()}${tableName1.slice(1)}Id`;
  const indexName2 = `by${tableName2[0]!.toUpperCase()}${tableName2.slice(1)}Id`;

  // CAST Kind 1 — defineTable with computed property keys erases literal field types.
  // The runtime object is correct: { [t1Id]: v.id(t1), [t2Id]: v.id(t2), ...extra }.
  // The return type annotation enforces the exact shape.
  // Tested: tests/schema/defineJoinTable.test.ts
  return defineTable({
    ...extraFields,
    [field1]: v.id(tableName1),
    [field2]: v.id(tableName2),
  } as any)
    .index(indexName1, [field1])
    .index(indexName2, [field2]);
}
