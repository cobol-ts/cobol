import {
    errorsOrThrow,
    valueOrThrow,
} from "@cobol-ts/errors";
import {
    FileFieldMetadata,
} from "@cobol-ts/copybookfiles";
import {
    codecFor,
    defaultFileCodecRegistry,
} from "@cobol-ts/cobolcodec";
import {
    writeRecord,
} from "./cobol.file.writer";


describe(
    "writeRecord",
    () => {
        it(
            "writes a mixed record",
            () => {
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
                        to: 9,
                        type: {
                            kind: "integer",
                            encoding: "binary-integer",
                            byteOrder: "big-endian",
                            semantics: "native",
                            signed: true,
                        },
                    },

                    {
                        name: "BALANCE",
                        from: 9,
                        to: 13,
                        type: {
                            kind: "decimal",
                            encoding: "packed-decimal",
                            digits: 7,
                            scale: 2,
                            signed: true,
                        },
                    },

                    {
                        name: "RATE",
                        from: 13,
                        to: 17,
                        type: {
                            kind: "floating-point",
                            encoding: "ieee754",
                            precision: "single",
                            byteOrder: "big-endian",
                        },
                    },
                ] as const satisfies readonly FileFieldMetadata[];

                const target =
                    new Uint8Array(17);

                valueOrThrow(
                    writeRecord(
                        fields,
                        defaultFileCodecRegistry,
                        target,
                        [
                            "PHIL",
                            123456n,
                            {
                                unscaled: 1234567n,
                                scale: 2,
                            },
                            1.5,
                        ],
                    ),
                );

                expect(
                    Array.from(target),
                ).toEqual([
                    0x50,
                    0x48,
                    0x49,
                    0x4c,
                    0x20,

                    0x00,
                    0x01,
                    0xe2,
                    0x40,

                    0x12,
                    0x34,
                    0x56,
                    0x7c,

                    0x3f,
                    0xc0,
                    0x00,
                    0x00,
                ]);
            },
        );


        it(
            "writes nothing for an empty field list",
            () => {
                const fields =
                    [] as const satisfies readonly FileFieldMetadata[];

                const target =
                    Uint8Array.from([
                        1,
                        2,
                        3,
                    ]);

                valueOrThrow(
                    writeRecord(
                        fields,
                        defaultFileCodecRegistry,
                        target,
                        [],
                    ),
                );

                expect(
                    Array.from(target),
                ).toEqual([
                    1,
                    2,
                    3,
                ]);
            },
        );


        it(
            "reports a missing field value",
            () => {
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
                ] as const satisfies readonly FileFieldMetadata[];

                const target =
                    new Uint8Array(5);

                /*
                 * Deliberately break the compile-time contract to
                 * exercise the runtime guard.
                 */
                const record =
                    [] as unknown as [string];

                expect(
                    errorsOrThrow(
                        writeRecord(
                            fields,
                            defaultFileCodecRegistry,
                            target,
                            record,
                        ),
                    ),
                ).toEqual([
                    "NAME: value is missing",
                ]);
            },
        );


        it(
            "reports a value that is too large for its field",
            () => {
                const fields = [
                    {
                        name: "NAME",
                        from: 0,
                        to: 4,
                        type: {
                            kind: "text",
                            encoding: "ascii",
                        },
                    },
                ] as const satisfies readonly FileFieldMetadata[];

                const target =
                    new Uint8Array(4);

                expect(
                    errorsOrThrow(
                        writeRecord(
                            fields,
                            defaultFileCodecRegistry,
                            target,
                            [
                                "PHILIP",
                            ],
                        ),
                    ),
                ).toEqual([
                    "NAME: value requires 6 bytes but field has 4",
                ]);
            },
        );


        it(
            "accumulates validation errors from multiple fields",
            () => {
                const fields = [
                    {
                        name: "NAME",
                        from: 0,
                        to: 3,
                        type: {
                            kind: "text",
                            encoding: "ascii",
                        },
                    },

                    {
                        name: "COUNT",
                        from: 3,
                        to: 4,
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
                        from: 4,
                        to: 6,
                        type: {
                            kind: "decimal",
                            encoding: "packed-decimal",
                            digits: 3,
                            scale: 2,
                            signed: false,
                        },
                    },
                ] as const satisfies readonly FileFieldMetadata[];

                const target =
                    new Uint8Array(6);

                const result =
                    errorsOrThrow(
                        writeRecord(
                            fields,
                            defaultFileCodecRegistry,
                            target,
                            [
                                "TOO LONG",
                                256n,
                                {
                                    unscaled: -123n,
                                    scale: 2,
                                },
                            ],
                        ),
                    );

                expect(result).toHaveLength(3);

                expect(result[0])
                    .toContain("NAME");

                expect(result[1])
                    .toContain("COUNT");

                expect(result[2])
                    .toContain("BALANCE");
            },
        );


        it(
            "does not write a field whose value validation fails",
            () => {
                const fields = [
                    {
                        name: "NAME",
                        from: 1,
                        to: 4,
                        type: {
                            kind: "text",
                            encoding: "ascii",
                        },
                    },
                ] as const satisfies readonly FileFieldMetadata[];

                const target =
                    Uint8Array.from([
                        0xaa,
                        0xbb,
                        0xcc,
                        0xdd,
                        0xee,
                    ]);

                errorsOrThrow(
                    writeRecord(
                        fields,
                        defaultFileCodecRegistry,
                        target,
                        [
                            "TOO LONG",
                        ],
                    ),
                );

                expect(
                    Array.from(target),
                ).toEqual([
                    0xaa,
                    0xbb,
                    0xcc,
                    0xdd,
                    0xee,
                ]);
            },
        );


        it(
            "writes valid fields even when another field is invalid",
            () => {
                const fields = [
                    {
                        name: "NAME",
                        from: 0,
                        to: 4,
                        type: {
                            kind: "text",
                            encoding: "ascii",
                        },
                    },

                    {
                        name: "COUNT",
                        from: 4,
                        to: 5,
                        type: {
                            kind: "integer",
                            encoding: "binary-integer",
                            byteOrder: "big-endian",
                            semantics: "native",
                            signed: false,
                        },
                    },
                ] as const satisfies readonly FileFieldMetadata[];

                const target =
                    new Uint8Array(5);

                errorsOrThrow(
                    writeRecord(
                        fields,
                        defaultFileCodecRegistry,
                        target,
                        [
                            "PHIL",
                            256n,
                        ],
                    ),
                );

                expect(
                    Array.from(
                        target.slice(
                            0,
                            4,
                        ),
                    ),
                ).toEqual([
                    0x50,
                    0x48,
                    0x49,
                    0x4c,
                ]);

                expect(
                    target[4],
                ).toBe(0);
            },
        );


        it(
            "leaves bytes outside the defined fields unchanged",
            () => {
                const fields = [
                    {
                        name: "NAME",
                        from: 2,
                        to: 6,
                        type: {
                            kind: "text",
                            encoding: "ascii",
                        },
                    },
                ] as const satisfies readonly FileFieldMetadata[];

                const target =
                    Uint8Array.from([
                        0xaa,
                        0xbb,
                        0x00,
                        0x00,
                        0x00,
                        0x00,
                        0xcc,
                        0xdd,
                    ]);

                valueOrThrow(
                    writeRecord(
                        fields,
                        defaultFileCodecRegistry,
                        target,
                        [
                            "PHIL",
                        ],
                    ),
                );

                expect(
                    Array.from(target),
                ).toEqual([
                    0xaa,
                    0xbb,

                    0x50,
                    0x48,
                    0x49,
                    0x4c,

                    0xcc,
                    0xdd,
                ]);
            },
        );


        it(
            "does not modify the source record",
            () => {
                const fields = [
                    {
                        name: "NAME",
                        from: 0,
                        to: 4,
                        type: {
                            kind: "text",
                            encoding: "ascii",
                        },
                    },
                ] as const satisfies readonly FileFieldMetadata[];

                const record: [string] = [
                    "PHIL",
                ];

                const target =
                    new Uint8Array(4);

                valueOrThrow(
                    writeRecord(
                        fields,
                        defaultFileCodecRegistry,
                        target,
                        record,
                    ),
                );

                expect(record).toEqual([
                    "PHIL",
                ]);
            },
        );


        test("throws if validated invariant is broken", () => {
            const field: FileFieldMetadata<string> = {
                name: "NAME",
                from: 0,
                to: 4,
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
    }
);