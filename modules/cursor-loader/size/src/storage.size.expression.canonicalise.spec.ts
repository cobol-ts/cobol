import type { StorageSizeExpression } from "./size.expression.grammer";
import { canonicaliseStorageSize } from "./storage.size.expression.canonicalise";
import { evaluateStorageSize, type ResolvedPath } from "./storage.size.expression.evaluate";

const noLookup = (_path: ResolvedPath): unknown => {
    throw new Error("Fixed-size copybook must not read an OCCURS count");
};

/*
 * 01 CUSTOMER-RECORD.
 *    05 AGE PIC 99.
 *    05 NAME PIC X(30).
 *    05 POSTCODE PIC X(8).
 */
describe("canonicalise CUSTOMER-RECORD: consecutive fixed fields", () => {
    const expression = { kind: "sum", terms: [16, { kind: "sum", terms: [240, 64] }] } as const satisfies StorageSizeExpression;

    test("flattens nested groups and produces the constant record size", () => {
        expect(canonicaliseStorageSize(expression)).toBe(320);
        expect(evaluateStorageSize(canonicaliseStorageSize(expression), noLookup)).toBe(320);
    });
});

/*
 * 01 WAREHOUSE-RECORD.
 *    05 SHELVES OCCURS 2 TIMES.
 *       10 BINS OCCURS 3 TIMES.
 *          15 CODE PIC X(4).
 *          15 QUANTITY PIC 9(3).
 */
describe("canonicalise WAREHOUSE-RECORD: nested fixed OCCURS", () => {
    const expression = {
        kind: "occurs", count: 2,
        expression: { kind: "occurs", count: 3, expression: { kind: "sum", terms: [32, 24] } },
    } as const satisfies StorageSizeExpression;

    test("collapses to the constant size when each occurrence is invariant", () => {
        expect(canonicaliseStorageSize(expression)).toBe(336);
        expect(evaluateStorageSize(expression, noLookup)).toBe(336);
    });
});

/*
 * 01 MESSAGE-RECORD.
 *    05 RAW-TEXT PIC X(12).
 *    05 STRUCTURED REDEFINES RAW-TEXT.
 *       10 HEADER PIC X(2).
 *       10 CONTENT PIC X(10).
 */
describe("canonicalise MESSAGE-RECORD: REDEFINES", () => {
    test("collapses nested maxima to their largest fixed extent", () => {
        const expression = { kind: "max", terms: [96, { kind: "max", terms: [16, 80] }] } as const satisfies StorageSizeExpression;
        expect(canonicaliseStorageSize(expression)).toBe(96);
    });
});

/*
 * 01 ORDER-RECORD.
 *    05 ITEM-COUNT PIC 9.
 *    05 ITEMS OCCURS 0 TO 9 TIMES DEPENDING ON ITEM-COUNT.
 *       10 ITEM PIC X(10).
 */
describe("canonicalise ORDER-RECORD: variable OCCURS", () => {
    const expression = {
        kind: "sum", terms: [8, {
            kind: "depending-on", path: ["ORDER-RECORD", "ITEM-COUNT"],
            expression: { kind: "sum", terms: [40, 40] },
        }],
    } as const satisfies StorageSizeExpression;

    test("simplifies the body without discarding the record dependency", () => {
        const canonical = canonicaliseStorageSize(expression);
        expect(canonical).toEqual({ kind: "sum", terms: [
                { kind: "depending-on", path: ["ORDER-RECORD", "ITEM-COUNT"], expression: 80 },
                8,
            ] });
        for (const count of [0, 1, 4]) {
            const lookup = () => count;
            expect(evaluateStorageSize(canonical, lookup)).toBe(evaluateStorageSize(expression, lookup));
        }
    });
});

/*
 * 01 BATCH-RECORD.
 *    05 GROUPS OCCURS 3 TIMES.
 *       10 ITEM-COUNT PIC 9.
 *       10 ITEMS OCCURS 0 TO 9 TIMES DEPENDING ON ITEM-COUNT.
 *          15 ITEM PIC X(10).
 */
describe("canonicalise BATCH-RECORD: fixed OCCURS containing a dependency", () => {
    const expression = {
        kind: "occurs", count: 3,
        expression: { kind: "sum", terms: [8, {
                kind: "depending-on", path: ["BATCH-RECORD", "GROUPS", 0, "ITEM-COUNT"],
                expression: { kind: "sum", terms: [40, 40] },
            }] },
    } as const satisfies StorageSizeExpression;

    test("preserves indexed iteration and simplifies constant subexpressions", () => {
        const canonical = canonicaliseStorageSize(expression);
        expect(canonical).toEqual({ kind: "occurs", count: 3, expression: {
                kind: "sum", terms: [{ kind: "depending-on",
                    path: ["BATCH-RECORD", "GROUPS", 0, "ITEM-COUNT"], expression: 80 }, 8],
            } });
        const counts = [2, 5, 1];
        const lookup = (path: ResolvedPath): unknown => counts[path[2] as number];
        expect(evaluateStorageSize(expression, lookup)).toBe(664);
        expect(evaluateStorageSize(canonical, lookup)).toBe(664);
    });
});

/*
 * 01 SINGLE-GROUP.
 *    05 GROUPS OCCURS 1 TIMES.
 *       10 COUNT-FIELD PIC 9.
 *       10 VALUES OCCURS 0 TO 9 TIMES DEPENDING ON COUNT-FIELD.
 *          15 VALUE PIC X.
 */
describe("canonicalise SINGLE-GROUP: preserve a needed index binding", () => {
    test("does not unwrap OCCURS 1 when its child refers to depth zero", () => {
        const expression = { kind: "occurs", count: 1, expression: {
                kind: "sum", terms: [8, { kind: "depending-on",
                    path: ["SINGLE-GROUP", "GROUPS", 0, "COUNT-FIELD"], expression: 8,
                }],
            } } as const satisfies StorageSizeExpression;
        const canonical = canonicaliseStorageSize(expression);
        expect(typeof canonical).not.toBe("number");
        expect(canonical).toMatchObject({ kind: "occurs", count: 1 });
        const lookup = (path: ResolvedPath): unknown => {
            expect(path).toEqual(["SINGLE-GROUP", "GROUPS", 0, "COUNT-FIELD"]);
            return 3;
        };
        expect(evaluateStorageSize(canonical, lookup)).toBe(32);
    });
});

describe("canonicalise: algebraic identities", () => {
    test("handles empty sums/maxima and zero fixed occurrences", () => {
        expect(canonicaliseStorageSize({ kind: "sum", terms: [] })).toBe(0);
        expect(canonicaliseStorageSize({ kind: "max", terms: [] })).toBe(0);
        expect(canonicaliseStorageSize({ kind: "occurs", count: 0, expression: 80 })).toBe(0);
    });

    test("is idempotent and leaves its input intact", () => {
        const original = { kind: "sum", terms: [0, { kind: "sum", terms: [8, 16] }] } as const satisfies StorageSizeExpression;
        const canonical = canonicaliseStorageSize(original);
        expect(canonicaliseStorageSize(canonical)).toEqual(canonical);
        expect(original.terms[1]).toEqual({ kind: "sum", terms: [8, 16] });
    });
});

/*
 * 01 BATCH-RECORD.
 *    05 GROUP-COUNT PIC 9.
 *    05 GROUPS OCCURS 0 TO 9 TIMES DEPENDING ON GROUP-COUNT.
 *       10 ITEM-COUNT PIC 9.
 *       10 ITEMS OCCURS 0 TO 9 TIMES DEPENDING ON ITEM-COUNT.
 *          15 ITEM-CODE PIC X(2).
 *          15 ITEM-VALUE PIC 9(2).
 *
 * Two nested DEPENDING ON declarations. The inner count is different
 * for each group, so neither repetition can be replaced by a fixed
 * multiplication. The fixed-size ITEM body can still be folded.
 */
describe("canonicalise BATCH-RECORD: two nested DEPENDING ON", () => {
    const expression = {
        kind: "sum",
        terms: [8, {
            kind: "depending-on",
            path: ["BATCH-RECORD", "GROUP-COUNT"],
            expression: {
                kind: "sum",
                terms: [8, {
                    kind: "depending-on",
                    path: ["BATCH-RECORD", "GROUPS", 0, "ITEM-COUNT"],
                    expression: { kind: "sum", terms: [16, 16] },
                }],
            },
        }],
    } as const satisfies StorageSizeExpression;

    test("folds each ITEM body but preserves both dependent repetitions", () => {
        const canonical = canonicaliseStorageSize(expression);
        expect(canonical).toEqual({
            kind: "sum", terms: [{
                kind: "depending-on",
                path: ["BATCH-RECORD", "GROUP-COUNT"],
                expression: {
                    kind: "sum", terms: [{
                        kind: "depending-on",
                        path: ["BATCH-RECORD", "GROUPS", 0, "ITEM-COUNT"],
                        expression: 32,
                    }, 8],
                },
            }, 8],
        });
    });

    test.each([
        { counts: [] as number[], expected: 8 },
        { counts: [0], expected: 16 },
        { counts: [2, 3], expected: 184 },
        { counts: [3, 0, 1], expected: 160 },
    ])("preserves per-group counts $counts and size $expected", ({ counts, expected }) => {
        const seen: ResolvedPath[] = [];
        const lookup = (path: ResolvedPath): unknown => {
            seen.push([...path]);
            if (path.length === 2) return counts.length;
            return counts[path[2] as number];
        };
        const canonical = canonicaliseStorageSize(expression);
        expect(evaluateStorageSize(expression, lookup)).toBe(expected);
        expect(evaluateStorageSize(canonical, lookup)).toBe(expected);
        expect(canonicaliseStorageSize(canonical)).toEqual(canonical);
        // Both evaluations only ask for the count fields that actually exist.
        expect(seen.slice(0, counts.length + 1)).toEqual([
            ["BATCH-RECORD", "GROUP-COUNT"],
            ...counts.map((_, index) => ["BATCH-RECORD", "GROUPS", index, "ITEM-COUNT"]),
        ]);
    });
});

/*
 * 01 DEEP-RECORD.
 *    05 GROUP-COUNT PIC 9.
 *    05 GROUPS OCCURS 0 TO 9 TIMES DEPENDING ON GROUP-COUNT.
 *       10 ITEM-COUNT PIC 9.
 *       10 ITEMS OCCURS 0 TO 9 TIMES DEPENDING ON ITEM-COUNT.
 *          15 DETAIL-COUNT PIC 9.
 *          15 DETAILS OCCURS 0 TO 9 TIMES DEPENDING ON DETAIL-COUNT.
 *             20 DETAIL-CODE PIC X(2).
 *             20 DETAIL-VALUE PIC X(2).
 *
 * The innermost count path uses TWO different enclosing indices:
 * depth 1 for GROUPS and depth 0 for ITEMS. Canonicalisation must not
 * remove either binding, even when it simplifies the fixed DETAIL body.
 */
describe("canonicalise DEEP-RECORD: three nested DEPENDING ON", () => {
    const expression = {
        kind: "sum", terms: [8, {
            kind: "depending-on", path: ["DEEP-RECORD", "GROUP-COUNT"],
            expression: {
                kind: "sum", terms: [8, {
                    kind: "depending-on", path: ["DEEP-RECORD", "GROUPS", 0, "ITEM-COUNT"],
                    expression: {
                        kind: "sum", terms: [8, {
                            kind: "depending-on",
                            path: ["DEEP-RECORD", "GROUPS", 1, "ITEMS", 0, "DETAIL-COUNT"],
                            expression: { kind: "sum", terms: [16, 16] },
                        }],
                    },
                }],
            },
        }],
    } as const satisfies StorageSizeExpression;

    test("preserves all three dependencies and both relative path depths", () => {
        const canonical = canonicaliseStorageSize(expression);
        expect(canonical).toEqual({
            kind: "sum", terms: [{
                kind: "depending-on", path: ["DEEP-RECORD", "GROUP-COUNT"],
                expression: {
                    kind: "sum", terms: [{
                        kind: "depending-on", path: ["DEEP-RECORD", "GROUPS", 0, "ITEM-COUNT"],
                        expression: {
                            kind: "sum", terms: [{
                                kind: "depending-on",
                                path: ["DEEP-RECORD", "GROUPS", 1, "ITEMS", 0, "DETAIL-COUNT"],
                                expression: 32,
                            }, 8],
                        },
                    }, 8],
                },
            }, 8],
        });
    });

    test("evaluates different detail counts for different items and groups", () => {
        const details = [[1, 3], [2]];
        const seen: ResolvedPath[] = [];
        const lookup = (path: ResolvedPath): unknown => {
            seen.push([...path]);
            if (path.length === 2) return details.length;
            const group = path[2] as number;
            if (path[3] === "ITEM-COUNT") return details[group].length;
            return details[group][path[4] as number];
        };
        const canonical = canonicaliseStorageSize(expression);
        expect(evaluateStorageSize(expression, lookup)).toBe(240);
        expect(seen).toEqual([
            ["DEEP-RECORD", "GROUP-COUNT"],
            ["DEEP-RECORD", "GROUPS", 0, "ITEM-COUNT"],
            ["DEEP-RECORD", "GROUPS", 0, "ITEMS", 0, "DETAIL-COUNT"],
            ["DEEP-RECORD", "GROUPS", 0, "ITEMS", 1, "DETAIL-COUNT"],
            ["DEEP-RECORD", "GROUPS", 1, "ITEM-COUNT"],
            ["DEEP-RECORD", "GROUPS", 1, "ITEMS", 0, "DETAIL-COUNT"],
        ]);
        seen.length = 0;
        expect(evaluateStorageSize(canonical, lookup)).toBe(240);
        expect(seen).toHaveLength(6);
        expect(canonicaliseStorageSize(canonical)).toEqual(canonical);
    });

    test("does not resolve nonexistent descendants when an inner count is zero", () => {
        const seen: ResolvedPath[] = [];
        const lookup = (path: ResolvedPath): unknown => {
            seen.push([...path]);
            if (path.length === 2) return 2;
            if (path[3] === "ITEM-COUNT") return path[2] === 0 ? 0 : 1;
            return 0;
        };
        // GROUP-COUNT(8) + GROUP[0](8) + GROUP[1](8)
        // + ITEM[0] in GROUP[1] (DETAIL-COUNT 8, zero details).
        expect(evaluateStorageSize(canonicaliseStorageSize(expression), lookup)).toBe(32);
        expect(seen).toEqual([
            ["DEEP-RECORD", "GROUP-COUNT"],
            ["DEEP-RECORD", "GROUPS", 0, "ITEM-COUNT"],
            ["DEEP-RECORD", "GROUPS", 1, "ITEM-COUNT"],
            ["DEEP-RECORD", "GROUPS", 1, "ITEMS", 0, "DETAIL-COUNT"],
        ]);
    });
});

/*
 * 01 OVERLAY-RECORD.
 *    05 ITEM-COUNT PIC 9.
 *    05 RAW-AREA PIC X(8).
 *    05 STRUCTURED-AREA REDEFINES RAW-AREA.
 *       10 ITEMS OCCURS 0 TO 9 TIMES DEPENDING ON ITEM-COUNT.
 *          15 CODE PIC X(4).
 *
 * This models a variable-sized overlay mathematically. Whether a dialect
 * permits this particular REDEFINES/ODO combination is a separate check.
 * The shared extent is the maximum of the alternative representations.
 */
describe("canonicalise OVERLAY-RECORD: REDEFINES containing DEPENDING ON", () => {
    const expression = {
        kind: "sum", terms: [8, {
            kind: "max", terms: [64, {
                kind: "depending-on", path: ["OVERLAY-RECORD", "ITEM-COUNT"],
                expression: { kind: "sum", terms: [16, 16] },
            }],
        }],
    } as const satisfies StorageSizeExpression;

    test("preserves the dependent alternative instead of folding the maximum", () => {
        expect(canonicaliseStorageSize(expression)).toEqual({
            kind: "sum", terms: [{
                kind: "max", terms: [{
                    kind: "depending-on", path: ["OVERLAY-RECORD", "ITEM-COUNT"], expression: 32,
                }, 64],
            }, 8],
        });
    });

    test.each([
        [0, 72], [1, 72], [2, 72], [3, 104], [9, 296],
    ])("preserves the maximum for ITEM-COUNT %i (%i bits)", (count, expected) => {
        const lookup = jest.fn((path: ResolvedPath): unknown => {
            expect(path).toEqual(["OVERLAY-RECORD", "ITEM-COUNT"]);
            return count;
        });
        expect(evaluateStorageSize(expression, lookup)).toBe(expected);
        expect(evaluateStorageSize(canonicaliseStorageSize(expression), lookup)).toBe(expected);
    });
});

/*
 * 01 MIXED-RECORD.
 *    05 ROW-COUNT PIC 9.
 *    05 ROWS OCCURS 0 TO 9 TIMES DEPENDING ON ROW-COUNT.
 *       10 ROW-CODE PIC X.
 *       10 SLOTS OCCURS 2 TIMES.
 *          15 DETAIL-COUNT PIC 9.
 *          15 DETAILS OCCURS 0 TO 9 TIMES DEPENDING ON DETAIL-COUNT.
 *             20 DETAIL PIC X(2).
 *
 * Both kinds of OCCURS bind an index. In DETAIL-COUNT's symbolic path,
 * depth 1 denotes ROWS and depth 0 denotes SLOTS.
 */
describe("canonicalise MIXED-RECORD: variable, fixed, variable nesting", () => {
    const expression = {
        kind: "sum", terms: [8, {
            kind: "depending-on", path: ["MIXED-RECORD", "ROW-COUNT"],
            expression: { kind: "sum", terms: [8, {
                    kind: "occurs", count: 2, expression: { kind: "sum", terms: [8, {
                            kind: "depending-on",
                            path: ["MIXED-RECORD", "ROWS", 1, "SLOTS", 0, "DETAIL-COUNT"],
                            expression: { kind: "sum", terms: [8, 8] },
                        }] },
                }] },
        }],
    } as const satisfies StorageSizeExpression;

    test("retains all index-producing expressions while simplifying detail size", () => {
        const canonical = canonicaliseStorageSize(expression);
        expect(JSON.stringify(canonical)).toContain('"count":2');
        expect(JSON.stringify(canonical)).toContain('"ROWS",1,"SLOTS",0');
        expect(canonicaliseStorageSize(canonical)).toEqual(canonical);
    });

    test.each([
        { details: [] as number[][], expected: 8 },
        { details: [[0, 0]], expected: 32 },
        { details: [[1, 2], [0, 3]], expected: 152 },
        { details: [[9, 0], [0, 0], [1, 1]], expected: 8 + 3 * 24 + 16 * 11 },
    ])("preserves all nested counts for $details", ({ details, expected }) => {
        const seen: ResolvedPath[] = [];
        const lookup = (path: ResolvedPath): unknown => {
            seen.push([...path]);
            if (path.length === 2) return details.length;
            return details[path[2] as number][path[4] as number];
        };
        const canonical = canonicaliseStorageSize(expression);
        expect(evaluateStorageSize(expression, lookup)).toBe(expected);
        expect(evaluateStorageSize(canonical, lookup)).toBe(expected);
        expect(seen.filter(path => path.length === 6)).toHaveLength(details.length * 4);
    });
});

/*
 * 01 TWO-LISTS.
 *    05 LEFT-COUNT PIC 9.
 *    05 LEFT-ITEMS OCCURS 0 TO 9 TIMES DEPENDING ON LEFT-COUNT.
 *       10 LEFT-CODE PIC X(2).
 *    05 RIGHT-COUNT PIC 9.
 *    05 RIGHT-ITEMS OCCURS 0 TO 9 TIMES DEPENDING ON RIGHT-COUNT.
 *       10 RIGHT-CODE PIC X(3).
 *
 * Sibling repetitions must not inherit one another's occurrence indices.
 */
describe("canonicalise TWO-LISTS: sibling dependencies", () => {
    const expression = {
        kind: "sum", terms: [8, {
            kind: "depending-on", path: ["TWO-LISTS", "LEFT-COUNT"],
            expression: { kind: "sum", terms: [8, 8] },
        }, 8, {
            kind: "depending-on", path: ["TWO-LISTS", "RIGHT-COUNT"],
            expression: { kind: "sum", terms: [16, 8] },
        }],
    } as const satisfies StorageSizeExpression;

    test.each([
        [0, 0], [1, 0], [0, 2], [3, 4], [9, 1],
    ])("keeps LEFT=%i and RIGHT=%i independent", (left, right) => {
        const seen: ResolvedPath[] = [];
        const lookup = (path: ResolvedPath): unknown => {
            seen.push([...path]);
            return path[1] === "LEFT-COUNT" ? left : right;
        };
        const expected = 16 + 16 * left + 24 * right;
        expect(evaluateStorageSize(expression, lookup)).toBe(expected);
        expect(evaluateStorageSize(canonicaliseStorageSize(expression), lookup)).toBe(expected);
        expect(seen).toEqual([
            ["TWO-LISTS", "LEFT-COUNT"], ["TWO-LISTS", "RIGHT-COUNT"],
            ["TWO-LISTS", "LEFT-COUNT"], ["TWO-LISTS", "RIGHT-COUNT"],
        ]);
    });
});

/*
 * 01 EDGE-RECORD.
 *    05 EMPTY-TABLE OCCURS 0 TIMES.
 *       10 UNREACHABLE-COUNT PIC 9.
 *       10 UNREACHABLE OCCURS 0 TO 9 TIMES DEPENDING ON UNREACHABLE-COUNT.
 *          15 VALUE PIC X.
 *    05 ONE-TABLE OCCURS 1 TIMES.
 *       10 COUNT-FIELD PIC 9.
 *       10 VALUES OCCURS 0 TO 9 TIMES DEPENDING ON COUNT-FIELD.
 *          15 VALUE PIC X.
 *
 * The zero table is unreachable. The one table must keep its binding.
 */
describe("canonicalise EDGE-RECORD: zero and one occurrences", () => {
    const expression = {
        kind: "sum", terms: [
            { kind: "occurs", count: 0, expression: {
                    kind: "depending-on", path: ["EDGE-RECORD", "EMPTY-TABLE", 0, "UNREACHABLE-COUNT"],
                    expression: 8,
                } },
            { kind: "occurs", count: 1, expression: { kind: "sum", terms: [8, {
                        kind: "depending-on", path: ["EDGE-RECORD", "ONE-TABLE", 0, "COUNT-FIELD"],
                        expression: 8,
                    }] } },
        ],
    } as const satisfies StorageSizeExpression;

    test("removes the zero branch without unbinding the one branch", () => {
        const canonical = canonicaliseStorageSize(expression);
        expect(canonical).toMatchObject({ kind: "occurs", count: 1 });
        const lookup = jest.fn((path: ResolvedPath): unknown => {
            expect(path).toEqual(["EDGE-RECORD", "ONE-TABLE", 0, "COUNT-FIELD"]);
            return 4;
        });
        expect(evaluateStorageSize(expression, lookup)).toBe(40);
        expect(evaluateStorageSize(canonical, lookup)).toBe(40);
        expect(lookup).toHaveBeenCalledTimes(2);
    });
});

/*
 * 01 FIXED-DEEP.
 *    05 REGIONS OCCURS 2 TIMES.
 *       10 AISLES OCCURS 3 TIMES.
 *          15 BINS OCCURS 4 TIMES.
 *             20 LABEL PIC X(2).
 *             20 QUANTITY PIC 9(3).
 *    05 SUMMARY PIC X(5).
 *
 * Every extent is fixed: 2 * 3 * 4 * (16 + 24) + 40 = 1000 bits.
 */
describe("canonicalise FIXED-DEEP: entirely constant nested layout", () => {
    const expression = { kind: "sum", terms: [
            { kind: "occurs", count: 2, expression: {
                    kind: "occurs", count: 3, expression: {
                        kind: "occurs", count: 4, expression: {
                            kind: "sum", terms: [16, { kind: "sum", terms: [8, 16] }],
                        },
                    },
                } },
            40,
        ] } as const satisfies StorageSizeExpression;

    test("collapses the whole record to a single number", () => {
        expect(canonicaliseStorageSize(expression)).toBe(1000);
        expect(evaluateStorageSize(expression, noLookup)).toBe(1000);
        expect(evaluateStorageSize(canonicaliseStorageSize(expression), noLookup)).toBe(1000);
    });
});

/*
 * 01 MANY-RECORDS.
 *    05 GROUPS OCCURS 3 TIMES.
 *       10 ITEM-COUNT PIC 9.
 *       10 ITEMS OCCURS 0 TO 9 TIMES DEPENDING ON ITEM-COUNT.
 *          15 ITEM PIC X(10).
 *
 * Varying the record's counts checks the canonicalisation for more
 * than one favourable data set.
 */
describe("canonicalise MANY-RECORDS: different count configurations", () => {
    const expression = {
        kind: "occurs", count: 3, expression: { kind: "sum", terms: [8, {
                kind: "depending-on", path: ["MANY-RECORDS", "GROUPS", 0, "ITEM-COUNT"],
                expression: { kind: "sum", terms: [40, 40] },
            }] },
    } as const satisfies StorageSizeExpression;

    test.each([
        [0, 0, 0], [2, 5, 1], [9, 0, 3], [1, 1, 1], [0, 9, 9], [9, 9, 9],
    ])("preserves the size for counts %i, %i, %i", (a, b, c) => {
        const counts = [a, b, c];
        const resolved: ResolvedPath[] = [];
        const lookup = (path: ResolvedPath): unknown => {
            resolved.push([...path]);
            return counts[path[2] as number];
        };
        const canonical = canonicaliseStorageSize(expression);
        const expected = 24 + 80 * (a + b + c);
        expect(evaluateStorageSize(expression, lookup)).toBe(expected);
        expect(evaluateStorageSize(canonical, lookup)).toBe(expected);
        expect(resolved).toEqual([
            ...[0, 1, 2].map(i => ["MANY-RECORDS", "GROUPS", i, "ITEM-COUNT"]),
            ...[0, 1, 2].map(i => ["MANY-RECORDS", "GROUPS", i, "ITEM-COUNT"]),
        ]);
        expect(canonicaliseStorageSize(canonical)).toEqual(canonical);
    });
});

/*
 * 01 ALIGNED-RECORD.
 *    05 PREFIX PIC X.
 *    05 AMOUNT PIC S9(9) COMP SYNC.
 *
 * AMOUNT needs a four-byte boundary. PREFIX occupies one byte,
 * so the compiler introduces three bytes of padding.
 */
describe("canonicalise ALIGNED-RECORD: fixed alignment", () => {
    test.each([
        [0, 0],
        [8, 24],
        [16, 16],
        [24, 8],
        [32, 0],
        [40, 24],
        [64, 0],
    ])("aligns offset %i to 32 bits with %i bits of padding", (size, expected) => {
        const expression = {
            kind: "align", size, boundary: 32
        } as const satisfies StorageSizeExpression;

        expect(canonicaliseStorageSize(expression)).toBe(expected);
        expect(evaluateStorageSize(expression, noLookup)).toBe(expected);
    });

    test("canonicalises the alignment input before calculating padding", () => {
        const expression = {
            kind: "align",
            size: {kind: "sum", terms: [8, {kind: "sum", terms: [8, 8]}]},
            boundary: 32
        } as const satisfies StorageSizeExpression;

        expect(canonicaliseStorageSize(expression)).toBe(8);
    });

    test("supports halfword and doubleword boundaries", () => {
        expect(canonicaliseStorageSize({
            kind: "align", size: 8, boundary: 16
        })).toBe(8);

        expect(canonicaliseStorageSize({
            kind: "align", size: 8, boundary: 64
        })).toBe(56);
    });
});

/*
 * 01 VARIABLE-RECORD.
 *    05 ITEM-COUNT PIC 9.
 *    05 ITEMS OCCURS 0 TO 9 TIMES DEPENDING ON ITEM-COUNT.
 *       10 CODE PIC X(3).
 *    05 AMOUNT PIC S9(9) COMP SYNC.
 *
 * AMOUNT's position is 8 + 24 * ITEM-COUNT bits.
 * Its alignment padding depends on the actual count.
 */
describe("canonicalise VARIABLE-RECORD: alignment after ODO", () => {
    const expression = {
        kind: "align",
        size: {
            kind: "sum",
            terms: [
                8,
                {
                    kind: "depending-on",
                    path: ["VARIABLE-RECORD", "ITEM-COUNT"],
                    expression: {kind: "sum", terms: [8, 16]}
                }
            ]
        },
        boundary: 32
    } as const satisfies StorageSizeExpression;

    test("simplifies the occurrence size but retains symbolic alignment", () => {
        expect(canonicaliseStorageSize(expression)).toEqual({
            kind: "align",
            size: {
                kind: "sum",
                terms: [{
                    kind: "depending-on",
                    path: ["VARIABLE-RECORD", "ITEM-COUNT"],
                    expression: 24
                }, 8]
            },
            boundary: 32
        });
    });

    test.each([
        [0, 24],
        [1, 0],
        [2, 8],
        [3, 16],
        [4, 24],
        [5, 0],
    ])("calculates padding for ITEM-COUNT %i", (count, expected) => {
        const lookup = (path: ResolvedPath): unknown => {
            expect(path).toEqual(["VARIABLE-RECORD", "ITEM-COUNT"]);
            return count;
        };

        expect(evaluateStorageSize(expression, lookup)).toBe(expected);
        expect(evaluateStorageSize(canonicaliseStorageSize(expression), lookup))
            .toBe(expected);
    });

    test("is idempotent and does not mutate the original expression", () => {
        const original = JSON.stringify(expression);
        const canonical = canonicaliseStorageSize(expression);

        expect(canonicaliseStorageSize(canonical)).toEqual(canonical);
        expect(JSON.stringify(expression)).toBe(original);
    });
});

/*
 * 01 GROUP-RECORD.
 *    05 GROUPS OCCURS 3 TIMES.
 *       10 ITEM-COUNT PIC 9.
 *       10 ITEMS OCCURS 0 TO 9 TIMES DEPENDING ON ITEM-COUNT.
 *          15 CODE PIC X(3).
 *       10 AMOUNT PIC S9(9) COMP SYNC.
 *
 * Each GROUPS occurrence can have a different ITEM-COUNT and
 * therefore a different amount of padding before AMOUNT.
 *
 * The fixed OCCURS binding must survive canonicalisation.
 */
describe("canonicalise GROUP-RECORD: alignment inside fixed OCCURS", () => {
    const expression = {
        kind: "occurs",
        count: 3,
        expression: {
            kind: "align",
            size: {
                kind: "sum",
                terms: [
                    8,
                    {
                        kind: "depending-on",
                        path: ["GROUP-RECORD", "GROUPS", 0, "ITEM-COUNT"],
                        expression: 24
                    }
                ]
            },
            boundary: 32
        }
    } as const satisfies StorageSizeExpression;

    test("preserves the OCCURS binding around symbolic alignment", () => {
        const canonical = canonicaliseStorageSize(expression);

        expect(canonical).toMatchObject({
            kind: "occurs",
            count: 3,
            expression: {
                kind: "align",
                boundary: 32
            }
        });
    });

    test("evaluates a different padding amount for each occurrence", () => {
        const counts = [0, 1, 2];
        const seen: ResolvedPath[] = [];

        const lookup = (path: ResolvedPath): unknown => {
            seen.push([...path]);
            return counts[path[2] as number];
        };

        const canonical = canonicaliseStorageSize(expression);

        // COUNT 0 -> 24 bits, COUNT 1 -> 0 bits, COUNT 2 -> 8 bits.
        expect(evaluateStorageSize(expression, lookup)).toBe(32);
        expect(evaluateStorageSize(canonical, lookup)).toBe(32);

        expect(seen).toEqual([
            ...[0, 1, 2].map(i => ["GROUP-RECORD", "GROUPS", i, "ITEM-COUNT"]),
            ...[0, 1, 2].map(i => ["GROUP-RECORD", "GROUPS", i, "ITEM-COUNT"])
        ]);
    });
});

/*
 * 01 NESTED-ALIGNMENT.
 *    05 PREFIX PIC X.
 *    05 AMOUNT PIC S9(9) COMP SYNC.
 *
 * Aligning the position after adding the first padding amount
 * must require no further padding at the same boundary.
 */
describe("canonicalise NESTED-ALIGNMENT: nested alignment expressions", () => {
    test("folds nested alignment when its inputs are constant", () => {
        const expression = {
            kind: "align",
            size: {
                kind: "sum",
                terms: [
                    8,
                    {kind: "align", size: 8, boundary: 32}
                ]
            },
            boundary: 32
        } as const satisfies StorageSizeExpression;

        expect(canonicaliseStorageSize(expression)).toBe(0);
        expect(evaluateStorageSize(expression, noLookup)).toBe(0);
    });

    test("retains symbolic nested alignment without losing information", () => {
        const variable = {
            kind: "depending-on",
            path: ["NESTED-ALIGNMENT", "COUNT"],
            expression: 24
        } as const satisfies StorageSizeExpression;

        const expression = {
            kind: "align",
            size: {
                kind: "sum",
                terms: [
                    variable,
                    {kind: "align", size: variable, boundary: 32}
                ]
            },
            boundary: 32
        } as const satisfies StorageSizeExpression;

        const canonical = canonicaliseStorageSize(expression);

        expect(canonicaliseStorageSize(canonical)).toEqual(canonical);

        for (const count of [0, 1, 2, 3, 4]) {
            const lookup = () => count;
            expect(evaluateStorageSize(canonical, lookup)).toBe(0);
            expect(evaluateStorageSize(canonical, lookup))
                .toBe(evaluateStorageSize(expression, lookup));
        }
    });
});
