import {
    BinaryIntegerFieldType,
    FileFieldMetadata,
    Ieee754FieldType,
    TextFieldType,
} from "@cobol-ts/copybookfiles";
import {
    asciiCodec,
    binaryIntegerCodec,
    ieee754Codec,
} from "./primitive.codec";
import {
    codecFor,
    defaultFileCodecRegistry,
    validateFieldsAgainstRegistry,
} from "./cobol.codec.registry";


describe("codecFor", () => {

    test("gets ASCII codec", () => {
        const field: FileFieldMetadata<string> = {
            name: "NAME",
            from: 0,
            to: 10,
            type: {
                kind: "text",
                encoding: "ascii",
            },
        };

        expect(
            codecFor(
                field,
                defaultFileCodecRegistry,
            ),
        ).toBe(asciiCodec);
    });


    test("gets binary integer codec", () => {
        const type: BinaryIntegerFieldType = {
            kind: "integer",
            encoding: "binary-integer",
            byteOrder: "big-endian",
            semantics: "native",
            signed: true,
        };

        const field: FileFieldMetadata<bigint> = {
            name: "COUNT",
            from: 0,
            to: 4,
            type,
        };

        expect(
            codecFor(
                field,
                defaultFileCodecRegistry,
            ),
        ).toBe(binaryIntegerCodec);
    });


    test("gets IEEE codec", () => {
        const type: Ieee754FieldType = {
            kind: "floating-point",
            encoding: "ieee754",
            precision: "single",
            byteOrder: "big-endian",
        };

        const field: FileFieldMetadata<number> = {
            name: "RATE",
            from: 0,
            to: 4,
            type,
        };

        expect(
            codecFor(
                field,
                defaultFileCodecRegistry,
            ),
        ).toBe(ieee754Codec);
    });


    test("throws if validated invariant is broken", () => {
        const field: FileFieldMetadata<string> = {
            name: "NAME",
            from: 0,
            to: 10,
            type: {
                kind: "text",
                encoding: "ebcdic:500",
            },
        };

        expect(
            () =>
                codecFor(
                    field,
                    defaultFileCodecRegistry,
                ),
        ).toThrow(
            "Cannot happen: no codec registered for encoding 'ebcdic:500'",
        );
    });


    test("supports a strongly typed custom registry", () => {
        const registry = {
            ascii: asciiCodec,
        };

        const type: TextFieldType = {
            kind: "text",
            encoding: "ascii",
        };

        const field: FileFieldMetadata<string> = {
            name: "NAME",
            from: 0,
            to: 5,
            type,
        };

        expect(
            codecFor(
                field,
                registry,
            ),
        ).toBe(asciiCodec);
    });

});


describe("validateFieldsAgainstRegistry", () => {

    test("accepts fields supported by the registry", () => {
        const fields: FileFieldMetadata[] = [
            {
                name: "NAME",
                from: 0,
                to: 10,
                type: {
                    kind: "text",
                    encoding: "ascii",
                },
            },

            {
                name: "COUNT",
                from: 10,
                to: 14,
                type: {
                    kind: "integer",
                    encoding: "binary-integer",
                    byteOrder: "big-endian",
                    semantics: "native",
                    signed: true,
                },
            },

            {
                name: "RATE",
                from: 14,
                to: 18,
                type: {
                    kind: "floating-point",
                    encoding: "ieee754",
                    precision: "single",
                    byteOrder: "big-endian",
                },
            },
        ];

        expect(
            validateFieldsAgainstRegistry(
                fields,
                defaultFileCodecRegistry,
            ),
        ).toEqual([]);
    });


    test("reports unsupported encoding", () => {
        const fields: FileFieldMetadata[] = [
            {
                name: "NAME",
                from: 0,
                to: 10,
                type: {
                    kind: "text",
                    encoding: "ebcdic:500",
                },
            },
        ];

        expect(
            validateFieldsAgainstRegistry(
                fields,
                defaultFileCodecRegistry,
            ),
        ).toEqual([
            "NAME: no codec registered for encoding 'ebcdic:500'",
        ]);
    });


    test("reports multiple unsupported encodings", () => {
        const fields: FileFieldMetadata[] = [
            {
                name: "FIRST",
                from: 0,
                to: 10,
                type: {
                    kind: "text",
                    encoding: "ebcdic:500",
                },
            },

            {
                name: "SECOND",
                from: 10,
                to: 20,
                type: {
                    kind: "text",
                    encoding: "ebcdic:1047",
                },
            },
        ];

        expect(
            validateFieldsAgainstRegistry(
                fields,
                defaultFileCodecRegistry,
            ),
        ).toEqual([
            "FIRST: no codec registered for encoding 'ebcdic:500'",
            "SECOND: no codec registered for encoding 'ebcdic:1047'",
        ]);
    });


    test("validates against a custom registry", () => {
        const registry = {
            ascii: asciiCodec,
        };

        const fields: FileFieldMetadata[] = [
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
                name: "RATE",
                from: 5,
                to: 9,
                type: {
                    kind: "floating-point",
                    encoding: "ieee754",
                    precision: "single",
                    byteOrder: "big-endian",
                },
            },
        ];

        expect(
            validateFieldsAgainstRegistry(
                fields,
                registry,
            ),
        ).toEqual([
            "RATE: no codec registered for encoding 'ieee754'",
        ]);
    });


    test("accepts an empty field list", () => {
        expect(
            validateFieldsAgainstRegistry(
                [],
                defaultFileCodecRegistry,
            ),
        ).toEqual([]);
    });

});