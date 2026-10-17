import {
    preprocessFixedCopybook,
} from "./copybook.preparser";


describe("preprocessFixedCopybook", () => {

    test("removes sequence numbers and column 7", () => {
        expect(
            preprocessFixedCopybook([
                "000100 01 CUSTOMER.",
                "000200     05 NAME PIC X(30).",
            ]),
        ).toEqual([
            "01 CUSTOMER.",
            "    05 NAME PIC X(30).",
        ]);
    });


    test("preserves line count when removing star comments", () => {
        expect(
            preprocessFixedCopybook([
                "000100 01 CUSTOMER.",
                "000200* THIS IS A COMMENT",
                "000300     05 NAME PIC X(30).",
            ]),
        ).toEqual([
            "01 CUSTOMER.",
            "",
            "    05 NAME PIC X(30).",
        ]);
    });


    test("preserves line count when removing slash comments", () => {
        expect(
            preprocessFixedCopybook([
                "000100 01 CUSTOMER.",
                "000200/ PAGE BREAK",
                "000300     05 NAME PIC X(30).",
            ]),
        ).toEqual([
            "01 CUSTOMER.",
            "",
            "    05 NAME PIC X(30).",
        ]);
    });


    test("joins a hyphen continuation without inserting whitespace", () => {
        expect(
            preprocessFixedCopybook([
                "000100     05 VERY-LONG-",
                "000200-NAME PIC X.",
            ]),
        ).toEqual([
            "    05 VERY-LONG-NAME PIC X.",
            "",
        ]);
    });


    test("joins a hyphen continuation to the previous source line", () => {
        expect(
            preprocessFixedCopybook([
                "000100     05 VALUE-FIELD PIC",
                "000200- X(30).",
            ]),
        ).toEqual([
            "    05 VALUE-FIELD PICX(30).",
            "",
        ]);
    });


    test("joins a continuation across an intervening comment", () => {
        expect(
            preprocessFixedCopybook([
                "000100     05 VERY-LONG-",
                "000200* COMMENT BETWEEN LINES",
                "000300-NAME PIC X.",
            ]),
        ).toEqual([
            "    05 VERY-LONG-NAME PIC X.",
            "",
            "",
        ]);
    });


    test("supports multiple hyphen continuation lines", () => {
        expect(
            preprocessFixedCopybook([
                "000100     05 VERY-",
                "000200-LONG-",
                "000300-NAME PIC X.",
            ]),
        ).toEqual([
            "    05 VERY-LONG-NAME PIC X.",
            "",
            "",
        ]);
    });


    test("does not join ordinary continuation lines", () => {
        expect(
            preprocessFixedCopybook([
                "000100     05 NAME",
                "000200        PIC X(30).",
            ]),
        ).toEqual([
            "    05 NAME",
            "       PIC X(30).",
        ]);
    });


    test("ordinary continuation lines retain whitespace separation", () => {
        const actual =
            preprocessFixedCopybook([
                "000100     05 NAME",
                "000200        PIC X(30).",
            ]);

        expect(
            actual
                .filter(line => line !== "")
                .map(line => line.trim())
                .join(" "),
        ).toEqual(
            "05 NAME PIC X(30).",
        );
    });


    test("ordinary continuation over several lines retains whitespace separation", () => {
        const actual =
            preprocessFixedCopybook([
                "000100     05 BALANCE",
                "000200        PIC S9(9)V99",
                "000300        COMP-3.",
            ]);

        expect(
            actual
                .filter(line => line !== "")
                .map(line => line.trim())
                .join(" "),
        ).toEqual(
            "05 BALANCE PIC S9(9)V99 COMP-3.",
        );
    });


    test("truncates source after column 72", () => {
        const source =
            "000100 " +
            "05 NAME PIC X.".padEnd(
                65,
                " ",
            ) +
            "IGNORED";

        expect(
            preprocessFixedCopybook([
                source,
            ]),
        ).toEqual([
            "05 NAME PIC X.",
        ]);
    });


    test("trims trailing whitespace from source text", () => {
        expect(
            preprocessFixedCopybook([
                "000100     05 NAME PIC X.        ",
            ]),
        ).toEqual([
            "    05 NAME PIC X.",
        ]);
    });


    test("preserves leading whitespace after column 7", () => {
        expect(
            preprocessFixedCopybook([
                "000100         10 NAME PIC X.",
            ]),
        ).toEqual([
            "        10 NAME PIC X.",
        ]);
    });


    test("handles a blank fixed-format source line", () => {
        expect(
            preprocessFixedCopybook([
                "       ",
            ]),
        ).toEqual([
            "",
        ]);
    });


    test("handles a short source line", () => {
        expect(
            preprocessFixedCopybook([
                "000100 ",
            ]),
        ).toEqual([
            "",
        ]);
    });


    test("handles an empty source", () => {
        expect(
            preprocessFixedCopybook([]),
        ).toEqual([]);
    });


    test("handles a continuation on the first source line", () => {
        expect(
            preprocessFixedCopybook([
                "000100-NAME PIC X.",
            ]),
        ).toEqual([
            "NAME PIC X.",
        ]);
    });


    test("keeps placeholders for consumed continuation lines", () => {
        expect(
            preprocessFixedCopybook([
                "000100     05 VERY-",
                "000200-LONG-",
                "000300-NAME PIC X.",
                "000400     05 NEXT PIC X.",
            ]),
        ).toEqual([
            "    05 VERY-LONG-NAME PIC X.",
            "",
            "",
            "    05 NEXT PIC X.",
        ]);
    });


    test("keeps placeholders for comments and continuations together", () => {
        expect(
            preprocessFixedCopybook([
                "000100 01 ROOT.",
                "000200* COMMENT",
                "000300     05 VERY-LONG-",
                "000400-NAME PIC X.",
                "000500/ PAGE BREAK",
                "000600     05 NEXT PIC X.",
            ]),
        ).toEqual([
            "01 ROOT.",
            "",
            "    05 VERY-LONG-NAME PIC X.",
            "",
            "",
            "    05 NEXT PIC X.",
        ]);
    });


    test("preserves the number of physical source lines", () => {
        const source = [
            "000100 01 ROOT.",
            "000200* COMMENT",
            "000300     05 VERY-LONG-",
            "000400-NAME PIC X.",
            "000500     05 NEXT PIC X.",
        ];

        const actual =
            preprocessFixedCopybook(
                source,
            );

        expect(actual.length).toEqual(
            source.length,
        );
    });

});