import {
    readFile,
    stat,
} from "node:fs/promises";
import {
    join,
} from "node:path";
import {
    defaultFileCodecRegistry,
} from "@cobol-ts/cobolcodec";
import {
    AuthoringFileMetadata,
    compileFileMetadata,
    FileMetadata,
} from "@cobol-ts/copybookfiles";
import {
    valueOrThrow,
} from "@cobol-ts/errors";
import {parseCopybook} from "@cobol-ts/copybook";
import {compileCopybook, CopybookCompilerConfig} from "@cobol-ts/compile_copybook";
import {readFileRecords} from "@cobol-ts/file_readers_writers";


const projectRoot =
    join(
        __dirname,
        "..",
    );

const copybookFilename =
    join(
        projectRoot,
        "company.copybook.txt",
    );

const dataFilename =
    join(
        projectRoot,
        "company.bin",
    );


const compilerConfig: CopybookCompilerConfig = {
    supportedEncodings: [
        "ascii",
        "binary-integer",
        "packed-decimal",
        "ieee754",
    ],

    characterEncoding: "ascii",

    binary: {
        byteOrder: "big-endian",
        semantics: "picture",
    },

    floatingPoint: {
        comp1: "ieee754",
        comp2: "ieee754",
    },

    defaultDisplaySign: "unsigned",
};


const expectedAuthoringMetadata: AuthoringFileMetadata = {
    entries: [
        {
            kind: "field",
            name: "ID",
            size: 2,

            type: {
                kind: "integer",
                encoding: "binary-integer",
                byteOrder: "big-endian",
                semantics: "picture",
                signed: true,
            },
        },

        {
            kind: "field",
            name: "SHORT-NAME",
            size: 10,

            type: {
                kind: "text",
                encoding: "ascii",
            },
        },

        {
            kind: "field",
            name: "COMPANY-ID-NUM",
            size: 3,

            type: {
                kind: "decimal",
                encoding: "packed-decimal",
                digits: 5,
                scale: 0,
                signed: false,
            },
        },

        {
            kind: "field",
            name: "CLIENTID",
            size: 15,

            type: {
                kind: "text",
                encoding: "ascii",
            },
        },

        {
            kind: "field",
            name: "REGISTRATION-NUM",
            size: 10,

            type: {
                kind: "text",
                encoding: "ascii",
            },
        },

        {
            kind: "field",
            name: "NUMBER-OF-ACCTS",
            size: 2,

            type: {
                kind: "decimal",
                encoding: "packed-decimal",
                digits: 3,
                scale: 0,
                signed: false,
            },
        },
    ],
};


const expectedFileMetadata: FileMetadata = {
    size: 42,

    fields: [
        {
            name: "ID",
            from: 0,
            to: 2,

            type: {
                kind: "integer",
                encoding: "binary-integer",
                byteOrder: "big-endian",
                semantics: "picture",
                signed: true,
            },
        },

        {
            name: "SHORT-NAME",
            from: 2,
            to: 12,

            type: {
                kind: "text",
                encoding: "ascii",
            },
        },

        {
            name: "COMPANY-ID-NUM",
            from: 12,
            to: 15,

            type: {
                kind: "decimal",
                encoding: "packed-decimal",
                digits: 5,
                scale: 0,
                signed: false,
            },
        },

        {
            name: "CLIENTID",
            from: 15,
            to: 30,

            type: {
                kind: "text",
                encoding: "ascii",
            },
        },

        {
            name: "REGISTRATION-NUM",
            from: 30,
            to: 40,

            type: {
                kind: "text",
                encoding: "ascii",
            },
        },

        {
            name: "NUMBER-OF-ACCTS",
            from: 40,
            to: 42,

            type: {
                kind: "decimal",
                encoding: "packed-decimal",
                digits: 3,
                scale: 0,
                signed: false,
            },
        },
    ],
};


describe(
    "company COBOL fixture",
    () => {
        it(
            "compiles the real copybook to the expected authoring metadata",
            async () => {
                const source =
                    await readFile(
                        copybookFilename,
                        "utf8",
                    );

                const ast =
                    valueOrThrow(
                        parseCopybook(
                            source,
                        ),
                    );

                const meta = valueOrThrow(compileCopybook(ast, compilerConfig));
                expect (meta)
                    .toEqual(
                        expectedAuthoringMetadata,
                    );

            },
        );


        it(
            "compiles the authoring metadata to the expected physical layout",
            () => {
                const compiled =
                    valueOrThrow(
                        compileFileMetadata(
                            expectedAuthoringMetadata,
                        ),
                    );

                expect(compiled)
                    .toEqual(
                        expectedFileMetadata,
                    );
            },
        );


        it(
            "has a data file containing complete 42 byte records",
            async () => {
                const file =
                    await stat(
                        dataFilename,
                    );
console.log(`File size: ${file.size} bytes`);
                expect(
                    file.size %
                    expectedFileMetadata.size,
                )
                    .toBe(
                        0,
                    );

                expect(file.size)
                    .toBeGreaterThan(
                        0,
                    );
            },
        );


        it(
            "reads every record in the real data file",
            async () => {
                const actual = [];

                for await (
                    const result of readFileRecords(
                    dataFilename,
                    expectedFileMetadata,
                    defaultFileCodecRegistry,
                )
                    )
                    actual.push(
                        valueOrThrow(
                            result,
                        ),
                    );

                const file =
                    await stat(
                        dataFilename,
                    );

                expect(actual.length)
                    .toBe(
                        file.size /
                        expectedFileMetadata.size,
                    );
            },
        );


        it.skip(
            "reads the expected company records",
            async () => {
                const actual = [];

                for await (
                    const result of readFileRecords(
                    dataFilename,
                    expectedFileMetadata,
                    defaultFileCodecRegistry,
                )
                    )
                    actual.push(
                        valueOrThrow(
                            result,
                        ),
                    );

                const expected = [
                    /*
                     * Fill these in once we know what company.bin contains.
                     */
                ];

                expect(actual)
                    .toEqual(
                        expected,
                    );
            },
        );
    },
);