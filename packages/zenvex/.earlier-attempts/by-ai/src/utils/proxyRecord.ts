/**
 * Creates a proxy object where any property access returns a function.
 * The property name (key) is passed as the first argument to the handler.
 *
 * Used throughout zenvex to build chainable proxy APIs where the accessed
 * property name carries meaning (table name, index name, etc).
 *
 * @example
 * const tables = proxyRecord((tableName: string) => {
 *   return { table: tableName };
 * });
 * tables.posts; // → () => { table: "posts" }
 *
 * @example
 * const indexes = proxyRecord((indexName: string, ...args: string[]) => {
 *   return { index: indexName, args };
 * });
 * indexes.byAuthor("userId"); // → { index: "byAuthor", args: ["userId"] }
 */
export function proxyRecord<
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  F extends (key: string, ...args: any[]) => any,
>(
  handler: F,
): Record<string, (...args: DropFirst<Parameters<F>>) => ReturnType<F>> {
  return new Proxy(Object.create(null) as Record<string, never>, {
    get(_target, key: string) {
      return (...args: DropFirst<Parameters<F>>) => handler(key, ...args);
    },
  });
}

/** Remove the first element from a tuple type. */
type DropFirst<T extends unknown[]> = T extends [unknown, ...infer Rest] ? Rest : never;
