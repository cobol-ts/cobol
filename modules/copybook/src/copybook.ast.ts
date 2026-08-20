export type CopybookAst = {
    metadata: any;
    entries: CopybookEntry[];
};

export type CopybookEntry =
    | GroupEntry
    | ElementaryEntry;

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
    | SynchronizedClause;

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
