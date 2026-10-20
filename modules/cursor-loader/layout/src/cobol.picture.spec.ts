import {parseCobolPicture, parseCobolPictureTokens} from "./cobol.picture";

describe("COBOL PICTURE grammar", () => {
    test("preserves repetitions without expanding symbols", () => {
        expect(parseCobolPictureTokens("-9(18)")).toEqual([
            {symbol: "-", repeat: 1}, {symbol: "9", repeat: 18}
        ]);
    });

    test("recognises CR and DB as two-character symbols", () => {
        expect(parseCobolPictureTokens("9(5)CR")).toEqual([
            {symbol: "9", repeat: 5}, {symbol: "CR", repeat: 1}
        ]);
        expect(parseCobolPictureTokens("9(5)DB")).toEqual([
            {symbol: "9", repeat: 5}, {symbol: "DB", repeat: 1}
        ]);
    });

    test("rejects malformed repetitions", () => {
        for (const picture of ["9(0)", "9()", "9(-2)", "9(2", "9(1.5)", "9(9007199254740993)"]) {
            expect(parseCobolPictureTokens(picture)).toBeUndefined();
        }
    });

    test("classifies mixed alphanumeric and edited pictures", () => {
        expect(parseCobolPicture("X9(2)")?.category).toBe("alphanumeric");
        expect(parseCobolPicture("XXBX/XXX")?.category).toBe("alphanumeric-edited");
        expect(parseCobolPicture("A(2)")?.category).toBe("alphabetic");
    });

    test("classifies numeric and edited numeric pictures", () => {
        expect(parseCobolPicture("S9(7)V99")?.category).toBe("numeric");
        expect(parseCobolPicture("ZZ,ZZ9.99")?.category).toBe("numeric-edited");
        expect(parseCobolPicture("-9(18)")?.positions).toBe(19);
    });

    test("recognises the external floating-point mantissa and exponent", () => {
        const result = parseCobolPicture("-9V9(9)E-99");
        expect(result?.category).toBe("external-floating");
        expect(result?.positions).toBe(15);
        expect(parseCobolPicture("9V9(9)E-99")).toBeUndefined();
        expect(parseCobolPicture("-9V9E-9")).toBeUndefined();
    });

    test("classifies national, DBCS and fixed-character UTF-8", () => {
        expect(parseCobolPicture("0NN")?.category).toBe("national-edited");
        expect(parseCobolPicture("G(3)")?.category).toBe("dbcs");
        expect(parseCobolPicture("U(10)")?.category).toBe("utf8");
    });
});

describe("compiler currency picture symbols", () => {
    test("preserves the exact case of custom currency symbols", () => {
        const options = {currencySigns: [{symbol: "f", value: "CHF"}, {symbol: "F", value: "USD"}]};
        expect(parseCobolPicture("f9(3)", options)?.positions).toBe(6);
        expect(parseCobolPicture("F9(3)", options)?.positions).toBe(6);
        expect(parseCobolPicture("fF9(3)", options)).toBeUndefined();
        expect(parseCobolPicture("f9(3)")).toBeUndefined();
    });
    test("an alternate CURRENCY compiler option replaces the default picture symbol", () => {
        const options = {defaultCurrency: {symbol: "@", value: "@"}};
        expect(parseCobolPicture("@9(4)", options)?.positions).toBe(5);
        expect(parseCobolPicture("$9(4)", options)).toBeUndefined();
    });
    test("counts full sign once, then one position per repeated picture symbol", () => {
        const options = {currencySigns: [{symbol: "$", value: "EUR"}]};
        expect(parseCobolPicture("$9(3).99", options)?.positions).toBe(9);
        expect(parseCobolPicture("$$$9.99", options)?.positions).toBe(9);
        expect(parseCobolPicture("$(3)9.99", options)?.positions).toBe(9);
        expect(parseCobolPicture("$$$9.99")?.positions).toBe(7);
    });
});
