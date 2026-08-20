import {
    BinaryIntegerFieldType,
    Decimal,
    Ieee754FieldType,
    PackedDecimalFieldType,
    TextFieldType,
} from "@cobol-ts/copybookfiles";
import {
    TypedFileFieldMetadata,
} from "./cobol.codec";
import {
    asciiCodec,
    binaryIntegerCodec,
    ieee754Codec,
    packedDecimalCodec,
} from "./primitive.codec";


const textField = (
    size: number,
): TypedFileFieldMetadata<string, TextFieldType> => ({
    name: "TEST-FIELD",
    from: 0,
    to: size,
    type: {
        kind: "text",
        encoding: "ascii",
    },
});


const binaryField = (
    size: number,
    type: BinaryIntegerFieldType,
): TypedFileFieldMetadata<bigint, BinaryIntegerFieldType> => ({
    name: "TEST-FIELD",
    from: 0,
    to: size,
    type,
});


const floatingPointField = (
    size: number,
    type: Ieee754FieldType,
): TypedFileFieldMetadata<number, Ieee754FieldType> => ({
    name: "TEST-FIELD",
    from: 0,
    to: size,
    type,
});


const decimalField = (
    size: number,
    type: PackedDecimalFieldType,
): TypedFileFieldMetadata<Decimal, PackedDecimalFieldType> => ({
    name: "TEST-FIELD",
    from: 0,
    to: size,
    type,
});


describe("asciiCodec", () => {

    test("reads ASCII", () => {
        const field = textField(3);

        expect(
            asciiCodec.read(
                field,
                new Uint8Array([
                    0x41,
                    0x42,
                    0x43,
                ]),
            ),
        ).toBe("ABC");
    });


    test("writes ASCII", () => {
        const field = textField(3);
        const bytes = new Uint8Array(3);

        asciiCodec.write(
            field,
            bytes,
            "ABC",
        );

        expect(Array.from(bytes)).toEqual([
            0x41,
            0x42,
            0x43,
        ]);
    });


    test("pads with spaces", () => {
        const field = textField(5);
        const bytes = new Uint8Array(5);

        asciiCodec.write(
            field,
            bytes,
            "ABC",
        );

        expect(Array.from(bytes)).toEqual([
            0x41,
            0x42,
            0x43,
            0x20,
            0x20,
        ]);
    });


    test("rejects value that does not fit", () => {
        expect(
            asciiCodec.validateValue(
                textField(3),
                "ABCD",
            ),
        ).toBe(
            "TEST-FIELD: value requires 4 bytes but field has 3",
        );
    });


    test("rejects non ASCII character", () => {
        expect(
            asciiCodec.validateValue(
                textField(10),
                "ABC£",
            ),
        ).toBe(
            'TEST-FIELD: character "£" cannot be encoded as ASCII',
        );
    });


    test("accepts valid value", () => {
        expect(
            asciiCodec.validateValue(
                textField(3),
                "ABC",
            ),
        ).toBeUndefined();
    });


    test("round trips", () => {
        const field = textField(5);
        const bytes = new Uint8Array(5);

        asciiCodec.write(
            field,
            bytes,
            "Hello",
        );

        expect(
            asciiCodec.read(
                field,
                bytes,
            ),
        ).toBe("Hello");
    });

});


describe("binaryIntegerCodec", () => {

    const unsignedBigEndian: BinaryIntegerFieldType = {
        kind: "integer",
        encoding: "binary-integer",
        byteOrder: "big-endian",
        semantics: "native",
        signed: false,
    };


    const signedBigEndian: BinaryIntegerFieldType = {
        kind: "integer",
        encoding: "binary-integer",
        byteOrder: "big-endian",
        semantics: "native",
        signed: true,
    };


    const unsignedLittleEndian: BinaryIntegerFieldType = {
        kind: "integer",
        encoding: "binary-integer",
        byteOrder: "little-endian",
        semantics: "native",
        signed: false,
    };


    test("reads unsigned big endian", () => {
        const field = binaryField(2, unsignedBigEndian);

        expect(
            binaryIntegerCodec.read(
                field,
                new Uint8Array([
                    0x01,
                    0x02,
                ]),
            ),
        ).toBe(0x0102n);
    });


    test("reads unsigned little endian", () => {
        const field = binaryField(2, unsignedLittleEndian);

        expect(
            binaryIntegerCodec.read(
                field,
                new Uint8Array([
                    0x02,
                    0x01,
                ]),
            ),
        ).toBe(0x0102n);
    });


    test("reads signed negative value", () => {
        const field = binaryField(1, signedBigEndian);

        expect(
            binaryIntegerCodec.read(
                field,
                new Uint8Array([
                    0xff,
                ]),
            ),
        ).toBe(-1n);

        expect(
            binaryIntegerCodec.read(
                field,
                new Uint8Array([
                    0x80,
                ]),
            ),
        ).toBe(-128n);
    });


    test("writes big endian", () => {
        const field = binaryField(2, unsignedBigEndian);
        const bytes = new Uint8Array(2);

        binaryIntegerCodec.write(
            field,
            bytes,
            0x0102n,
        );

        expect(Array.from(bytes)).toEqual([
            0x01,
            0x02,
        ]);
    });


    test("writes little endian", () => {
        const field = binaryField(2, unsignedLittleEndian);
        const bytes = new Uint8Array(2);

        binaryIntegerCodec.write(
            field,
            bytes,
            0x0102n,
        );

        expect(Array.from(bytes)).toEqual([
            0x02,
            0x01,
        ]);
    });


    test("writes signed negative value", () => {
        const field = binaryField(2, signedBigEndian);
        const bytes = new Uint8Array(2);

        binaryIntegerCodec.write(
            field,
            bytes,
            -2n,
        );

        expect(Array.from(bytes)).toEqual([
            0xff,
            0xfe,
        ]);
    });


    test("validates unsigned one byte range", () => {
        const field = binaryField(1, unsignedBigEndian);

        expect(
            binaryIntegerCodec.validateValue(
                field,
                0n,
            ),
        ).toBeUndefined();

        expect(
            binaryIntegerCodec.validateValue(
                field,
                255n,
            ),
        ).toBeUndefined();

        expect(
            binaryIntegerCodec.validateValue(
                field,
                256n,
            ),
        ).toBe(
            "TEST-FIELD: value 256 does not fit in unsigned 1-byte integer",
        );

        expect(
            binaryIntegerCodec.validateValue(
                field,
                -1n,
            ),
        ).toBe(
            "TEST-FIELD: unsigned integer cannot contain a negative value",
        );
    });


    test("validates signed one byte range", () => {
        const field = binaryField(1, signedBigEndian);

        expect(
            binaryIntegerCodec.validateValue(
                field,
                -128n,
            ),
        ).toBeUndefined();

        expect(
            binaryIntegerCodec.validateValue(
                field,
                127n,
            ),
        ).toBeUndefined();

        expect(
            binaryIntegerCodec.validateValue(
                field,
                -129n,
            ),
        ).toBe(
            "TEST-FIELD: value -129 does not fit in signed 1-byte integer",
        );

        expect(
            binaryIntegerCodec.validateValue(
                field,
                128n,
            ),
        ).toBe(
            "TEST-FIELD: value 128 does not fit in signed 1-byte integer",
        );
    });


    test.each([
        0n,
        1n,
        255n,
        256n,
        65535n,
    ])(
        "round trips unsigned value %s",
        value => {
            const field = binaryField(8, unsignedBigEndian);
            const bytes = new Uint8Array(8);

            binaryIntegerCodec.write(
                field,
                bytes,
                value,
            );

            expect(
                binaryIntegerCodec.read(
                    field,
                    bytes,
                ),
            ).toBe(value);
        },
    );


    test.each([
        -32768n,
        -1n,
        0n,
        1n,
        32767n,
    ])(
        "round trips signed value %s",
        value => {
            const field = binaryField(2, signedBigEndian);
            const bytes = new Uint8Array(2);

            expect(
                binaryIntegerCodec.validateValue(
                    field,
                    value,
                ),
            ).toBeUndefined();

            binaryIntegerCodec.write(
                field,
                bytes,
                value,
            );

            expect(
                binaryIntegerCodec.read(
                    field,
                    bytes,
                ),
            ).toBe(value);
        },
    );

});


describe("ieee754Codec", () => {

    const singleBigEndian: Ieee754FieldType = {
        kind: "floating-point",
        encoding: "ieee754",
        precision: "single",
        byteOrder: "big-endian",
    };


    const doubleLittleEndian: Ieee754FieldType = {
        kind: "floating-point",
        encoding: "ieee754",
        precision: "double",
        byteOrder: "little-endian",
    };


    test("writes known single precision bytes", () => {
        const field = floatingPointField(4, singleBigEndian);
        const bytes = new Uint8Array(4);

        ieee754Codec.write(
            field,
            bytes,
            1,
        );

        expect(Array.from(bytes)).toEqual([
            0x3f,
            0x80,
            0x00,
            0x00,
        ]);
    });


    test("reads known single precision bytes", () => {
        const field = floatingPointField(4, singleBigEndian);

        expect(
            ieee754Codec.read(
                field,
                new Uint8Array([
                    0x3f,
                    0x80,
                    0x00,
                    0x00,
                ]),
            ),
        ).toBe(1);
    });


    test("round trips double precision", () => {
        const field = floatingPointField(8, doubleLittleEndian);
        const bytes = new Uint8Array(8);

        ieee754Codec.write(
            field,
            bytes,
            123.456,
        );

        expect(
            ieee754Codec.read(
                field,
                bytes,
            ),
        ).toBe(123.456);
    });


    test("validates single precision size", () => {
        expect(
            ieee754Codec.validateValue(
                floatingPointField(4, singleBigEndian),
                1,
            ),
        ).toBeUndefined();

        expect(
            ieee754Codec.validateValue(
                floatingPointField(8, singleBigEndian),
                1,
            ),
        ).toBe(
            "TEST-FIELD: IEEE-754 single requires 4 bytes but field has 8",
        );
    });


    test("rejects value not exactly representable as single precision", () => {
        const field = floatingPointField(4, singleBigEndian);

        expect(
            ieee754Codec.validateValue(
                field,
                123.456,
            ),
        ).toBe(
            "TEST-FIELD: value 123.456 cannot be represented exactly as IEEE-754 single precision",
        );
    });


    test("validates byte size", () => {
        expect(
            ieee754Codec.validateBytes(
                floatingPointField(4, singleBigEndian),
                new Uint8Array(8),
            ),
        ).toBeUndefined();

        expect(
            ieee754Codec.validateBytes(
                floatingPointField(8, singleBigEndian),
                new Uint8Array(8),
            ),
        ).toBe(
            "TEST-FIELD: IEEE-754 single requires 4 bytes but field has 8",
        );
    });


    test.each([
        0,
        -1,
        1,
        123.5,
        Number.POSITIVE_INFINITY,
        Number.NEGATIVE_INFINITY,
    ])(
        "round trips %s",
        value => {
            const field = floatingPointField(8, doubleLittleEndian);
            const bytes = new Uint8Array(8);

            ieee754Codec.write(
                field,
                bytes,
                value,
            );

            expect(
                ieee754Codec.read(
                    field,
                    bytes,
                ),
            ).toBe(value);
        },
    );


    test("round trips NaN", () => {
        const field = floatingPointField(8, doubleLittleEndian);
        const bytes = new Uint8Array(8);

        ieee754Codec.write(
            field,
            bytes,
            Number.NaN,
        );

        expect(
            ieee754Codec.read(
                field,
                bytes,
            ),
        ).toBeNaN();
    });

});


describe("packedDecimalCodec", () => {

    const signedDecimal: PackedDecimalFieldType = {
        kind: "decimal",
        encoding: "packed-decimal",
        digits: 5,
        scale: 2,
        signed: true,
    };


    const unsignedDecimal: PackedDecimalFieldType = {
        kind: "decimal",
        encoding: "packed-decimal",
        digits: 5,
        scale: 2,
        signed: false,
    };


    test("writes positive signed packed decimal", () => {
        const field = decimalField(3, signedDecimal);
        const bytes = new Uint8Array(3);

        packedDecimalCodec.write(
            field,
            bytes,
            {
                unscaled: 12345n,
                scale: 2,
            },
        );

        expect(Array.from(bytes)).toEqual([
            0x12,
            0x34,
            0x5c,
        ]);
    });


    test("writes negative packed decimal", () => {
        const field = decimalField(3, signedDecimal);
        const bytes = new Uint8Array(3);

        packedDecimalCodec.write(
            field,
            bytes,
            {
                unscaled: -12345n,
                scale: 2,
            },
        );

        expect(Array.from(bytes)).toEqual([
            0x12,
            0x34,
            0x5d,
        ]);
    });


    test("writes unsigned packed decimal with F sign", () => {
        const field = decimalField(3, unsignedDecimal);
        const bytes = new Uint8Array(3);

        packedDecimalCodec.write(
            field,
            bytes,
            {
                unscaled: 12345n,
                scale: 2,
            },
        );

        expect(Array.from(bytes)).toEqual([
            0x12,
            0x34,
            0x5f,
        ]);
    });


    test("reads positive packed decimal", () => {
        expect(
            packedDecimalCodec.read(
                decimalField(3, signedDecimal),
                new Uint8Array([
                    0x12,
                    0x34,
                    0x5c,
                ]),
            ),
        ).toEqual({
            unscaled: 12345n,
            scale: 2,
        });
    });


    test("reads negative packed decimal", () => {
        expect(
            packedDecimalCodec.read(
                decimalField(3, signedDecimal),
                new Uint8Array([
                    0x12,
                    0x34,
                    0x5d,
                ]),
            ),
        ).toEqual({
            unscaled: -12345n,
            scale: 2,
        });
    });


    test("validates decimal scale", () => {
        expect(
            packedDecimalCodec.validateValue(
                decimalField(3, signedDecimal),
                {
                    unscaled: 12345n,
                    scale: 3,
                },
            ),
        ).toBe(
            "TEST-FIELD: decimal scale must be 2 but was 3",
        );
    });


    test("validates number of digits", () => {
        expect(
            packedDecimalCodec.validateValue(
                decimalField(3, signedDecimal),
                {
                    unscaled: 123456n,
                    scale: 2,
                },
            ),
        ).toBe(
            "TEST-FIELD: decimal has 6 digits but field allows 5",
        );
    });


    test("validates physical field capacity", () => {
        const type: PackedDecimalFieldType = {
            ...signedDecimal,
            digits: 6,
        };

        expect(
            packedDecimalCodec.validateValue(
                decimalField(3, type),
                {
                    unscaled: 1n,
                    scale: 2,
                },
            ),
        ).toBe(
            "TEST-FIELD: decimal type requires 6 digits but 3 bytes can hold only 5",
        );
    });


    test("rejects negative unsigned value", () => {
        expect(
            packedDecimalCodec.validateValue(
                decimalField(3, unsignedDecimal),
                {
                    unscaled: -1n,
                    scale: 2,
                },
            ),
        ).toBe(
            "TEST-FIELD: unsigned decimal cannot contain a negative value",
        );
    });


    test("rejects invalid digit nibble", () => {
        expect(
            packedDecimalCodec.validateBytes(
                decimalField(3, signedDecimal),
                new Uint8Array([
                    0x1a,
                    0x34,
                    0x5c,
                ]),
            ),
        ).toBe(
            "TEST-FIELD: invalid packed decimal digit at byte 0",
        );
    });


    test("rejects invalid sign nibble", () => {
        expect(
            packedDecimalCodec.validateBytes(
                decimalField(3, signedDecimal),
                new Uint8Array([
                    0x12,
                    0x34,
                    0x51,
                ]),
            ),
        ).toBe(
            "TEST-FIELD: invalid packed decimal sign nibble 0x1",
        );
    });


    test("rejects negative sign for unsigned decimal", () => {
        expect(
            packedDecimalCodec.validateBytes(
                decimalField(3, unsignedDecimal),
                new Uint8Array([
                    0x12,
                    0x34,
                    0x5d,
                ]),
            ),
        ).toBe(
            "TEST-FIELD: unsigned packed decimal cannot contain a negative sign",
        );
    });


    test.each([
        0n,
        1n,
        123n,
        12345n,
        -1n,
        -12345n,
    ])(
        "round trips %s",
        unscaled => {
            const field = decimalField(3, signedDecimal);
            const value: Decimal = {
                unscaled,
                scale: 2,
            };

            expect(
                packedDecimalCodec.validateValue(
                    field,
                    value,
                ),
            ).toBeUndefined();

            const bytes = new Uint8Array(3);

            packedDecimalCodec.write(
                field,
                bytes,
                value,
            );

            expect(
                packedDecimalCodec.validateBytes(
                    field,
                    bytes,
                ),
            ).toBeUndefined();

            expect(
                packedDecimalCodec.read(
                    field,
                    bytes,
                ),
            ).toEqual(value);
        },
    );

});