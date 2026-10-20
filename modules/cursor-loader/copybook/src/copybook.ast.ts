export type CopybookAst = {
    metadata: any;
    entries: CopybookEntry[];
};

export type CopybookEntry =
    | GroupEntry
    | ElementaryEntry
    | RenamesEntry
    | ConstantEntry;

export type CopybookEntryName =
    | {
    kind: "named";
    name: string;
}
    | {
    kind: "filler";
};

export type GroupEntry = {
    kind: "group";
    level: number;
    name: CopybookEntryName;
    clauses: CopybookClause[];
    children: CopybookEntry[];
    line: number;
};

export type ElementaryEntry = {
    kind: "elementary";
    level: number;
    name: CopybookEntryName;
    picture?: string;
    clauses: CopybookClause[];
    conditions: ConditionEntry[];
    line: number;
};

/** Level 66: an alias for a contiguous range; occupies no additional storage. */
export type RenamesEntry = {
    kind: "renames";
    level: 66;
    name: CopybookEntryName;
    from: string;
    through?: string;
    line: number;
};

/** Level 78: a compile-time constant; occupies no record storage. */
export type ConstantEntry = {
    kind: "constant";
    level: 78;
    name: CopybookEntryName;
    value: string;
    line: number;
};

export type ConditionEntry = {
    kind: "condition";
    level: 88;
    name: CopybookEntryName;
    values: ConditionValue[];
    line: number;
};

export type ConditionValue =
    | {
    kind: "value";
    value: string;
}
    | {
    kind: "range";
    from: string;
    to: string;
};

export type CopybookClause =
    | RedefinesClause
    | OccursClause
    | UsageClause
    | SignClause
    | ValueClause
    | JustifiedClause
    | BlankWhenZeroClause
    | SynchronizedClause
    | ByteLengthClause
    | DynamicLengthClause;

export type RedefinesClause = {
    kind: "redefines";
    target: string;
};

export type OccursKey = {
    order: "ascending" | "descending";
    names: string[];
};

type OccursDetails = {
    keys?: OccursKey[];
    indexedBy?: string[];
};

export type OccursClause = (
    | {
    kind: "occurs";
    count: number;
}
    | {
    kind: "occurs";
    min: number;
    max: number;
    dependingOn: string;
}
) & OccursDetails;

export type UsageClause = {
    kind: "usage";
    usage: string;
};

export type SignClause = {
    kind: "sign";
    position?: "leading" | "trailing";
    separate?: boolean;
};

export type ValueClause = {
    kind: "value";
    value: string;
};

export type JustifiedClause = {
    kind: "justified";
};

export type BlankWhenZeroClause = {
    kind: "blank-when-zero";
};

export type SynchronizedClause = {
    kind: "synchronized";
    position?: "left" | "right";
};

/** PIC U BYTE-LENGTH n: fixed n-byte UTF-8 representation. */
export type ByteLengthClause = {kind: "byte-length"; bytes: number};

/** Runtime-managed storage, not an inline FD record field. */
export type DynamicLengthClause = {kind: "dynamic-length"; limit?: number};
