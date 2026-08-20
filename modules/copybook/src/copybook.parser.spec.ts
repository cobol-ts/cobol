import {errorsOrThrow, valueOrThrow} from "@cobol-ts/errors";

import {
    ConditionEntry,
    ConditionValue,
    CopybookClause,
    CopybookEntry,
    CopybookEntryName,
    ElementaryEntry,
    GroupEntry,
} from "./copybook.ast";
import {parseCopybook} from "./copybook.parser";


const parse = (
    source: string,
    metadata?: any,
) =>
    valueOrThrow(
        parseCopybook(source, metadata),
    );


const parseErrors = (
    source: string,
): string[] =>
    errorsOrThrow(
        parseCopybook(source),
    );


/*
 * Exact expected AST values
 */

const named = (
    name: string,
): CopybookEntryName => ({
    kind: "named",
    name,
});


const filler = (): CopybookEntryName => ({
    kind: "filler",
});


const conditionValue = (
    value: string,
): ConditionValue => ({
    kind: "value",
    value,
});


const conditionRange = (
    from: string,
    to: string,
): ConditionValue => ({
    kind: "range",
    from,
    to,
});


const condition = (
    name: string,
    values: ConditionValue[],
    line: number,
): ConditionEntry => ({
    kind: "condition",
    level: 88,
    name: named(name),
    values,
    line,
});


type ElementaryExpected = {
    level?: number;
    name?: CopybookEntryName;
    picture?: string;
    clauses?: CopybookClause[];
    conditions?: ConditionEntry[];
    line?: number;
};


const elementary = (
    expected: ElementaryExpected = {},
): ElementaryEntry => ({
    kind: "elementary",
    level: expected.level ?? 5,
    name: expected.name ?? named("VALUE-FIELD"),
    picture: expected.picture,
    clauses: expected.clauses ?? [],
    conditions: expected.conditions ?? [],
    line: expected.line ?? 1,
});


type GroupExpected = {
    level?: number;
    name?: CopybookEntryName;
    clauses?: CopybookClause[];
    children?: CopybookEntry[];
    line?: number;
};


const group = (
    expected: GroupExpected = {},
): GroupEntry => ({
    kind: "group",
    level: expected.level ?? 1,
    name: expected.name ?? named("ROOT"),
    clauses: expected.clauses ?? [],
    children: expected.children ?? [],
    line: expected.line ?? 1,
});


/*
 * Exact expected diagnostics
 */

const diagnostic = (
    source: string,
    message: string,
    line: number,
): string => {
    const sourceLines = source.split(/\r?\n/);
    const result = [
        `${message} at line ${line}`,
        "",
    ];

    if (line > 1)
        result.push(
            `  ${line - 1} | ${sourceLines[line - 2]}`,
        );

    result.push(
        `> ${line} | ${sourceLines[line - 1]}`,
    );

    if (line < sourceLines.length)
        result.push(
            `  ${line + 1} | ${sourceLines[line]}`,
        );

    return result.join("\n");
};


const expectParseErrors = (
    source: string,
    expected: Array<{
        message: string;
        line: number;
    }>,
): void => {
    expect(
        parseErrors(source),
    ).toEqual(
        expected.map(({message, line}) =>
            diagnostic(
                source,
                message,
                line,
            ),
        ),
    );
};


describe("parseCopybook", () => {

    describe("entries", () => {

        test("parses a simple PIC X field", () => {
            const ast = parse(`
01 CUSTOMER.
    05 NAME PIC X(30).
`);

            expect(ast.entries).toEqual([
                group({
                    name: named("CUSTOMER"),
                    line: 2,
                    children: [
                        elementary({
                            name: named("NAME"),
                            picture: "X(30)",
                            line: 3,
                        }),
                    ],
                }),
            ]);
        });


        test("recognises FILLER", () => {
            const ast = parse(
                "05 FILLER PIC X(10).",
            );

            expect(ast.entries).toEqual([
                elementary({
                    name: filler(),
                    picture: "X(10)",
                }),
            ]);
        });


        test("supports level 77 elementary entries", () => {
            const ast = parse(
                "77 STANDALONE PIC X(10).",
            );

            expect(ast.entries).toEqual([
                elementary({
                    level: 77,
                    name: named("STANDALONE"),
                    picture: "X(10)",
                }),
            ]);
        });

    });


    describe("hierarchy", () => {

        test("level 77 entries are standalone roots", () => {
            const ast = parse(`
01 CUSTOMER.
    05 NAME PIC X(20).
77 WORK-AREA PIC X(10).
01 ACCOUNT.
    05 NUMBER PIC X(10).
`);

            expect(ast.entries).toEqual([
                group({
                    name: named("CUSTOMER"),
                    line: 2,
                    children: [
                        elementary({
                            name: named("NAME"),
                            picture: "X(20)",
                            line: 3,
                        }),
                    ],
                }),
                elementary({
                    level: 77,
                    name: named("WORK-AREA"),
                    picture: "X(10)",
                    line: 4,
                }),
                group({
                    name: named("ACCOUNT"),
                    line: 5,
                    children: [
                        elementary({
                            name: named("NUMBER"),
                            picture: "X(10)",
                            line: 6,
                        }),
                    ],
                }),
            ]);
        });


        test("builds hierarchy from level numbers", () => {
            const ast = parse(`
01 CUSTOMER.
    05 ID PIC 9(8).
    05 ADDRESS.
        10 STREET PIC X(30).
        10 TOWN PIC X(20).
    05 STATUS PIC X.
`);

            expect(ast.entries).toEqual([
                group({
                    name: named("CUSTOMER"),
                    line: 2,
                    children: [
                        elementary({
                            name: named("ID"),
                            picture: "9(8)",
                            line: 3,
                        }),
                        group({
                            level: 5,
                            name: named("ADDRESS"),
                            line: 4,
                            children: [
                                elementary({
                                    level: 10,
                                    name: named("STREET"),
                                    picture: "X(30)",
                                    line: 5,
                                }),
                                elementary({
                                    level: 10,
                                    name: named("TOWN"),
                                    picture: "X(20)",
                                    line: 6,
                                }),
                            ],
                        }),
                        elementary({
                            name: named("STATUS"),
                            picture: "X",
                            line: 7,
                        }),
                    ],
                }),
            ]);
        });


        test("supports multiple root entries", () => {
            const ast = parse(`
01 FIRST.
    05 A PIC X.
01 SECOND.
    05 B PIC X.
`);

            expect(ast.entries).toEqual([
                group({
                    name: named("FIRST"),
                    line: 2,
                    children: [
                        elementary({
                            name: named("A"),
                            picture: "X",
                            line: 3,
                        }),
                    ],
                }),
                group({
                    name: named("SECOND"),
                    line: 4,
                    children: [
                        elementary({
                            name: named("B"),
                            picture: "X",
                            line: 5,
                        }),
                    ],
                }),
            ]);
        });


        test("levels do not need to be consecutive", () => {
            const ast = parse(`
01 ROOT.
    07 CHILD.
        42 VALUE-FIELD PIC X.
`);

            expect(ast.entries).toEqual([
                group({
                    name: named("ROOT"),
                    line: 2,
                    children: [
                        group({
                            level: 7,
                            name: named("CHILD"),
                            line: 3,
                            children: [
                                elementary({
                                    level: 42,
                                    picture: "X",
                                    line: 4,
                                }),
                            ],
                        }),
                    ],
                }),
            ]);
        });


        test("moves back several hierarchy levels", () => {
            const ast = parse(`
01 ROOT.
    05 A.
        10 B.
            15 C PIC X.
    05 D PIC X.
`);

            expect(ast.entries).toEqual([
                group({
                    name: named("ROOT"),
                    line: 2,
                    children: [
                        group({
                            level: 5,
                            name: named("A"),
                            line: 3,
                            children: [
                                group({
                                    level: 10,
                                    name: named("B"),
                                    line: 4,
                                    children: [
                                        elementary({
                                            level: 15,
                                            name: named("C"),
                                            picture: "X",
                                            line: 5,
                                        }),
                                    ],
                                }),
                            ],
                        }),
                        elementary({
                            name: named("D"),
                            picture: "X",
                            line: 6,
                        }),
                    ],
                }),
            ]);
        });

    });


    describe("PICTURE", () => {

        test.each([
            [
                "PIC",
                "05 NAME PIC X(30).",
            ],
            [
                "PICTURE",
                "05 NAME PICTURE X(30).",
            ],
            [
                "PICTURE IS",
                "05 NAME PICTURE IS X(30).",
            ],
        ])(
            "parses %s",
            (_description, source) => {
                const ast = parse(source);

                expect(ast.entries).toEqual([
                    elementary({
                        name: named("NAME"),
                        picture: "X(30)",
                    }),
                ]);
            },
        );


        test("preserves complex picture text", () => {
            const ast = parse(
                "05 AMOUNT PIC S9(11)V9(4).",
            );

            expect(ast.entries).toEqual([
                elementary({
                    name: named("AMOUNT"),
                    picture: "S9(11)V9(4)",
                }),
            ]);
        });


        test.each([
            "$,$$,$9.99",
            "Z,ZZZ,ZZ9.99",
            "+ZZZ,ZZ9.99",
        ])(
            "preserves edited picture %s",
            picture => {
                const ast = parse(
                    `05 AMOUNT PIC ${picture}.`,
                );

                expect(ast.entries).toEqual([
                    elementary({
                        name: named("AMOUNT"),
                        picture,
                    }),
                ]);
            },
        );


        test("still treats a comma followed by whitespace as a clause separator", () => {
            const ast = parse(
                "05 AMOUNT PIC X, USAGE DISPLAY.",
            );

            expect(ast.entries).toEqual([
                elementary({
                    name: named("AMOUNT"),
                    picture: "X",
                    clauses: [
                        {
                            kind: "usage",
                            usage: "DISPLAY",
                        },
                    ],
                }),
            ]);
        });

    });


    describe("USAGE", () => {

        test.each([
            ["COMP", "COMP"],
            ["COMP-1", "COMP-1"],
            ["COMP-2", "COMP-2"],
            ["COMP-3", "COMP-3"],
            ["COMP-4", "COMP-4"],
            ["COMP-5", "COMP-5"],
            ["BINARY", "BINARY"],
            [
                "PACKED-DECIMAL",
                "PACKED-DECIMAL",
            ],
        ])(
            "parses direct usage %s",
            (
                sourceUsage,
                expectedUsage,
            ) => {
                const ast = parse(
                    `05 VALUE-FIELD PIC 9(10) ${sourceUsage}.`,
                );

                expect(ast.entries).toEqual([
                    elementary({
                        picture: "9(10)",
                        clauses: [
                            {
                                kind: "usage",
                                usage: expectedUsage,
                            },
                        ],
                    }),
                ]);
            },
        );


        test("parses explicit USAGE IS", () => {
            const ast = parse(
                "05 BALANCE PIC S9(9) USAGE IS COMP-3.",
            );

            expect(ast.entries).toEqual([
                elementary({
                    name: named("BALANCE"),
                    picture: "S9(9)",
                    clauses: [
                        {
                            kind: "usage",
                            usage: "COMP-3",
                        },
                    ],
                }),
            ]);
        });


        test("parses USAGE without IS", () => {
            const ast = parse(
                "05 VALUE-FIELD PIC 9(10) USAGE COMP-3.",
            );

            expect(ast.entries).toEqual([
                elementary({
                    picture: "9(10)",
                    clauses: [
                        {
                            kind: "usage",
                            usage: "COMP-3",
                        },
                    ],
                }),
            ]);
        });

    });


    describe("OCCURS", () => {

        test("parses OCCURS TIMES", () => {
            const ast = parse(
                "05 ITEM PIC X(10) OCCURS 5 TIMES.",
            );

            expect(ast.entries).toEqual([
                elementary({
                    name: named("ITEM"),
                    picture: "X(10)",
                    clauses: [
                        {
                            kind: "occurs",
                            count: 5,
                        },
                    ],
                }),
            ]);
        });


        test("parses OCCURS without TIMES", () => {
            const ast = parse(
                "05 VALUES PIC X OCCURS 10.",
            );

            expect(ast.entries).toEqual([
                elementary({
                    name: named("VALUES"),
                    picture: "X",
                    clauses: [
                        {
                            kind: "occurs",
                            count: 10,
                        },
                    ],
                }),
            ]);
        });


        test("parses OCCURS on a group", () => {
            const ast = parse(`
01 ROOT.
    05 ITEMS OCCURS 10 TIMES.
        10 ITEM-CODE PIC X(5).
`);

            expect(ast.entries).toEqual([
                group({
                    name: named("ROOT"),
                    line: 2,
                    children: [
                        group({
                            level: 5,
                            name: named("ITEMS"),
                            clauses: [
                                {
                                    kind: "occurs",
                                    count: 10,
                                },
                            ],
                            line: 3,
                            children: [
                                elementary({
                                    level: 10,
                                    name: named("ITEM-CODE"),
                                    picture: "X(5)",
                                    line: 4,
                                }),
                            ],
                        }),
                    ],
                }),
            ]);
        });


        test("parses nested OCCURS", () => {
            const ast = parse(`
01 ROOT.
    05 ROWS OCCURS 5.
        10 COLUMNS OCCURS 10.
            15 VALUE-FIELD PIC X.
`);

            expect(ast.entries).toEqual([
                group({
                    name: named("ROOT"),
                    line: 2,
                    children: [
                        group({
                            level: 5,
                            name: named("ROWS"),
                            clauses: [
                                {
                                    kind: "occurs",
                                    count: 5,
                                },
                            ],
                            line: 3,
                            children: [
                                group({
                                    level: 10,
                                    name: named("COLUMNS"),
                                    clauses: [
                                        {
                                            kind: "occurs",
                                            count: 10,
                                        },
                                    ],
                                    line: 4,
                                    children: [
                                        elementary({
                                            level: 15,
                                            picture: "X",
                                            line: 5,
                                        }),
                                    ],
                                }),
                            ],
                        }),
                    ],
                }),
            ]);
        });

    });


    describe("SIGN", () => {

        test.each([
            [
                "SIGN LEADING",
                {
                    kind: "sign" as const,
                    position: "leading" as const,
                    separate: false,
                },
            ],
            [
                "SIGN TRAILING",
                {
                    kind: "sign" as const,
                    position: "trailing" as const,
                    separate: false,
                },
            ],
            [
                "SIGN IS LEADING SEPARATE",
                {
                    kind: "sign" as const,
                    position: "leading" as const,
                    separate: true,
                },
            ],
            [
                "SIGN IS TRAILING SEPARATE CHARACTER",
                {
                    kind: "sign" as const,
                    position: "trailing" as const,
                    separate: true,
                },
            ],
        ])(
            "parses %s",
            (
                signSource,
                expected,
            ) => {
                const ast = parse(
                    `05 AMOUNT PIC S9(7) ${signSource}.`,
                );

                expect(ast.entries).toEqual([
                    elementary({
                        name: named("AMOUNT"),
                        picture: "S9(7)",
                        clauses: [expected],
                    }),
                ]);
            },
        );

    });


    describe("VALUE", () => {

        test("parses a quoted value", () => {
            const ast = parse(
                "05 STATUS PIC X VALUE 'A'.",
            );

            expect(ast.entries).toEqual([
                elementary({
                    name: named("STATUS"),
                    picture: "X",
                    clauses: [
                        {
                            kind: "value",
                            value: "'A'",
                        },
                    ],
                }),
            ]);
        });


        test("preserves a quoted value containing spaces", () => {
            const ast = parse(
                `05 NAME PIC X(20) VALUE "NOT KNOWN".`,
            );

            expect(ast.entries).toEqual([
                elementary({
                    name: named("NAME"),
                    picture: "X(20)",
                    clauses: [
                        {
                            kind: "value",
                            value: '"NOT KNOWN"',
                        },
                    ],
                }),
            ]);
        });


        test("parses a numeric value", () => {
            const ast = parse(
                "05 COUNT-FIELD PIC 9(3) VALUE 100.",
            );

            expect(ast.entries).toEqual([
                elementary({
                    name: named("COUNT-FIELD"),
                    picture: "9(3)",
                    clauses: [
                        {
                            kind: "value",
                            value: "100",
                        },
                    ],
                }),
            ]);
        });

    });


    describe("other clauses", () => {

        test("parses BLANK WHEN ZERO", () => {
            const ast = parse(
                "05 AMOUNT PIC 9(5) BLANK WHEN ZERO.",
            );

            expect(ast.entries).toEqual([
                elementary({
                    name: named("AMOUNT"),
                    picture: "9(5)",
                    clauses: [
                        {
                            kind: "blank-when-zero",
                        },
                    ],
                }),
            ]);
        });


        test.each([
            ["JUSTIFIED", "JUSTIFIED RIGHT"],
            ["JUST", "JUST RIGHT"],
        ])(
            "parses %s",
            (_description, source) => {
                const ast = parse(
                    `05 NAME PIC X(20) ${source}.`,
                );

                expect(ast.entries).toEqual([
                    elementary({
                        name: named("NAME"),
                        picture: "X(20)",
                        clauses: [
                            {
                                kind: "justified",
                            },
                        ],
                    }),
                ]);
            },
        );


        test.each([
            ["SYNC", undefined],
            ["SYNC LEFT", "left" as const],
            [
                "SYNCHRONIZED RIGHT",
                "right" as const,
            ],
        ])(
            "parses %s",
            (source, position) => {
                const ast = parse(
                    `05 VALUE-FIELD PIC X ${source}.`,
                );

                expect(ast.entries).toEqual([
                    elementary({
                        picture: "X",
                        clauses: [
                            {
                                kind: "synchronized",
                                position,
                            },
                        ],
                    }),
                ]);
            },
        );


        test("preserves clause order", () => {
            const ast = parse(
                "05 AMOUNT PIC S9(9) SIGN LEADING COMP-3.",
            );

            expect(ast.entries).toEqual([
                elementary({
                    name: named("AMOUNT"),
                    picture: "S9(9)",
                    clauses: [
                        {
                            kind: "sign",
                            position: "leading",
                            separate: false,
                        },
                        {
                            kind: "usage",
                            usage: "COMP-3",
                        },
                    ],
                }),
            ]);
        });

    });


    describe("source handling", () => {

        test("parses COBOL keywords case insensitively", () => {
            const ast = parse(
                "05 BALANCE pic S9(7)V99 comp-3.",
            );

            expect(ast.entries).toEqual([
                elementary({
                    name: named("BALANCE"),
                    picture: "S9(7)V99",
                    clauses: [
                        {
                            kind: "usage",
                            usage: "COMP-3",
                        },
                    ],
                }),
            ]);
        });


        test("handles tabs and excessive whitespace", () => {
            const ast = parse(
                "\t05\tNAME\tPIC\tX(30).\t",
            );

            expect(ast.entries).toEqual([
                elementary({
                    name: named("NAME"),
                    picture: "X(30)",
                }),
            ]);
        });


        test("ignores blank lines", () => {
            const ast = parse(`

01 CUSTOMER.

    05 NAME PIC X(20).

`);

            expect(ast.entries).toEqual([
                group({
                    name: named("CUSTOMER"),
                    line: 3,
                    children: [
                        elementary({
                            name: named("NAME"),
                            picture: "X(20)",
                            line: 5,
                        }),
                    ],
                }),
            ]);
        });


        test("ignores comments", () => {
            const ast = parse(`
* this is a comment
01 CUSTOMER.
    *> another comment
    05 NAME PIC X(20).
`);

            expect(ast.entries).toEqual([
                group({
                    name: named("CUSTOMER"),
                    line: 3,
                    children: [
                        elementary({
                            name: named("NAME"),
                            picture: "X(20)",
                            line: 5,
                        }),
                    ],
                }),
            ]);
        });


        test("joins continuation lines", () => {
            const ast = parse(`
01 CUSTOMER.
    05 BALANCE
       PIC S9(9)V99
       COMP-3.
`);

            expect(ast.entries).toEqual([
                group({
                    name: named("CUSTOMER"),
                    line: 2,
                    children: [
                        elementary({
                            name: named("BALANCE"),
                            picture: "S9(9)V99",
                            clauses: [
                                {
                                    kind: "usage",
                                    usage: "COMP-3",
                                },
                            ],
                            line: 3,
                        }),
                    ],
                }),
            ]);
        });


        test("comments do not break a continued declaration", () => {
            const ast = parse(`
01 ROOT.
    05 BALANCE
    *> description of balance
       PIC S9(9)V99
       COMP-3.
`);

            expect(ast.entries).toEqual([
                group({
                    name: named("ROOT"),
                    line: 2,
                    children: [
                        elementary({
                            name: named("BALANCE"),
                            picture: "S9(9)V99",
                            clauses: [
                                {
                                    kind: "usage",
                                    usage: "COMP-3",
                                },
                            ],
                            line: 3,
                        }),
                    ],
                }),
            ]);
        });


        test("handles CRLF input", () => {
            const ast = parse(
                "01 ROOT.\r\n    05 NAME PIC X(10).\r\n",
            );

            expect(ast.entries).toEqual([
                group({
                    name: named("ROOT"),
                    children: [
                        elementary({
                            name: named("NAME"),
                            picture: "X(10)",
                            line: 2,
                        }),
                    ],
                }),
            ]);
        });

    });


    describe("metadata", () => {

        test("passes metadata through unchanged", () => {
            const metadata = {
                file: "customer.cpy",
                version: 7,
            };

            const ast = parse(
                "01 CUSTOMER.",
                metadata,
            );

            expect(ast).toEqual({
                metadata,
                entries: [
                    group({
                        name: named("CUSTOMER"),
                    }),
                ],
            });

            expect(ast.metadata).toBe(metadata);
        });

    });


    describe("unsupported and special syntax", () => {

        test("rejects COPY", () => {
            const source =
                "COPY CUSTOMER.";

            expectParseErrors(
                source,
                [
                    {
                        message:
                            "COPY statements are not supported",
                        line: 1,
                    },
                ],
            );
        });


        test("parses REDEFINES", () => {
            const ast = parse(
                "05 NEW-VALUE REDEFINES OLD-VALUE PIC X(10).",
            );

            expect(ast.entries).toEqual([
                elementary({
                    name: named("NEW-VALUE"),
                    picture: "X(10)",
                    clauses: [
                        {
                            kind: "redefines",
                            target: "OLD-VALUE",
                        },
                    ],
                }),
            ]);
        });


        test("rejects level 66", () => {
            const source =
                "66 ALTERNATIVE RENAMES A THRU B.";

            expectParseErrors(
                source,
                [
                    {
                        message:
                            "Level 66 RENAMES entries are not supported",
                        line: 1,
                    },
                ],
            );
        });


        test("parses level 88 conditions", () => {
            const ast = parse(`
05 STATUS PIC X.
    88 ACTIVE VALUE 'A'.
    88 CLOSED VALUES 'C' 'X'.
    88 PENDING VALUE 'P' THRU 'R'.
`);

            expect(ast.entries).toEqual([
                elementary({
                    name: named("STATUS"),
                    picture: "X",
                    line: 2,
                    conditions: [
                        condition(
                            "ACTIVE",
                            [conditionValue("'A'")],
                            3,
                        ),
                        condition(
                            "CLOSED",
                            [
                                conditionValue("'C'"),
                                conditionValue("'X'"),
                            ],
                            4,
                        ),
                        condition(
                            "PENDING",
                            [
                                conditionRange(
                                    "'P'",
                                    "'R'",
                                ),
                            ],
                            5,
                        ),
                    ],
                }),
            ]);
        });


        test("parses OCCURS DEPENDING ON", () => {
            const ast = parse(
                "05 ITEMS PIC X OCCURS 0 TO 10000 TIMES DEPENDING ON ITEM-COUNT.",
            );

            expect(ast.entries).toEqual([
                elementary({
                    name: named("ITEMS"),
                    picture: "X",
                    clauses: [
                        {
                            kind: "occurs",
                            min: 0,
                            max: 10000,
                            dependingOn: "ITEM-COUNT",
                        },
                    ],
                }),
            ]);
        });


        test("parses short OCCURS DEPENDING ON", () => {
            const ast = parse(
                "05 ITEMS PIC X OCCURS 100 DEPENDING ON ITEM-COUNT.",
            );

            expect(ast.entries).toEqual([
                elementary({
                    name: named("ITEMS"),
                    picture: "X",
                    clauses: [
                        {
                            kind: "occurs",
                            min: 1,
                            max: 100,
                            dependingOn: "ITEM-COUNT",
                        },
                    ],
                }),
            ]);
        });


        test("parses short OCCURS TIMES DEPENDING ON", () => {
            const ast = parse(
                "05 ITEMS PIC X OCCURS 100 TIMES DEPENDING ON ITEM-COUNT.",
            );

            expect(ast.entries).toEqual([
                elementary({
                    name: named("ITEMS"),
                    picture: "X",
                    clauses: [
                        {
                            kind: "occurs",
                            min: 1,
                            max: 100,
                            dependingOn: "ITEM-COUNT",
                        },
                    ],
                }),
            ]);
        });


        test("parses OCCURS ASCENDING and DESCENDING keys", () => {
            const ast = parse(
                "05 ITEMS PIC X OCCURS 100 ASCENDING KEY IS TYPE CODE DESCENDING KEY IS EFFECTIVE-DATE.",
            );

            expect(ast.entries).toEqual([
                elementary({
                    name: named("ITEMS"),
                    picture: "X",
                    clauses: [
                        {
                            kind: "occurs",
                            count: 100,
                            keys: [
                                {
                                    order: "ascending",
                                    names: ["TYPE", "CODE"],
                                },
                                {
                                    order: "descending",
                                    names: ["EFFECTIVE-DATE"],
                                },
                            ],
                        },
                    ],
                }),
            ]);
        });


        test("parses OCCURS INDEXED BY", () => {
            const ast = parse(
                "05 ITEMS PIC X OCCURS 100 INDEXED BY IX IX2.",
            );

            expect(ast.entries).toEqual([
                elementary({
                    name: named("ITEMS"),
                    picture: "X",
                    clauses: [
                        {
                            kind: "occurs",
                            count: 100,
                            indexedBy: ["IX", "IX2"],
                        },
                    ],
                }),
            ]);
        });


        test("parses OCCURS DEPENDING ON with keys and indexes", () => {
            const ast = parse(
                "05 ITEMS PIC X OCCURS 0 TO 100 TIMES DEPENDING ON ITEM-COUNT ASCENDING KEY IS ITEM-CODE INDEXED BY ITEM-INDEX.",
            );

            expect(ast.entries).toEqual([
                elementary({
                    name: named("ITEMS"),
                    picture: "X",
                    clauses: [
                        {
                            kind: "occurs",
                            min: 0,
                            max: 100,
                            dependingOn: "ITEM-COUNT",
                            keys: [
                                {
                                    order: "ascending",
                                    names: ["ITEM-CODE"],
                                },
                            ],
                            indexedBy: ["ITEM-INDEX"],
                        },
                    ],
                }),
            ]);
        });


        test("rejects OCCURS key without a data name", () => {
            expectParseErrors(
                "05 ITEMS PIC X OCCURS 100 ASCENDING KEY IS INDEXED BY IX.",
                [
                    {
                        message: "ASCENDING KEY requires a data name",
                        line: 1,
                    },
                ],
            );
        });


        test("rejects INDEXED BY without an index name", () => {
            expectParseErrors(
                "05 ITEMS PIC X OCCURS 100 INDEXED BY.",
                [
                    {
                        message: "INDEXED BY requires an index name",
                        line: 1,
                    },
                ],
            );
        });

    });


    describe("error recovery", () => {

        test("aggregates errors from multiple declarations", () => {
            const source = [
                "01 CUSTOMER.",
                "    05 A PIC X OCCURS BANANA.",
                "    66 SOMETHING RENAMES A THRU B.",
                "    88 ACTIVE.",
            ].join("\n");

            expectParseErrors(
                source,
                [
                    {
                        message:
                            "Invalid OCCURS count 'BANANA'",
                        line: 2,
                    },
                    {
                        message:
                            "Level 66 RENAMES entries are not supported",
                        line: 3,
                    },
                    {
                        message:
                            "Level 88 condition requires VALUE",
                        line: 4,
                    },
                ],
            );
        });


        test("reports errors from multiple bad clauses", () => {
            const source =
                "05 BAD PIC X OCCURS BANANA BLANK SOMETHING.";

            expectParseErrors(
                source,
                [
                    {
                        message:
                            "Invalid OCCURS count 'BANANA'",
                        line: 1,
                    },
                    {
                        message:
                            "Expected BLANK WHEN ZERO",
                        line: 1,
                    },
                ],
            );
        });


        test("continues parsing later declarations after an error", () => {
            const source = [
                "01 ROOT.",
                "    05 GOOD PIC X OCCURS 5 DEPENDING ON COUNT.",
                "    05 ALSO-BAD PIC X OCCURS BANANA.",
            ].join("\n");

            expectParseErrors(
                source,
                [
                    {
                        message:
                            "Invalid OCCURS count 'BANANA'",
                        line: 3,
                    },
                ],
            );
        });

    });


    describe("error diagnostics", () => {

        test("shows the failing physical line", () => {
            const source = [
                "01 ROOT.",
                "    05 BAD PIC X OCCURS BANANA.",
            ].join("\n");

            expectParseErrors(
                source,
                [
                    {
                        message:
                            "Invalid OCCURS count 'BANANA'",
                        line: 2,
                    },
                ],
            );
        });


        test("shows the line before and after the failure", () => {
            const source = [
                "01 ROOT.",
                "    05 BEFORE PIC X.",
                "    05 BAD PIC X OCCURS BANANA.",
                "    05 AFTER PIC X.",
            ].join("\n");

            expectParseErrors(
                source,
                [
                    {
                        message:
                            "Invalid OCCURS count 'BANANA'",
                        line: 3,
                    },
                ],
            );
        });


        test("reports the actual physical line in a continued declaration", () => {
            const source = [
                "01 ROOT.",
                "    05 BALANCE",
                "       PIC S9(9)V99",
                "       BANANA.",
                "    05 STATUS PIC X.",
            ].join("\n");

            expectParseErrors(
                source,
                [
                    {
                        message:
                            "Unexpected token 'BANANA'",
                        line: 4,
                    },
                ],
            );
        });


        test("handles an error on the first source line", () => {
            const source = [
                "COPY CUSTOMER.",
                "01 CUSTOMER.",
            ].join("\n");

            expectParseErrors(
                source,
                [
                    {
                        message:
                            "COPY statements are not supported",
                        line: 1,
                    },
                ],
            );
        });


        test("handles an error on the final source line", () => {
            const source = [
                "01 ROOT.",
                "    05 GOOD PIC X.",
                "    05 BAD PIC X OCCURS BANANA.",
            ].join("\n");

            expectParseErrors(
                source,
                [
                    {
                        message:
                            "Invalid OCCURS count 'BANANA'",
                        line: 3,
                    },
                ],
            );
        });

    });

});


describe("entry classification", () => {

    test("classifies an entry with children as a group", () => {
        const ast = parse(`
01 ROOT.
    05 CHILD.
        10 VALUE-FIELD PIC X.
`);

        expect(ast.entries).toEqual([
            group({
                name: named("ROOT"),
                line: 2,
                children: [
                    group({
                        level: 5,
                        name: named("CHILD"),
                        line: 3,
                        children: [
                            elementary({
                                level: 10,
                                picture: "X",
                                line: 4,
                            }),
                        ],
                    }),
                ],
            }),
        ]);
    });


    test("classifies an entry with PIC as elementary", () => {
        const ast = parse(
            "05 VALUE-FIELD PIC X(20).",
        );

        expect(ast.entries).toEqual([
            elementary({
                picture: "X(20)",
            }),
        ]);
    });


    test.each([
        ["COMP-1", "COMP-1"],
        ["COMP-2", "COMP-2"],
        ["COMPUTATIONAL-1", "COMPUTATIONAL-1"],
        ["COMPUTATIONAL-2", "COMPUTATIONAL-2"],
        ["INDEX", "INDEX"],
        ["POINTER", "POINTER"],
    ])(
        "classifies pictureless %s as elementary",
        (sourceUsage, expectedUsage) => {
            const ast = parse(
                `05 VALUE-FIELD ${sourceUsage}.`,
            );

            expect(ast.entries).toEqual([
                elementary({
                    clauses: [
                        {
                            kind: "usage",
                            usage: expectedUsage,
                        },
                    ],
                }),
            ]);
        },
    );


    test("classifies explicit USAGE POINTER as elementary", () => {
        const ast = parse(
            "05 ADDRESS USAGE IS POINTER.",
        );

        expect(ast.entries).toEqual([
            elementary({
                name: named("ADDRESS"),
                clauses: [
                    {
                        kind: "usage",
                        usage: "POINTER",
                    },
                ],
            }),
        ]);
    });


    test("classifies explicit USAGE INDEX as elementary", () => {
        const ast = parse(
            "05 TABLE-INDEX USAGE INDEX.",
        );

        expect(ast.entries).toEqual([
            elementary({
                name: named("TABLE-INDEX"),
                clauses: [
                    {
                        kind: "usage",
                        usage: "INDEX",
                    },
                ],
            }),
        ]);
    });


    test("classifies a leaf without PIC as an empty group", () => {
        const ast = parse(
            "05 EMPTY-GROUP.",
        );

        expect(ast.entries).toEqual([
            group({
                level: 5,
                name: named("EMPTY-GROUP"),
            }),
        ]);
    });


    test("rejects an entry with PIC and subordinate entries", () => {
        const source = [
            "01 ROOT.",
            "    05 VALUE-FIELD PIC X.",
            "        10 CHILD PIC X.",
        ].join("\n");

        expectParseErrors(
            source,
            [
                {
                    message:
                        "An entry with a PIC clause cannot contain subordinate entries",
                    line: 2,
                },
            ],
        );
    });


    test.each([
        "COMP-1",
        "COMP-2",
        "INDEX",
        "POINTER",
    ])(
        "rejects pictureless elementary usage %s with subordinate entries",
        usage => {
            const source = [
                "01 ROOT.",
                `    05 VALUE-FIELD ${usage}.`,
                "        10 CHILD PIC X.",
            ].join("\n");

            expectParseErrors(
                source,
                [
                    {
                        message:
                            "An elementary USAGE entry cannot contain subordinate entries",
                        line: 2,
                    },
                ],
            );
        },
    );


    test("allows ordinary group clauses without making the entry elementary", () => {
        const ast = parse(`
01 ROOT.
    05 ITEMS OCCURS 10.
        10 VALUE-FIELD PIC X.
`);

        expect(ast.entries).toEqual([
            group({
                name: named("ROOT"),
                line: 2,
                children: [
                    group({
                        level: 5,
                        name: named("ITEMS"),
                        clauses: [
                            {
                                kind: "occurs",
                                count: 10,
                            },
                        ],
                        line: 3,
                        children: [
                            elementary({
                                level: 10,
                                picture: "X",
                                line: 4,
                            }),
                        ],
                    }),
                ],
            }),
        ]);
    });


    test("PIC with COMP remains elementary", () => {
        const ast = parse(
            "05 COUNT-FIELD PIC 9(8) COMP.",
        );

        expect(ast.entries).toEqual([
            elementary({
                name: named("COUNT-FIELD"),
                picture: "9(8)",
                clauses: [
                    {
                        kind: "usage",
                        usage: "COMP",
                    },
                ],
            }),
        ]);
    });

});


describe("source separators and comments", () => {

    test("ignores an inline comment", () => {
        const ast = parse(
            "05 NAME PIC X(20). *> customer name",
        );

        expect(ast.entries).toEqual([
            elementary({
                name: named("NAME"),
                picture: "X(20)",
            }),
        ]);
    });


    test("does not treat comment marker inside a double quoted value as a comment", () => {
        const ast = parse(
            `05 TEXT PIC X(20) VALUE "A *> B".`,
        );

        expect(ast.entries).toEqual([
            elementary({
                name: named("TEXT"),
                picture: "X(20)",
                clauses: [
                    {
                        kind: "value",
                        value: '"A *> B"',
                    },
                ],
            }),
        ]);
    });


    test("does not treat comment marker inside a single quoted value as a comment", () => {
        const ast = parse(
            `05 TEXT PIC X(20) VALUE 'A *> B'.`,
        );

        expect(ast.entries).toEqual([
            elementary({
                name: named("TEXT"),
                picture: "X(20)",
                clauses: [
                    {
                        kind: "value",
                        value: "'A *> B'",
                    },
                ],
            }),
        ]);
    });


    test("handles escaped quotes before an inline comment", () => {
        const ast = parse(
            `05 TEXT PIC X(20) VALUE "A ""quoted"" value". *> comment`,
        );

        expect(ast.entries).toEqual([
            elementary({
                name: named("TEXT"),
                picture: "X(20)",
                clauses: [
                    {
                        kind: "value",
                        value: '"A ""quoted"" value"',
                    },
                ],
            }),
        ]);
    });


    test("accepts comma clause separators", () => {
        const ast = parse(
            "05 AMOUNT PIC 9(8), COMP-3.",
        );

        expect(ast.entries).toEqual([
            elementary({
                name: named("AMOUNT"),
                picture: "9(8)",
                clauses: [
                    {
                        kind: "usage",
                        usage: "COMP-3",
                    },
                ],
            }),
        ]);
    });


    test("accepts semicolon clause separators", () => {
        const ast = parse(
            "05 AMOUNT PIC 9(8); COMP-3.",
        );

        expect(ast.entries).toEqual([
            elementary({
                name: named("AMOUNT"),
                picture: "9(8)",
                clauses: [
                    {
                        kind: "usage",
                        usage: "COMP-3",
                    },
                ],
            }),
        ]);
    });


    test("accepts separators between several clauses", () => {
        const ast = parse(
            "05 AMOUNT PIC S9(8), SIGN LEADING; COMP-3.",
        );

        expect(ast.entries).toEqual([
            elementary({
                name: named("AMOUNT"),
                picture: "S9(8)",
                clauses: [
                    {
                        kind: "sign",
                        position: "leading",
                        separate: false,
                    },
                    {
                        kind: "usage",
                        usage: "COMP-3",
                    },
                ],
            }),
        ]);
    });

});


describe("level numbers", () => {

    test.each([
        "00",
        "50",
        "65",
        "67",
        "76",
        "78",
        "99",
    ])(
        "rejects unsupported level %s",
        level => {
            const source =
                `${level} BAD PIC X.`;

            expectParseErrors(
                source,
                [
                    {
                        message:
                            `Unsupported COBOL level number '${level}'`,
                        line: 1,
                    },
                ],
            );
        },
    );


    test.each([
        ["01", 1],
        ["02", 2],
        ["10", 10],
        ["49", 49],
        ["77", 77],
    ])(
        "accepts supported level %s",
        (level, expected) => {
            const ast = parse(
                `${level} VALUE-FIELD PIC X.`,
            );

            expect(ast.entries).toEqual([
                elementary({
                    level: expected,
                    picture: "X",
                }),
            ]);
        },
    );


    test("still gives level 66 its specific unsupported error", () => {
        const source =
            "66 ALTERNATIVE RENAMES A THRU B.";

        expectParseErrors(
            source,
            [
                {
                    message:
                        "Level 66 RENAMES entries are not supported",
                    line: 1,
                },
            ],
        );
    });


    test("rejects a standalone level 88 condition", () => {
        const source =
            "88 ACTIVE VALUE 'A'.";

        expectParseErrors(
            source,
            [
                {
                    message:
                        "Level 88 condition must follow an elementary data item",
                    line: 1,
                },
            ],
        );
    });

});


describe("pictureless elementary usages", () => {

    test.each([
        "COMP-1",
        "COMP-2",
        "COMPUTATIONAL-1",
        "COMPUTATIONAL-2",
        "INDEX",
        "POINTER",
        "FUNCTION-POINTER",
        "PROCEDURE-POINTER",
    ])(
        "classifies direct %s as elementary without PIC",
        usage => {
            const ast = parse(
                `05 VALUE-FIELD ${usage}.`,
            );

            expect(ast.entries).toEqual([
                elementary({
                    clauses: [
                        {
                            kind: "usage",
                            usage,
                        },
                    ],
                }),
            ]);
        },
    );


    test.each([
        "COMP-1",
        "COMP-2",
        "INDEX",
        "POINTER",
        "FUNCTION-POINTER",
        "PROCEDURE-POINTER",
    ])(
        "classifies explicit USAGE %s as elementary without PIC",
        usage => {
            const ast = parse(
                `05 VALUE-FIELD USAGE IS ${usage}.`,
            );

            expect(ast.entries).toEqual([
                elementary({
                    clauses: [
                        {
                            kind: "usage",
                            usage,
                        },
                    ],
                }),
            ]);
        },
    );


    test("pictureless elementary usage can appear among ordinary fields", () => {
        const ast = parse(`
01 ROOT.
    05 NAME PIC X(20).
    05 ADDRESS-POINTER POINTER.
    05 COUNT PIC 9(8).
`);

        expect(ast.entries).toEqual([
            group({
                name: named("ROOT"),
                line: 2,
                children: [
                    elementary({
                        name: named("NAME"),
                        picture: "X(20)",
                        line: 3,
                    }),
                    elementary({
                        name: named("ADDRESS-POINTER"),
                        clauses: [
                            {
                                kind: "usage",
                                usage: "POINTER",
                            },
                        ],
                        line: 4,
                    }),
                    elementary({
                        name: named("COUNT"),
                        picture: "9(8)",
                        line: 5,
                    }),
                ],
            }),
        ]);
    });


    test("rejects pictureless elementary usage with children", () => {
        const source = [
            "01 ROOT.",
            "    05 ADDRESS-POINTER POINTER.",
            "        10 CHILD PIC X.",
        ].join("\n");

        expectParseErrors(
            source,
            [
                {
                    message:
                        "An elementary USAGE entry cannot contain subordinate entries",
                    line: 2,
                },
            ],
        );
    });

});


describe("level 88 condition values", () => {

    test("parses a single VALUE", () => {
        const ast = parse(`
05 STATUS PIC X.
    88 ACTIVE VALUE 'A'.
`);

        expect(ast.entries).toEqual([
            elementary({
                name: named("STATUS"),
                picture: "X",
                line: 2,
                conditions: [
                    condition(
                        "ACTIVE",
                        [conditionValue("'A'")],
                        3,
                    ),
                ],
            }),
        ]);
    });


    test("parses multiple VALUES", () => {
        const ast = parse(`
05 STATUS PIC X.
    88 ACTIVE VALUES 'A' 'B' 'C'.
`);

        expect(ast.entries).toEqual([
            elementary({
                name: named("STATUS"),
                picture: "X",
                line: 2,
                conditions: [
                    condition(
                        "ACTIVE",
                        [
                            conditionValue("'A'"),
                            conditionValue("'B'"),
                            conditionValue("'C'"),
                        ],
                        3,
                    ),
                ],
            }),
        ]);
    });


    test("parses VALUE IS", () => {
        const ast = parse(`
05 STATUS PIC X.
    88 ACTIVE VALUE IS 'A'.
`);

        expect(ast.entries).toEqual([
            elementary({
                name: named("STATUS"),
                picture: "X",
                line: 2,
                conditions: [
                    condition(
                        "ACTIVE",
                        [conditionValue("'A'")],
                        3,
                    ),
                ],
            }),
        ]);
    });


    test("parses VALUES ARE", () => {
        const ast = parse(`
05 STATUS PIC X.
    88 ACTIVE VALUES ARE 'A' 'B'.
`);

        expect(ast.entries).toEqual([
            elementary({
                name: named("STATUS"),
                picture: "X",
                line: 2,
                conditions: [
                    condition(
                        "ACTIVE",
                        [
                            conditionValue("'A'"),
                            conditionValue("'B'"),
                        ],
                        3,
                    ),
                ],
            }),
        ]);
    });


    test("parses a THRU range", () => {
        const ast = parse(`
05 SCORE PIC 9.
    88 VALID VALUE 1 THRU 9.
`);

        expect(ast.entries).toEqual([
            elementary({
                name: named("SCORE"),
                picture: "9",
                line: 2,
                conditions: [
                    condition(
                        "VALID",
                        [conditionRange("1", "9")],
                        3,
                    ),
                ],
            }),
        ]);
    });


    test("parses a THROUGH range", () => {
        const ast = parse(`
05 SCORE PIC 9.
    88 VALID VALUE 1 THROUGH 9.
`);

        expect(ast.entries).toEqual([
            elementary({
                name: named("SCORE"),
                picture: "9",
                line: 2,
                conditions: [
                    condition(
                        "VALID",
                        [conditionRange("1", "9")],
                        3,
                    ),
                ],
            }),
        ]);
    });


    test("parses values and ranges together", () => {
        const ast = parse(`
05 SCORE PIC 9.
    88 VALID VALUES 1 3 THRU 7 9.
`);

        expect(ast.entries).toEqual([
            elementary({
                name: named("SCORE"),
                picture: "9",
                line: 2,
                conditions: [
                    condition(
                        "VALID",
                        [
                            conditionValue("1"),
                            conditionRange("3", "7"),
                            conditionValue("9"),
                        ],
                        3,
                    ),
                ],
            }),
        ]);
    });


    test("parses ALL literal as one value", () => {
        const ast = parse(`
05 FLAG PIC X.
    88 BLANK VALUE ALL ' '.
`);

        expect(ast.entries).toEqual([
            elementary({
                name: named("FLAG"),
                picture: "X",
                line: 2,
                conditions: [
                    condition(
                        "BLANK",
                        [conditionValue("ALL ' '")],
                        3,
                    ),
                ],
            }),
        ]);
    });


    test("requires VALUE or VALUES", () => {
        const source = `
05 STATUS PIC X.
    88 ACTIVE.
`;

        expectParseErrors(
            source,
            [
                {
                    message:
                        "Level 88 condition requires VALUE",
                    line: 3,
                },
            ],
        );
    });


    test("requires a value after VALUE", () => {
        const source = `
05 STATUS PIC X.
    88 ACTIVE VALUE.
`;

        expectParseErrors(
            source,
            [
                {
                    message:
                        "VALUE requires a value",
                    line: 3,
                },
            ],
        );
    });


    test("requires a value after VALUE IS", () => {
        const source = `
05 STATUS PIC X.
    88 ACTIVE VALUE IS.
`;

        expectParseErrors(
            source,
            [
                {
                    message:
                        "VALUE requires a value",
                    line: 3,
                },
            ],
        );
    });


    test("rejects THRU without a lower value", () => {
        const source = `
05 SCORE PIC 9.
    88 VALID VALUE THRU 9.
`;

        expectParseErrors(
            source,
            [
                {
                    message:
                        "THRU requires a preceding condition value",
                    line: 3,
                },
            ],
        );
    });


    test("requires an upper value after THRU", () => {
        const source = `
05 SCORE PIC 9.
    88 VALID VALUE 1 THRU.
`;

        expectParseErrors(
            source,
            [
                {
                    message:
                        "THRU requires an upper value",
                    line: 3,
                },
            ],
        );
    });


    test("requires an upper value after THROUGH", () => {
        const source = `
05 SCORE PIC 9.
    88 VALID VALUE 1 THROUGH.
`;

        expectParseErrors(
            source,
            [
                {
                    message:
                        "THROUGH requires an upper value",
                    line: 3,
                },
            ],
        );
    });


    test("requires a value after ALL", () => {
        const source = `
05 FLAG PIC X.
    88 BLANK VALUE ALL.
`;

        expectParseErrors(
            source,
            [
                {
                    message:
                        "ALL requires a condition value",
                    line: 3,
                },
            ],
        );
    });


    test("rejects another clause after VALUE", () => {
        const source = `
05 STATUS PIC X.
    88 ACTIVE VALUE 'A' PIC X.
`;

        expectParseErrors(
            source,
            [
                {
                    message:
                        "Level 88 condition cannot contain PIC",
                    line: 3,
                },
            ],
        );
    });


    test("rejects FILLER as a level 88 condition name", () => {
        const source = `
05 STATUS PIC X.
    88 FILLER VALUE 'A'.
`;

        expectParseErrors(
            source,
            [
                {
                    message:
                        "Level 88 condition name cannot be FILLER",
                    line: 3,
                },
            ],
        );
    });

});