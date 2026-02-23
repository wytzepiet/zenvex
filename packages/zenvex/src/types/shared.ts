// ---------------------------------------------------------------------------
// Shared type aliases used across the query and relation layers
// ---------------------------------------------------------------------------

import type { RelationDescriptor } from "../relations/types.js";

/** Loose document record — used at the runtime layer where exact fields aren't known. */
export type Doc = Record<string, unknown>;

/** Per-table relation descriptors keyed by relation name, keyed by table name. */
export type AllRelations = Record<string, Record<string, RelationDescriptor>>;
