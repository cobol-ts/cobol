
import {errorsOrThrow, valueOrThrow} from "@cobol-ts/errors";
import {
    ibmCobolAlignment,
    type CobolAlignmentResolver
} from "./cobol.alignment";
import {
    type CobolPrimitiveDescription,
    type CobolPrimitiveSizeContext
} from "./cobol.primitive.size";

describe("IBM COBOL alignment", () => {
    const context: CobolPrimitiveSizeContext = {
        copybook: "CUSTOMER.cpy",
        line: 12,
        path: ["CUSTOMER", "FIELD"]
    };

    const boundary = (
        picture?: string,
        usage?: string,
        synchronized = true
    ): number => {
        const description: CobolPrimitiveDescription = {picture, usage};
        return valueOrThrow(ibmCobolAlignment(description, synchronized, context));
    };

    const failures = (
        picture?: string,
        usage?: string,
        synchronized = true
    ): string[] => {
        const description: CobolPrimitiveDescription = {picture, usage};
        return errorsOrThrow(ibmCobolAlignment(description, synchronized, context));
    };

    describe("without SYNCHRONIZED", () => {
        // 05 FIELD PIC X(5).
        test("DISPLAY is byte aligned", () => {
            expect(boundary("X(5)", undefined, false)).toBe(8);
        });

        // 05 FIELD PIC S9(4) COMP.
        test("binary halfword requires no explicit alignment", () => {
            expect(boundary("S9(4)", "COMP", false)).toBe(8);
        });

        // 05 FIELD PIC S9(9) COMP.
        test("binary fullword requires no explicit alignment", () => {
            expect(boundary("S9(9)", "COMP", false)).toBe(8);
        });

        // 05 FIELD PIC S9(18) COMP.
        test("binary doubleword requires no explicit alignment", () => {
            expect(boundary("S9(18)", "COMP", false)).toBe(8);
        });

        // 05 FIELD COMP-2.
        test("floating point requires no explicit alignment", () => {
            expect(boundary(undefined, "COMP-2", false)).toBe(8);
        });
    });

    describe("DISPLAY and packed storage", () => {
        // 05 FIELD PIC X(5) SYNC.
        test("alphanumeric DISPLAY is byte aligned", () => {
            expect(boundary("X(5)")).toBe(8);
        });

        // 05 FIELD PIC S9(5) SYNC.
        test("numeric DISPLAY is byte aligned", () => {
            expect(boundary("S9(5)")).toBe(8);
        });

        // 05 FIELD PIC S9(5) DISPLAY SYNC.
        test("explicit DISPLAY is byte aligned", () => {
            expect(boundary("S9(5)", "DISPLAY")).toBe(8);
        });

        // 05 FIELD PIC S9(5) COMP-3 SYNC.
        test("packed decimal is byte aligned", () => {
            expect(boundary("S9(5)", "COMP-3")).toBe(8);
        });

        // 05 FIELD PIC S9(5) PACKED-DECIMAL SYNC.
        test("PACKED-DECIMAL is byte aligned", () => {
            expect(boundary("S9(5)", "PACKED-DECIMAL")).toBe(8);
        });

        // 05 FIELD PIC N(5) NATIONAL SYNC.
        test("NATIONAL is byte aligned", () => {
            expect(boundary("N(5)", "NATIONAL")).toBe(8);
        });

        // 05 FIELD PIC N(5) DISPLAY-1 SYNC.
        test("DISPLAY-1 is byte aligned", () => {
            expect(boundary("N(5)", "DISPLAY-1")).toBe(8);
        });
    });

    describe("binary halfword alignment", () => {
        // 05 FIELD PIC S9 COMP SYNC.
        test("one digit", () => {
            expect(boundary("S9", "COMP")).toBe(16);
        });

        // 05 FIELD PIC S9(4) COMP SYNC.
        test("four digits", () => {
            expect(boundary("S9(4)", "COMP")).toBe(16);
        });

        // 05 FIELD PIC 9999 COMP SYNC.
        test("expanded picture", () => {
            expect(boundary("9999", "COMP")).toBe(16);
        });

        // 05 FIELD PIC S9(4) COMP-4 SYNC.
        test("COMP-4", () => {
            expect(boundary("S9(4)", "COMP-4")).toBe(16);
        });

        // 05 FIELD PIC S9(4) COMP-5 SYNC.
        test("COMP-5", () => {
            expect(boundary("S9(4)", "COMP-5")).toBe(16);
        });

        // 05 FIELD PIC S9(4) BINARY SYNC.
        test("BINARY", () => {
            expect(boundary("S9(4)", "BINARY")).toBe(16);
        });
    });

    describe("binary fullword alignment", () => {
        // 05 FIELD PIC S9(5) COMP SYNC.
        test("five digits", () => {
            expect(boundary("S9(5)", "COMP")).toBe(32);
        });

        // 05 FIELD PIC S9(9) COMP SYNC.
        test("nine digits", () => {
            expect(boundary("S9(9)", "COMP")).toBe(32);
        });

        // 05 FIELD PIC S9(10) COMP SYNC.
        test("ten digits", () => {
            expect(boundary("S9(10)", "COMP")).toBe(32);
        });

        // 05 FIELD PIC S9(18) COMP SYNC.
        test("eighteen digits", () => {
            expect(boundary("S9(18)", "COMP")).toBe(32);
        });

        // 05 FIELD PIC S9(18) COMP-5 SYNC.
        test("COMP-5 doubleword storage is fullword aligned", () => {
            expect(boundary("S9(18)", "COMP-5")).toBe(32);
        });

        // 05 FIELD PIC S9(5) COMPUTATIONAL SYNC.
        test("COMPUTATIONAL synonym", () => {
            expect(boundary("S9(5)", "COMPUTATIONAL")).toBe(32);
        });

        // 05 FIELD PIC S9(5) COMPUTATIONAL-4 SYNC.
        test("COMPUTATIONAL-4 synonym", () => {
            expect(boundary("S9(5)", "COMPUTATIONAL-4")).toBe(32);
        });

        // 05 FIELD PIC S9(5) COMPUTATIONAL-5 SYNC.
        test("COMPUTATIONAL-5 synonym", () => {
            expect(boundary("S9(5)", "COMPUTATIONAL-5")).toBe(32);
        });
    });

    describe("floating point alignment", () => {
        // 05 FIELD COMP-1 SYNC.
        test("COMP-1 aligns to four bytes", () => {
            expect(boundary(undefined, "COMP-1")).toBe(32);
        });

        // 05 FIELD COMP-2 SYNC.
        test("COMP-2 aligns to eight bytes", () => {
            expect(boundary(undefined, "COMP-2")).toBe(64);
        });

        // 05 FIELD COMPUTATIONAL-1 SYNC.
        test("COMPUTATIONAL-1 synonym", () => {
            expect(boundary(undefined, "COMPUTATIONAL-1")).toBe(32);
        });

        // 05 FIELD COMPUTATIONAL-2 SYNC.
        test("COMPUTATIONAL-2 synonym", () => {
            expect(boundary(undefined, "COMPUTATIONAL-2")).toBe(64);
        });
    });

    describe("numeric picture precision", () => {
        // 05 FIELD PIC S999V99 COMP SYNC.
        test("implied decimal contributes digits", () => {
            expect(boundary("S999V99", "COMP")).toBe(32);
        });

        // 05 FIELD PIC S9(4)V9(5) COMP SYNC.
        test("repeated digits around decimal", () => {
            expect(boundary("S9(4)V9(5)", "COMP")).toBe(32);
        });

        // 05 FIELD PIC S9(4)P(2) COMP SYNC.
        test("scaling positions do not count as digits", () => {
            expect(boundary("S9(4)P(2)", "COMP")).toBe(16);
        });

        // 05 FIELD PIC 9(4) COMP SYNC.
        test("unsigned binary", () => {
            expect(boundary("9(4)", "COMP")).toBe(16);
        });
    });

    describe("invalid declarations", () => {
        // 05 FIELD PIC X(5) COMP SYNC.
        test("binary requires numeric picture", () => {
            expect(failures("X(5)", "COMP")[0])
                .toContain("Unsupported binary PICTURE");
        });

        // 05 FIELD PIC 9(0) COMP SYNC.
        test("zero repetition is rejected", () => {
            expect(failures("9(0)", "COMP")[0])
                .toContain("Unsupported binary PICTURE");
        });

        // 05 FIELD PIC 9(19) COMP SYNC.
        test("binary precision above eighteen digits is rejected", () => {
            expect(failures("9(19)", "COMP")[0])
                .toContain("exceeds 18 digits");
        });

        // 05 FIELD COMP SYNC.
        test("binary requires a picture", () => {
            expect(failures(undefined, "COMP")[0])
                .toContain("Binary alignment requires a PICTURE");
        });

        // 05 FIELD PIC 9(5) USAGE UNKNOWN SYNC.
        test("unknown usage is rejected", () => {
            expect(failures("9(5)", "UNKNOWN")[0])
                .toContain("Unsupported USAGE 'UNKNOWN'");
        });
    });

    describe("diagnostics", () => {
        // 05 FIELD PIC 9(19) COMP SYNC.
        test("includes copybook, line and qualified path", () => {
            expect(failures("9(19)", "COMP")[0]).toBe(
                "Copybook CUSTOMER.cpy, line 12, CUSTOMER.FIELD: " +
                "Binary PICTURE exceeds 18 digits: '9(19)'"
            );
        });

        // 05 FIELD PIC 9(19) COMP SYNC.
        test("uses the supplied context", () => {
            const nested: CobolPrimitiveSizeContext = {
                copybook: "ORDERS.cpy",
                line: 42,
                path: ["ORDER", "ITEMS", "AMOUNT"]
            };
            const description: CobolPrimitiveDescription = {
                picture: "9(19)",
                usage: "COMP"
            };
            const result = ibmCobolAlignment(description, true, nested);

            expect(errorsOrThrow(result)[0]).toBe(
                "Copybook ORDERS.cpy, line 42, ORDER.ITEMS.AMOUNT: " +
                "Binary PICTURE exceeds 18 digits: '9(19)'"
            );
        });
    });

    describe("resolver contract", () => {
        // 05 FIELD PIC S9(4) COMP SYNC.
        test("can be injected as a CobolAlignmentResolver", () => {
            const resolver: CobolAlignmentResolver = ibmCobolAlignment;
            const description: CobolPrimitiveDescription = {
                picture: "S9(4)",
                usage: "COMP"
            };

            expect(valueOrThrow(resolver(description, true, context))).toBe(16);
        });

        // 05 FIELD PIC S9(4) COMP.
        test("same declaration without SYNC requires no alignment", () => {
            const description: CobolPrimitiveDescription = {
                picture: "S9(4)",
                usage: "COMP"
            };

            expect(valueOrThrow(ibmCobolAlignment(description, false, context))).toBe(8);
        });
    });
});
