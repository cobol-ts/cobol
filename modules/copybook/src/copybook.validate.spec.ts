import {
    CopybookAst,
    CopybookClause,
    CopybookEntry,
    ElementaryEntry,
    GroupEntry,
} from "./copybook.ast";

import {
    validateCopybook,
} from "./copybook.validate";


const elementary = (
    overrides: Partial<ElementaryEntry> = {},
): ElementaryEntry => ({
    kind: "elementary",
    level: 5,
    name: {
        kind: "named",
        name: "FIELD",
    },
    picture: "X",
    clauses: [],
    conditions: [],
    line: 1,
    ...overrides,
});


const group = (
    overrides: Partial<GroupEntry> = {},
): GroupEntry => ({
    kind: "group",
    level: 1,
    name: {
        kind: "named",
        name: "ROOT",
    },
    clauses: [],
    children: [],
    line: 1,
    ...overrides,
});


const astWith = (
    ...entries: CopybookEntry[]
): CopybookAst => ({
    metadata: {},
    entries,
});


const validate = (
    ast: CopybookAst,
    source?: string[],
): string[] =>
    validateCopybook(
        "copybook",
        source === undefined
            ? undefined
            : {source},
    )(ast);


describe("validateCopybook", () => {

    describe("valid copybooks", () => {

        test("accepts a simple elementary entry", () => {
            expect(
                validate(
                    astWith(
                        elementary(),
                    ),
                ),
            ).toEqual([]);
        });


        test("accepts nested groups and elementary entries", () => {
            const ast =
                astWith(
                    group({
                        children: [
                            elementary({
                                line: 2,
                            }),
                            group({
                                level: 5,
                                line: 3,
                                children: [
                                    elementary({
                                        level: 10,
                                        line: 4,
                                    }),
                                ],
                            }),
                        ],
                    }),
                );

            expect(
                validate(ast),
            ).toEqual([]);
        });


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
            "accepts pictureless elementary usage %s",
            usage => {
                const ast =
                    astWith(
                        elementary({
                            picture: undefined,
                            clauses: [
                                {
                                    kind: "usage",
                                    usage,
                                },
                            ],
                        }),
                    );

                expect(
                    validate(ast),
                ).toEqual([]);
            },
        );


        test("accepts a positive OCCURS count", () => {
            const ast =
                astWith(
                    elementary({
                        clauses: [
                            {
                                kind: "occurs",
                                count: 10,
                            },
                        ],
                    }),
                );

            expect(
                validate(ast),
            ).toEqual([]);
        });

    });


    describe("entry semantics", () => {

        test("rejects an elementary entry without PIC or elementary-only USAGE", () => {
            const ast =
                astWith(
                    elementary({
                        picture: undefined,
                    }),
                );

            expect(
                validate(ast),
            ).toEqual([
                "copybook.entries[0] is elementary but has neither PIC nor an elementary-only USAGE at source line 1",
            ]);
        });


        test("rejects an elementary-only USAGE on a group", () => {
            const ast =
                astWith(
                    group({
                        clauses: [
                            {
                                kind: "usage",
                                usage: "COMP-1",
                            },
                        ],
                    }),
                );

            expect(
                validate(ast),
            ).toEqual([
                "copybook.entries[0] is a group but has an elementary-only USAGE at source line 1",
            ]);
        });


        test("validates nested entries recursively", () => {
            const ast =
                astWith(
                    group({
                        line: 1,
                        children: [
                            elementary({
                                line: 2,
                                picture: undefined,
                            }),
                        ],
                    }),
                );

            expect(
                validate(ast),
            ).toEqual([
                "copybook.entries[0].children[0] is elementary but has neither PIC nor an elementary-only USAGE at source line 2",
            ]);
        });

    });


    describe("levels", () => {

        test.each([
            1,
            2,
            10,
            49,
            77,
        ])(
            "accepts level %s",
            level => {
                const ast =
                    astWith(
                        elementary({
                            level,
                        }),
                    );

                expect(
                    validate(ast),
                ).toEqual([]);
            },
        );


        test.each([
            0,
            50,
            66,
            76,
            78,
            88,
            99,
        ])(
            "rejects unsupported level %s",
            level => {
                const ast =
                    astWith(
                        elementary({
                            level,
                        }),
                    );

                expect(
                    validate(ast),
                ).toEqual([
                    `copybook.entries[0].level must be between 1 and 49, or 77, but was ${level} at source line 1`,
                ]);
            },
        );

    });


    describe("source lines", () => {

        test.each([
            1,
            2,
            100,
        ])(
            "accepts positive integer source line %s",
            line => {
                const ast =
                    astWith(
                        elementary({
                            line,
                        }),
                    );

                expect(
                    validate(ast),
                ).toEqual([]);
            },
        );


        test.each([
            0,
            -1,
            1.5,
        ])(
            "rejects invalid source line %s",
            line => {
                const ast =
                    astWith(
                        elementary({
                            line,
                        }),
                    );

                expect(
                    validate(ast),
                ).toEqual([
                    `copybook.entries[0].line must be a positive integer but was ${line}`,
                ]);
            },
        );

    });


    describe("OCCURS", () => {

        test.each([
            0,
            -1,
            1.5,
        ])(
            "rejects invalid OCCURS count %s",
            count => {
                const ast =
                    astWith(
                        elementary({
                            clauses: [
                                {
                                    kind: "occurs",
                                    count,
                                },
                            ],
                        }),
                    );

                expect(
                    validate(ast),
                ).toEqual([
                    "copybook.entries[0].clauses[0].count must be a positive integer at source line 1",
                ]);
            },
        );


        test("does not add a semantic count error when count has the wrong type", () => {
            const ast =
                astWith(
                    elementary({
                        clauses: [
                            {
                                kind: "occurs",
                                count: "ten",
                            } as any,
                        ],
                    }),
                );

            const errors =
                validate(ast);

            expect(errors).toEqual([
                "copybook.entries[0].clauses[0].count must be a number at source line 1",
            ]);
        });


        test("accepts a valid variable OCCURS range", () => {
            const ast =
                astWith(
                    elementary({
                        clauses: [
                            {
                                kind: "occurs",
                                min: 0,
                                max: 100,
                                dependingOn: "COUNT",
                            },
                        ],
                    }),
                );

            expect(validate(ast)).toEqual([]);
        });


        test.each([
            -1,
            1.5,
        ])(
            "rejects invalid OCCURS minimum %s",
            min => {
                const ast =
                    astWith(
                        elementary({
                            clauses: [
                                {
                                    kind: "occurs",
                                    min,
                                    max: 10,
                                    dependingOn: "COUNT",
                                },
                            ],
                        }),
                    );

                expect(validate(ast)).toEqual([
                    "copybook.entries[0].clauses[0].min must be a non-negative integer at source line 1",
                ]);
            },
        );


        test.each([
            0,
            -1,
            1.5,
        ])(
            "rejects invalid OCCURS maximum %s",
            max => {
                const ast =
                    astWith(
                        elementary({
                            clauses: [
                                {
                                    kind: "occurs",
                                    min: 0,
                                    max,
                                    dependingOn: "COUNT",
                                },
                            ],
                        }),
                    );

                expect(validate(ast)).toEqual([
                    "copybook.entries[0].clauses[0].max must be a positive integer at source line 1",
                ]);
            },
        );


        test("rejects an OCCURS minimum greater than maximum", () => {
            const ast =
                astWith(
                    elementary({
                        clauses: [
                            {
                                kind: "occurs",
                                min: 11,
                                max: 10,
                                dependingOn: "COUNT",
                            },
                        ],
                    }),
                );

            expect(validate(ast)).toEqual([
                "copybook.entries[0].clauses[0].min must not exceed max at source line 1",
            ]);
        });


        test.each([
            1,
            77,
        ])(
            "rejects OCCURS at level %s",
            level => {
                const ast =
                    astWith(
                        elementary({
                            level,
                            clauses: [
                                {
                                    kind: "occurs",
                                    count: 10,
                                },
                            ],
                        }),
                    );

                expect(validate(ast)).toEqual([
                    `copybook.entries[0].clauses[0] OCCURS is not allowed at level ${level} at source line 1`,
                ]);
            },
        );


        test("rejects an empty OCCURS DEPENDING ON name", () => {
            const ast =
                astWith(
                    elementary({
                        clauses: [
                            {
                                kind: "occurs",
                                min: 0,
                                max: 10,
                                dependingOn: "   ",
                            },
                        ],
                    }),
                );

            expect(validate(ast)).toEqual([
                "copybook.entries[0].clauses[0].dependingOn must not be empty at source line 1",
            ]);
        });


        test("rejects empty OCCURS key and index declarations", () => {
            const ast =
                astWith(
                    elementary({
                        clauses: [
                            {
                                kind: "occurs",
                                count: 10,
                                keys: [],
                                indexedBy: [],
                            },
                        ],
                    }),
                );

            expect(validate(ast)).toEqual([
                "copybook.entries[0].clauses[0].keys must contain at least one key at source line 1",
                "copybook.entries[0].clauses[0].indexedBy must contain at least one name at source line 1",
            ]);
        });


        test("rejects empty OCCURS key names and index names", () => {
            const ast =
                astWith(
                    elementary({
                        clauses: [
                            {
                                kind: "occurs",
                                count: 10,
                                keys: [
                                    {
                                        order: "ascending",
                                        names: [],
                                    },
                                    {
                                        order: "descending",
                                        names: ["   "],
                                    },
                                ],
                                indexedBy: [""],
                            },
                        ],
                    }),
                );

            expect(validate(ast)).toEqual([
                "copybook.entries[0].clauses[0].keys[0].names must contain at least one name at source line 1",
                "copybook.entries[0].clauses[0].keys[1].names[0] must not be empty at source line 1",
                "copybook.entries[0].clauses[0].indexedBy[0] must not be empty at source line 1",
            ]);
        });


        test("rejects non-array OCCURS keys and indexes", () => {
            const ast =
                astWith(
                    elementary({
                        clauses: [
                            {
                                kind: "occurs",
                                count: 10,
                                keys: "wrong",
                                indexedBy: "wrong",
                            } as any,
                        ],
                    }),
                );

            expect(validate(ast)).toEqual([
                "copybook.entries[0].clauses[0].keys must be an array at source line 1",
                "copybook.entries[0].clauses[0].indexedBy must be an array at source line 1",
            ]);
        });


        test("rejects malformed OCCURS key structures", () => {
            const ast =
                astWith(
                    elementary({
                        clauses: [
                            {
                                kind: "occurs",
                                count: 10,
                                keys: [
                                    null,
                                    {
                                        order: "ascending",
                                        names: "wrong",
                                    },
                                ],
                            } as any,
                        ],
                    }),
                );

            expect(validate(ast)).toEqual([
                "copybook.entries[0].clauses[0].keys[0] must be an object at source line 1",
                "copybook.entries[0].clauses[0].keys[1].names must be an array at source line 1",
            ]);
        });


        test("accepts OCCURS keys and indexes", () => {
            const ast =
                astWith(
                    elementary({
                        clauses: [
                            {
                                kind: "occurs",
                                count: 10,
                                keys: [
                                    {
                                        order: "ascending",
                                        names: ["CODE"],
                                    },
                                ],
                                indexedBy: ["IX", "IX2"],
                            },
                        ],
                    }),
                );

            expect(validate(ast)).toEqual([]);
        });


        test("rejects malformed OCCURS keys and indexes", () => {
            const ast =
                astWith(
                    elementary({
                        clauses: [
                            {
                                kind: "occurs",
                                count: 10,
                                keys: [
                                    {
                                        order: "sideways",
                                        names: [123],
                                    },
                                ],
                                indexedBy: [456],
                            } as any,
                        ],
                    }),
                );

            expect(validate(ast)).toEqual([
                "copybook.entries[0].clauses[0].keys[0].order must be one of ascending, descending but was sideways at source line 1",
                "copybook.entries[0].clauses[0].keys[0].names[0] must be a string at source line 1",
                "copybook.entries[0].clauses[0].indexedBy[0] must be a string at source line 1",
            ]);
        });

    });


    describe("duplicate clauses", () => {

        const duplicateClauseCases: Array<{
            name: string;
            clauses: CopybookClause[];
        }> = [
            {
                name: "occurs",
                clauses: [
                    {
                        kind: "occurs",
                        count: 2,
                    },
                    {
                        kind: "occurs",
                        count: 3,
                    },
                ],
            },
            {
                name: "usage",
                clauses: [
                    {
                        kind: "usage",
                        usage: "DISPLAY",
                    },
                    {
                        kind: "usage",
                        usage: "COMP-3",
                    },
                ],
            },
            {
                name: "sign",
                clauses: [
                    {
                        kind: "sign",
                    },
                    {
                        kind: "sign",
                    },
                ],
            },
            {
                name: "value",
                clauses: [
                    {
                        kind: "value",
                        value: "1",
                    },
                    {
                        kind: "value",
                        value: "2",
                    },
                ],
            },
            {
                name: "justified",
                clauses: [
                    {
                        kind: "justified",
                    },
                    {
                        kind: "justified",
                    },
                ],
            },
            {
                name: "blank-when-zero",
                clauses: [
                    {
                        kind: "blank-when-zero",
                    },
                    {
                        kind: "blank-when-zero",
                    },
                ],
            },
            {
                name: "synchronized",
                clauses: [
                    {
                        kind: "synchronized",
                    },
                    {
                        kind: "synchronized",
                    },
                ],
            },
        ];


        test.each(
            duplicateClauseCases,
        )(
            "rejects duplicate $name clauses",
            ({name, clauses}) => {
                const ast =
                    astWith(
                        elementary({
                            clauses,
                        }),
                    );

                expect(
                    validate(ast),
                ).toEqual([
                    `copybook.entries[0].clauses contains 2 ${name} clauses; at most one is allowed at source line 1`,
                ]);
            },
        );


        test("aggregates multiple duplicate clause errors", () => {
            const ast =
                astWith(
                    elementary({
                        clauses: [
                            {
                                kind: "usage",
                                usage: "DISPLAY",
                            },
                            {
                                kind: "usage",
                                usage: "COMP-3",
                            },
                            {
                                kind: "value",
                                value: "1",
                            },
                            {
                                kind: "value",
                                value: "2",
                            },
                        ],
                    }),
                );

            expect(
                validate(ast),
            ).toEqual([
                "copybook.entries[0].clauses contains 2 usage clauses; at most one is allowed at source line 1",
                "copybook.entries[0].clauses contains 2 value clauses; at most one is allowed at source line 1",
            ]);
        });

    });


    describe("shape validation", () => {

        test("rejects an invalid entry kind", () => {
            const ast =
                astWith({
                    ...elementary(),
                    kind: "banana",
                } as any);

            expect(
                validate(ast),
            ).toEqual([
                "copybook.entries[0] has illegal type banana. Legal values are: elementary, group at source line 1",
            ]);
        });


        test("rejects an entry with no kind", () => {
            const entry = {
                ...elementary(),
            } as any;

            delete entry.kind;

            const ast =
                astWith(entry);

            expect(
                validate(ast),
            ).toEqual([
                "copybook.entries[0] has no valid type at source line 1",
            ]);
        });


        test("rejects a non-number level", () => {
            const ast =
                astWith({
                    ...elementary(),
                    level: "five",
                } as any);

            expect(
                validate(ast),
            ).toEqual([
                "copybook.entries[0].level must be a number at source line 1",
            ]);
        });


        test("rejects a non-string picture", () => {
            const ast =
                astWith({
                    ...elementary(),
                    picture: 123,
                } as any);

            expect(
                validate(ast),
            ).toEqual([
                "copybook.entries[0].picture must be a string at source line 1",
            ]);
        });


        test("rejects a non-array clauses value", () => {
            const ast =
                astWith({
                    ...elementary(),
                    clauses: "not-an-array",
                } as any);

            expect(
                validate(ast),
            ).toEqual([
                "copybook.entries[0].clauses must be an array at source line 1",
            ]);
        });


        test("rejects a non-array children value", () => {
            const ast =
                astWith({
                    ...group(),
                    children: "not-an-array",
                } as any);

            expect(
                validate(ast),
            ).toEqual([
                "copybook.entries[0].children must be an array at source line 1",
            ]);
        });


        test("rejects an OCCURS clause with a non-number count", () => {
            const ast =
                astWith(
                    elementary({
                        clauses: [
                            {
                                kind: "occurs",
                                count: "ten",
                            } as any,
                        ],
                    }),
                );

            expect(
                validate(ast),
            ).toEqual([
                "copybook.entries[0].clauses[0].count must be a number at source line 1",
            ]);
        });


        test("rejects an invalid SIGN position", () => {
            const ast =
                astWith(
                    elementary({
                        clauses: [
                            {
                                kind: "sign",
                                position: "middle",
                            } as any,
                        ],
                    }),
                );

            expect(
                validate(ast),
            ).toEqual([
                "copybook.entries[0].clauses[0].position must be one of leading, trailing but was middle at source line 1",
            ]);
        });


        test("rejects an invalid SYNCHRONIZED position", () => {
            const ast =
                astWith(
                    elementary({
                        clauses: [
                            {
                                kind: "synchronized",
                                position: "middle",
                            } as any,
                        ],
                    }),
                );

            expect(
                validate(ast),
            ).toEqual([
                "copybook.entries[0].clauses[0].position must be one of left, right but was middle at source line 1",
            ]);
        });


        test("rejects a non-object entry", () => {
            const ast =
                astWith(
                    123 as any,
                );

            expect(
                validate(ast),
            ).toEqual([
                "copybook.entries[0] has no valid type",
            ]);
        });

    });


    describe("error aggregation", () => {

        test("collects semantic errors from multiple entries", () => {
            const ast =
                astWith(
                    elementary({
                        level: 0,
                        line: 1,
                    }),
                    elementary({
                        picture: undefined,
                        line: 2,
                    }),
                );

            expect(
                validate(ast),
            ).toEqual([
                "copybook.entries[0].level must be between 1 and 49, or 77, but was 0 at source line 1",
                "copybook.entries[1] is elementary but has neither PIC nor an elementary-only USAGE at source line 2",
            ]);
        });

    });


    describe("source diagnostics", () => {

        test("works without validation options", () => {
            const ast =
                astWith(
                    elementary({
                        level: 0,
                        line: 2,
                    }),
                );

            expect(
                validate(ast),
            ).toEqual([
                "copybook.entries[0].level must be between 1 and 49, or 77, but was 0 at source line 2",
            ]);
        });


        test("works when options exist but source is absent", () => {
            const ast =
                astWith(
                    elementary({
                        level: 0,
                        line: 2,
                    }),
                );

            const errors =
                validateCopybook(
                    "copybook",
                    {
                        source: undefined,
                    },
                )(ast);

            expect(errors).toEqual([
                "copybook.entries[0].level must be between 1 and 49, or 77, but was 0 at source line 2",
            ]);
        });


        test("shows current and following line for the first source line", () => {
            const source = [
                "01 BAD.",
                "05 NEXT PIC X.",
                "05 LAST PIC X.",
            ];

            const ast =
                astWith(
                    elementary({
                        level: 0,
                        line: 1,
                    }),
                );

            expect(
                validate(
                    ast,
                    source,
                ),
            ).toEqual([
                [
                    "copybook.entries[0].level must be between 1 and 49, or 77, but was 0 at source line 1",
                    "",
                    "> 1 | 01 BAD.",
                    "  2 | 05 NEXT PIC X.",
                ].join("\n"),
            ]);
        });


        test("shows previous, current and following source lines", () => {
            const source = [
                "01 ROOT.",
                "05 BAD.",
                "05 NEXT PIC X.",
            ];

            const ast =
                astWith(
                    elementary({
                        picture: undefined,
                        line: 2,
                    }),
                );

            expect(
                validate(
                    ast,
                    source,
                ),
            ).toEqual([
                [
                    "copybook.entries[0] is elementary but has neither PIC nor an elementary-only USAGE at source line 2",
                    "",
                    "  1 | 01 ROOT.",
                    "> 2 | 05 BAD.",
                    "  3 | 05 NEXT PIC X.",
                ].join("\n"),
            ]);
        });


        test("shows previous and current line for the final source line", () => {
            const source = [
                "01 ROOT.",
                "05 GOOD PIC X.",
                "05 BAD.",
            ];

            const ast =
                astWith(
                    elementary({
                        picture: undefined,
                        line: 3,
                    }),
                );

            expect(
                validate(
                    ast,
                    source,
                ),
            ).toEqual([
                [
                    "copybook.entries[0] is elementary but has neither PIC nor an elementary-only USAGE at source line 3",
                    "",
                    "  2 | 05 GOOD PIC X.",
                    "> 3 | 05 BAD.",
                ].join("\n"),
            ]);
        });


        test("uses source for shape validation errors", () => {
            const source = [
                "01 ROOT.",
                "05 BAD PIC X.",
                "05 NEXT PIC X.",
            ];

            const ast =
                astWith({
                    ...elementary({
                        line: 2,
                    }),
                    level: "five",
                } as any);

            expect(
                validate(
                    ast,
                    source,
                ),
            ).toEqual([
                [
                    "copybook.entries[0].level must be a number at source line 2",
                    "",
                    "  1 | 01 ROOT.",
                    "> 2 | 05 BAD PIC X.",
                    "  3 | 05 NEXT PIC X.",
                ].join("\n"),
            ]);
        });


        test("uses the child entry line rather than the parent line", () => {
            const source = [
                "01 ROOT.",
                "05 GOOD PIC X.",
                "05 BAD.",
                "05 AFTER PIC X.",
            ];

            const ast =
                astWith(
                    group({
                        line: 1,
                        children: [
                            elementary({
                                line: 2,
                            }),
                            elementary({
                                line: 3,
                                picture: undefined,
                            }),
                        ],
                    }),
                );

            expect(
                validate(
                    ast,
                    source,
                ),
            ).toEqual([
                [
                    "copybook.entries[0].children[1] is elementary but has neither PIC nor an elementary-only USAGE at source line 3",
                    "",
                    "  2 | 05 GOOD PIC X.",
                    "> 3 | 05 BAD.",
                    "  4 | 05 AFTER PIC X.",
                ].join("\n"),
            ]);
        });


        test("does not fail when the AST line is beyond the supplied source", () => {
            const source = [
                "01 ROOT.",
            ];

            const ast =
                astWith(
                    elementary({
                        level: 0,
                        line: 10,
                    }),
                );

            expect(
                validate(
                    ast,
                    source,
                ),
            ).toEqual([
                "copybook.entries[0].level must be between 1 and 49, or 77, but was 0 at source line 10",
            ]);
        });


        test("uses source for clause shape errors", () => {
            const source = [
                "01 ROOT.",
                "05 BAD PIC X SIGN MIDDLE.",
                "05 AFTER PIC X.",
            ];

            const ast =
                astWith(
                    elementary({
                        line: 2,
                        clauses: [
                            {
                                kind: "sign",
                                position: "middle",
                            } as any,
                        ],
                    }),
                );

            expect(
                validate(
                    ast,
                    source,
                ),
            ).toEqual([
                [
                    "copybook.entries[0].clauses[0].position must be one of leading, trailing but was middle at source line 2",
                    "",
                    "  1 | 01 ROOT.",
                    "> 2 | 05 BAD PIC X SIGN MIDDLE.",
                    "  3 | 05 AFTER PIC X.",
                ].join("\n"),
            ]);
        });

    });

});
describe("level 88 conditions", () => {

    test("accepts a valid condition", () => {
        const ast =
            astWith(
                elementary({
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
                            line: 2,
                        },
                    ],
                }),
            );

        expect(
            validate(ast),
        ).toEqual([]);
    });


    test("accepts a condition with multiple values", () => {
        const ast =
            astWith(
                elementary({
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
                                {
                                    kind: "value",
                                    value: "'B'",
                                },
                            ],
                            line: 2,
                        },
                    ],
                }),
            );

        expect(
            validate(ast),
        ).toEqual([]);
    });


    test("accepts a condition range", () => {
        const ast =
            astWith(
                elementary({
                    conditions: [
                        {
                            kind: "condition",
                            level: 88,
                            name: {
                                kind: "named",
                                name: "VALID",
                            },
                            values: [
                                {
                                    kind: "range",
                                    from: "1",
                                    to: "9",
                                },
                            ],
                            line: 2,
                        },
                    ],
                }),
            );

        expect(
            validate(ast),
        ).toEqual([]);
    });


    test("rejects FILLER as a condition name", () => {
        const ast =
            astWith(
                elementary({
                    conditions: [
                        {
                            kind: "condition",
                            level: 88,
                            name: {
                                kind: "filler",
                            },
                            values: [
                                {
                                    kind: "value",
                                    value: "'A'",
                                },
                            ],
                            line: 2,
                        },
                    ],
                }),
            );

        expect(
            validate(ast),
        ).toEqual([
            "copybook.entries[0].conditions[0].name cannot be FILLER at source line 2",
        ]);
    });


    test("rejects a condition with no values", () => {
        const ast =
            astWith(
                elementary({
                    conditions: [
                        {
                            kind: "condition",
                            level: 88,
                            name: {
                                kind: "named",
                                name: "ACTIVE",
                            },
                            values: [],
                            line: 2,
                        },
                    ],
                }),
            );

        expect(
            validate(ast),
        ).toEqual([
            "copybook.entries[0].conditions[0].values must contain at least one value at source line 2",
        ]);
    });


    test("rejects a condition with the wrong level", () => {
        const ast =
            astWith(
                elementary({
                    conditions: [
                        {
                            kind: "condition",
                            level: 77,
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
                            line: 2,
                        } as any,
                    ],
                }),
            );

        expect(
            validate(ast),
        ).toEqual([
            "copybook.entries[0].conditions[0].level must be 88 but was 77 at source line 1",
        ]);
    });


    test("rejects an invalid condition value kind", () => {
        const ast =
            astWith(
                elementary({
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
                                    kind: "banana",
                                    value: "'A'",
                                } as any,
                            ],
                            line: 2,
                        },
                    ],
                }),
            );

        expect(
            validate(ast),
        ).toEqual([
            "copybook.entries[0].conditions[0].values[0] has illegal type banana. Legal values are: range, value at source line 1",
        ]);
    });


    test("rejects a non-array conditions value", () => {
        const ast =
            astWith({
                ...elementary(),
                conditions: "not-an-array",
            } as any);

        expect(
            validate(ast),
        ).toEqual([
            "copybook.entries[0].conditions must be an array at source line 1",
        ]);
    });

});