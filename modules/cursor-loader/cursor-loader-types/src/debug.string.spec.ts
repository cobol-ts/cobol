import {
    bytesToDebugString,
    utf8RangeToString
} from "./debug.string";


const encoder = new TextEncoder();


describe("utf8RangeToString", () => {
    test("decodes a range from one buffer", () => {
        const record = {
            buffers: [
                encoder.encode("0123456789")
            ]
        };

        expect(
            utf8RangeToString(
                record,
                2,
                7
            )
        ).toBe(
            "23456"
        );
    });


    test("decodes a range spanning buffers", () => {
        const record = {
            buffers: [
                encoder.encode("0123"),
                encoder.encode("4567"),
                encoder.encode("89")
            ]
        };

        expect(
            utf8RangeToString(
                record,
                2,
                8
            )
        ).toBe(
            "234567"
        );
    });


    test("decodes the complete range across several buffers", () => {
        const record = {
            buffers: [
                encoder.encode("hello "),
                encoder.encode("world"),
                encoder.encode("!")
            ]
        };

        expect(
            utf8RangeToString(
                record,
                0,
                12
            )
        ).toBe(
            "hello world!"
        );
    });


    test("decodes a utf8 character split across buffers", () => {
        const encoded =
            encoder.encode(
                "A£B"
            );

        const record = {
            buffers: [
                encoded.subarray(
                    0,
                    2
                ),
                encoded.subarray(
                    2
                )
            ]
        };

        expect(
            utf8RangeToString(
                record,
                0,
                encoded.length
            )
        ).toBe(
            "A£B"
        );
    });


    test("decodes a multibyte utf8 character split across three buffers", () => {
        const encoded =
            encoder.encode(
                "A😀B"
            );

        const record = {
            buffers: [
                encoded.subarray(
                    0,
                    2
                ),
                encoded.subarray(
                    2,
                    4
                ),
                encoded.subarray(
                    4
                )
            ]
        };

        expect(
            utf8RangeToString(
                record,
                0,
                encoded.length
            )
        ).toBe(
            "A😀B"
        );
    });


    test("returns an empty string for an empty range", () => {
        const record = {
            buffers: [
                encoder.encode("abcdef")
            ]
        };

        expect(
            utf8RangeToString(
                record,
                3,
                3
            )
        ).toBe(
            ""
        );
    });


    test("starts part way through a later buffer", () => {
        const record = {
            buffers: [
                encoder.encode("abc"),
                encoder.encode("def"),
                encoder.encode("ghi")
            ]
        };

        expect(
            utf8RangeToString(
                record,
                4,
                8
            )
        ).toBe(
            "efgh"
        );
    });


    test("stops before later buffers", () => {
        const record = {
            buffers: [
                encoder.encode("abc"),
                encoder.encode("def"),
                encoder.encode("ghi")
            ]
        };

        expect(
            utf8RangeToString(
                record,
                1,
                5
            )
        ).toBe(
            "bcde"
        );
    });
});


describe("bytesToDebugString", () => {
    test("renders bytes as two digit hexadecimal", () => {
        const record = {
            buffers: [
                Uint8Array.from([
                    0x00,
                    0x01,
                    0x0f,
                    0x10,
                    0xff
                ])
            ]
        };

        expect(
            bytesToDebugString(
                record,
                0,
                5
            )
        ).toBe(
            "00 01 0f 10 ff"
        );
    });


    test("renders only the requested range", () => {
        const record = {
            buffers: [
                Uint8Array.from([
                    0x10,
                    0x20,
                    0x30,
                    0x40,
                    0x50
                ])
            ]
        };

        expect(
            bytesToDebugString(
                record,
                1,
                4
            )
        ).toBe(
            "20 30 40"
        );
    });


    test("renders a range spanning buffers", () => {
        const record = {
            buffers: [
                Uint8Array.from([
                    0x10,
                    0x20
                ]),
                Uint8Array.from([
                    0x30,
                    0x40
                ]),
                Uint8Array.from([
                    0x50,
                    0x60
                ])
            ]
        };

        expect(
            bytesToDebugString(
                record,
                1,
                5
            )
        ).toBe(
            "20 30 40 50"
        );
    });


    test("starts part way through a later buffer", () => {
        const record = {
            buffers: [
                Uint8Array.from([
                    0x10,
                    0x20
                ]),
                Uint8Array.from([
                    0x30,
                    0x40
                ]),
                Uint8Array.from([
                    0x50,
                    0x60
                ])
            ]
        };

        expect(
            bytesToDebugString(
                record,
                3,
                6
            )
        ).toBe(
            "40 50 60"
        );
    });


    test("returns an empty string for an empty range", () => {
        const record = {
            buffers: [
                Uint8Array.from([
                    0x10,
                    0x20
                ])
            ]
        };

        expect(
            bytesToDebugString(
                record,
                1,
                1
            )
        ).toBe(
            ""
        );
    });
});