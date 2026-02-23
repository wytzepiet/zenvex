export type RestrictKeys<T, Allowed> = {
  [K in keyof T]: K extends keyof Allowed ? T[K] : never;
};

export type Not<T extends boolean> = T extends true ? false : true;
