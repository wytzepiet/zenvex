import type { GenericSchema, SchemaDefinition } from "convex/server";

export function defineRelations<
  Schema extends GenericSchema,
  StrictTableTypes extends boolean,
  Relations extends {
    [K in keyof Schema]?: any;
  },
>(
  schema: SchemaDefinition<Schema, StrictTableTypes>,
  relations: Relations,
): Relations {
  return relations;
}
