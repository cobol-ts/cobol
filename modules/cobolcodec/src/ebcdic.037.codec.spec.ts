import {
    TextFieldType,
} from "@cobol-ts/copybookfiles";
import {
    TypedFileFieldMetadata,
} from "./cobol.codec";
import {
    ebcdic037Codec,
} from "./ebcdic.037.codec";


const field = (
    from: number,
    to: number,
): TypedFileFieldMetadata<string, TextFieldType> => ({
    name: "TEST-FIELD",
    from,
    to,
    type: {
        kind: "text",
        encoding: "ebcdic:037",
    },
});


describe("ebcdic037Codec", () => {

    describe("read", () => {

        test("reads uppercase letters", () => {
            const bytes =
                new Uint8Array([
                    0xC1,
                    0xC2,
                    0xC3,
                ]);

            expect(
                ebcdic037Codec.read(
                    field(0, bytes.length),
                    bytes,
                ),
            ).toBe("ABC");
        });


        test("reads lowercase letters", () => {
            const bytes =
                new Uint8Array([
                    0x81,
                    0x82,
                    0x83,
                ]);

            expect(
                ebcdic037Codec.read(
                    field(0, bytes.length),
                    bytes,
                ),
            ).toBe("abc");
        });


        test("reads digits", () => {
            const bytes =
                new Uint8Array([
                    0xF0,
                    0xF1,
                    0xF2,
                    0xF3,
                ]);

            expect(
                ebcdic037Codec.read(
                    field(0, bytes.length),
                    bytes,
                ),
            ).toBe("0123");
        });


        test("reads spaces", () => {
            const bytes =
                new Uint8Array([
                    0xC1,
                    0x40,
                    0xC2,
                ]);

            expect(
                ebcdic037Codec.read(
                    field(0, bytes.length),
                    bytes,
                ),
            ).toBe("A B");
        });


        test("reads only the requested range", () => {
            const bytes =
                new Uint8Array([
                    0xE7,
                    0xC1,
                    0xC2,
                    0xC3,
                    0xE8,
                ]);

            expect(
                ebcdic037Codec.read(
                    field(1, 4),
                    bytes,
                ),
            ).toBe("ABC");
        });

    });


    describe("write", () => {

        test("writes uppercase letters", () => {
            const target =
                new Uint8Array(3);

            ebcdic037Codec.write(
                field(0, 3),
                target,
                "ABC",
            );

            expect(
                Array.from(target),
            ).toEqual([
                0xC1,
                0xC2,
                0xC3,
            ]);
        });


        test("writes lowercase letters", () => {
            const target =
                new Uint8Array(3);

            ebcdic037Codec.write(
                field(0, 3),
                target,
                "abc",
            );

            expect(
                Array.from(target),
            ).toEqual([
                0x81,
                0x82,
                0x83,
            ]);
        });


        test("writes digits", () => {
            const target =
                new Uint8Array(4);

            ebcdic037Codec.write(
                field(0, 4),
                target,
                "0123",
            );

            expect(
                Array.from(target),
            ).toEqual([
                0xF0,
                0xF1,
                0xF2,
                0xF3,
            ]);
        });


        test("pads unused bytes with EBCDIC spaces", () => {
            const target =
                new Uint8Array(5);

            ebcdic037Codec.write(
                field(0, 5),
                target,
                "ABC",
            );

            expect(
                Array.from(target),
            ).toEqual([
                0xC1,
                0xC2,
                0xC3,
                0x40,
                0x40,
            ]);
        });


        test("writes only to the requested range", () => {
            const target =
                new Uint8Array([
                    0x11,
                    0x00,
                    0x00,
                    0x00,
                    0x22,
                ]);

            ebcdic037Codec.write(
                field(1, 4),
                target,
                "ABC",
            );

            expect(
                Array.from(target),
            ).toEqual([
                0x11,
                0xC1,
                0xC2,
                0xC3,
                0x22,
            ]);
        });

    });


    describe("validation", () => {

        test("accepts valid byte range", () => {
            const bytes =
                new Uint8Array(10);

            expect(
                ebcdic037Codec.validateBytes(
                    field(2, 5),
                    bytes,
                ),
            ).toBeUndefined();
        });


        test("rejects negative from", () => {
            const bytes =
                new Uint8Array(10);

            expect(
                ebcdic037Codec.validateBytes(
                    field(-1, 5),
                    bytes,
                ),
            ).toBe(
                "TEST-FIELD: invalid byte range [-1, 5) for array of length 10",
            );
        });


        test("rejects to before from", () => {
            const bytes =
                new Uint8Array(10);

            expect(
                ebcdic037Codec.validateBytes(
                    field(6, 5),
                    bytes,
                ),
            ).toBe(
                "TEST-FIELD: invalid byte range [6, 5) for array of length 10",
            );
        });


        test("rejects to beyond array", () => {
            const bytes =
                new Uint8Array(10);

            expect(
                ebcdic037Codec.validateBytes(
                    field(0, 11),
                    bytes,
                ),
            ).toBe(
                "TEST-FIELD: invalid byte range [0, 11) for array of length 10",
            );
        });


        test("accepts characters supported by CP037", () => {
            expect(
                ebcdic037Codec.validateValue(
                    field(0, 20),
                    "Hello 123 £$",
                ),
            ).toBeUndefined();
        });


        test("rejects value that does not fit field", () => {
            expect(
                ebcdic037Codec.validateValue(
                    field(0, 3),
                    "ABCD",
                ),
            ).toBe(
                "TEST-FIELD: value requires 4 bytes but field has 3",
            );
        });


        test("rejects characters not supported by CP037", () => {
            expect(
                ebcdic037Codec.validateValue(
                    field(0, 20),
                    "Hello €",
                ),
            ).toBe(
                'TEST-FIELD: character "€" cannot be encoded as EBCDIC CP037',
            );
        });

    });


    describe("round trip", () => {

        test.each([
            "",
            "A",
            "ABC",
            "Hello",
            "0123456789",
            "Hello, world!",
            "£123.45",
            "[]{}<>",
        ])(
            "round trips %j",
            value => {
                const target =
                    new Uint8Array(
                        value.length,
                    );

                const testField =
                    field(
                        0,
                        target.length,
                    );

                expect(
                    ebcdic037Codec.validateValue(
                        testField,
                        value,
                    ),
                ).toBeUndefined();

                ebcdic037Codec.write(
                    testField,
                    target,
                    value,
                );

                expect(
                    ebcdic037Codec.read(
                        testField,
                        target,
                    ),
                ).toBe(value);
            },
        );

    });


    describe("complete code page", () => {

        test("every byte can be decoded", () => {
            const bytes =
                new Uint8Array(256);

            for (let i = 0; i < 256; i++)
                bytes[i] = i;

            const value =
                ebcdic037Codec.read(
                    field(0, 256),
                    bytes,
                );

            expect(
                value.length,
            ).toBe(256);
        });


        test("every decoded CP037 character can be encoded again", () => {
            for (let byte = 0; byte < 256; byte++) {
                const source =
                    new Uint8Array([
                        byte,
                    ]);

                const testField =
                    field(
                        0,
                        1,
                    );

                const value =
                    ebcdic037Codec.read(
                        testField,
                        source,
                    );

                expect(
                    ebcdic037Codec.validateValue(
                        testField,
                        value,
                    ),
                ).toBeUndefined();

                const target =
                    new Uint8Array(1);

                ebcdic037Codec.write(
                    testField,
                    target,
                    value,
                );

                expect(
                    target[0],
                ).toBe(byte);
            }
        });

    });

});