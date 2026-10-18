import {
    valueOrThrow,
    errorsOrThrow
} from "@cobol-ts/errors";

import {
    CopybookAst,
    CopybookClause,
    ElementaryEntry,
    GroupEntry, parseCopybook
} from "@cobol-ts/copybook";

import {permissiveOverlayAlignment} from "./cobol.overlay.alignment";

import {
    compileCobolLayout,
    type CompiledCobolEntry,
    type CompiledCobolGroup
} from "./cobol.layout";

const named = (name: string) => ({
    kind: "named" as const,
    name
});

const sync = (): CopybookClause => ({
    kind: "synchronized"
});

const usage = (name: string): CopybookClause => ({
    kind: "usage",
    usage: name
});

function elementary(
    name: string,
    picture: string,
    line: number,
    clauses: CopybookClause[] = [],
    level = 5
): ElementaryEntry {
    return {
        kind: "elementary",
        level,
        name: named(name),
        picture,
        clauses,
        conditions: [],
        line
    };
}

function group(
    name: string,
    children: (GroupEntry | ElementaryEntry)[],
    clauses: CopybookClause[] = [],
    level = 1,
    line = 1
): GroupEntry {
    return {
        kind: "group",
        level,
        name: named(name),
        clauses,
        children,
        line
    };
}

function ast(root: GroupEntry): CopybookAst {
    return {
        metadata: {},
        entries: [root]
    };
}

function compile(root: GroupEntry) {
    return valueOrThrow(
        compileCobolLayout(ast(root), "test.cpy")
    );
}

function asGroup(
    entry: CompiledCobolEntry
): CompiledCobolGroup {
    if (entry.kind !== "group") {
        throw new Error(
            `Expected group, received ${entry.kind}`
        );
    }
    return entry;
}

function geometry(entry: CompiledCobolEntry) {
    return {
        kind: entry.kind,
        size: entry.size,
        leftOffset: entry.leftOffset,
        rightOffset: entry.rightOffset
    };
}

describe("compileCobolLayout", () => {

    describe("fixed elementary storage", () => {

        // 01 CUSTOMER.
        //    05 AGE PIC 9(3).
        //    05 NAME PIC X(10).
        //    05 ACTIVE PIC X.
        test("calculates constant sizes and both offsets", () => {
            const age = elementary("AGE", "9(3)", 2);
            const root = asGroup(compile(group("CUSTOMER", [
                age,
                elementary("NAME", "X(10)", 3),
                elementary("ACTIVE", "X", 4)
            ]))[0]);

            expect(root.size).toBe(112);

            expect(root.children.map(geometry)).toEqual([
                {
                    kind: "elementary",
                    size: 24,
                    leftOffset: 0,
                    rightOffset: 88
                },
                {
                    kind: "elementary",
                    size: 80,
                    leftOffset: 24,
                    rightOffset: 8
                },
                {
                    kind: "elementary",
                    size: 8,
                    leftOffset: 104,
                    rightOffset: 0
                }
            ]);

            expect(root.children[0].kind).toBe("elementary");
            if (root.children[0].kind === "elementary") {
                expect(root.children[0].source).toBe(age);
            }
        });

        // 01 CUSTOMER.
        //    05 PREFIX PIC X(2).
        //    05 DETAILS.
        //       10 CODE PIC X.
        //       10 AMOUNT PIC 9(3).
        //    05 SUFFIX PIC X.
        test("preserves parent-relative group offsets", () => {
            const details = group("DETAILS", [
                elementary("CODE", "X", 4, [], 10),
                elementary("AMOUNT", "9(3)", 5, [], 10)
            ], [], 5, 3);

            const root = asGroup(compile(group("CUSTOMER", [
                elementary("PREFIX", "X(2)", 2),
                details,
                elementary("SUFFIX", "X", 6)
            ]))[0]);

            expect(root.size).toBe(56);

            expect(root.children.map(c => [
                c.size,
                c.leftOffset,
                c.rightOffset
            ])).toEqual([
                [16, 0, 40],
                [32, 16, 8],
                [8, 48, 0]
            ]);

            const nested = asGroup(root.children[1]);

            expect(nested.source).toBe(details);
            expect(nested.children.map(c => [
                c.size,
                c.leftOffset,
                c.rightOffset
            ])).toEqual([
                [8, 0, 24],
                [24, 8, 0]
            ]);
        });
    });

    describe("SYNCHRONIZED elementary fields", () => {

        // 01 RECORD.
        //    05 CODE PIC X.
        //    05 AMOUNT PIC S9(9) COMP SYNC.
        //    05 TRAILER PIC X.
        //
        // Byte layout:
        // 0       CODE
        // 1-3     PADDING
        // 4-7     AMOUNT
        // 8       TRAILER
        test("inserts padding before a fullword field", () => {
            const root = asGroup(compile(group("RECORD", [
                elementary("CODE", "X", 2),
                elementary("AMOUNT", "S9(9)", 3, [
                    usage("COMP"), sync()
                ]),
                elementary("TRAILER", "X", 4)
            ]))[0]);

            expect(root.size).toBe(72);

            expect(root.children.map(geometry)).toEqual([
                {
                    kind: "elementary",
                    size: 8,
                    leftOffset: 0,
                    rightOffset: 64
                },
                {
                    kind: "padding",
                    size: 24,
                    leftOffset: 8,
                    rightOffset: 40
                },
                {
                    kind: "elementary",
                    size: 32,
                    leftOffset: 32,
                    rightOffset: 8
                },
                {
                    kind: "elementary",
                    size: 8,
                    leftOffset: 64,
                    rightOffset: 0
                }
            ]);
        });

        // 01 RECORD.
        //    05 PREFIX PIC X(4).
        //    05 AMOUNT PIC S9(9) COMP SYNC.
        //
        // AMOUNT already starts at a fullword boundary.
        test("does not insert unnecessary padding", () => {
            const root = asGroup(compile(group("RECORD", [
                elementary("PREFIX", "X(4)", 2),
                elementary("AMOUNT", "S9(9)", 3, [
                    usage("COMP"), sync()
                ])
            ]))[0]);

            expect(root.size).toBe(64);
            expect(root.children.map(c => c.kind)).toEqual([
                "elementary",
                "elementary"
            ]);

            expect(root.children[1].leftOffset).toBe(32);
        });

        // 01 RECORD.
        //    05 PREFIX PIC X.
        //    05 AMOUNT PIC S9(4) COMP SYNC.
        //
        // Halfword alignment requires one padding byte.
        test("uses a halfword boundary for four digits", () => {
            const root = asGroup(compile(group("RECORD", [
                elementary("PREFIX", "X", 2),
                elementary("AMOUNT", "S9(4)", 3, [
                    usage("COMP"), sync()
                ])
            ]))[0]);

            expect(root.size).toBe(32);
            expect(root.children.map(c => [
                c.kind,
                c.size,
                c.leftOffset,
                c.rightOffset
            ])).toEqual([
                ["elementary", 8, 0, 24],
                ["padding", 8, 8, 16],
                ["elementary", 16, 16, 0]
            ]);
        });

        // 01 RECORD.
        //    05 PREFIX PIC X.
        //    05 AMOUNT PIC S9(18) COMP-5 SYNC.
        //
        // Eight-byte storage, four-byte alignment.
        test("does not confuse storage width with alignment", () => {
            const root = asGroup(compile(group("RECORD", [
                elementary("PREFIX", "X", 2),
                elementary("AMOUNT", "S9(18)", 3, [
                    usage("COMP-5"), sync()
                ])
            ]))[0]);

            expect(root.size).toBe(96);
            expect(root.children.map(c => [
                c.kind,
                c.size,
                c.leftOffset
            ])).toEqual([
                ["elementary", 8, 0],
                ["padding", 24, 8],
                ["elementary", 64, 32]
            ]);
        });
    });

    describe("nested group padding ownership", () => {

        // CASE A
        //
        // 01 RECORD.
        //    05 PREFIX PIC X(2).
        //    05 DETAILS.
        //       10 CODE PIC X.
        //       10 AMOUNT PIC S9(9) COMP SYNC.
        //
        // PREFIX  0-1
        // DETAILS 2-7
        //   CODE  2
        //   PAD   3
        //   AMOUNT 4-7
        //
        // Padding belongs INSIDE DETAILS.
        test("Case A: padding belongs to the nested group", () => {
            const root = asGroup(compile(group("RECORD", [
                elementary("PREFIX", "X(2)", 2),
                group("DETAILS", [
                    elementary("CODE", "X", 4, [], 10),
                    elementary("AMOUNT", "S9(9)", 5, [
                        usage("COMP"), sync()
                    ], 10)
                ], [], 5, 3)
            ]))[0]);

            expect(root.size).toBe(64);
            expect(root.children.map(c => c.kind)).toEqual([
                "elementary",
                "group"
            ]);

            const details = asGroup(root.children[1]);

            expect(details.size).toBe(48);
            expect(details.leftOffset).toBe(16);
            expect(details.rightOffset).toBe(0);

            expect(details.children.map(geometry)).toEqual([
                {
                    kind: "elementary",
                    size: 8,
                    leftOffset: 0,
                    rightOffset: 40
                },
                {
                    kind: "padding",
                    size: 8,
                    leftOffset: 8,
                    rightOffset: 32
                },
                {
                    kind: "elementary",
                    size: 32,
                    leftOffset: 16,
                    rightOffset: 0
                }
            ]);
        });

        // CASE B
        //
        // 01 RECORD.
        //    05 PREFIX PIC X(3).
        //    05 DETAILS.
        //       10 AMOUNT PIC S9(9) COMP SYNC.
        //
        // PREFIX  0-2
        // PAD     3
        // DETAILS 4-7
        //   AMOUNT 4-7
        //
        // Padding belongs to RECORD, not DETAILS.
        test("Case B: padding belongs to the parent group", () => {
            const root = asGroup(compile(group("RECORD", [
                elementary("PREFIX", "X(3)", 2),
                group("DETAILS", [
                    elementary("AMOUNT", "S9(9)", 4, [
                        usage("COMP"), sync()
                    ], 10)
                ], [], 5, 3)
            ]))[0]);

            expect(root.size).toBe(64);

            expect(root.children.map(geometry)).toEqual([
                {
                    kind: "elementary",
                    size: 24,
                    leftOffset: 0,
                    rightOffset: 40
                },
                {
                    kind: "padding",
                    size: 8,
                    leftOffset: 24,
                    rightOffset: 32
                },
                {
                    kind: "group",
                    size: 32,
                    leftOffset: 32,
                    rightOffset: 0
                }
            ]);

            const details = asGroup(root.children[2]);

            expect(details.children).toHaveLength(1);
            expect(details.children[0].kind).toBe("elementary");
            expect(details.children[0].leftOffset).toBe(0);
            expect(details.children[0].rightOffset).toBe(0);
        });

        // 01 RECORD.
        //    05 PREFIX PIC X(3).
        //    05 OUTER.
        //       10 INNER.
        //          15 AMOUNT PIC S9(9) COMP SYNC.
        //
        // Initial padding belongs to RECORD, not either
        // of the two nested groups.
        test("moves padding out through multiple group levels", () => {
            const root = asGroup(compile(group("RECORD", [
                elementary("PREFIX", "X(3)", 2),
                group("OUTER", [
                    group("INNER", [
                        elementary("AMOUNT", "S9(9)", 5, [
                            usage("COMP"), sync()
                        ], 15)
                    ], [], 10, 4)
                ], [], 5, 3)
            ]))[0]);

            expect(root.children.map(c => c.kind)).toEqual([
                "elementary",
                "padding",
                "group"
            ]);

            expect(root.children[1].size).toBe(8);

            const outer = asGroup(root.children[2]);
            const inner = asGroup(outer.children[0]);

            expect(outer.size).toBe(32);
            expect(outer.children).toHaveLength(1);
            expect(inner.size).toBe(32);
            expect(inner.children).toHaveLength(1);
            expect(inner.children[0].leftOffset).toBe(0);
        });
    });

    describe("inherited clauses", () => {

        // 01 RECORD.
        //    05 PREFIX PIC X.
        //    05 DETAILS USAGE COMP SYNC.
        //       10 COUNT PIC S9(9).
        //
        // The group supplies both USAGE and SYNCHRONIZED
        // to its elementary descendant.
        test("inherits USAGE and SYNCHRONIZED", () => {
            const root = asGroup(compile(group("RECORD", [
                elementary("PREFIX", "X", 2),
                group("DETAILS", [
                    elementary("COUNT", "S9(9)", 4, [], 10)
                ], [
                    usage("COMP"),
                    sync()
                ], 5, 3)
            ]))[0]);

            expect(root.size).toBe(64);

            expect(root.children.map(c => [
                c.kind,
                c.size,
                c.leftOffset
            ])).toEqual([
                ["elementary", 8, 0],
                ["padding", 24, 8],
                ["group", 32, 32]
            ]);

            const details = asGroup(root.children[2]);

            expect(details.children).toHaveLength(1);
            expect(details.children[0].size).toBe(32);
            expect(details.children[0].leftOffset).toBe(0);
        });
    });

    describe("unsupported layout features", () => {

        
        // 01 RECORD.
//    05 ITEM-COUNT PIC 9.
//    05 ITEMS OCCURS 0 TO 9 TIMES
//       DEPENDING ON ITEM-COUNT.
//       10 ITEM PIC X.
        test("compiles a simple OCCURS DEPENDING ON symbolically", () => {
            const items = group("ITEMS", [
                elementary("ITEM", "X", 4, [], 10)
            ], [{
                kind: "occurs",
                min: 0,
                max: 9,
                dependingOn: "ITEM-COUNT"
            }], 5, 3);

            const layout = compile(group("RECORD", [
                elementary("ITEM-COUNT", "9", 2),
                items
            ]));
            const record = asGroup(layout[0]);
            const table = asGroup(record.children[1]);
            expect(table.size).toEqual({
                kind: "depending-on",
                path: ["RECORD", "ITEM-COUNT"],
                expression: 8
            });
            expect(table.leftOffset).toBe(8);
            expect(table.rightOffset).toBe(0);
        });
    });

function compileCopybook(copybook: string): readonly CompiledCobolEntry[] {
    const ast = valueOrThrow(parseCopybook(copybook));

    return valueOrThrow(
        compileCobolLayout(ast, "test.cpy")
    );
}

    describe("additional SYNCHRONIZED layout cases", () => {

    describe("absolute alignment within nested groups", () => {

        // 01 RECORD.
        //    05 PREFIX PIC X(5).
        //    05 DETAILS.
        //       10 CODE PIC X(2).
        //       10 AMOUNT PIC S9(9) COMP SYNC.
        //
        // Physical layout:
        // PREFIX  bytes 0-4
        // DETAILS starts at byte 5
        //   CODE  bytes 5-6
        //   PAD   byte 7
        //   AMOUNT bytes 8-11
        //
        // Padding must be calculated from the absolute
        // physical offset, not the group-relative offset.
        test("aligns using the absolute record position", () => {
            const layout = compileCopybook(`
       01 RECORD.
          05 PREFIX PIC X(5).
          05 DETAILS.
             10 CODE PIC X(2).
             10 AMOUNT PIC S9(9) COMP SYNC.
            `);

            const record = asGroup(layout[0]);
            const details = asGroup(record.children[1]);

            expect(record.size).toBe(96);
            expect(details.size).toBe(56);
            expect(details.leftOffset).toBe(40);

            expect(details.children.map(geometry)).toEqual([
                {
                    kind: "elementary",
                    size: 16,
                    leftOffset: 0,
                    rightOffset: 40
                },
                {
                    kind: "padding",
                    size: 8,
                    leftOffset: 16,
                    rightOffset: 32
                },
                {
                    kind: "elementary",
                    size: 32,
                    leftOffset: 24,
                    rightOffset: 0
                }
            ]);
        });
    });

    describe("combined external and internal padding", () => {

        // 01 RECORD.
        //    05 PREFIX PIC X(3).
        //    05 DETAILS.
        //       10 FIRST PIC S9(9) COMP SYNC.
        //       10 CODE PIC X.
        //       10 SECOND PIC S9(9) COMP SYNC.
        //
        // Physical layout:
        // PREFIX  bytes 0-2
        // PAD     byte 3             (owned by RECORD)
        // DETAILS bytes 4-15
        //   FIRST  bytes 4-7
        //   CODE   byte 8
        //   PAD    bytes 9-11        (owned by DETAILS)
        //   SECOND bytes 12-15
        //
        // The two padding regions have different owners.
        test("places padding at both ownership levels", () => {
            const layout = compileCopybook(`
       01 RECORD.
          05 PREFIX PIC X(3).
          05 DETAILS.
             10 FIRST PIC S9(9) COMP SYNC.
             10 CODE PIC X.
             10 SECOND PIC S9(9) COMP SYNC.
            `);

            const record = asGroup(layout[0]);

            expect(record.size).toBe(128);

            expect(record.children.map(geometry)).toEqual([
                {
                    kind: "elementary",
                    size: 24,
                    leftOffset: 0,
                    rightOffset: 104
                },
                {
                    kind: "padding",
                    size: 8,
                    leftOffset: 24,
                    rightOffset: 96
                },
                {
                    kind: "group",
                    size: 96,
                    leftOffset: 32,
                    rightOffset: 0
                }
            ]);

            const details = asGroup(record.children[2]);

            expect(details.children.map(geometry)).toEqual([
                {
                    kind: "elementary",
                    size: 32,
                    leftOffset: 0,
                    rightOffset: 64
                },
                {
                    kind: "elementary",
                    size: 8,
                    leftOffset: 32,
                    rightOffset: 56
                },
                {
                    kind: "padding",
                    size: 24,
                    leftOffset: 40,
                    rightOffset: 32
                },
                {
                    kind: "elementary",
                    size: 32,
                    leftOffset: 64,
                    rightOffset: 0
                }
            ]);
        });
    });

    describe("unsynchronized binary fields", () => {

        // 01 RECORD.
        //    05 PREFIX PIC X.
        //    05 AMOUNT PIC S9(9) COMP.
        //
        // Physical layout:
        // PREFIX byte 0
        // AMOUNT bytes 1-4
        //
        // Without SYNC, COMP storage does not automatically
        // insert alignment padding.
        test("does not align an unsynchronized binary field", () => {
            const layout = compileCopybook(`
       01 RECORD.
          05 PREFIX PIC X.
          05 AMOUNT PIC S9(9) COMP.
            `);

            const record = asGroup(layout[0]);

            expect(record.size).toBe(40);

            expect(record.children.map(geometry)).toEqual([
                {
                    kind: "elementary",
                    size: 8,
                    leftOffset: 0,
                    rightOffset: 32
                },
                {
                    kind: "elementary",
                    size: 32,
                    leftOffset: 8,
                    rightOffset: 0
                }
            ]);
        });
    });

    describe("ordinary group trailing padding", () => {

        // 01 RECORD.
        //    05 DETAILS.
        //       10 CODE PIC X.
        //       10 AMOUNT PIC S9(9) COMP SYNC.
        //    05 TRAILER PIC X.
        //
        // Physical layout:
        // DETAILS bytes 0-7
        //   CODE  byte 0
        //   PAD   bytes 1-3
        //   AMOUNT bytes 4-7
        // TRAILER byte 8
        //
        // DETAILS does not acquire trailing padding.
        test("places the following sibling immediately after the group", () => {
            const layout = compileCopybook(`
       01 RECORD.
          05 DETAILS.
             10 CODE PIC X.
             10 AMOUNT PIC S9(9) COMP SYNC.
          05 TRAILER PIC X.
            `);

            const record = asGroup(layout[0]);
            const details = asGroup(record.children[0]);

            expect(details.size).toBe(64);
            expect(record.size).toBe(72);

            expect(record.children.map(geometry)).toEqual([
                {
                    kind: "group",
                    size: 64,
                    leftOffset: 0,
                    rightOffset: 8
                },
                {
                    kind: "elementary",
                    size: 8,
                    leftOffset: 64,
                    rightOffset: 0
                }
            ]);

            expect(details.children.map(c => c.kind)).toEqual([
                "elementary",
                "padding",
                "elementary"
            ]);
        });

        // 01 RECORD.
        //    05 DETAILS.
        //       10 AMOUNT PIC S9(9) COMP SYNC.
        //       10 CODE PIC X.
        //    05 TRAILER PIC X.
        //
        // Physical layout:
        // DETAILS bytes 0-4 (5 bytes)
        //   AMOUNT bytes 0-3
        //   CODE   byte 4
        // TRAILER byte 5
        //
        // The next field begins immediately at byte 5.
        // No rounding of DETAILS to an 8-byte or 4-byte
        // multiple is permitted for an ordinary group.
        test("does not round a group's final extent", () => {
            const layout = compileCopybook(`
       01 RECORD.
          05 DETAILS.
             10 AMOUNT PIC S9(9) COMP SYNC.
             10 CODE PIC X.
          05 TRAILER PIC X.
            `);

            const record = asGroup(layout[0]);
            const details = asGroup(record.children[0]);

            expect(details.size).toBe(40);
            expect(record.size).toBe(48);

            expect(record.children.map(geometry)).toEqual([
                {
                    kind: "group",
                    size: 40,
                    leftOffset: 0,
                    rightOffset: 8
                },
                {
                    kind: "elementary",
                    size: 8,
                    leftOffset: 40,
                    rightOffset: 0
                }
            ]);

            expect(details.children.map(geometry)).toEqual([
                {
                    kind: "elementary",
                    size: 32,
                    leftOffset: 0,
                    rightOffset: 8
                },
                {
                    kind: "elementary",
                    size: 8,
                    leftOffset: 32,
                    rightOffset: 0
                }
            ]);
        });
    });
    }); // additional SYNCHRONIZED layout cases

    describe("fixed OCCURS", () => {

    describe("elementary repetition", () => {

        // 01 RECORD.
        //    05 PREFIX PIC X(2).
        //    05 ITEMS PIC X(4) OCCURS 3 TIMES.
        //    05 TRAILER PIC X.
        //
        // PREFIX  bytes 0-1
        // ITEMS   bytes 2-13 (3 × 4 bytes)
        // TRAILER byte 14
        //
        // The elementary entry has a total size of 12 bytes.
        test("repeats an elementary field without expanding it", () => {
            const layout = compileCopybook(`
       01 RECORD.
          05 PREFIX PIC X(2).
          05 ITEMS PIC X(4) OCCURS 3 TIMES.
          05 TRAILER PIC X.
            `);

            const record = asGroup(layout[0]);

            expect(record.size).toBe(120);

            expect(record.children.map(geometry)).toEqual([
                {
                    kind: "elementary",
                    size: 16,
                    leftOffset: 0,
                    rightOffset: 104
                },
                {
                    kind: "elementary",
                    size: 96,
                    leftOffset: 16,
                    rightOffset: 8
                },
                {
                    kind: "elementary",
                    size: 8,
                    leftOffset: 112,
                    rightOffset: 0
                }
            ]);

            expect(record.children).toHaveLength(3);
        });

        // 01 RECORD.
        //    05 ITEMS PIC X(4) OCCURS 1 TIMES.
        //    05 TRAILER PIC X.
        //
        // A single occurrence occupies the ordinary field size.
        test("handles OCCURS 1 TIMES", () => {
            const layout = compileCopybook(`
       01 RECORD.
          05 ITEMS PIC X(4) OCCURS 1 TIMES.
          05 TRAILER PIC X.
            `);

            const record = asGroup(layout[0]);

            expect(record.size).toBe(40);

            expect(record.children.map(c => [
                c.size,
                c.leftOffset,
                c.rightOffset
            ])).toEqual([
                [32, 0, 8],
                [8, 32, 0]
            ]);
        });
    });

    describe("group repetition", () => {

        // 01 RECORD.
        //    05 PREFIX PIC X(2).
        //    05 ITEMS OCCURS 3 TIMES.
        //       10 CODE PIC X(4).
        //       10 VALUE PIC 9(2).
        //    05 TRAILER PIC X.
        //
        // One ITEMS occurrence = 6 bytes.
        // Three occurrences = 18 bytes.
        //
        // PREFIX  bytes 0-1
        // ITEMS   bytes 2-19
        // TRAILER byte 20
        test("repeats a group without expanding its children", () => {
            const layout = compileCopybook(`
       01 RECORD.
          05 PREFIX PIC X(2).
          05 ITEMS OCCURS 3 TIMES.
             10 CODE PIC X(4).
             10 VALUE PIC 9(2).
          05 TRAILER PIC X.
            `);

            const record = asGroup(layout[0]);
            const items = asGroup(record.children[1]);

            expect(record.size).toBe(168);

            expect(record.children.map(geometry)).toEqual([
                {
                    kind: "elementary",
                    size: 16,
                    leftOffset: 0,
                    rightOffset: 152
                },
                {
                    kind: "group",
                    size: 144,
                    leftOffset: 16,
                    rightOffset: 8
                },
                {
                    kind: "elementary",
                    size: 8,
                    leftOffset: 160,
                    rightOffset: 0
                }
            ]);

            expect(items.children).toHaveLength(2);

            expect(items.children.map(geometry)).toEqual([
                {
                    kind: "elementary",
                    size: 32,
                    leftOffset: 0,
                    rightOffset: 16
                },
                {
                    kind: "elementary",
                    size: 16,
                    leftOffset: 32,
                    rightOffset: 0
                }
            ]);
        });
    });

    describe("nested fixed repetition", () => {

        // 01 RECORD.
        //    05 BLOCKS OCCURS 2 TIMES.
        //       10 HEADER PIC X.
        //       10 ITEMS PIC X(3) OCCURS 4 TIMES.
        //       10 FOOTER PIC X.
        //    05 TRAILER PIC X.
        //
        // Inner ITEMS: 4 × 3 = 12 bytes.
        // One BLOCKS occurrence: 1 + 12 + 1 = 14 bytes.
        // Two BLOCKS occurrences: 28 bytes.
        // RECORD: 28 + 1 = 29 bytes.
        //
        // No occurrence bodies should be expanded in the tree.
        test("compiles nested fixed repetitions", () => {
            const layout = compileCopybook(`
       01 RECORD.
          05 BLOCKS OCCURS 2 TIMES.
             10 HEADER PIC X.
             10 ITEMS PIC X(3) OCCURS 4 TIMES.
             10 FOOTER PIC X.
          05 TRAILER PIC X.
            `);

            const record = asGroup(layout[0]);
            const blocks = asGroup(record.children[0]);

            expect(record.size).toBe(232);
            expect(blocks.size).toBe(224);
            expect(blocks.children).toHaveLength(3);

            expect(blocks.children.map(geometry)).toEqual([
                {
                    kind: "elementary",
                    size: 8,
                    leftOffset: 0,
                    rightOffset: 104
                },
                {
                    kind: "elementary",
                    size: 96,
                    leftOffset: 8,
                    rightOffset: 8
                },
                {
                    kind: "elementary",
                    size: 8,
                    leftOffset: 104,
                    rightOffset: 0
                }
            ]);

            expect(record.children[1].leftOffset).toBe(224);
        });
    });

    describe("SYNCHRONIZED inside fixed OCCURS", () => {

        // 01 RECORD.
        //    05 ITEMS OCCURS 3 TIMES.
        //       10 CODE PIC X.
        //       10 AMOUNT PIC S9(9) COMP SYNC.
        //       10 TRAILER PIC X.
        //
        // One occurrence:
        //   CODE      byte 0
        //   PAD       bytes 1-3
        //   AMOUNT    bytes 4-7
        //   TRAILER   byte 8
        //   TAIL PAD  bytes 9-11
        //
        // Stride = 12 bytes, so three occurrences = 36 bytes.
        test("adds trailing padding to preserve aligned stride", () => {
            const layout = compileCopybook(`
       01 RECORD.
          05 ITEMS OCCURS 3 TIMES.
             10 CODE PIC X.
             10 AMOUNT PIC S9(9) COMP SYNC.
             10 TRAILER PIC X.
            `);

            const record = asGroup(layout[0]);
            const items = asGroup(record.children[0]);

            expect(record.size).toBe(288);
            expect(items.size).toBe(288);

            expect(items.children.map(geometry)).toEqual([
                {
                    kind: "elementary",
                    size: 8,
                    leftOffset: 0,
                    rightOffset: 88
                },
                {
                    kind: "padding",
                    size: 24,
                    leftOffset: 8,
                    rightOffset: 64
                },
                {
                    kind: "elementary",
                    size: 32,
                    leftOffset: 32,
                    rightOffset: 32
                },
                {
                    kind: "elementary",
                    size: 8,
                    leftOffset: 64,
                    rightOffset: 24
                },
                {
                    kind: "padding",
                    size: 24,
                    leftOffset: 72,
                    rightOffset: 0
                }
            ]);

            expect(items.children).toHaveLength(5);
        });

        // 01 RECORD.
        //    05 PREFIX PIC X.
        //    05 ITEMS OCCURS 2 TIMES.
        //       10 AMOUNT PIC S9(9) COMP SYNC.
        //       10 CODE PIC X.
        //    05 TRAILER PIC X.
        //
        // PREFIX     byte 0
        // LEAD PAD   bytes 1-3 (owned by RECORD)
        //
        // ITEMS occurrence 1: bytes 4-11
        //   AMOUNT   bytes 4-7
        //   CODE     byte 8
        //   TAIL PAD bytes 9-11
        //
        // ITEMS occurrence 2: bytes 12-19
        // TRAILER begins at byte 20.
        test("aligns a repeated group and preserves its stride", () => {
            const layout = compileCopybook(`
       01 RECORD.
          05 PREFIX PIC X.
          05 ITEMS OCCURS 2 TIMES.
             10 AMOUNT PIC S9(9) COMP SYNC.
             10 CODE PIC X.
          05 TRAILER PIC X.
            `);

            const record = asGroup(layout[0]);

            expect(record.size).toBe(168);
            expect(record.children.map(c => [
                c.kind,
                c.size,
                c.leftOffset,
                c.rightOffset
            ])).toEqual([
                ["elementary", 8, 0, 160],
                ["padding", 24, 8, 136],
                ["group", 128, 32, 8],
                ["elementary", 8, 160, 0]
            ]);

            const items = asGroup(record.children[2]);

            expect(items.size).toBe(128);
            expect(items.children.map(geometry)).toEqual([
                {
                    kind: "elementary",
                    size: 32,
                    leftOffset: 0,
                    rightOffset: 32
                },
                {
                    kind: "elementary",
                    size: 8,
                    leftOffset: 32,
                    rightOffset: 24
                },
                {
                    kind: "padding",
                    size: 24,
                    leftOffset: 40,
                    rightOffset: 0
                }
            ]);
        });
    });
    }); // fixed OCCURS

    describe("REDEFINES", () => {

    describe("basic overlays", () => {

        // 01 RECORD.
        //    05 PREFIX PIC X(2).
        //    05 ORIGINAL PIC X(4).
        //    05 ALTERNATIVE REDEFINES ORIGINAL PIC 9(4).
        //    05 TRAILER PIC X.
        //
        // PREFIX      bytes 0-1
        // ORIGINAL    bytes 2-5
        // ALTERNATIVE bytes 2-5 (same storage)
        // TRAILER     byte 6
        //
        // Both interpretations share the same physical bytes.
        test("overlays equal-sized elementary fields", () => {
            const layout = compileCopybook(`
       01 RECORD.
          05 PREFIX PIC X(2).
          05 ORIGINAL PIC X(4).
          05 ALTERNATIVE REDEFINES ORIGINAL PIC 9(4).
          05 TRAILER PIC X.
            `);

            const record = asGroup(layout[0]);

            expect(record.size).toBe(56);

            expect(record.children.map(geometry)).toEqual([
                {
                    kind: "elementary",
                    size: 16,
                    leftOffset: 0,
                    rightOffset: 40
                },
                {
                    kind: "elementary",
                    size: 32,
                    leftOffset: 16,
                    rightOffset: 8
                },
                {
                    kind: "elementary",
                    size: 32,
                    leftOffset: 16,
                    rightOffset: 8
                },
                {
                    kind: "elementary",
                    size: 8,
                    leftOffset: 48,
                    rightOffset: 0
                }
            ]);
        });

        // 01 RECORD.
        //    05 ORIGINAL PIC X(4).
        //    05 FIRST-VIEW REDEFINES ORIGINAL PIC 9(4).
        //    05 SECOND-VIEW REDEFINES FIRST-VIEW PIC X(4).
        //    05 THIRD-VIEW REDEFINES ORIGINAL PIC X(4).
        //    05 TRAILER PIC X.
        //
        // All four declarations occupy bytes 0-3.
        // TRAILER occupies byte 4.
        //
        // A REDEFINES chain must resolve to the same base.
        test("resolves multiple alternatives and chains", () => {
            const layout = compileCopybook(`
       01 RECORD.
          05 ORIGINAL PIC X(4).
          05 FIRST-VIEW REDEFINES ORIGINAL PIC 9(4).
          05 SECOND-VIEW REDEFINES FIRST-VIEW PIC X(4).
          05 THIRD-VIEW REDEFINES ORIGINAL PIC X(4).
          05 TRAILER PIC X.
            `);

            const record = asGroup(layout[0]);

            expect(record.size).toBe(40);
            expect(record.children).toHaveLength(5);

            expect(record.children.map(c => [
                c.leftOffset,
                c.rightOffset
            ])).toEqual([
                [0, 8],
                [0, 8],
                [0, 8],
                [0, 8],
                [32, 0]
            ]);
        });
    });

    describe("overlay allocation extent", () => {

        // 01 RECORD.
        //    05 PREFIX PIC X(2).
        //    05 ORIGINAL PIC X(3).
        //    05 ALTERNATIVE REDEFINES ORIGINAL PIC X(5).
        //    05 TRAILER PIC X.
        //
        // PREFIX      bytes 0-1
        // ORIGINAL    bytes 2-4
        // ALTERNATIVE bytes 2-6
        // TRAILER     byte 7
        //
        // Under maximum-fixed-extent allocation, the
        // overlay reserves five bytes, not three or eight.
        test("uses the maximum fixed alternative extent", () => {
            const layout = compileCopybook(`
       01 RECORD.
          05 PREFIX PIC X(2).
          05 ORIGINAL PIC X(3).
          05 ALTERNATIVE REDEFINES ORIGINAL PIC X(5).
          05 TRAILER PIC X.
            `);

            const record = asGroup(layout[0]);

            expect(record.size).toBe(64);

            expect(record.children.map(geometry)).toEqual([
                {
                    kind: "elementary",
                    size: 16,
                    leftOffset: 0,
                    rightOffset: 48
                },
                {
                    kind: "elementary",
                    size: 24,
                    leftOffset: 16,
                    rightOffset: 24
                },
                {
                    kind: "elementary",
                    size: 40,
                    leftOffset: 16,
                    rightOffset: 8
                },
                {
                    kind: "elementary",
                    size: 8,
                    leftOffset: 56,
                    rightOffset: 0
                }
            ]);
        });

        // 01 RECORD.
        //    05 PREFIX PIC X(2).
        //    05 ORIGINAL PIC X(4).
        //    05 ALTERNATIVE REDEFINES ORIGINAL.
        //       10 FIRST PIC X(2).
        //       10 SECOND PIC X(2).
        //    05 TRAILER PIC X.
        //
        // ORIGINAL and ALTERNATIVE both start at byte 2.
        // Within ALTERNATIVE:
        //   FIRST  bytes 2-3
        //   SECOND bytes 4-5
        // TRAILER byte 6
        test("compiles a group redefining an elementary", () => {
            const layout = compileCopybook(`
       01 RECORD.
          05 PREFIX PIC X(2).
          05 ORIGINAL PIC X(4).
          05 ALTERNATIVE REDEFINES ORIGINAL.
             10 FIRST PIC X(2).
             10 SECOND PIC X(2).
          05 TRAILER PIC X.
            `);

            const record = asGroup(layout[0]);
            const alternative = asGroup(record.children[2]);

            expect(record.size).toBe(56);
            expect(alternative.size).toBe(32);
            expect(alternative.leftOffset).toBe(16);
            expect(alternative.rightOffset).toBe(8);

            expect(alternative.children.map(geometry)).toEqual([
                {
                    kind: "elementary",
                    size: 16,
                    leftOffset: 0,
                    rightOffset: 16
                },
                {
                    kind: "elementary",
                    size: 16,
                    leftOffset: 16,
                    rightOffset: 0
                }
            ]);

            expect(record.children[1].leftOffset).toBe(16);
            expect(record.children[3].leftOffset).toBe(48);
        });
    });

    describe("SYNCHRONIZED within overlays", () => {

        // 01 RECORD.
        //    05 PREFIX PIC X(4).
        //    05 ORIGINAL PIC X(4).
        //    05 ALTERNATIVE REDEFINES ORIGINAL.
        //       10 AMOUNT PIC S9(9) COMP SYNC.
        //    05 TRAILER PIC X.
        //
        // PREFIX      bytes 0-3
        // ORIGINAL    bytes 4-7
        // ALTERNATIVE bytes 4-7
        //   AMOUNT    bytes 4-7
        // TRAILER     byte 8
        //
        // The synchronized descendant is already aligned.
        // The overlay must not acquire leading padding.
        test("preserves an already-aligned overlay start", () => {
            const layout = compileCopybook(`
       01 RECORD.
          05 PREFIX PIC X(4).
          05 ORIGINAL PIC X(4).
          05 ALTERNATIVE REDEFINES ORIGINAL.
             10 AMOUNT PIC S9(9) COMP SYNC.
          05 TRAILER PIC X.
            `);

            const record = asGroup(layout[0]);
            const alternative = asGroup(record.children[2]);

            expect(record.size).toBe(72);

            expect(record.children.map(c => c.kind)).toEqual([
                "elementary",
                "elementary",
                "group",
                "elementary"
            ]);

            expect(record.children[1].leftOffset).toBe(32);
            expect(alternative.leftOffset).toBe(32);
            expect(record.children[3].leftOffset).toBe(64);

            expect(alternative.children).toHaveLength(1);
            expect(alternative.children[0].leftOffset).toBe(0);
            expect(alternative.children[0].size).toBe(32);
        });

        // 01 RECORD.
        //    05 PREFIX PIC X(2).
        //    05 ORIGINAL PIC X(8).
        //    05 ALTERNATIVE REDEFINES ORIGINAL.
        //       10 CODE PIC X.
        //       10 AMOUNT PIC S9(9) COMP SYNC.
        //    05 TRAILER PIC X.
        //
        // PREFIX      bytes 0-1
        // ORIGINAL    bytes 2-9
        // ALTERNATIVE starts at byte 2:
        //   CODE      byte 2
        //   PAD       byte 3
        //   AMOUNT    bytes 4-7
        // TRAILER     byte 10
        //
        // The overlay start is fixed; internal padding
        // belongs inside ALTERNATIVE.
        test("inserts internal padding without moving the overlay", () => {
            const layout = compileCopybook(`
       01 RECORD.
          05 PREFIX PIC X(2).
          05 ORIGINAL PIC X(8).
          05 ALTERNATIVE REDEFINES ORIGINAL.
             10 CODE PIC X.
             10 AMOUNT PIC S9(9) COMP SYNC.
          05 TRAILER PIC X.
            `);

            const record = asGroup(layout[0]);
            const alternative = asGroup(record.children[2]);

            expect(record.size).toBe(88);

            expect(record.children[1].leftOffset).toBe(16);
            expect(alternative.leftOffset).toBe(16);
            expect(alternative.size).toBe(48);
            expect(record.children[3].leftOffset).toBe(80);

            expect(alternative.children.map(geometry)).toEqual([
                {
                    kind: "elementary",
                    size: 8,
                    leftOffset: 0,
                    rightOffset: 40
                },
                {
                    kind: "padding",
                    size: 8,
                    leftOffset: 8,
                    rightOffset: 32
                },
                {
                    kind: "elementary",
                    size: 32,
                    leftOffset: 16,
                    rightOffset: 0
                }
            ]);
        });
    });

    describe("unaligned synchronized overlay", () => {

        // 01 RECORD.
        //    05 PREFIX PIC X(3).
        //    05 ORIGINAL PIC X(4).
        //    05 ALTERNATIVE REDEFINES ORIGINAL.
        //       10 AMOUNT PIC S9(9) COMP SYNC.
        //
        // ORIGINAL begins at byte 3.
        // ALTERNATIVE must also begin at byte 3.
        //
        // A normal sequential compiler would attempt to
        // insert padding before ALTERNATIVE and move it to
        // byte 4. That is forbidden.
        //
        // This negative test assumes a strict IBM policy
        // rejecting an incompatible first-child alignment.
        test("default IBM policy rejects unaligned synchronized overlay", () => {
            const copybook = `
       01 RECORD.
          05 PREFIX PIC X(3).
          05 ORIGINAL PIC X(4).
          05 ALTERNATIVE REDEFINES ORIGINAL.
             10 AMOUNT PIC S9(9) COMP SYNC.
            `;

            const result = compileCobolLayout(
                valueOrThrow(parseCopybook(copybook)),
                "test.cpy"
            );

            expect(errorsOrThrow(result)).toEqual(
                expect.arrayContaining([
                    expect.stringContaining(
                        "SYNCHRONIZED"
                    )
                ])
            );
        });
    });
    }); // REDEFINES

    describe("interaction cases and policy injection", () => {

        describe("fixed OCCURS containing REDEFINES", () => {

            // 01 RECORD.
            //    05 BLOCKS OCCURS 3 TIMES.
            //       10 ORIGINAL PIC X(4).
            //       10 ALTERNATIVE REDEFINES ORIGINAL PIC X(6).
            //       10 TRAILER PIC X.
            //
            // One BLOCKS occurrence = max(4,6) + 1 = 7 bytes.
            // Three occurrences = 21 bytes. No expansion of children.
            test("uses the allocated overlay extent as a repeated group stride", () => {
                const record = asGroup(compileCopybook(`
       01 RECORD.
          05 BLOCKS OCCURS 3 TIMES.
             10 ORIGINAL PIC X(4).
             10 ALTERNATIVE REDEFINES ORIGINAL PIC X(6).
             10 TRAILER PIC X.
                `)[0]);
                const blocks = asGroup(record.children[0]);

                expect(record.size).toBe(168);
                expect(blocks.size).toBe(168);
                expect(blocks.children.map(geometry)).toEqual([
                    {kind: "elementary", size: 32, leftOffset: 0, rightOffset: 24},
                    {kind: "elementary", size: 48, leftOffset: 0, rightOffset: 8},
                    {kind: "elementary", size: 8, leftOffset: 48, rightOffset: 0}
                ]);
            });
        });

        describe("nested REDEFINES", () => {

            // 01 RECORD.
            //    05 PREFIX PIC X.
            //    05 ORIGINAL PIC X(7).
            //    05 ALTERNATIVE REDEFINES ORIGINAL.
            //       10 A PIC X(2).
            //       10 B PIC X(2).
            //       10 C REDEFINES B PIC X(4).
            //    05 TRAILER PIC X.
            //
            // ALTERNATIVE: A 2 + max(B 2, C 4) = 6 bytes.
            // ORIGINAL reserves 7; TRAILER begins at byte 8.
            test("resolves an overlay nested inside an alternative", () => {
                const record = asGroup(compileCopybook(`
       01 RECORD.
          05 PREFIX PIC X.
          05 ORIGINAL PIC X(7).
          05 ALTERNATIVE REDEFINES ORIGINAL.
             10 A PIC X(2).
             10 B PIC X(2).
             10 C REDEFINES B PIC X(4).
          05 TRAILER PIC X.
                `)[0]);
                const alternative = asGroup(record.children[2]);

                expect(record.size).toBe(72);
                expect(alternative.leftOffset).toBe(8);
                expect(alternative.size).toBe(48);
                expect(record.children[3].leftOffset).toBe(64);
                expect(alternative.children.map(geometry)).toEqual([
                    {kind: "elementary", size: 16, leftOffset: 0, rightOffset: 32},
                    {kind: "elementary", size: 16, leftOffset: 16, rightOffset: 16},
                    {kind: "elementary", size: 32, leftOffset: 16, rightOffset: 0}
                ]);
            });
        });

        describe("overlay allocation", () => {

            // 01 RECORD.
            //    05 BASE PIC X(3).
            //    05 LONG-VIEW REDEFINES BASE PIC X(8).
            //    05 SHORT-VIEW REDEFINES LONG-VIEW PIC X(2).
            //    05 TRAILER PIC X.
            //
            // Longest alternative is in the MIDDLE; TRAILER at byte 8.
            test("retains the maximum extent even when the last alternative is shorter", () => {
                const record = asGroup(compileCopybook(`
       01 RECORD.
          05 BASE PIC X(3).
          05 LONG-VIEW REDEFINES BASE PIC X(8).
          05 SHORT-VIEW REDEFINES LONG-VIEW PIC X(2).
          05 TRAILER PIC X.
                `)[0]);

                expect(record.size).toBe(72);
                expect(record.children.map(c => [c.size, c.leftOffset, c.rightOffset])).toEqual([
                    [24, 0, 48], [64, 0, 8], [16, 0, 56], [8, 64, 0]
                ]);
            });

            // 01 RECORD.
            //    05 FIRST PIC X(2).
            //    05 FIRST-ALT REDEFINES FIRST PIC X(4).
            //    05 MIDDLE PIC X.
            //    05 SECOND PIC X(3).
            //    05 SECOND-ALT REDEFINES SECOND PIC X(5).
            //    05 END-FIELD PIC X.
            //
            // Allocations: 4 + 1 + 5 + 1 = 11 bytes.
            test("handles two independent overlay runs", () => {
                const record = asGroup(compileCopybook(`
       01 RECORD.
          05 FIRST PIC X(2).
          05 FIRST-ALT REDEFINES FIRST PIC X(4).
          05 MIDDLE PIC X.
          05 SECOND PIC X(3).
          05 SECOND-ALT REDEFINES SECOND PIC X(5).
          05 END-FIELD PIC X.
                `)[0]);

                expect(record.size).toBe(88);
                expect(record.children.map(c => c.leftOffset)).toEqual([
                    0, 0, 32, 40, 40, 80
                ]);
            });
        });

        describe("injected overlay alignment", () => {

            // 01 RECORD.
            //    05 PREFIX PIC X(3).
            //    05 ORIGINAL PIC X(4).
            //    05 ALTERNATIVE REDEFINES ORIGINAL.
            //       10 AMOUNT PIC S9(9) COMP SYNC.
            //
            // Under the permissive policy: ORIGINAL begins byte 3;
            // ALTERNATIVE starts at byte 3 (unchanged), owns PAD at byte 3;
            // AMOUNT begins byte 4. Alternative size is five bytes.
            test("permits leading padding inside an overlay without moving its start", () => {
                const copybook = `
       01 RECORD.
          05 PREFIX PIC X(3).
          05 ORIGINAL PIC X(4).
          05 ALTERNATIVE REDEFINES ORIGINAL.
             10 AMOUNT PIC S9(9) COMP SYNC.
                `;
                const ast = valueOrThrow(parseCopybook(copybook));
                const record = asGroup(valueOrThrow(compileCobolLayout(
                    ast, "test.cpy", {overlayAlignment: permissiveOverlayAlignment}
                ))[0]);
                const alternative = asGroup(record.children[2]);

                expect(record.size).toBe(64);
                expect(record.children[1].leftOffset).toBe(24);
                expect(alternative.leftOffset).toBe(24);
                expect(alternative.size).toBe(40);
                expect(alternative.children.map(geometry)).toEqual([
                    {kind: "padding", size: 8, leftOffset: 0, rightOffset: 32},
                    {kind: "elementary", size: 32, leftOffset: 8, rightOffset: 0}
                ]);
            });
        });

        describe("fixed OCCURS with SYNC inside REDEFINES", () => {

            // 01 RECORD.
            //    05 PREFIX PIC X(4).
            //    05 ORIGINAL PIC X(24).
            //    05 ALTERNATIVE REDEFINES ORIGINAL.
            //       10 ITEM OCCURS 2 TIMES.
            //          15 CODE PIC X.
            //          15 AMOUNT PIC S9(9) COMP SYNC.
            //          15 TRAILER PIC X.
            //
            // Each ITEM stride: 1 + 3 PAD + 4 + 1 + 3 TAIL PAD = 12 bytes.
            // Two occurrences occupy 24 bytes; both views start at byte 4.
            test("combines repeated stride padding with overlay allocation", () => {
                const record = asGroup(compileCopybook(`
       01 RECORD.
          05 PREFIX PIC X(4).
          05 ORIGINAL PIC X(24).
          05 ALTERNATIVE REDEFINES ORIGINAL.
             10 ITEM OCCURS 2 TIMES.
                15 CODE PIC X.
                15 AMOUNT PIC S9(9) COMP SYNC.
                15 TRAILER PIC X.
                `)[0]);
                const alternative = asGroup(record.children[2]);
                const item = asGroup(alternative.children[0]);
                expect(record.size).toBe(224);
                expect(record.children[1].leftOffset).toBe(32);
                expect(alternative.leftOffset).toBe(32);
                expect(alternative.size).toBe(192);
                expect(item.size).toBe(192);
                expect(item.children.map(c => [c.kind, c.size, c.leftOffset])).toEqual([
                    ["elementary", 8, 0], ["padding", 24, 8],
                    ["elementary", 32, 32], ["elementary", 8, 64],
                    ["padding", 24, 72]
                ]);
            });
        });

        describe("diagnostics", () => {

            // 01 RECORD.
            //    05 ITEM REDEFINES ABSENT PIC X(3).
            //
            // Construct the AST directly to test compiler diagnostics,
            // independently of parser-level symbol validation.
            test("rejects a missing REDEFINES target", () => {
                const missing = elementary("ITEM", "X(3)", 2, [
                    {kind: "redefines", target: "ABSENT"}
                ]);
                const result = compileCobolLayout(
                    ast(group("RECORD", [missing])), "test.cpy"
                );
                expect(errorsOrThrow(result).join(" ")).toContain("ABSENT");
            });
        });
    }); // interaction cases and policy injection
}); // compileCobolLayout
