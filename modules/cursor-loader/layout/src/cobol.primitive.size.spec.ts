
import {valueOrThrow, errorsOrThrow} from "@cobol-ts/errors";
import {
    defaultCobolPrimitiveSizer,
    type CobolPrimitiveDescription,
    type CobolPrimitiveSizeContext
} from "./cobol.primitive.size";

describe("primitive size", () => {
    const context: CobolPrimitiveSizeContext = {
        copybook: "CUSTOMER.cpy",
        line: 12,
        path: ["CUSTOMER", "FIELD"]
    };

    const description = (
        picture?: string,
        usage?: string,
        separateSign = false
    ): CobolPrimitiveDescription => ({
        picture,
        usage,
        ...(separateSign ? {
            sign: {kind: "sign", position: "trailing", separate: true}
        } : {})
    });

    const bits = (picture?: string, usage?: string, separateSign = false) =>
        valueOrThrow(defaultCobolPrimitiveSizer(
            description(picture, usage, separateSign), context
        ));

    const failures = (picture?: string, usage?: string, separateSign = false) =>
        errorsOrThrow(defaultCobolPrimitiveSizer(
            description(picture, usage, separateSign), context
        ));

    describe("DISPLAY alphanumeric", () => {
        // 05 FIELD PIC X.
        test("one character", () => expect(bits("X")).toBe(8));

        // 05 FIELD PIC X(10).
        test("ten characters", () => expect(bits("X(10)")).toBe(80));

        // 05 FIELD PIC XX(3).
        test("mixed repetition is four characters", () => expect(bits("XX(3)")).toBe(32));

        // 05 FIELD PIC XXX(3).
        test("mixed repetition is five characters", () => expect(bits("XXX(3)")).toBe(40));

        // 05 FIELD PIC A(5).
        test("alphabetic characters", () => expect(bits("A(5)")).toBe(40));

        // 05 FIELD PIC X(5) USAGE DISPLAY.
        test("explicit DISPLAY", () => expect(bits("X(5)", "DISPLAY")).toBe(40));
    });

    describe("DISPLAY numeric", () => {
        // 05 FIELD PIC 9.
        test("one digit", () => expect(bits("9")).toBe(8));

        // 05 FIELD PIC 9(3).
        test("three digits", () => expect(bits("9(3)")).toBe(24));

        // 05 FIELD PIC 999V99.
        test("implied decimal point", () => expect(bits("999V99")).toBe(40));

        // 05 FIELD PIC S9(5).
        test("embedded sign", () => expect(bits("S9(5)")).toBe(40));

        // 05 FIELD PIC S9(5) SIGN IS TRAILING SEPARATE.
        test("separate sign adds one byte", () => {
            const field = description("S9(5)", undefined, true);
            expect(field.sign).toEqual({kind: "sign", position: "trailing", separate: true});
            expect(valueOrThrow(defaultCobolPrimitiveSizer(field, context))).toBe(48);
        });

        // 05 FIELD PIC 9(4)P(2).
        test("assumed scaling positions", () => expect(bits("9(4)P(2)")).toBe(32));

        // 05 FIELD PIC ZZZ9.99.
        test("numeric editing", () => expect(bits("ZZZ9.99")).toBe(56));
    });

    describe("packed decimal", () => {
        // 05 FIELD PIC 9(4) COMP-3.
        test("four digits", () => expect(bits("9(4)", "COMP-3")).toBe(24));

        // 05 FIELD PIC 9(5) COMP-3.
        test("five digits", () => expect(bits("9(5)", "COMP-3")).toBe(24));

        // 05 FIELD PIC S9(6) COMP-3.
        test("six signed digits", () => expect(bits("S9(6)", "COMP-3")).toBe(32));

        // 05 FIELD PIC S9(7)V99 COMP-3.
        test("implied decimal", () => expect(bits("S9(7)V99", "COMP-3")).toBe(40));

        // 05 FIELD PIC 9(9) USAGE PACKED-DECIMAL.
        test("usage synonym", () => expect(bits("9(9)", "PACKED-DECIMAL")).toBe(40));
    });

    describe("binary", () => {
        // 05 FIELD PIC S9(4) COMP.
        test("four digits", () => expect(bits("S9(4)", "COMP")).toBe(16));

        // 05 FIELD PIC S9(5) COMP.
        test("five digits", () => expect(bits("S9(5)", "COMP")).toBe(32));

        // 05 FIELD PIC S9(9) COMP.
        test("nine digits", () => expect(bits("S9(9)", "COMP")).toBe(32));

        // 05 FIELD PIC S9(10) COMP.
        test("ten digits", () => expect(bits("S9(10)", "COMP")).toBe(64));

        // 05 FIELD PIC S9(18) COMP.
        test("eighteen digits", () => expect(bits("S9(18)", "COMP")).toBe(64));

        // 05 FIELD PIC 9(4) COMP-4.
        test("COMP-4", () => expect(bits("9(4)", "COMP-4")).toBe(16));

        // 05 FIELD PIC 9(8) COMP-5.
        test("COMP-5", () => expect(bits("9(8)", "COMP-5")).toBe(32));

        // 05 FIELD PIC 9(4) BINARY.
        test("BINARY synonym", () => expect(bits("9(4)", "BINARY")).toBe(16));

        // 05 FIELD PIC 9(4) COMPUTATIONAL.
        test("COMPUTATIONAL synonym", () => expect(bits("9(4)", "COMPUTATIONAL")).toBe(16));

        // 05 FIELD PIC 9(5) COMPUTATIONAL-3.
        test("COMPUTATIONAL-3 synonym", () => {
            expect(bits("9(5)", "COMPUTATIONAL-3")).toBe(24);
        });
    });

    describe("floating point", () => {
        // 05 FIELD USAGE COMP-1.
        test("single precision", () => expect(bits(undefined, "COMP-1")).toBe(32));

        // 05 FIELD USAGE COMP-2.
        test("double precision", () => expect(bits(undefined, "COMP-2")).toBe(64));
    });

    describe("national", () => {
        // 05 FIELD PIC N(10) USAGE NATIONAL.
        test("ten national characters", () => expect(bits("N(10)", "NATIONAL")).toBe(160));

        // 05 FIELD PIC N(3) USAGE DISPLAY-1.
        test("DISPLAY-1", () => expect(bits("N(3)", "DISPLAY-1")).toBe(48));
    });

    describe("independent storage descriptions", () => {
        // 05 ORIGINAL PIC X(4).
        // 05 ALTERNATIVE REDEFINES ORIGINAL PIC X(6).
        test("larger alternative", () => {
            expect(bits("X(4)")).toBe(32);
            expect(bits("X(6)")).toBe(48);
        });

        // 05 ORIGINAL PIC X(4).
        // 05 ALTERNATIVE REDEFINES ORIGINAL PIC X(2).
        test("smaller alternative", () => {
            expect(bits("X(4)")).toBe(32);
            expect(bits("X(2)")).toBe(16);
        });

        // 05 ORIGINAL PIC X(4).
        // 05 ALTERNATIVE REDEFINES ORIGINAL PIC S9(4) COMP-3.
        test("different representation", () => {
            expect(bits("X(4)")).toBe(32);
            expect(bits("S9(4)", "COMP-3")).toBe(24);
        });
    });

    describe("invalid storage", () => {
        // 05 FIELD PIC INVALID.
        test("unsupported picture", () => {
            expect(failures("INVALID")[0]).toContain("Unsupported PICTURE");
        });

        // 05 FIELD PIC 9(0).
        test("zero repetition", () => {
            expect(failures("9(0)")[0]).toContain("Unsupported PICTURE");
        });

        // 05 FIELD PIC X(10) COMP-3.
        test("packed alphanumeric", () => {
            expect(failures("X(10)", "COMP-3")[0]).toContain("unedited numeric");
        });

        // 05 FIELD PIC 9(19) COMP.
        test("excessive binary precision", () => {
            expect(failures("9(19)", "COMP")[0]).toContain("exceeds 18 digits");
        });

        // 05 FIELD PIC 9(5) COMP-1.
        test("floating point with PICTURE", () => {
            expect(failures("9(5)", "COMP-1")[0]).toContain("must not have PICTURE");
        });

        // 05 FIELD PIC 9(5) USAGE UNKNOWN.
        test("unsupported usage", () => {
            expect(failures("9(5)", "UNKNOWN")[0]).toContain("Unsupported USAGE 'UNKNOWN'");
        });

        // 05 FIELD PIC 9(5) SIGN IS TRAILING SEPARATE.
        test("separate sign without signed picture", () => {
            expect(failures("9(5)", undefined, true)[0])
                .toContain("SIGN clause requires a signed numeric picture");
        });

        // 05 FIELD PIC S9(5) COMP-3 SIGN IS TRAILING SEPARATE.
        test("SIGN clause on packed decimal", () => {
            expect(failures("S9(5)", "COMP-3", true)[0])
                .toContain("does not support a SIGN clause");
        });

        // 05 FIELD PIC S9(5) COMP SIGN IS TRAILING SEPARATE.
        test("SIGN clause on binary", () => {
            expect(failures("S9(5)", "COMP", true)[0])
                .toContain("does not support a SIGN clause");
        });
    });

    describe("diagnostics", () => {
        // 05 FIELD PIC 9(5) USAGE UNKNOWN.
        test("identifies copybook, line and field", () => {
            expect(failures("9(5)", "UNKNOWN")[0]).toBe(
                "Copybook CUSTOMER.cpy, line 12, CUSTOMER.FIELD: Unsupported USAGE 'UNKNOWN'"
            );
        });

        // 05 FIELD PIC X(3) USAGE UNKNOWN.
        test("supports qualified field paths", () => {
            const nested: CobolPrimitiveSizeContext = {
                copybook: "ORDERS.cpy",
                line: 42,
                path: ["ORDER", "ITEMS", "CODE"]
            };
            const result = defaultCobolPrimitiveSizer(
                {picture: "X(3)", usage: "UNKNOWN"}, nested
            );
            expect(errorsOrThrow(result)[0]).toBe(
                "Copybook ORDERS.cpy, line 42, ORDER.ITEMS.CODE: Unsupported USAGE 'UNKNOWN'"
            );
        });
    });
});
