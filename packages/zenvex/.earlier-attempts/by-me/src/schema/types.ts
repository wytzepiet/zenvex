import type { GenericSchema, TableDefinition } from "convex/server";
import type { VObject } from "convex/values";

type TableFields<T> =
  T extends TableDefinition<VObject<any, infer Fields, any, any>, any, any, any>
    ? Fields
    : never;

type TableIndexes<T> =
  T extends TableDefinition<any, infer I, any, any> ? I : never;

export type SchemaInfo<Schema extends GenericSchema> = {
  [K in keyof Schema]: {
    fields: TableFields<Schema[K]>;
    indexes: TableIndexes<Schema[K]>;
  };
};
