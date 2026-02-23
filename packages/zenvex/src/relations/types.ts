// ---------------------------------------------------------------------------
// Descriptor types — plain data produced by builders, resolved by defineRelations
// ---------------------------------------------------------------------------

export type OnDeleteAction = "cascade" | "setNull" | "restrict" | "noAction";

export interface OneDescriptor<
  TargetTable extends string = string,
  ForeignKey extends string = string,
> {
  readonly type: "one";
  readonly targetTable: TargetTable;
  readonly foreignKey: ForeignKey;
  readonly optional: boolean;
}

export interface ManyDescriptor<
  TargetTable extends string = string,
  IndexName extends string = string,
  ForeignKey extends string = string,
> {
  readonly type: "many";
  readonly targetTable: TargetTable;
  readonly index: IndexName;
  readonly foreignKey: ForeignKey;
  readonly onDelete?: OnDeleteAction;
}

export interface ThroughDescriptor<
  TargetTable extends string = string,
  JoinTable extends string = string,
> {
  readonly type: "through";
  readonly targetTable: TargetTable;
  readonly joinTable: JoinTable;
  readonly sourceField: string;
  readonly targetField: string;
  readonly index: string;
  readonly onDelete?: OnDeleteAction;
}

export type RelationDescriptor = OneDescriptor | ManyDescriptor | ThroughDescriptor;
