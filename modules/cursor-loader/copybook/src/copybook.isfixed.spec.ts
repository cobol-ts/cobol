import {
    isFixedFormatCopybook,
} from "./copybook.isfixed";


describe("isFixedFormatCopybook", () => {

    test("detects fixed format with sequence numbers", () => {
        expect(
            isFixedFormatCopybook([
                "000100 01 CUSTOMER.",
                "000200     05 NAME PIC X(30).",
            ]),
        ).toEqual(true);
    });


    test("detects fixed format with a star indicator in column 7", () => {
        expect(
            isFixedFormatCopybook([
                "       01 CUSTOMER.",
                "      * COMMENT",
                "           05 NAME PIC X(30).",
            ]),
        ).toEqual(true);
    });


    test("detects fixed format with a slash indicator in column 7", () => {
        expect(
            isFixedFormatCopybook([
                "       01 CUSTOMER.",
                "      / PAGE BREAK",
                "           05 NAME PIC X(30).",
            ]),
        ).toEqual(true);
    });


    test("detects fixed format with a continuation indicator in column 7", () => {
        expect(
            isFixedFormatCopybook([
                "       05 VERY-LONG-",
                "      -NAME PIC X.",
            ]),
        ).toEqual(true);
    });


    test("ignores blank lines when detecting fixed format", () => {
        expect(
            isFixedFormatCopybook([
                "",
                "000100 01 CUSTOMER.",
                "",
                "000200     05 NAME PIC X.",
                "",
            ]),
        ).toEqual(true);
    });


    test("rejects free format source", () => {
        expect(
            isFixedFormatCopybook([
                "01 CUSTOMER.",
                "    05 NAME PIC X(30).",
            ]),
        ).toEqual(false);
    });


    test("does not mistake indented free format for fixed format", () => {
        expect(
            isFixedFormatCopybook([
                "      01 CUSTOMER.",
                "      05 NAME PIC X(30).",
            ]),
        ).toEqual(false);
    });


    test("does not detect fixed format without strong evidence", () => {
        expect(
            isFixedFormatCopybook([
                "       01 CUSTOMER.",
                "           05 NAME PIC X(30).",
            ]),
        ).toEqual(false);
    });


    test("rejects mixed fixed and free format source", () => {
        expect(
            isFixedFormatCopybook([
                "000100 01 CUSTOMER.",
                "    05 NAME PIC X(30).",
            ]),
        ).toEqual(false);
    });


    test("rejects a line whose sequence area contains non-fixed characters", () => {
        expect(
            isFixedFormatCopybook([
                "ABC100 01 CUSTOMER.",
            ]),
        ).toEqual(false);
    });


    test("rejects an unsupported column 7 indicator", () => {
        expect(
            isFixedFormatCopybook([
                "000100X01 CUSTOMER.",
            ]),
        ).toEqual(false);
    });


    test("rejects lines shorter than the fixed format prefix", () => {
        expect(
            isFixedFormatCopybook([
                "01",
            ]),
        ).toEqual(false);
    });


    test("returns false for blank source", () => {
        expect(
            isFixedFormatCopybook([
                "",
                "   ",
                "",
            ]),
        ).toEqual(false);
    });


    test("returns false for empty source", () => {
        expect(
            isFixedFormatCopybook([]),
        ).toEqual(false);
    });


    test("accepts spaces in the sequence area when another line supplies strong evidence", () => {
        expect(
            isFixedFormatCopybook([
                "000100 01 CUSTOMER.",
                "           05 NAME PIC X(30).",
            ]),
        ).toEqual(true);
    });


    test("does not treat partially populated numeric sequence areas as fixed format", () => {
        expect(
            isFixedFormatCopybook([
                "   100 01 CUSTOMER.",
                "   200     05 NAME PIC X.",
            ]),
        ).toEqual(false);
    });

});