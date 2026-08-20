# COBOL Copybook Parser

Parses COBOL copybooks into a small TypeScript AST for later layout analysis and lens generation.

The parser is intentionally **not a COBOL compiler**. Its job is to preserve the structure and declarations in a copybook, not to calculate byte offsets or interpret runtime storage.

## Pipeline

```text
copybook source
      ↓
fixed-format detection
      ↓
fixed-format preprocessing, if needed
      ↓
parser
      ↓
CopybookAst
      ↓
validator
      ↓
layout / semantic interpretation
      ↓
generated TypeScript lenses over Uint8Array
```

The important boundary is:

* **parser** — what did the copybook declare?
* **validator** — is this AST structurally and semantically valid?
* **layout/interpreter** — what does this mean in bytes?
* **code generator** — how do we expose those bytes to TypeScript?

---

## Main API

```ts
parseCopybook(
    source: string,
    metadata?: any,
): ErrorsOr<CopybookAst>
```

Example:

```ts
const result =
    parseCopybook(
        `
01 CUSTOMER.
    05 NAME PIC X(30).
    05 AGE PIC 999.
`,
        {
            file: "customer.cpy",
        },
    );
```

Metadata is passed through unchanged into the AST.

---

# Source formats

## Free format

Free-format COBOL can be parsed directly:

```cobol
01 CUSTOMER.
    05 NAME PIC X(30).
    05 AGE PIC 999.
```

## Fixed format

Traditional fixed-format COBOL uses physical columns:

| Columns | Meaning       |
| ------- | ------------- |
| 1–6     | sequence area |
| 7       | indicator     |
| 8–72    | COBOL source  |

Example:

```text
000100 01 CUSTOMER.
000200     05 NAME PIC X(30).
000300* THIS IS A COMMENT
000400     05 AGE PIC 999.
```

The fixed-format support is split into two functions.

### Detection

```ts
isFixedFormatCopybook(
    source: string[],
): boolean
```

The detector is deliberately conservative.

A false negative causes a parse failure. A false positive could silently strip the first seven characters from valid free-format source, which is much worse.

### Preprocessing

```ts
preprocessFixedCopybook(
    source: string[],
): string[]
```

It:

* removes columns 1–6;
* interprets column 7;
* keeps columns 8–72;
* removes `*` and `/` comment lines;
* handles `-` continuation;
* preserves the number of source lines using `""` placeholders.

Example:

```ts
preprocessFixedCopybook([
    "000100 01 CUSTOMER.",
    "000200* COMMENT",
    "000300     05 VERY-LONG-",
    "000400-NAME PIC X.",
])
```

returns:

```ts
[
    "01 CUSTOMER.",
    "",
    "    05 VERY-LONG-NAME PIC X.",
    "",
]
```

Preserving array length keeps later diagnostic line numbers stable.

---

# AST

The root type is:

```ts
type CopybookAst = {
    metadata: any
    entries: CopybookEntry[]
}
```

A copybook entry is either:

```ts
type CopybookEntry =
    | GroupEntry
    | ElementaryEntry
```

## Names

COBOL `FILLER` is represented explicitly:

```ts
type CopybookEntryName =
    | {
          kind: "named"
          name: string
      }
    | {
          kind: "filler"
      }
```

---

# Groups

A group contains subordinate entries:

```ts
type GroupEntry = {
    kind: "group"
    level: number
    name: CopybookEntryName
    clauses: CopybookClause[]
    children: CopybookEntry[]
    line: number
}
```

Example:

```cobol
01 CUSTOMER.
    05 ADDRESS.
        10 STREET PIC X(30).
        10 TOWN PIC X(20).
```

becomes:

```text
CUSTOMER
└── ADDRESS
    ├── STREET
    └── TOWN
```

Hierarchy is determined by COBOL level numbers.

The numeric levels do not need to be consecutive.

---

# Elementary entries

Elementary entries describe stored values:

```ts
type ElementaryEntry = {
    kind: "elementary"
    level: number
    name: CopybookEntryName
    picture?: string
    clauses: CopybookClause[]
    conditions: ConditionEntry[]
    line: number
}
```

A normal field with no level-88 conditions has:

```ts
conditions: []
```

Some elementary usages do not require a `PIC`.

---

# PICTURE

Supported forms include:

```cobol
PIC X(30)
PICTURE X(30)
PICTURE IS X(30)
```

The picture text is preserved rather than interpreted:

```ts
picture: "S9(11)V9(4)"
```

Edited pictures containing punctuation are also preserved:

```cobol
PIC $,$$,$9.99
PIC Z,ZZZ,ZZ9.99
PIC +ZZZ,ZZ9.99
```

For example:

```cobol
05 AMOUNT PIC Z,ZZZ,ZZ9.99.
```

contains:

```ts
picture: "Z,ZZZ,ZZ9.99"
```

Commas inside a PICTURE are therefore distinct from commas used as COBOL clause separators.

The parser does not interpret the picture into byte size, numeric semantics or editing behaviour.

That belongs to the later layout and type-analysis stage.

---

# USAGE

Supported forms include:

```cobol
05 VALUE-FIELD PIC 9(10) COMP-3.
05 VALUE-FIELD PIC 9(10) USAGE COMP-3.
05 VALUE-FIELD PIC 9(10) USAGE IS COMP-3.
```

AST:

```ts
{
    kind: "usage",
    usage: "COMP-3",
}
```

Currently recognised usages include:

```text
DISPLAY
COMP
COMP-1
COMP-2
COMP-3
COMP-4
COMP-5
COMPUTATIONAL
COMPUTATIONAL-1
COMPUTATIONAL-2
COMPUTATIONAL-3
COMPUTATIONAL-4
COMPUTATIONAL-5
BINARY
PACKED-DECIMAL
INDEX
POINTER
FUNCTION-POINTER
PROCEDURE-POINTER
```

Pictureless usages such as `POINTER` and `INDEX` are classified as elementary entries.

---

# REDEFINES

Example:

```cobol
05 NEW-VALUE REDEFINES OLD-VALUE PIC X(10).
```

AST:

```ts
{
    kind: "redefines",
    target: "OLD-VALUE",
}
```

The parser deliberately does **not**:

* resolve `OLD-VALUE`;
* calculate offsets;
* calculate storage size;
* decide how the two views share bytes.

That belongs to the AST interpreter/layout stage.

---

# OCCURS

## Fixed OCCURS

```cobol
05 ITEM PIC X(10) OCCURS 5 TIMES.
```

or:

```cobol
05 ITEM PIC X(10) OCCURS 5.
```

AST:

```ts
{
    kind: "occurs",
    count: 5,
}
```

`OCCURS` can appear on groups or elementary fields.

Nested `OCCURS` is represented naturally by the AST hierarchy.

## OCCURS DEPENDING ON

Both ranged and short forms are supported.

A ranged declaration:

```cobol
05 ITEMS PIC X
   OCCURS 0 TO 10000 TIMES
   DEPENDING ON ITEM-COUNT.
```

becomes:

```ts
{
    kind: "occurs",
    min: 0,
    max: 10000,
    dependingOn: "ITEM-COUNT",
}
```

The short form:

```cobol
05 ITEMS PIC X
   OCCURS 100
   DEPENDING ON ITEM-COUNT.
```

means a minimum of one occurrence and a maximum of 100:

```ts
{
    kind: "occurs",
    min: 1,
    max: 100,
    dependingOn: "ITEM-COUNT",
}
```

The parser preserves the name in `dependingOn`.

It does not resolve that name or determine runtime layout.

## OCCURS keys

`ASCENDING KEY` and `DESCENDING KEY` declarations are preserved as part of the OCCURS clause.

Example:

```cobol
05 ITEMS
   OCCURS 100
   ASCENDING KEY IS CATEGORY ITEM-CODE
   DESCENDING KEY IS EFFECTIVE-DATE.
```

Conceptually:

```ts
{
    kind: "occurs",
    count: 100,
    keys: [
        {
            order: "ascending",
            names: [
                "CATEGORY",
                "ITEM-CODE",
            ],
        },
        {
            order: "descending",
            names: [
                "EFFECTIVE-DATE",
            ],
        },
    ],
}
```

The parser preserves the declarations.

It does not resolve the key names or implement COBOL table ordering semantics.

## INDEXED BY

`INDEXED BY` is also preserved:

```cobol
05 ITEMS
   OCCURS 100
   INDEXED BY ITEM-INDEX SECONDARY-INDEX.
```

Conceptually:

```ts
{
    kind: "occurs",
    count: 100,
    indexedBy: [
        "ITEM-INDEX",
        "SECONDARY-INDEX",
    ],
}
```

Keys and indexes can be combined with both fixed OCCURS and OCCURS DEPENDING ON.

For example:

```cobol
05 ITEMS
   OCCURS 0 TO 100 TIMES
   DEPENDING ON ITEM-COUNT
   ASCENDING KEY IS ITEM-CODE
   INDEXED BY ITEM-INDEX.
```

The AST remains declarative: the parser records what COBOL declared and leaves interpretation to later stages.

---

# Level 88 conditions

Level 88 entries are conditions on an elementary field.

They are **not stored fields**.

Example:

```cobol
05 STATUS PIC X.
    88 ACTIVE VALUE 'A'.
    88 CLOSED VALUES 'C' 'X'.
    88 PENDING VALUE 'P' THRU 'R'.
```

Conceptually:

```ts
{
    kind: "elementary",
    name: {
        kind: "named",
        name: "STATUS",
    },
    picture: "X",
    conditions: [
        {
            kind: "condition",
            level: 88,
            name: {
                kind: "named",
                name: "ACTIVE",
            },
            values: [
                {
                    kind: "value",
                    value: "'A'",
                },
            ],
        },
        {
            kind: "condition",
            level: 88,
            name: {
                kind: "named",
                name: "CLOSED",
            },
            values: [
                {
                    kind: "value",
                    value: "'C'",
                },
                {
                    kind: "value",
                    value: "'X'",
                },
            ],
        },
        {
            kind: "condition",
            level: 88,
            name: {
                kind: "named",
                name: "PENDING",
            },
            values: [
                {
                    kind: "range",
                    from: "'P'",
                    to: "'R'",
                },
            ],
        },
    ],
}
```

Condition values are:

```ts
type ConditionValue =
    | {
          kind: "value"
          value: string
      }
    | {
          kind: "range"
          from: string
          to: string
      }
```

Supported forms include:

```cobol
VALUE 'A'
VALUES 'A' 'B' 'C'
VALUE IS 'A'
VALUES ARE 'A' 'B'
VALUE 1 THRU 9
VALUE 1 THROUGH 9
VALUES 1 3 THRU 7 9
VALUE ALL ' '
```

The parser rejects malformed level-88 declarations early.

Examples:

```text
missing VALUE / VALUES
missing value after VALUE
missing lower range value
missing upper range value
missing value after ALL
ordinary clauses after VALUE
FILLER used as the condition name
standalone level 88
```

---

# Other supported clauses

The AST currently includes:

```ts
type CopybookClause =
    | RedefinesClause
    | OccursClause
    | UsageClause
    | SignClause
    | ValueClause
    | JustifiedClause
    | BlankWhenZeroClause
    | SynchronizedClause
```

Examples:

```cobol
SIGN LEADING
SIGN TRAILING
SIGN IS LEADING SEPARATE
SIGN IS TRAILING SEPARATE CHARACTER
```

```cobol
VALUE 'A'
VALUE 100
```

```cobol
JUSTIFIED
JUST
JUSTIFIED RIGHT
JUST RIGHT
```

```cobol
BLANK WHEN ZERO
```

```cobol
SYNC
SYNC LEFT
SYNCHRONIZED RIGHT
```

Clause order is preserved.

Comma and semicolon separators are accepted.

---

# Comments and multiline declarations

Supported comments include:

```cobol
* full-line comment
```

and:

```cobol
*> inline comment
```

Comment markers inside quoted literals are preserved:

```cobol
05 TEXT PIC X(20) VALUE "A *> B".
```

Declarations can span physical lines:

```cobol
05 BALANCE
   PIC S9(9)V99
   COMP-3.
```

The parser joins them into a logical statement before clause parsing.

---

# Levels

Supported normal levels are:

```text
01–49
77
88
```

## Level 77

Level 77 is treated as a standalone root elementary entry.

## Level 88

Level 88 is handled as a condition attached to an elementary entry.

## Level 66

Level 66 `RENAMES` is currently unsupported.

Example:

```cobol
66 ALTERNATIVE RENAMES A THRU B.
```

The parser returns an explicit error.

`RENAMES` can be added later if production copybooks require it.

---

# COPY

`COPY` is currently unsupported:

```cobol
COPY CUSTOMER.
```

The parser returns an explicit error rather than silently ignoring it.

COPY expansion can be added when the production corpus requires it.

---

# Entry classification

An entry becomes elementary when it has:

* a `PIC`; or
* a supported pictureless elementary `USAGE`.

An entry with subordinate entries becomes a group.

A leaf with neither `PIC` nor an elementary-only usage is represented as an empty group.

The parser rejects inconsistent structures such as:

```cobol
05 VALUE-FIELD PIC X.
    10 CHILD PIC X.
```

because a PIC-bearing item cannot also contain subordinate data items.

---

# Validation

`validateCopybook` validates an already-created AST.

The parser and validator have different responsibilities.

## Parser

Catches syntax that is locally knowable from the source.

Examples:

```text
bad OCCURS syntax
malformed level 88 VALUE
unsupported level number
unsupported COPY
unsupported level 66
```

## Validator

Checks runtime AST shape and semantic invariants.

Examples:

```text
invalid entry kind
invalid level
invalid source line
invalid clause shape
duplicate singleton clauses
invalid OCCURS count
invalid OCCURS minimum or maximum
OCCURS minimum greater than maximum
OCCURS on level 01 or 77
empty OCCURS DEPENDING ON name
invalid or empty OCCURS keys
invalid or empty INDEXED BY names
elementary entry with neither PIC nor elementary-only USAGE
elementary-only USAGE on a group
invalid condition shape
FILLER condition name
empty condition value array
```

Dependent semantic errors are suppressed when their inputs are already invalid.

For example, if an OCCURS maximum is itself invalid, validation reports that error rather than also reporting that the minimum exceeds the invalid maximum.

The validator recursively checks group children.

---

# Diagnostics

Parser diagnostics include source context.

Example:

```text
Invalid OCCURS count 'BANANA' at line 3

  2 |     05 BEFORE PIC X.
> 3 |     05 BAD PIC X OCCURS BANANA.
  4 |     05 AFTER PIC X.
```

Where recovery is possible, errors from multiple declarations are aggregated.

The fixed-format preprocessor preserves line count so later diagnostics do not drift simply because comments or continuation lines were removed.

---

# Testing philosophy

Parser and validator tests use exact equality.

For ASTs:

```ts
expect(ast.entries).toEqual([
    // complete expected AST
]);
```

For diagnostics:

```ts
expect(errors).toEqual([
    // complete ordered diagnostic strings
]);
```

The intention is that the AST and diagnostics are contracts.

Adding, removing or reordering fields or errors should fail the relevant tests.

---

# Current scope

## Supported

* groups and elementary fields;
* levels 01–49;
* level 77;
* level 88;
* `FILLER`;
* `PIC` / `PICTURE`;
* edited PICTURE strings containing commas and other editing characters;
* supported `USAGE` forms;
* `REDEFINES`;
* fixed `OCCURS`;
* `OCCURS n DEPENDING ON name`;
* `OCCURS ... TO ... DEPENDING ON ...`;
* `ASCENDING KEY`;
* `DESCENDING KEY`;
* `INDEXED BY`;
* `SIGN`;
* `VALUE`;
* `JUSTIFIED`;
* `BLANK WHEN ZERO`;
* `SYNCHRONIZED`;
* comments;
* multiline declarations;
* comma and semicolon clause separators;
* fixed-format detection and preprocessing.

## Explicitly unsupported or incomplete

* `COPY`;
* level 66 `RENAMES`;
* COBOL syntax not yet encountered in the production corpus.

The policy is to fail explicitly on unsupported syntax and add it when real copybooks require it.

---

# Design principle

The parser should remain small and declarative.

For example:

```text
REDEFINES
```

becomes:

```ts
{
    kind: "redefines",
    target: "OLD-VALUE",
}
```

not:

```text
resolved byte offset
shared storage calculation
generated runtime accessor
```

Likewise:

```text
OCCURS DEPENDING ON
```

records the declaration, while dynamic layout is handled later.

`ASCENDING KEY`, `DESCENDING KEY` and `INDEXED BY` follow the same rule: their declarations are preserved in the AST without attempting to implement their runtime semantics.

This keeps parsing independent from byte layout and makes the AST useful as the stable boundary between COBOL source and the rest of the system.
