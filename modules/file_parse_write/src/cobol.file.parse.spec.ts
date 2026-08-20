import {
    errorsOrThrow,
    valueOrThrow,
} from "@cobol-ts/errors";
import {
    FileFieldMetadata,
} from "@cobol-ts/copybookfiles";
import {
    defaultFileCodecRegistry,
} from "@cobol-ts/cobolcodec";
import {
    parseRecord,
} from "./cobol.file.parser";


describe("parseRecord", () => {

    test("parses values in field order", () => {
        const fields = [
            {
                name: "NAME",
                from: 0,
                to: 5,
                type: {
                    kind: "text",
                    encoding: "ascii",
                },
            },

            {
                name: "COUNT",
                from: 5,
                to: 7,
                type: {
                    kind: "integer",
                    encoding: "binary-integer",
                    byteOrder: "big-endian",
                    semantics: "native",
                    signed: false,
                },
            },

            {
                name: "BALANCE",
                from: 7,
                to: 10,
                type: {
                    kind: "decimal",
                    encoding: "packed-decimal",
                    digits: 5,
                    scale: 2,
                    signed: true,
                },
            },

            {
                name: "RATE",
                from: 10,
                to: 14,
                type: {
                    kind: "floating-point",
                    encoding: "ieee754",
                    precision: "single",
                    byteOrder: "big-endian",
                },
            },
        ] as const satisfies readonly FileFieldMetadata[];

        const source = new Uint8Array([
            0x50, 0x48, 0x49, 0x4c, 0x20,
            0x01, 0x02,
            0x12, 0x34, 0x5c,
            0x3f, 0xc0, 0x00, 0x00,
        ]);

        expect(
            valueOrThrow(
                parseRecord(
                    fields,
                    defaultFileCodecRegistry,
                    source,
                ),
            ),
        ).toEqual([
            "PHIL ",
            0x0102n,
            {
                unscaled: 12345n,
                scale: 2,
            },
            1.5,
        ]);
    });


    test("field order determines result order", () => {
        const fields = [
            {
                name: "SECOND",
                from: 1,
                to: 2,
                type: {
                    kind: "text",
                    encoding: "ascii",
                },
            },

            {
                name: "FIRST",
                from: 0,
                to: 1,
                type: {
                    kind: "text",
                    encoding: "ascii",
                },
            },
        ] as const satisfies readonly FileFieldMetadata[];

        expect(
            valueOrThrow(
                parseRecord(
                    fields,
                    defaultFileCodecRegistry,
                    new Uint8Array([
                        0x41,
                        0x42,
                    ]),
                ),
            ),
        ).toEqual([
            "B",
            "A",
        ]);
    });


    test("parses an empty field list", () => {
        const fields = [] as const satisfies readonly FileFieldMetadata[];

        expect(
            valueOrThrow(
                parseRecord(
                    fields,
                    defaultFileCodecRegistry,
                    new Uint8Array(0),
                ),
            ),
        ).toEqual([]);
    });


    test("reports invalid field bytes", () => {
        const fields = [
            {
                name: "BALANCE",
                from: 0,
                to: 3,
                type: {
                    kind: "decimal",
                    encoding: "packed-decimal",
                    digits: 5,
                    scale: 2,
                    signed: true,
                },
            },
        ] as const satisfies readonly FileFieldMetadata[];

        expect(
            errorsOrThrow(
                parseRecord(
                    fields,
                    defaultFileCodecRegistry,
                    new Uint8Array([
                        0x1a,
                        0x34,
                        0x5c,
                    ]),
                ),
            ),
        ).toEqual([
            "BALANCE: invalid packed decimal digit at byte 0",
        ]);
    });


    test("accumulates errors", () => {
        const fields = [
            {
                name: "FIRST",
                from: 0,
                to: 5,
                type: {
                    kind: "text",
                    encoding: "ascii",
                },
            },

            {
                name: "SECOND",
                from: 5,
                to: 9,
                type: {
                    kind: "integer",
                    encoding: "binary-integer",
                    byteOrder: "big-endian",
                    semantics: "native",
                    signed: false,
                },
            },
        ] as const satisfies readonly FileFieldMetadata[];

        expect(
            errorsOrThrow(
                parseRecord(
                    fields,
                    defaultFileCodecRegistry,
                    new Uint8Array(2),
                ),
            ),
        ).toEqual([
            "FIRST: invalid byte range [0, 5) for array of length 2",
            "SECOND: invalid byte range [5, 9) for array of length 2",
        ]);
    });

});