import {
    isConstantSizeExpression,
    type StorageSizeExpression,
} from "./size.expression.grammer";
import {
    evaluateStorageSize,
    type ResolvedPath,
} from "./storage.size.expression.evaluate";

// The fixed-size examples below must not resolve record data.
// The resolver deliberately throws if invoked by those examples.
const resolve = jest.fn((_path: ResolvedPath): unknown => {
    throw new Error("Fixed-size expressions must not resolve a record path");
});

beforeEach(() => {
    resolve.mockClear();
});

describe("constant expressions: elementary COBOL fields", () => {
    /*
     * 01 CHARACTER-RECORD.
     *    05 INITIAL PIC X.
     *
     * One DISPLAY character = 1 byte = 8 bits.
     */
    describe("CHARACTER-RECORD", () => {
        test("evaluates the complete record as 8 bits", () => {
            expect(evaluateStorageSize(8, resolve)).toBe(8);
            expect(resolve).not.toHaveBeenCalled();
        });
    });

    /*
     * 01 ITEM-RECORD.
     *    05 ITEM PIC X(10).
     *
     * Ten DISPLAY characters = 10 bytes = 80 bits.
     */
    describe("ITEM-RECORD", () => {
        test("evaluates the complete record as 80 bits", () => {
            expect(evaluateStorageSize(80, resolve)).toBe(80);
            expect(resolve).not.toHaveBeenCalled();
        });

        test.each([0, 8, 80, 1024])(
            "recognises %i as a valid constant size",
            bits => {
                expect(isConstantSizeExpression(bits)).toBe(true);
            },
        );

        test.each([
            -1, 1.5, NaN, Infinity, -Infinity,
            "80", null, undefined, {}, true,
        ])("rejects %p as a constant size", value => {
            expect(isConstantSizeExpression(value)).toBe(false);
        });
    });

    /*
     * 01 MESSAGE-RECORD.
     *    05 MESSAGE-TEXT PIC X(128).
     *
     * 128 bytes = 1024 bits.
     */
    describe("MESSAGE-RECORD", () => {
        test("evaluates the complete record as 1024 bits", () => {
            expect(evaluateStorageSize(1024, resolve)).toBe(1024);
            expect(resolve).not.toHaveBeenCalled();
        });
    });

    /*
     * 01 STATUS-RECORD.
     *    05 STATUS PIC X.
     *       88 STATUS-READY VALUE "R".
     *
     * STATUS occupies 8 bits. The level-88 condition allocates no additional
     * storage, so the entire record is 8 bits, not zero.
     */
    describe("STATUS-RECORD (level 88 condition)", () => {
        test("counts the underlying field, but not the condition name", () => {
            expect(evaluateStorageSize(8, resolve)).toBe(8);
            expect(resolve).not.toHaveBeenCalled();
        });
    });
});

describe("sum expressions: consecutive COBOL fields and groups", () => {
    /*
     * 01 CUSTOMER-RECORD.
     *    05 CUSTOMER-AGE      PIC 99.
     *    05 CUSTOMER-NAME     PIC X(30).
     *    05 CUSTOMER-POSTCODE PIC X(8).
     *
     * DISPLAY storage: 2 + 30 + 8 = 40 bytes = 320 bits.
     */
    describe("CUSTOMER-RECORD (flat)", () => {
        test("adds the sizes of three consecutive fields", () => {
            const expression = {
                kind: "sum",
                terms: [16, 240, 64],
            } as const satisfies StorageSizeExpression;

            expect(evaluateStorageSize(expression, resolve)).toBe(320);
            expect(resolve).not.toHaveBeenCalled();
        });
    });

    /*
     * 01 CUSTOMER-RECORD.
     *    05 CUSTOMER-AGE PIC 99.
     *    05 CUSTOMER-NAME PIC X(30).
     *    05 ADDRESS-DETAILS.
     *       10 HOUSE-NUMBER PIC 9(4).
     *       10 STREET-NAME  PIC X(25).
     *       10 POSTCODE     PIC X(8).
     *
     * ADDRESS-DETAILS is a group, not an extra stored field.
     * 2 + 30 + (4 + 25 + 8) = 69 bytes = 552 bits.
     */
    describe("CUSTOMER-RECORD (nested address)", () => {
        test("recursively sums the address fields into the record", () => {
            const expression = {
                kind: "sum",
                terms: [
                    16,
                    240,
                    {
                        kind: "sum",
                        terms: [32, 200, 64],
                    },
                ],
            } as const satisfies StorageSizeExpression;

            expect(evaluateStorageSize(expression, resolve)).toBe(552);
            expect(resolve).not.toHaveBeenCalled();
        });
    });

    /*
     * 01 CUSTOMER-RECORD.
     *    05 CUSTOMER-NAME PIC X(30).
     *    05 CONTACT-DETAILS.
     *       10 HOME-ADDRESS.
     *          15 HOUSE-NUMBER PIC 9(4).
     *          15 POSTCODE PIC X(8).
     *       10 PHONE PIC X(12).
     *
     * Two group levels: 30 + ((4 + 8) + 12) = 54 bytes = 432 bits.
     */
    describe("CUSTOMER-RECORD (two nested group levels)", () => {
        test("evaluates sums nested within sums", () => {
            const expression = {
                kind: "sum",
                terms: [
                    240,
                    {
                        kind: "sum",
                        terms: [
                            { kind: "sum", terms: [32, 64] },
                            96,
                        ],
                    },
                ],
            } as const satisfies StorageSizeExpression;

            expect(evaluateStorageSize(expression, resolve)).toBe(432);
            expect(resolve).not.toHaveBeenCalled();
        });
    });
});

describe("occurs expressions: fixed-count COBOL tables", () => {
    /*
     * 01 CODE-RECORD.
     *    05 CODES OCCURS 5 TIMES.
     *       10 CODE PIC X(4).
     *
     * Five occurrences of four characters: 5 × 4 = 20 bytes = 160 bits.
     */
    describe("CODE-RECORD (simple OCCURS)", () => {
        test("sums the sizes of its fixed-size occurrences", () => {
            const expression = {
                kind: "occurs",
                count: 5,
                expression: 32,
            } as const satisfies StorageSizeExpression;

            expect(evaluateStorageSize(expression, resolve)).toBe(160);
            expect(resolve).not.toHaveBeenCalled();
        });
    });

    /*
     * 01 CUSTOMER-RECORD.
     *    05 CUSTOMER-NAME PIC X(30).
     *    05 POSTCODES OCCURS 3 TIMES.
     *       10 POSTCODE PIC X(8).
     *
     * 30 + (3 × 8) = 54 bytes = 432 bits.
     */
    describe("CUSTOMER-RECORD (fields followed by OCCURS)", () => {
        test("adds a fixed table to ordinary fields", () => {
            const expression = {
                kind: "sum",
                terms: [
                    240,
                    { kind: "occurs", count: 3, expression: 64 },
                ],
            } as const satisfies StorageSizeExpression;

            expect(evaluateStorageSize(expression, resolve)).toBe(432);
            expect(resolve).not.toHaveBeenCalled();
        });
    });

    /*
     * 01 CUSTOMER-RECORD.
     *    05 CUSTOMER-NAME PIC X(30).
     *    05 ADDRESSES OCCURS 2 TIMES.
     *       10 HOUSE-NUMBER PIC 9(4).
     *       10 STREET-NAME  PIC X(25).
     *       10 POSTCODE     PIC X(8).
     *
     * 30 + 2 × (4 + 25 + 8) = 104 bytes = 832 bits.
     */
    describe("CUSTOMER-RECORD (OCCURS of a group)", () => {
        test("sums a nested group for each address", () => {
            const expression = {
                kind: "sum",
                terms: [
                    240,
                    {
                        kind: "occurs",
                        count: 2,
                        expression: {
                            kind: "sum",
                            terms: [32, 200, 64],
                        },
                    },
                ],
            } as const satisfies StorageSizeExpression;

            expect(evaluateStorageSize(expression, resolve)).toBe(832);
            expect(resolve).not.toHaveBeenCalled();
        });
    });

    /*
     * 01 WAREHOUSE-RECORD.
     *    05 SHELVES OCCURS 2 TIMES.
     *       10 BINS OCCURS 3 TIMES.
     *          15 BIN-CODE PIC X(4).
     *          15 QUANTITY PIC 9(3).
     *
     * 2 × (3 × (4 + 3)) = 42 bytes = 336 bits.
     */
    describe("WAREHOUSE-RECORD (nested fixed OCCURS)", () => {
        test("evaluates nested repetitions and a nested group", () => {
            const expression = {
                kind: "occurs",
                count: 2,
                expression: {
                    kind: "occurs",
                    count: 3,
                    expression: {
                        kind: "sum",
                        terms: [32, 24],
                    },
                },
            } as const satisfies StorageSizeExpression;

            expect(evaluateStorageSize(expression, resolve)).toBe(336);
            expect(resolve).not.toHaveBeenCalled();
        });
    });
});


describe("redefines expressions: overlapping COBOL storage", () => {
    /*
     * 01 MESSAGE-RECORD.
     *    05 RAW-MESSAGE PIC X(8).
     *    05 DECODED-MESSAGE REDEFINES RAW-MESSAGE.
     *       10 MESSAGE-TYPE PIC X(2).
     *       10 MESSAGE-ID   PIC 9(6).
     *
     * Both views occupy the same 8 bytes. REDEFINES does not add
     * another 8 bytes: max(8, 2 + 6) = 8 bytes = 64 bits.
     */
    describe("MESSAGE-RECORD (simple REDEFINES)", () => {
        test("uses the largest view rather than summing the views", () => {
            const expression = {
                kind: "max",
                terms: [
                    64,
                    { kind: "sum", terms: [16, 48] },
                ],
            } as const satisfies StorageSizeExpression;

            expect(evaluateStorageSize(expression, resolve)).toBe(64);
            expect(resolve).not.toHaveBeenCalled();
        });
    });

    /*
     * 01 CUSTOMER-RECORD.
     *    05 CUSTOMER-ID PIC X(4).
     *    05 CONTACT-DATA.
     *       10 PHONE PIC X(12).
     *    05 SHORT-CONTACT REDEFINES CONTACT-DATA.
     *       10 AREA-CODE PIC X(4).
     *       10 LOCAL-CODE PIC X(4).
     *    05 ACTIVE-FLAG PIC X.
     *
     * CONTACT-DATA occupies 12 bytes; SHORT-CONTACT views only its
     * first 8 bytes. Its shorter view does not shrink the reserved
     * storage. Total: 4 + max(12, 4 + 4) + 1 = 17 bytes = 136 bits.
     */
    describe("CUSTOMER-RECORD (shorter redefinition)", () => {
        test("reserves the maximum overlay extent and counts following fields", () => {
            const expression = {
                kind: "sum",
                terms: [
                    32,
                    {
                        kind: "max",
                        terms: [96, { kind: "sum", terms: [32, 32] }],
                    },
                    8,
                ],
            } as const satisfies StorageSizeExpression;

            expect(evaluateStorageSize(expression, resolve)).toBe(136);
            expect(resolve).not.toHaveBeenCalled();
        });
    });

    /*
     * 01 SALES-RECORD.
     *    05 SALES-HEADER PIC X(3).
     *    05 LINE-DATA PIC X(12).
     *    05 ITEM-LINES REDEFINES LINE-DATA.
     *       10 ITEMS OCCURS 3 TIMES.
     *          15 ITEM-CODE PIC X(2).
     *          15 QUANTITY  PIC 9(2).
     *    05 TRAILER PIC X(2).
     *
     * The table of three 4-byte items reuses the 12-byte LINE-DATA
     * region. Total: 3 + max(12, 3 × (2 + 2)) + 2 = 17 bytes = 136 bits.
     */
    describe("SALES-RECORD (REDEFINES with OCCURS)", () => {
        test("combines an overlay, a repeated group and following fields", () => {
            const expression = {
                kind: "sum",
                terms: [
                    24,
                    {
                        kind: "max",
                        terms: [
                            96,
                            {
                                kind: "occurs",
                                count: 3,
                                expression: { kind: "sum", terms: [16, 16] },
                            },
                        ],
                    },
                    16,
                ],
            } as const satisfies StorageSizeExpression;

            expect(evaluateStorageSize(expression, resolve)).toBe(136);
            expect(resolve).not.toHaveBeenCalled();
        });
    });

    /*
     * 01 DELIVERY-RECORD.
     *    05 ROUTE-CODE PIC X(2).
     *    05 PARCELS OCCURS 2 TIMES.
     *       10 PARCEL-ID PIC X(4).
     *       10 ADDRESS-DATA.
     *          15 RAW-ADDRESS PIC X(10).
     *          15 STRUCTURED-ADDRESS REDEFINES RAW-ADDRESS.
     *             20 STREET PIC X(6).
     *             20 POSTCODE PIC X(4).
     *       10 STATUS PIC X.
     *
     * Each parcel occupies 4 + max(10, 6 + 4) + 1 = 15 bytes.
     * Total: 2 + 2 × 15 = 32 bytes = 256 bits.
     *
     * The redefinition is nested inside ADDRESS-DATA, which is
     * itself inside a fixed OCCURS table.
     */
    describe("DELIVERY-RECORD (nested REDEFINES inside OCCURS)", () => {
        test("evaluates a nested overlay for every repeated group", () => {
            const expression = {
                kind: "sum",
                terms: [
                    16,
                    {
                        kind: "occurs",
                        count: 2,
                        expression: {
                            kind: "sum",
                            terms: [
                                32,
                                {
                                    kind: "sum",
                                    terms: [{
                                        kind: "max",
                                        terms: [
                                            80,
                                            { kind: "sum", terms: [48, 32] },
                                        ],
                                    }],
                                },
                                8,
                            ],
                        },
                    },
                ],
            } as const satisfies StorageSizeExpression;

            expect(evaluateStorageSize(expression, resolve)).toBe(256);
            expect(resolve).not.toHaveBeenCalled();
        });
    });
});

/*
 * 01 ORDER-RECORD.
 *    05 ITEM-COUNT PIC 9.
 *    05 ITEMS OCCURS 0 TO 9 TIMES
 *       DEPENDING ON ITEM-COUNT.
 *       10 ITEM-CODE PIC X(10).
 *
 * One byte for ITEM-COUNT; 10 bytes per item.
 */
describe("depending-on: ORDER-RECORD (one dependent table)", () => {
    const expression = {
        kind: "sum",
        terms: [
            8,
            {
                kind: "depending-on",
                path: ["ORDER-RECORD", "ITEM-COUNT"],
                expression: 80,
            },
        ],
    } as const satisfies StorageSizeExpression;

    test.each([
        [0, 8],
        [1, 88],
        [3, 248],
        [9, 728],
    ])("ITEM-COUNT = %i makes %i bits", (count, expected) => {
        const lookup = jest.fn((_path: ResolvedPath): unknown => count);
        expect(evaluateStorageSize(expression, lookup)).toBe(expected);
        expect(lookup).toHaveBeenCalledTimes(1);
        expect(lookup).toHaveBeenCalledWith(["ORDER-RECORD", "ITEM-COUNT"]);
    });

    test.each(["3", -1, 1.5, null, undefined, Infinity])(
        "rejects invalid count %p",
        count => {
            const lookup = jest.fn((_path: ResolvedPath): unknown => count);
            expect(() => evaluateStorageSize(expression, lookup)).toThrow(
                "Invalid OCCURS DEPENDING ON count",
            );
        },
    );
});

/*
 * 01 BATCH-RECORD.
 *    05 GROUP-COUNT PIC 9.
 *    05 GROUPS OCCURS 0 TO 9 TIMES
 *       DEPENDING ON GROUP-COUNT.
 *       10 ITEM-COUNT PIC 9.
 *       10 ITEMS OCCURS 0 TO 9 TIMES
 *          DEPENDING ON ITEM-COUNT.
 *          15 ITEM PIC X(10).
 *
 * Example counts: GROUP-COUNT = 3; ITEM-COUNT = [2,5,1].
 * Total = 1 + (1+20) + (1+50) + (1+10) = 84 bytes.
 * The nested count path substitutes numeric depth 0 (the nearest enclosing group index).
 */
describe("depending-on: BATCH-RECORD (two nested dependencies)", () => {
    const expression = {
        kind: "sum",
        terms: [
            8,
            {
                kind: "depending-on",
                path: ["BATCH-RECORD", "GROUP-COUNT"],
                expression: {
                    kind: "sum",
                    terms: [
                        8,
                        {
                            kind: "depending-on",
                            path: [
                                "BATCH-RECORD", "GROUPS",
                                0, "ITEM-COUNT",
                            ],
                            expression: 80,
                        },
                    ],
                },
            },
        ],
    } as const satisfies StorageSizeExpression;

    test("reads a different item count for each group", () => {
        const counts = [2, 5, 1];
        const seen: ResolvedPath[] = [];
        const lookup = jest.fn((path: ResolvedPath): unknown => {
            seen.push([...path]);
            if (path.join("/") === "BATCH-RECORD/GROUP-COUNT") return 3;
            return counts[path[2] as number];
        });

        expect(evaluateStorageSize(expression, lookup)).toBe(672);
        expect(seen).toEqual([
            ["BATCH-RECORD", "GROUP-COUNT"],
            ["BATCH-RECORD", "GROUPS", 0, "ITEM-COUNT"],
            ["BATCH-RECORD", "GROUPS", 1, "ITEM-COUNT"],
            ["BATCH-RECORD", "GROUPS", 2, "ITEM-COUNT"],
        ]);
    });

    test("does not enter the body when there are zero groups", () => {
        const lookup = jest.fn((path: ResolvedPath): unknown => {
            if (path[1] === "GROUP-COUNT") return 0;
            throw new Error("Inner body must not be evaluated");
        });
        expect(evaluateStorageSize(expression, lookup)).toBe(8);
        expect(lookup).toHaveBeenCalledTimes(1);
    });

    test("rejects an index that is not bound at its count path", () => {
        const invalid = {
            kind: "depending-on",
            path: ["BATCH-RECORD", "GROUPS", 0, "ITEM-COUNT"],
            expression: 80,
        } as const satisfies StorageSizeExpression;
        expect(() => evaluateStorageSize(invalid, jest.fn())).toThrow(
            "Unbound OCCURS variable at relative depth 0",
        );
    });

    test("rejects a relative depth larger than the enclosing lambda stack", () => {
        const invalid = {
            kind: "depending-on",
            path: ["BATCH-RECORD", "GROUP-COUNT"],
            expression: {
                kind: "depending-on",
                path: [
                    "BATCH-RECORD", "GROUPS",
                    1, "ITEM-COUNT",
                ],
                expression: 80,
            },
        } as const satisfies StorageSizeExpression;
        const lookup = jest.fn((path: ResolvedPath): unknown => {
            if (path[1] === "GROUP-COUNT") return 1;
            throw new Error("An invalid inner path must not reach the resolver");
        });
        expect(() => evaluateStorageSize(invalid, lookup)).toThrow(
            "Unbound OCCURS variable at relative depth 1",
        );
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
 *             20 DETAIL PIC X(4).
 *
 * Two groups, with items [2,1]; detail counts [[1,3],[2]].
 * 1 + (1 + (1+4) + (1+12)) + (1 + (1+8)) = 30 bytes.
 * Detail count references both enclosing variables: numeric depth 1 (group) and depth 0 (item).
 */
describe("depending-on: DEEP-RECORD (three nested dependencies)", () => {
    const expression = {
        kind: "sum",
        terms: [8, {
            kind: "depending-on",
            path: ["DEEP-RECORD", "GROUP-COUNT"],
            expression: {
                kind: "sum",
                terms: [8, {
                    kind: "depending-on",
                    path: ["DEEP-RECORD", "GROUPS", 0, "ITEM-COUNT"],
                    expression: {
                        kind: "sum",
                        terms: [8, {
                            kind: "depending-on",
                            path: [
                                "DEEP-RECORD", "GROUPS", 1,
                                "ITEMS", 0, "DETAIL-COUNT",
                            ],
                            expression: 32,
                        }],
                    },
                }],
            },
        }],
    } as const satisfies StorageSizeExpression;

    test("uses both enclosing occurrence indices", () => {
        const detailCounts = [[1, 3], [2]];
        const seen: ResolvedPath[] = [];
        const lookup = jest.fn((path: ResolvedPath): unknown => {
            seen.push([...path]);
            if (path[1] === "GROUP-COUNT") return 2;
            if (path[3] === "ITEM-COUNT") return detailCounts[path[2] as number].length;
            return detailCounts[path[2] as number][path[4] as number];
        });

        expect(evaluateStorageSize(expression, lookup)).toBe(240);
        expect(seen).toEqual([
            ["DEEP-RECORD", "GROUP-COUNT"],
            ["DEEP-RECORD", "GROUPS", 0, "ITEM-COUNT"],
            ["DEEP-RECORD", "GROUPS", 0, "ITEMS", 0, "DETAIL-COUNT"],
            ["DEEP-RECORD", "GROUPS", 0, "ITEMS", 1, "DETAIL-COUNT"],
            ["DEEP-RECORD", "GROUPS", 1, "ITEM-COUNT"],
            ["DEEP-RECORD", "GROUPS", 1, "ITEMS", 0, "DETAIL-COUNT"],
        ]);
    });
});

/*
 * 01 BATCH-RECORD.
 *    05 GROUPS OCCURS 3 TIMES.
 *       10 ITEM-COUNT PIC 9.
 *       10 ITEMS OCCURS 0 TO 9 TIMES
 *          DEPENDING ON ITEM-COUNT.
 *          15 ITEM PIC X(10).
 *
 * Fixed count does not guarantee fixed-size elements: GROUPS[0..2]
 * have ITEM-COUNT values [2,5,1]. Their sizes are 21, 51, 11 bytes,
 * so the entire record occupies 83 bytes = 664 bits.
 */
describe("occurs: BATCH-RECORD (fixed outer table, variable inner table)", () => {
    const expression = {
        kind: "occurs",
        count: 3,
        expression: {
            kind: "sum",
            terms: [
                8,
                {
                    kind: "depending-on",
                    path: ["BATCH-RECORD", "GROUPS", 0, "ITEM-COUNT"],
                    expression: 80,
                },
            ],
        },
    } as const satisfies StorageSizeExpression;

    test("reads a distinct ITEM-COUNT for each of three fixed occurrences", () => {
        const counts = [2, 5, 1];
        const seen: ResolvedPath[] = [];
        const lookup = jest.fn((path: ResolvedPath): unknown => {
            seen.push([...path]);
            return counts[path[2] as number];
        });

        expect(evaluateStorageSize(expression, lookup)).toBe(664);
        expect(seen).toEqual([
            ["BATCH-RECORD", "GROUPS", 0, "ITEM-COUNT"],
            ["BATCH-RECORD", "GROUPS", 1, "ITEM-COUNT"],
            ["BATCH-RECORD", "GROUPS", 2, "ITEM-COUNT"],
        ]);
    });

    test("a zero fixed count never evaluates the element body", () => {
        const empty = {
            ...expression,
            count: 0,
        } as const satisfies StorageSizeExpression;
        const lookup = jest.fn((_path: ResolvedPath): unknown => {
            throw new Error("No element should be evaluated");
        });

        expect(evaluateStorageSize(empty, lookup)).toBe(0);
        expect(lookup).not.toHaveBeenCalled();
    });
});

/*
 * 01 STORE-RECORD.
 *    05 AISLE-COUNT PIC 9.
 *    05 AISLES OCCURS 0 TO 9 TIMES
 *       DEPENDING ON AISLE-COUNT.
 *       10 SHELVES OCCURS 2 TIMES.
 *          15 PRODUCT-COUNT PIC 9.
 *          15 PRODUCTS OCCURS 0 TO 9 TIMES
 *             DEPENDING ON PRODUCT-COUNT.
 *             20 PRODUCT PIC X(2).
 *
 * AISLE-COUNT = 2. Each aisle has two shelves, with product counts
 * [[1,2],[3,0]]. Sizes: (1+2)+(1+4)+(1+6)+(1+0) = 16 bytes,
 * plus the initial count byte = 17 bytes = 136 bits.
 *
 * At PRODUCT-COUNT, depth 0 is the fixed shelf index and depth 1
 * is the enclosing variable aisle index.
 */
describe("occurs: STORE-RECORD (mixed fixed and dependent nesting)", () => {
    const expression = {
        kind: "sum",
        terms: [
            8,
            {
                kind: "depending-on",
                path: ["STORE-RECORD", "AISLE-COUNT"],
                expression: {
                    kind: "occurs",
                    count: 2,
                    expression: {
                        kind: "sum",
                        terms: [
                            8,
                            {
                                kind: "depending-on",
                                path: ["STORE-RECORD", "AISLES", 1, "SHELVES", 0, "PRODUCT-COUNT"],
                                expression: 16,
                            },
                        ],
                    },
                },
            },
        ],
    } as const satisfies StorageSizeExpression;

    test("resolves the two enclosing indices in their proper relative order", () => {
        const counts = [[1, 2], [3, 0]];
        const seen: ResolvedPath[] = [];
        const lookup = jest.fn((path: ResolvedPath): unknown => {
            seen.push([...path]);
            if (path[1] === "AISLE-COUNT") return 2;
            return counts[path[2] as number][path[4] as number];
        });

        expect(evaluateStorageSize(expression, lookup)).toBe(136);
        expect(seen).toEqual([
            ["STORE-RECORD", "AISLE-COUNT"],
            ["STORE-RECORD", "AISLES", 0, "SHELVES", 0, "PRODUCT-COUNT"],
            ["STORE-RECORD", "AISLES", 0, "SHELVES", 1, "PRODUCT-COUNT"],
            ["STORE-RECORD", "AISLES", 1, "SHELVES", 0, "PRODUCT-COUNT"],
            ["STORE-RECORD", "AISLES", 1, "SHELVES", 1, "PRODUCT-COUNT"],
        ]);
    });
});
