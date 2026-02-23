// ---------------------------------------------------------------------------
// Range markers for index queries
// ---------------------------------------------------------------------------

export const RANGE_BRAND: unique symbol = Symbol("zenvex.range");

export interface RangeMarker<T = unknown> {
  readonly [RANGE_BRAND]: true;
  readonly lower?: { readonly op: "gt" | "gte"; readonly value: T };
  readonly upper?: { readonly op: "lt" | "lte"; readonly value: T };
}

export function isRangeMarker(v: unknown): v is RangeMarker {
  return v != null && typeof v === "object" && RANGE_BRAND in v;
}

// ---------------------------------------------------------------------------
// Chainable builder types
// ---------------------------------------------------------------------------

interface WithUpperChain<T> extends RangeMarker<T> {
  lt(value: T): RangeMarker<T>;
  lte(value: T): RangeMarker<T>;
}

interface WithLowerChain<T> extends RangeMarker<T> {
  gt(value: T): RangeMarker<T>;
  gte(value: T): RangeMarker<T>;
}

// ---------------------------------------------------------------------------
// q builder — entry point for range queries
// ---------------------------------------------------------------------------

function makeLowerMarker<T>(
  op: "gt" | "gte",
  value: T,
): WithUpperChain<T> {
  const base = { [RANGE_BRAND]: true as const, lower: { op, value } };
  return Object.assign(base, {
    lt: (v: T): RangeMarker<T> => ({ ...base, upper: { op: "lt", value: v } }),
    lte: (v: T): RangeMarker<T> => ({ ...base, upper: { op: "lte", value: v } }),
  });
}

function makeUpperMarker<T>(
  op: "lt" | "lte",
  value: T,
): WithLowerChain<T> {
  const base = { [RANGE_BRAND]: true as const, upper: { op, value } };
  return Object.assign(base, {
    gt: (v: T): RangeMarker<T> => ({ ...base, lower: { op: "gt", value: v } }),
    gte: (v: T): RangeMarker<T> => ({ ...base, lower: { op: "gte", value: v } }),
  });
}

export const q = {
  gt<T>(value: T): WithUpperChain<T> {
    return makeLowerMarker("gt", value);
  },
  gte<T>(value: T): WithUpperChain<T> {
    return makeLowerMarker("gte", value);
  },
  lt<T>(value: T): WithLowerChain<T> {
    return makeUpperMarker("lt", value);
  },
  lte<T>(value: T): WithLowerChain<T> {
    return makeUpperMarker("lte", value);
  },
};
