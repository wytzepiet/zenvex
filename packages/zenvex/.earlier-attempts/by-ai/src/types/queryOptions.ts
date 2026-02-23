interface FindManyBaseOptions<Doc> {
  filter?: (doc: Doc) => boolean;
  order?: "asc" | "desc";
  limit?: number;
}

interface WithSelect<Doc> {
  select: (keyof Doc & string)[];
  omit?: never;
}

interface WithOmit<Doc> {
  omit: (keyof Doc & string)[];
  select?: never;
}

interface WithNeither {
  select?: never;
  omit?: never;
}

export type FindManyOptions<Doc> = FindManyBaseOptions<Doc> &
  (WithSelect<Doc> | WithOmit<Doc> | WithNeither);

export type PaginateOptions<Doc> = Omit<FindManyOptions<Doc>, "limit"> & {
  paginate: { cursor: string | null; numItems: number };
};

export interface PaginatedResult<Doc> {
  data: Doc[];
  cursor: string;
  hasMore: boolean;
}

export type FindFirstOptions<Doc> = Omit<FindManyOptions<Doc>, "limit">;
