import {type ElementaryEntry, type GroupEntry, parseCopybook} from "@cobol-ts/copybook";
import {errorsOrThrow, valueOrThrow} from "@cobol-ts/errors";
import {
    type CobolPaddingContext,
    ibmCobolPadding,
    ibmInitialPadding,
    ibmOccurrenceAlignment,
    ibmOccurrencePadding
} from "./cobol.padding";
import {evaluateStorageSize, StorageSizeExpression} from "@cobol-ts/size";

describe("IBM COBOL padding", () => {
    function recordOf(copybook: string): GroupEntry {
        const ast = valueOrThrow(parseCopybook(copybook));
        const record = ast.entries[0];
        if (record.kind !== "group") throw new Error("Expected group");
        return record;
    }

    function childOf(record: GroupEntry, index: number): GroupEntry | ElementaryEntry {
        const child = record.children[index];
        if (child.kind !== "group" && child.kind !== "elementary")
            throw new Error("Expected storage entry");
        return child;
    }

    function context(path: string[]): CobolPaddingContext {
        return {copybook: "RECORD.cpy", line: 1, path};
    }

    describe("initial padding", () => {
        // 01 RECORD.
        //    05 PREFIX PIC X.
        //    05 AMOUNT PIC S9(4) COMP SYNC.
        const copybook = `
01 RECORD.
   05 PREFIX PIC X.
   05 AMOUNT PIC S9(4) COMP SYNC.
`;
        const record = recordOf(copybook);
        const prefix = childOf(record, 0);
        const amount = childOf(record, 1);

        test("unsynchronized DISPLAY needs no padding", () => {
            expect(valueOrThrow(ibmInitialPadding(
                prefix, 0, context(["RECORD", "PREFIX"])
            ))).toBe(0);
        });

        test("inserts padding before an unaligned halfword", () => {
            expect(valueOrThrow(ibmInitialPadding(
                amount, 8, context(["RECORD", "AMOUNT"])
            ))).toBe(8);
        });

        test("does not insert padding when already aligned", () => {
            expect(valueOrThrow(ibmInitialPadding(
                amount, 16, context(["RECORD", "AMOUNT"])
            ))).toBe(0);
        });

        test("padding repeats with the alignment boundary", () => {
            expect(valueOrThrow(ibmInitialPadding(
                amount, 24, context(["RECORD", "AMOUNT"])
            ))).toBe(8);
            expect(valueOrThrow(ibmInitialPadding(
                amount, 32, context(["RECORD", "AMOUNT"])
            ))).toBe(0);
        });
    });

    describe("fullword initial padding", () => {
        // 01 RECORD.
        //    05 PREFIX PIC X.
        //    05 AMOUNT PIC S9(9) COMP SYNC.
        const copybook = `
01 RECORD.
   05 PREFIX PIC X.
   05 AMOUNT PIC S9(9) COMP SYNC.
`;
        const record = recordOf(copybook);
        const amount = childOf(record, 1);

        test("aligns from one byte to four bytes", () => {
            expect(valueOrThrow(ibmInitialPadding(
                amount, 8, context(["RECORD", "AMOUNT"])
            ))).toBe(24);
        });

        test("aligns from two bytes to four bytes", () => {
            expect(valueOrThrow(ibmInitialPadding(
                amount, 16, context(["RECORD", "AMOUNT"])
            ))).toBe(16);
        });

        test("requires no padding when already aligned", () => {
            expect(valueOrThrow(ibmInitialPadding(
                amount, 32, context(["RECORD", "AMOUNT"])
            ))).toBe(0);
        });
    });

    describe("doubleword initial padding", () => {
        // 01 RECORD.
        //    05 PREFIX PIC X.
        //    05 AMOUNT COMP-2 SYNC.
        const copybook = `
01 RECORD.
   05 PREFIX PIC X.
   05 AMOUNT COMP-2 SYNC.
`;
        const record = recordOf(copybook);
        const amount = childOf(record, 1);

        test("aligns from one byte to eight bytes", () => {
            expect(valueOrThrow(ibmInitialPadding(
                amount, 8, context(["RECORD", "AMOUNT"])
            ))).toBe(56);
        });

        test("aligns from four bytes to eight bytes", () => {
            expect(valueOrThrow(ibmInitialPadding(
                amount, 32, context(["RECORD", "AMOUNT"])
            ))).toBe(32);
        });

        test("requires no padding at an eight-byte boundary", () => {
            expect(valueOrThrow(ibmInitialPadding(
                amount, 64, context(["RECORD", "AMOUNT"])
            ))).toBe(0);
        });
    });

    describe("unsynchronized binary", () => {
        // 01 RECORD.
        //    05 PREFIX PIC X.
        //    05 AMOUNT PIC S9(9) COMP.
        const copybook = `
01 RECORD.
   05 PREFIX PIC X.
   05 AMOUNT PIC S9(9) COMP.
`;
        const record = recordOf(copybook);
        const amount = childOf(record, 1);

        test("does not introduce padding without SYNC", () => {
            expect(valueOrThrow(ibmInitialPadding(
                amount, 8, context(["RECORD", "AMOUNT"])
            ))).toBe(0);
        });
    });

    describe("group initial padding", () => {
        // 01 RECORD.
        //    05 PREFIX PIC X.
        //    05 DETAILS.
        //       10 AMOUNT PIC S9(9) COMP SYNC.
        const copybook = `
01 RECORD.
   05 PREFIX PIC X.
   05 DETAILS.
      10 AMOUNT PIC S9(9) COMP SYNC.
`;
        const record = recordOf(copybook);
        const details = childOf(record, 1);

        test("does not move the group as a whole", () => {
            expect(valueOrThrow(ibmInitialPadding(
                details, 8, context(["RECORD", "DETAILS"])
            ))).toBe(0);
        });

        test("aligns the elementary descendant when placed", () => {
            if (details.kind !== "group") throw new Error("Expected DETAILS group");
            const amount = childOf(details, 0);

            expect(valueOrThrow(ibmInitialPadding(
                amount, 8, context(["RECORD", "DETAILS", "AMOUNT"])
            ))).toBe(24);
        });
    });

    describe("occurrence alignment", () => {
        // 01 RECORD.
        //    05 ITEMS OCCURS 3 TIMES.
        //       10 CODE PIC X.
        //       10 AMOUNT PIC S9(4) COMP SYNC.
        //       10 FLAG PIC X.
        const copybook = `
01 RECORD.
   05 ITEMS OCCURS 3 TIMES.
      10 CODE PIC X.
      10 AMOUNT PIC S9(4) COMP SYNC.
      10 FLAG PIC X.
`;
        const record = recordOf(copybook);
        const items = childOf(record, 0);
        const itemContext = context(["RECORD", "ITEMS"]);

        test("finds the strongest elementary alignment", () => {
            expect(valueOrThrow(ibmOccurrenceAlignment(
                items, itemContext
            ))).toBe(16);
        });

        test("adds trailing padding to a 40-bit occurrence", () => {
            // CODE 8 + internal padding 8 + AMOUNT 16 + FLAG 8 = 40 bits.
            expect(valueOrThrow(ibmOccurrencePadding(
                items, 40, itemContext
            ))).toBe(8);
        });

        test("does not add trailing padding to an aligned occurrence", () => {
            expect(valueOrThrow(ibmOccurrencePadding(
                items, 48, itemContext
            ))).toBe(0);
        });
    });

    describe("nested occurrence alignment", () => {
        // 01 RECORD.
        //    05 ITEMS OCCURS 3 TIMES.
        //       10 HEADER PIC X.
        //       10 DETAILS.
        //          15 AMOUNT PIC S9(9) COMP SYNC.
        //       10 TRAILER PIC X.
        const copybook = `
01 RECORD.
   05 ITEMS OCCURS 3 TIMES.
      10 HEADER PIC X.
      10 DETAILS.
         15 AMOUNT PIC S9(9) COMP SYNC.
      10 TRAILER PIC X.
`;
        const record = recordOf(copybook);
        const items = childOf(record, 0);

        test("includes alignment requirements of nested groups", () => {
            expect(valueOrThrow(ibmOccurrenceAlignment(
                items, context(["RECORD", "ITEMS"])
            ))).toBe(32);
        });

        test("pads a 72-bit occurrence to a 96-bit stride", () => {
            // HEADER 8 + internal padding 24 + AMOUNT 32 + TRAILER 8 = 72.
            expect(valueOrThrow(ibmOccurrencePadding(
                items, 72, context(["RECORD", "ITEMS"])
            ))).toBe(24);
        });
    });

    describe("occurrence containing REDEFINES", () => {
        // 01 RECORD.
        //    05 ITEMS OCCURS 3 TIMES.
        //       10 ORIGINAL PIC X(4).
        //       10 ALTERNATIVE REDEFINES ORIGINAL PIC S9(9) COMP SYNC.
        //       10 FLAG PIC X.
        const copybook = `
01 RECORD.
   05 ITEMS OCCURS 3 TIMES.
      10 ORIGINAL PIC X(4).
      10 ALTERNATIVE REDEFINES ORIGINAL PIC S9(9) COMP SYNC.
      10 FLAG PIC X.
`;
        const record = recordOf(copybook);
        const items = childOf(record, 0);

        test("considers the alignment of every alternative", () => {
            expect(valueOrThrow(ibmOccurrenceAlignment(
                items, context(["RECORD", "ITEMS"])
            ))).toBe(32);
        });

        test("calculates trailing padding from the overlay extent", () => {
            // Overlay maximum 32 + FLAG 8 = 40 bits.
            expect(valueOrThrow(ibmOccurrencePadding(
                items, 40, context(["RECORD", "ITEMS"])
            ))).toBe(24);
        });
    });

    describe("level-01 synchronization", () => {
        // 01 RECORD SYNCHRONIZED.
        //    05 ITEMS OCCURS 3 TIMES.
        //       10 CODE PIC X.
        //       10 AMOUNT PIC S9(4) COMP.
        const copybook = `
01 RECORD SYNCHRONIZED.
   05 ITEMS OCCURS 3 TIMES.
      10 CODE PIC X.
      10 AMOUNT PIC S9(4) COMP.
`;
        const record = recordOf(copybook);
        const items = childOf(record, 0);

        test("propagates inherited synchronization to descendants", () => {
            // Resolve the inherited property through the enclosing RECORD.
            // The policy receives the resolved context when starting at ITEMS.
            const inheritedContext: CobolPaddingContext = {
                ...context(["RECORD", "ITEMS"]),
                inheritedSynchronized: true
            };

            expect(valueOrThrow(ibmOccurrenceAlignment(
                items, inheritedContext
            ))).toBe(16);
        });

        test("an unsynchronized child without inherited context requires no alignment", () => {
            expect(valueOrThrow(ibmOccurrenceAlignment(
                items, context(["RECORD", "ITEMS"])
            ))).toBe(8);
        });
    });

    describe("unsynchronized occurrence", () => {
        // 01 RECORD.
        //    05 ITEMS OCCURS 3 TIMES.
        //       10 CODE PIC X.
        //       10 AMOUNT PIC S9(4) COMP.
        const copybook = `
01 RECORD.
   05 ITEMS OCCURS 3 TIMES.
      10 CODE PIC X.
      10 AMOUNT PIC S9(4) COMP.
`;
        const record = recordOf(copybook);
        const items = childOf(record, 0);

        test("requires only byte alignment", () => {
            expect(valueOrThrow(ibmOccurrenceAlignment(
                items, context(["RECORD", "ITEMS"])
            ))).toBe(8);
        });

        test("adds no trailing padding", () => {
            expect(valueOrThrow(ibmOccurrencePadding(
                items, 24, context(["RECORD", "ITEMS"])
            ))).toBe(0);
        });
    });

    describe("inherited usage", () => {
        // 01 RECORD.
        //    05 ITEMS OCCURS 3 TIMES USAGE COMP.
        //       10 AMOUNT PIC S9(9) SYNC.
        const copybook = `
01 RECORD.
   05 ITEMS OCCURS 3 TIMES USAGE COMP.
      10 AMOUNT PIC S9(9) SYNC.
`;
        const record = recordOf(copybook);
        const items = childOf(record, 0);

        test("uses inherited COMP for alignment", () => {
            expect(valueOrThrow(ibmOccurrenceAlignment(
                items, context(["RECORD", "ITEMS"])
            ))).toBe(32);
        });
    });

    describe("repeated group at an unaligned start", () => {
        // 01 RECORD.
        //    05 PREFIX PIC X.
        //    05 ITEMS OCCURS 3 TIMES.
        //       10 CODE PIC X.
        //       10 AMOUNT PIC S9(9) COMP SYNC.
        //       10 FLAG PIC X.
        const copybook = `
01 RECORD.
   05 PREFIX PIC X.
   05 ITEMS OCCURS 3 TIMES.
      10 CODE PIC X.
      10 AMOUNT PIC S9(9) COMP SYNC.
      10 FLAG PIC X.
`;
        const record = recordOf(copybook);
        const items = childOf(record, 1);
        const code = items.kind === "group" ? childOf(items, 0) : undefined;
        const amount = items.kind === "group" ? childOf(items, 1) : undefined;
        const flag = items.kind === "group" ? childOf(items, 2) : undefined;
        const itemContext = context(["RECORD", "ITEMS"]);

        test("leaves an ordinary group at its unaligned start", () => {
            expect(valueOrThrow(ibmInitialPadding(
                items, 8, itemContext
            ))).toBe(0);
        });

        test("calculates the first occurrence's internal alignment", () => {
            if (!code || !amount || !flag)
                throw new Error("Expected occurrence children");

            expect(valueOrThrow(ibmInitialPadding(
                code, 8, context(["RECORD", "ITEMS", "CODE"])
            ))).toBe(0);

            // CODE occupies byte 1, so AMOUNT is proposed at byte 2.
            expect(valueOrThrow(ibmInitialPadding(
                amount, 16, context(["RECORD", "ITEMS", "AMOUNT"])
            ))).toBe(16);

            // FLAG follows AMOUNT at byte 8.
            expect(valueOrThrow(ibmInitialPadding(
                flag, 64, context(["RECORD", "ITEMS", "FLAG"])
            ))).toBe(0);
        });

        test("requires no trailing padding for an eight-byte occurrence", () => {
            // CODE 8 + padding 16 + AMOUNT 32 + FLAG 8 = 64 bits.
            expect(valueOrThrow(ibmOccurrenceAlignment(
                items, itemContext
            ))).toBe(32);
            expect(valueOrThrow(ibmOccurrencePadding(
                items, 64, itemContext
            ))).toBe(0);
        });

        test("the second occurrence has the same alignment pattern", () => {
            if (!amount) throw new Error("Expected AMOUNT");

            // First occurrence starts at bit 8 and occupies 64 bits.
            // Second occurrence starts at bit 72; AMOUNT is proposed at bit 80.
            expect(valueOrThrow(ibmInitialPadding(
                amount, 80, context(["RECORD", "ITEMS", "AMOUNT"])
            ))).toBe(16);
        });
    });

    describe("invalid declarations", () => {
        // 01 RECORD.
        //    05 AMOUNT PIC S9(19) COMP SYNC.
        const copybook = `
01 RECORD.
   05 AMOUNT PIC S9(19) COMP SYNC.
`;
        const record = recordOf(copybook);
        const amount = childOf(record, 0);

        test("preserves alignment diagnostics", () => {
            const result = ibmInitialPadding(
                amount, 8, context(["RECORD", "AMOUNT"])
            );
            expect(errorsOrThrow(result)[0]).toContain("exceeds 18 digits");
        });
    });
    describe("symbolic initial padding after ODO", () => {
        // 01 RECORD.
        //    05 COUNT PIC 9.
        //    05 ITEMS OCCURS 0 TO 10 TIMES DEPENDING ON COUNT.
        //       10 CODE PIC X(3).
        //    05 AMOUNT PIC S9(9) COMP SYNC.
        const copybook = `
01 RECORD.
   05 COUNT PIC 9.
   05 ITEMS OCCURS 0 TO 10 TIMES DEPENDING ON COUNT.
      10 CODE PIC X(3).
   05 AMOUNT PIC S9(9) COMP SYNC.
`;
        const record = recordOf(copybook);
        const amount = childOf(record, 2);

        const offset = {
            kind: "sum",
            terms: [
                8,
                {
                    kind: "depending-on",
                    path: ["RECORD", "COUNT"],
                    expression: 24
                }
            ]
        } as const satisfies StorageSizeExpression;

        test("returns an alignment expression for a symbolic offset", () => {
            expect(valueOrThrow(ibmInitialPadding(
                amount, offset, context(["RECORD", "AMOUNT"])
            ))).toEqual({
                kind: "align",
                size: offset,
                boundary: 32
            });
        });

        test("the expression produces different padding for different counts", () => {
            const padding = valueOrThrow(ibmInitialPadding(
                amount, offset, context(["RECORD", "AMOUNT"])
            ));

            for (const [count, expected] of [
                [0, 24],
                [1, 0],
                [2, 8],
                [3, 16],
                [4, 24]
            ]) {
                expect(evaluateStorageSize(padding, () => count)).toBe(expected);
            }
        });
    });

    describe("byte alignment of symbolic sizes", () => {
        // 01 RECORD.
        //    05 COUNT PIC 9.
        //    05 ITEMS OCCURS 0 TO 10 TIMES DEPENDING ON COUNT.
        //       10 CODE PIC X(3).
        //    05 FLAG PIC X.
        const copybook = `
01 RECORD.
   05 COUNT PIC 9.
   05 ITEMS OCCURS 0 TO 10 TIMES DEPENDING ON COUNT.
      10 CODE PIC X(3).
   05 FLAG PIC X.
`;
        const record = recordOf(copybook);
        const flag = childOf(record, 2);

        const offset = {
            kind: "sum",
            terms: [
                8,
                {
                    kind: "depending-on",
                    path: ["RECORD", "COUNT"],
                    expression: 24
                }
            ]
        } as const satisfies StorageSizeExpression;

        test("returns zero before an unsynchronized field without constructing an expression", () => {
            expect(valueOrThrow(ibmInitialPadding(
                flag, offset, context(["RECORD", "FLAG"])
            ))).toBe(0);
        });

        test("returns zero trailing padding for a byte-aligned symbolic occurrence", () => {
            const items = childOf(record, 1);

            expect(valueOrThrow(ibmOccurrenceAlignment(
                items, context(["RECORD", "ITEMS"])
            ))).toBe(8);

            expect(valueOrThrow(ibmOccurrencePadding(
                items, offset, context(["RECORD", "ITEMS"])
            ))).toBe(0);
        });
    });

    describe("default policy", () => {
        test("provides all three IBM strategies", () => {
            expect(ibmCobolPadding.before).toBe(ibmInitialPadding);
            expect(ibmCobolPadding.occurrenceAlignment).toBe(ibmOccurrenceAlignment);
            expect(ibmCobolPadding.afterOccurrence).toBe(ibmOccurrencePadding);
        });
    });
});
