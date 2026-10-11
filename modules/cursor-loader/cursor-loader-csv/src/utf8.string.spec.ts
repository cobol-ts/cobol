import {HasByteBuffers} from "@cobol-ts/cursor-loader-types";

import {utf8String} from "./utf8.string";


const ENCODER = new TextEncoder();
const ESCAPE = "\\".charCodeAt(0);


describe("utf8String",() => {
    test("converts bytes to a string",() => {
        const source = record("hello world");

        expect(
            utf8String(source,0,11,false,ESCAPE)
        ).toBe(
            "hello world"
        );
    });


    test("converts part of a buffer to a string",() => {
        const source = record("hello world");

        expect(
            utf8String(source,6,11,false,ESCAPE)
        ).toBe(
            "world"
        );
    });


    test("converts bytes spanning buffers to a string",() => {
        const source = record(
            "hello ",
            "beautiful ",
            "world"
        );

        expect(
            utf8String(source,6,21,false,ESCAPE)
        ).toBe(
            "beautiful world"
        );
    });


    test("starts and ends part way through buffers",() => {
        const source = record(
            "xxxhello",
            " beautiful ",
            "worldyyy"
        );

        expect(
            utf8String(source,3,24,false,ESCAPE)
        ).toBe(
            "hello beautiful world"
        );
    });


    test("handles UTF-8 characters across buffer boundaries",() => {
        const bytes = ENCODER.encode("A£€B");

        const source: HasByteBuffers = {
            buffers: [
                bytes.subarray(0,2),
                bytes.subarray(2,4),
                bytes.subarray(4,6),
                bytes.subarray(6)
            ]
        };

        expect(
            utf8String(source,1,6,false,ESCAPE)
        ).toBe(
            "£€"
        );
    });


    test("returns an empty string for an empty range",() => {
        const source = record("hello");

        expect(
            utf8String(source,5,5,false,ESCAPE)
        ).toBe(
            ""
        );
    });


    test("leaves escape characters unchanged when escaped is false",() => {
        const value = "hello \\\"world\\\"";
        const source = record(value);

        expect(
            utf8String(
                source,
                0,
                ENCODER.encode(value).length,
                false,
                ESCAPE
            )
        ).toBe(
            value
        );
    });


    test("removes escape characters",() => {
        const value = "hello \\\"world\\\"";
        const source = record(value);

        expect(
            utf8String(
                source,
                0,
                ENCODER.encode(value).length,
                true,
                ESCAPE
            )
        ).toBe(
            "hello \"world\""
        );
    });


    test("copies an escaped escape character",() => {
        const value = "one\\\\two";
        const source = record(value);

        expect(
            utf8String(
                source,
                0,
                ENCODER.encode(value).length,
                true,
                ESCAPE
            )
        ).toBe(
            "one\\two"
        );
    });


    test("handles an escape at a physical buffer boundary",() => {
        const value = "hello \\\"world\\\"";

        const source = record(
            "hello \\",
            "\"world\\\""
        );

        expect(
            utf8String(
                source,
                0,
                ENCODER.encode(value).length,
                true,
                ESCAPE
            )
        ).toBe(
            "hello \"world\""
        );
    });


    test("supports quote as the escape character",() => {
        const value = "one \"\"quoted\"\" value";
        const source = record(value);
        const quote = "\"".charCodeAt(0);

        expect(
            utf8String(
                source,
                0,
                ENCODER.encode(value).length,
                true,
                quote
            )
        ).toBe(
            "one \"quoted\" value"
        );
    });


    test("handles doubled quotes across a physical buffer boundary",() => {
        const value = "one \"\"quoted\"\" value";

        const source = record(
            "one \"",
            "\"quoted\"",
            "\" value"
        );

        const quote = "\"".charCodeAt(0);

        expect(
            utf8String(
                source,
                0,
                ENCODER.encode(value).length,
                true,
                quote
            )
        ).toBe(
            "one \"quoted\" value"
        );
    });
});


function record(...parts: string[]): HasByteBuffers {
    return {
        buffers: parts.map(
            part => ENCODER.encode(part)
        )
    };
}

test("starts exactly at a physical buffer boundary",() => {
    const source = record(
        "hello",
        "world"
    );

    expect(
        utf8String(source,5,10,false,ESCAPE)
    ).toBe(
        "world"
    );
});


test("ends exactly at a physical buffer boundary",() => {
    const source = record(
        "hello",
        "world"
    );

    expect(
        utf8String(source,0,5,false,ESCAPE)
    ).toBe(
        "hello"
    );
});