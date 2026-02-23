export type MapRecord<R extends Record<string, any>, Out> = {
  [K in keyof R & string]: Out;
};

export function mapRecord<
  R extends Record<string, any>,
  K extends keyof R & string,
  Out,
>(record: R, fn: (key: K, value: R[K]) => Out): MapRecord<R, Out> {
  return Object.fromEntries(
    Object.entries(record).map(([k, v]) => [k, fn(k as K, v as R[K])]),
  ) as MapRecord<R, Out>;
}

export function remapRecord<
  R extends Record<string, any>,
  K extends keyof R & string,
  NewKey extends string,
  Out,
>(record: R, fn: (key: K, value: R[K]) => [NewKey, Out]): Record<NewKey, Out> {
  return Object.fromEntries(
    Object.entries(record).map(([k, v]) => fn(k as K, v as R[K])),
  ) as Record<NewKey, Out>;
}

export function filterRecord<K extends string, V, S extends V>(
  record: Record<K, V>,
  fn: (key: K, value: V) => value is S,
): Record<K, S>;
export function filterRecord<K extends string, V>(
  record: Record<K, V>,
  fn: (key: K, value: V) => boolean,
): Record<K, V>;
export function filterRecord<K extends string, V>(
  record: Record<K, V>,
  fn: (key: K, value: V) => boolean,
): Record<K, V> {
  return Object.fromEntries(
    Object.entries(record).filter(([k, v]) => fn(k as K, v as V)),
  ) as Record<K, V>;
}
