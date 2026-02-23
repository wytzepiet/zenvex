// ---------------------------------------------------------------------------
// Type-level helpers for the `with` option — eager relation loading
// ---------------------------------------------------------------------------

import type {
  GenericDataModel,
  TableNamesInDataModel,
  DocumentByName,
} from "convex/server";
import type {
  OneDescriptor,
  ManyDescriptor,
  ThroughDescriptor,
} from "../relations/types.js";

// ---------------------------------------------------------------------------
// Table relations lookup — extracts relation descriptors for a table
// ---------------------------------------------------------------------------

export type TableRelations<
  Relations,
  TN extends string,
> = TN extends keyof Relations ? Relations[TN] : {};

// ---------------------------------------------------------------------------
// AllRelationsResult — all relations resolved as if loaded with `true`
//
// Used for nested `add` callback typing. Gives one level of relations
// so `thread.posts` is PostDoc[] and `thread.author` is UserDoc | null.
// ---------------------------------------------------------------------------

type AllRelationsResult<
  DM extends GenericDataModel,
  Relations,
  TN extends string,
> = {
  [K in keyof TableRelations<Relations, TN>]: ResolveRelationType<
    DM,
    Relations,
    TableRelations<Relations, TN>[K],
    true
  >;
};

// ---------------------------------------------------------------------------
// WithSpec — constrains `with` keys to valid relation names, supports nesting
//
// WithSpec serves as W's constraint in zen.ts.  TS uses it as the contextual
// type for nested `add` callbacks (see the overload explanation in zen.ts).
// Because the constraint can't reference W itself, we can't know which
// relations the caller actually loaded.  Instead, nested `add` receives the
// doc plus ALL relations (via AllRelationsResult) — slightly imprecise but
// pragmatically correct since users access what they loaded.
// ---------------------------------------------------------------------------

export type WithSpec<
  DM extends GenericDataModel,
  Relations,
  TN extends string,
> = {
  [K in keyof TableRelations<Relations, TN>]?:
    | true
    | WithNestedOpts<DM, Relations, TableRelations<Relations, TN>[K]>;
};

type WithNestedOpts<
  DM extends GenericDataModel,
  Relations,
  Desc,
> = Desc extends OneDescriptor<infer TT, any>
  ? TT extends TableNamesInDataModel<DM>
    ? {
        with?: WithSpec<DM, Relations, TT>;
        add?: (
          doc: DocumentByName<DM, TT> & AllRelationsResult<DM, Relations, TT>,
        ) => Record<string, unknown>;
        select?: (keyof DocumentByName<DM, TT> & string)[];
        omit?: (keyof DocumentByName<DM, TT> & string)[];
      }
    : never
  : Desc extends { targetTable: infer TT extends string }
    ? TT extends TableNamesInDataModel<DM>
      ? {
          with?: WithSpec<DM, Relations, TT>;
          add?: (
            doc: DocumentByName<DM, TT> & AllRelationsResult<DM, Relations, TT>,
          ) => Record<string, unknown>;
          filter?: (doc: DocumentByName<DM, TT>) => boolean;
          order?: "asc" | "desc";
          take?: number;
          select?: (keyof DocumentByName<DM, TT> & string)[];
          omit?: (keyof DocumentByName<DM, TT> & string)[];
        }
      : never
    : never;

// ---------------------------------------------------------------------------
// WithResult — computes the additional fields from a with spec
// ---------------------------------------------------------------------------

export type WithResult<
  DM extends GenericDataModel,
  Relations,
  TN extends string,
  W,
> = {
  [K in keyof W & keyof TableRelations<Relations, TN>]: ResolveRelationType<
    DM,
    Relations,
    TableRelations<Relations, TN>[K],
    W[K]
  >;
};

// ---------------------------------------------------------------------------
// ResolveRelationType — maps descriptor + nested spec → loaded type
// ---------------------------------------------------------------------------

type ResolveRelationType<DM extends GenericDataModel, Relations, Desc, Spec> =
  Desc extends OneDescriptor<infer TT, any>
    ? TT extends TableNamesInDataModel<DM>
      ? Spec extends { add: (...args: any[]) => infer A }
        ? Spec extends { with: infer NW }
          ?
              | (DocumentByName<DM, TT> & WithResult<DM, Relations, TT, NW> & A)
              | null
          : (DocumentByName<DM, TT> & A) | null
        : Spec extends { with: infer NW }
          ? (DocumentByName<DM, TT> & WithResult<DM, Relations, TT, NW>) | null
          : DocumentByName<DM, TT> | null
      : never
    : Desc extends ManyDescriptor<infer TT, any, any>
      ? TT extends TableNamesInDataModel<DM>
        ? Spec extends { add: (...args: any[]) => infer A }
          ? Spec extends { with: infer NW }
            ? (DocumentByName<DM, TT> & WithResult<DM, Relations, TT, NW> & A)[]
            : (DocumentByName<DM, TT> & A)[]
          : Spec extends { with: infer NW }
            ? (DocumentByName<DM, TT> & WithResult<DM, Relations, TT, NW>)[]
            : DocumentByName<DM, TT>[]
        : never
      : Desc extends ThroughDescriptor<infer TT, any>
        ? TT extends TableNamesInDataModel<DM>
          ? Spec extends { add: (...args: any[]) => infer A }
            ? Spec extends { with: infer NW }
              ? (DocumentByName<DM, TT> & {
                  pivot: Record<string, unknown>;
                } & WithResult<DM, Relations, TT, NW> &
                  A)[]
              : (DocumentByName<DM, TT> & {
                  pivot: Record<string, unknown>;
                } & A)[]
            : Spec extends { with: infer NW }
              ? (DocumentByName<DM, TT> & {
                  pivot: Record<string, unknown>;
                } & WithResult<DM, Relations, TT, NW>)[]
              : (DocumentByName<DM, TT> & { pivot: Record<string, unknown> })[]
          : never
        : never;
