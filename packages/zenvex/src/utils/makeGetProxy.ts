// ---------------------------------------------------------------------------
// makeGetProxy — concise get-trap-only Proxy factory
// ---------------------------------------------------------------------------

/**
 * Creates a Proxy whose only trap is `get`. All property access is routed
 * through the provided handler function.
 *
 * Eliminates the `new Proxy(Object.create(null) as T, { get(_target, prop) { ... } })`
 * boilerplate that repeats across the codebase.
 */
export function makeGetProxy<T extends object>(
  handler: (prop: string) => unknown,
): T {
  return new Proxy(Object.create(null) as T, {
    get(_target, prop: string) {
      return handler(prop);
    },
  });
}
