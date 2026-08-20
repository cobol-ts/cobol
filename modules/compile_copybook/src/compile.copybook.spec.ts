import {
    errorsOrThrow,
    valueOrThrow,
} from "@cobol-ts/errors";

import {
    CopybookAst,
    ElementaryEntry,
    GroupEntry,
} from "@cobol-ts/copybook";

import {
    CopybookCompilerConfig,
    compileCopybook,
} from "./compile.copybook";


const config: CopybookCompilerConfig = {
    supportedEncodings: [
        "ascii",
        "ebcdic:037",
        "display-integer",
        "display-decimal",
        "binary-integer",
        "binary-decimal",
        "packed-decimal",
        "ieee754",
        "ibm-hex",
    ],

    characterEncoding:
        "ebcdic:037",

    binary: {
        byteOrder:
            "big-endian",

        semantics:
            "picture",
    },

    floatingPoint: {
        comp1:
            "ibm-hex",

        comp2:
            "ibm-hex",
    },

    defaultDisplaySign:
        "trailing-overpunch",
};


describe(
    "compileCopybook",
    () => {
        it(
            "uses DISPLAY and the configured character encoding by default for PIC X",
            () => {
                const ast =
                    copybook(
                        elementary(
                            "NAME",
                            "X(10)",
                        ),
                    );

                const result =
                    valueOrThrow(
                        compileCopybook(
                            ast,
                            config,
                        ),
                    );

                expect(result).toEqual({
                    entries: [
                        {
                            kind: "field",
                            name: "NAME",
                            size: 10,
                            type: {
                                kind: "text",
                                encoding:
                                    "ebcdic:037",
                            },
                        },
                    ],
                });
            },
        );


        it(
            "uses DISPLAY by default for an unsigned integer PIC",
            () => {
                const ast =
                    copybook(
                        elementary(
                            "COUNT",
                            "9(5)",
                        ),
                    );

                const result =
                    valueOrThrow(
                        compileCopybook(
                            ast,
                            config,
                        ),
                    );

                expect(result.entries).toEqual([
                    {
                        kind: "field",
                        name: "COUNT",
                        size: 5,
                        type: {
                            kind: "integer",
                            encoding:
                                "display-integer",
                            characterEncoding:
                                "ebcdic:037",
                            sign:
                                "unsigned",
                        },
                    },
                ]);
            },
        );


        it(
            "uses the configured default display sign for signed DISPLAY integers",
            () => {
                const ast =
                    copybook(
                        elementary(
                            "BALANCE",
                            "S9(5)",
                        ),
                    );

                const result =
                    valueOrThrow(
                        compileCopybook(
                            ast,
                            config,
                        ),
                    );

                expect(result.entries).toEqual([
                    {
                        kind: "field",
                        name: "BALANCE",
                        size: 5,
                        type: {
                            kind: "integer",
                            encoding:
                                "display-integer",
                            characterEncoding:
                                "ebcdic:037",
                            sign:
                                "trailing-overpunch",
                        },
                    },
                ]);
            },
        );


        it(
            "uses an explicit SIGN clause instead of the default display sign",
            () => {
                const ast =
                    copybook(
                        {
                            ...elementary(
                                "BALANCE",
                                "S9(5)",
                            ),

                            clauses: [
                                {
                                    kind: "sign",
                                    position:
                                        "leading",
                                    separate:
                                        true,
                                },
                            ],
                        },
                    );

                const result =
                    valueOrThrow(
                        compileCopybook(
                            ast,
                            config,
                        ),
                    );

                expect(result.entries).toEqual([
                    {
                        kind: "field",
                        name: "BALANCE",
                        size: 6,
                        type: {
                            kind: "integer",
                            encoding:
                                "display-integer",
                            characterEncoding:
                                "ebcdic:037",
                            sign:
                                "leading-separate",
                        },
                    },
                ]);
            },
        );


        it(
            "compiles a DISPLAY decimal",
            () => {
                const ast =
                    copybook(
                        elementary(
                            "AMOUNT",
                            "S9(7)V99",
                        ),
                    );

                const result =
                    valueOrThrow(
                        compileCopybook(
                            ast,
                            config,
                        ),
                    );

                expect(result.entries).toEqual([
                    {
                        kind: "field",
                        name: "AMOUNT",
                        size: 9,
                        type: {
                            kind: "decimal",
                            encoding:
                                "display-decimal",
                            characterEncoding:
                                "ebcdic:037",
                            sign:
                                "trailing-overpunch",
                            digits: 9,
                            scale: 2,
                            signed: true,
                        },
                    },
                ]);
            },
        );


        it(
            "compiles COMP as a binary integer using configured binary defaults",
            () => {
                const ast =
                    copybook(
                        elementary(
                            "COUNT",
                            "S9(9)",
                            "COMP",
                        ),
                    );

                const result =
                    valueOrThrow(
                        compileCopybook(
                            ast,
                            config,
                        ),
                    );

                expect(result.entries).toEqual([
                    {
                        kind: "field",
                        name: "COUNT",
                        size: 4,
                        type: {
                            kind: "integer",
                            encoding:
                                "binary-integer",
                            byteOrder:
                                "big-endian",
                            semantics:
                                "picture",
                            signed: true,
                        },
                    },
                ]);
            },
        );


        it(
            "compiles COMP-5 using native binary semantics",
            () => {
                const ast =
                    copybook(
                        elementary(
                            "COUNT",
                            "9(4)",
                            "COMP-5",
                        ),
                    );

                const result =
                    valueOrThrow(
                        compileCopybook(
                            ast,
                            config,
                        ),
                    );

                expect(result.entries).toEqual([
                    {
                        kind: "field",
                        name: "COUNT",
                        size: 2,
                        type: {
                            kind: "integer",
                            encoding:
                                "binary-integer",
                            byteOrder:
                                "big-endian",
                            semantics:
                                "native",
                            signed: false,
                        },
                    },
                ]);
            },
        );


        it(
            "compiles a binary decimal",
            () => {
                const ast =
                    copybook(
                        elementary(
                            "AMOUNT",
                            "S9(7)V99",
                            "COMP",
                        ),
                    );

                const result =
                    valueOrThrow(
                        compileCopybook(
                            ast,
                            config,
                        ),
                    );

                expect(result.entries).toEqual([
                    {
                        kind: "field",
                        name: "AMOUNT",
                        size: 4,
                        type: {
                            kind: "decimal",
                            encoding:
                                "binary-decimal",
                            byteOrder:
                                "big-endian",
                            semantics:
                                "picture",
                            digits: 9,
                            scale: 2,
                            signed: true,
                        },
                    },
                ]);
            },
        );


        it(
            "compiles COMP-3 as packed decimal",
            () => {
                const ast =
                    copybook(
                        elementary(
                            "AMOUNT",
                            "S9(7)V99",
                            "COMP-3",
                        ),
                    );

                const result =
                    valueOrThrow(
                        compileCopybook(
                            ast,
                            config,
                        ),
                    );

                expect(result.entries).toEqual([
                    {
                        kind: "field",
                        name: "AMOUNT",
                        size: 5,
                        type: {
                            kind: "decimal",
                            encoding:
                                "packed-decimal",
                            digits: 9,
                            scale: 2,
                            signed: true,
                        },
                    },
                ]);
            },
        );


        it(
            "uses the configured COMP-1 floating point encoding",
            () => {
                const ast =
                    copybook(
                        pictureless(
                            "VALUE",
                            "COMP-1",
                        ),
                    );

                const result =
                    valueOrThrow(
                        compileCopybook(
                            ast,
                            config,
                        ),
                    );

                expect(result.entries).toEqual([
                    {
                        kind: "field",
                        name: "VALUE",
                        size: 4,
                        type: {
                            kind: "floating-point",
                            encoding:
                                "ibm-hex",
                            precision:
                                "single",
                            byteOrder:
                                "big-endian",
                        },
                    },
                ]);
            },
        );


        it(
            "uses the configured COMP-2 floating point encoding",
            () => {
                const ast =
                    copybook(
                        pictureless(
                            "VALUE",
                            "COMP-2",
                        ),
                    );

                const result =
                    valueOrThrow(
                        compileCopybook(
                            ast,
                            config,
                        ),
                    );

                expect(result.entries).toEqual([
                    {
                        kind: "field",
                        name: "VALUE",
                        size: 8,
                        type: {
                            kind: "floating-point",
                            encoding:
                                "ibm-hex",
                            precision:
                                "double",
                            byteOrder:
                                "big-endian",
                        },
                    },
                ]);
            },
        );


        it(
            "allows COMP-1 and COMP-2 to use different configured encodings",
            () => {
                const mixedConfig: CopybookCompilerConfig = {
                    ...config,

                    floatingPoint: {
                        comp1:
                            "ieee754",

                        comp2:
                            "ibm-hex",
                    },
                };

                const ast =
                    copybook(
                        pictureless(
                            "SINGLE",
                            "COMP-1",
                        ),
                        pictureless(
                            "DOUBLE",
                            "COMP-2",
                        ),
                    );

                const result =
                    valueOrThrow(
                        compileCopybook(
                            ast,
                            mixedConfig,
                        ),
                    );

                expect(result.entries).toEqual([
                    {
                        kind: "field",
                        name: "SINGLE",
                        size: 4,
                        type: {
                            kind: "floating-point",
                            encoding:
                                "ieee754",
                            precision:
                                "single",
                            byteOrder:
                                "big-endian",
                        },
                    },
                    {
                        kind: "field",
                        name: "DOUBLE",
                        size: 8,
                        type: {
                            kind: "floating-point",
                            encoding:
                                "ibm-hex",
                            precision:
                                "double",
                            byteOrder:
                                "big-endian",
                        },
                    },
                ]);
            },
        );


        it(
            "emits FILLER as physical filler rather than a field",
            () => {
                const ast =
                    copybook(
                        {
                            ...elementary(
                                "IGNORED",
                                "X(7)",
                            ),

                            name: {
                                kind: "filler",
                            },
                        },
                    );

                const result =
                    valueOrThrow(
                        compileCopybook(
                            ast,
                            config,
                        ),
                    );

                expect(result.entries).toEqual([
                    {
                        kind: "filler",
                        size: 7,
                    },
                ]);
            },
        );


        it(
            "expands a fixed elementary OCCURS",
            () => {
                const ast =
                    copybook(
                        {
                            ...elementary(
                                "CODE",
                                "X(2)",
                            ),

                            clauses: [
                                {
                                    kind: "occurs",
                                    count: 3,
                                },
                            ],
                        },
                    );

                const result =
                    valueOrThrow(
                        compileCopybook(
                            ast,
                            config,
                        ),
                    );

                expect(result.entries).toEqual([
                    {
                        kind: "field",
                        name: "CODE[0]",
                        size: 2,
                        type: {
                            kind: "text",
                            encoding:
                                "ebcdic:037",
                        },
                    },
                    {
                        kind: "field",
                        name: "CODE[1]",
                        size: 2,
                        type: {
                            kind: "text",
                            encoding:
                                "ebcdic:037",
                        },
                    },
                    {
                        kind: "field",
                        name: "CODE[2]",
                        size: 2,
                        type: {
                            kind: "text",
                            encoding:
                                "ebcdic:037",
                        },
                    },
                ]);
            },
        );


        it(
            "compiles children of a group",
            () => {
                const ast =
                    copybook(
                        group(
                            "CUSTOMER",
                            elementary(
                                "NAME",
                                "X(10)",
                            ),
                            elementary(
                                "AGE",
                                "9(3)",
                            ),
                        ),
                    );

                const result =
                    valueOrThrow(
                        compileCopybook(
                            ast,
                            config,
                        ),
                    );

                expect(
                    result.entries.map(
                        entry =>
                            entry.kind === "field"
                                ? entry.name
                                : "filler",
                    ),
                ).toEqual([
                    "NAME",
                    "AGE",
                ]);
            },
        );


        it(
            "reports an unsupported encoding",
            () => {
                const restricted: CopybookCompilerConfig = {
                    ...config,

                    supportedEncodings: [
                        "ascii",
                    ],
                };

                const ast =
                    copybook(
                        elementary(
                            "NAME",
                            "X(10)",
                        ),
                    );

                expect(
                    errorsOrThrow(
                        compileCopybook(
                            ast,
                            restricted,
                        ),
                    ),
                ).toEqual([
                    "NAME: Encoding 'ebcdic:037' is not supported",
                ]);
            },
        );


        it(
            "reports unsupported PIC forms",
            () => {
                const ast =
                    copybook(
                        elementary(
                            "VALUE",
                            "A(10)",
                        ),
                    );

                const result =
                    errorsOrThrow(
                        compileCopybook(
                            ast,
                            config,
                        ),
                    );

                expect(result.length).toBe(1);

                expect(result[0]).toContain(
                    "VALUE:",
                );

                expect(result[0]).toContain(
                    "Unsupported PIC",
                );
            },
        );


        it(
            "reports binary PICs that are too large",
            () => {
                const ast =
                    copybook(
                        elementary(
                            "HUGE",
                            "9(19)",
                            "COMP",
                        ),
                    );

                expect(
                    errorsOrThrow(
                        compileCopybook(
                            ast,
                            config,
                        ),
                    ),
                ).toEqual([
                    "HUGE: Binary PIC with 19 digits is not supported",
                ]);
            },
        );


        it(
            "accumulates errors from multiple entries",
            () => {
                const restricted: CopybookCompilerConfig = {
                    ...config,

                    supportedEncodings: [
                        "ascii",
                    ],
                };

                const ast =
                    copybook(
                        elementary(
                            "NAME",
                            "X(10)",
                        ),
                        elementary(
                            "AMOUNT",
                            "9(5)",
                            "COMP-3",
                        ),
                    );

                const result =
                    errorsOrThrow(
                        compileCopybook(
                            ast,
                            restricted,
                        ),
                    );

                expect(result).toEqual([
                    "NAME: Encoding 'ebcdic:037' is not supported",
                    "AMOUNT: Encoding 'packed-decimal' is not supported",
                ]);
            },
        );
    },
);


/*
 * Test AST builders
 */

const copybook = (
    ...entries: Array<
        ElementaryEntry | GroupEntry
    >
): CopybookAst => ({
    metadata: undefined,
    entries,
});


const elementary = (
    name: string,
    picture: string,
    usage?: string,
): ElementaryEntry => ({
    kind: "elementary",

    level: 5,

    name: {
        kind: "named",
        name,
    },

    picture,

    clauses:
        usage
            ? [{
                kind: "usage",
                usage,
            }]
            : [],

    line: 1,
});


const pictureless = (
    name: string,
    usage: string,
): ElementaryEntry => ({
    kind: "elementary",

    level: 5,

    name: {
        kind: "named",
        name,
    },

    clauses: [{
        kind: "usage",
        usage,
    }],

    line: 1,
});


const group = (
    name: string,
    ...children: Array<
        ElementaryEntry | GroupEntry
    >
): GroupEntry => ({
    kind: "group",

    level: 1,

    name: {
        kind: "named",
        name,
    },

    clauses: [],

    children,

    line: 1,
});