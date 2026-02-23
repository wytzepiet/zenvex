// ---------------------------------------------------------------------------
// Query option types — filter, select/omit, take, cursor
//
// `with` and `add` are zen-level concerns typed in zen.ts, not here.
// Runtime code uses its own local interfaces (queryBuilder.ts, tableProxy.ts).
// ---------------------------------------------------------------------------

/** Loose runtime type for the `with` option. */
export type WithOption = Record<
  string,
  | true
  | {
      with?: WithOption;
      add?: (doc: any) => any;
      filter?: (doc: any) => boolean;
      order?: "asc" | "desc";
      take?: number;
      select?: string[];
      omit?: string[];
    }
>;

export type FieldSelection<Doc> =
  | { select: (keyof Doc & string)[]; omit?: never }
  | { omit: (keyof Doc & string)[]; select?: never }
  | { select?: never; omit?: never };

export type FindManyOptions<Doc> = {
  filter?: (doc: Doc) => boolean;
  order?: "asc" | "desc";
  take?: number;
} & FieldSelection<Doc>;

export type FindManyPaginateOptions<Doc> = FindManyOptions<Doc> & {
  cursor: string | null;
};

export type FindFirstOptions<Doc> = {
  filter?: (doc: Doc) => boolean;
  order?: "asc" | "desc";
} & FieldSelection<Doc>;

export type FindOptions<Doc> = FieldSelection<Doc>;
