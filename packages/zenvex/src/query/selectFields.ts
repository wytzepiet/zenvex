// ---------------------------------------------------------------------------
// Field selection — shared select/omit logic for queries
// ---------------------------------------------------------------------------

import type { Doc } from "../types/shared.js";

export function selectFields(doc: Doc, select?: string[], omit?: string[]): Doc {
  if (select) {
    return Object.fromEntries(
      select.filter((key) => key in doc).map((key) => [key, doc[key]]),
    );
  }
  if (omit) {
    const omitSet = new Set(omit);
    return Object.fromEntries(
      Object.entries(doc).filter(([key]) => !omitSet.has(key)),
    );
  }
  return doc;
}
