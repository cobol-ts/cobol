import {
    isErrors
} from "@cobol-ts/errors";

import {
    type PhysicalRecordContent
} from "@cobol-ts/cursor-loader-types";

import {
    JsonParser
} from "./cursor.loader.json.parser";


const encoder =
    new TextEncoder();


function bytes(
    value: string
): PhysicalRecordContent {

    const content =
        encoder.encode(
            value
        );


    return {
        buffers: [
            content
        ],

        firstBufferOffset:
            0,

        length:
        content.length
    };
}


test(
    "parses a JSON object",
    () => {
        interface Customer {
            id: string;
            name: string;
        }


        const parser =
            new JsonParser<Customer>();


        const result =
            parser.parse(
                bytes(
                    `{"id":"123","name":"Fred"}`
                )
            );


        expect(
            isErrors(
                result
            )
        ).toBe(
            false
        );


        if (
            isErrors(
                result
            )
        ) {
            throw new Error(
                "expected parsed JSON"
            );
        }


        expect(
            result
        ).toEqual({
            id: "123",
            name: "Fred"
        });
    }
);


test(
    "parses a JSON array",
    () => {
        const parser =
            new JsonParser<number[]>();


        const result =
            parser.parse(
                bytes(
                    `[1,2,3]`
                )
            );


        expect(
            isErrors(
                result
            )
        ).toBe(
            false
        );


        if (
            isErrors(
                result
            )
        ) {
            throw new Error(
                "expected parsed JSON"
            );
        }


        expect(
            result
        ).toEqual([
            1,
            2,
            3
        ]);
    }
);


test(
    "parses a JSON string primitive",
    () => {
        const parser =
            new JsonParser<string>();


        const result =
            parser.parse(
                bytes(
                    `"hello"`
                )
            );


        expect(
            isErrors(
                result
            )
        ).toBe(
            false
        );


        if (
            isErrors(
                result
            )
        ) {
            throw new Error(
                "expected parsed JSON"
            );
        }


        expect(
            result
        ).toBe(
            "hello"
        );
    }
);


test(
    "parses a JSON number primitive",
    () => {
        const parser =
            new JsonParser<number>();


        const result =
            parser.parse(
                bytes(
                    `42`
                )
            );


        expect(
            isErrors(
                result
            )
        ).toBe(
            false
        );


        if (
            isErrors(
                result
            )
        ) {
            throw new Error(
                "expected parsed JSON"
            );
        }


        expect(
            result
        ).toBe(
            42
        );
    }
);


test(
    "parses JSON null",
    () => {
        const parser =
            new JsonParser<null>();


        const result =
            parser.parse(
                bytes(
                    `null`
                )
            );


        expect(
            isErrors(
                result
            )
        ).toBe(
            false
        );

        expect(
            result
        ).toBeNull();
    }
);


test(
    "parses a record beginning part way through the first buffer",
    () => {
        const parser =
            new JsonParser<{
                id: number;
            }>();

        const prefix =
            encoder.encode(
                "ignored:"
            );

        const json =
            encoder.encode(
                `{"id":123}`
            );

        const suffix =
            encoder.encode(
                ":ignored"
            );

        const buffer =
            new Uint8Array(
                prefix.length
                + json.length
                + suffix.length
            );


        buffer.set(
            prefix,
            0
        );

        buffer.set(
            json,
            prefix.length
        );

        buffer.set(
            suffix,
            prefix.length
            + json.length
        );


        const record:
            PhysicalRecordContent = {

            buffers: [
                buffer
            ],

            firstBufferOffset:
            prefix.length,

            length:
            json.length
        };


        const result =
            parser.parse(
                record
            );


        expect(
            result
        ).toEqual({
            id: 123
        });
    }
);


test(
    "parses JSON spanning several buffers",
    () => {
        const parser =
            new JsonParser<{
                id: string;
                name: string;
            }>();

        const first =
            encoder.encode(
                `xxx{"id":"123",`
            );

        const second =
            encoder.encode(
                `"name":"Fred"`
            );

        const third =
            encoder.encode(
                `}yyy`
            );


        const record:
            PhysicalRecordContent = {

            buffers: [
                first,
                second,
                third
            ],

            firstBufferOffset:
                3,

            length:
            encoder.encode(
                `{"id":"123","name":"Fred"}`
            ).length
        };


        const result =
            parser.parse(
                record
            );


        expect(
            result
        ).toEqual({
            id: "123",
            name: "Fred"
        });
    }
);


test(
    "parses UTF-8 characters split across buffers",
    () => {
        const parser =
            new JsonParser<{
                name: string;
            }>();


        const json =
            encoder.encode(
                `{"name":"£"}`
            );


        /*
         * Split between the two bytes of the UTF-8 encoding of £.
         */

        const split =
            json.indexOf(
                0xc2
            )
            + 1;


        const first =
            json.slice(
                0,
                split
            );

        const second =
            json.slice(
                split
            );


        const record:
            PhysicalRecordContent = {

            buffers: [
                first,
                second
            ],

            firstBufferOffset:
                0,

            length:
            json.length
        };


        const result =
            parser.parse(
                record
            );


        expect(
            result
        ).toEqual({
            name: "£"
        });
    }
);


test(
    "returns Errors for malformed JSON",
    () => {
        const parser =
            new JsonParser();


        const result =
            parser.parse(
                bytes(
                    `{"id":`
                )
            );


        expect(
            isErrors(
                result
            )
        ).toBe(
            true
        );


        if (
            !isErrors(
                result
            )
        ) {
            throw new Error(
                "expected JSON parse error"
            );
        }


        expect(
            result.errors
        ).toHaveLength(
            1
        );

        expect(
            result.errors[0]
        ).toContain(
            "JSON parse"
        );
    }
);


test(
    "returns Errors for invalid UTF-8",
    () => {
        const parser =
            new JsonParser();


        const invalidUtf8 =
            new Uint8Array([
                0xc3,
                0x28
            ]);

        const record:
            PhysicalRecordContent = {

            buffers: [
                invalidUtf8
            ],

            firstBufferOffset:
                0,

            length:
            invalidUtf8.length
        };


        const result =
            parser.parse(
                record
            );


        expect(
            isErrors(
                result
            )
        ).toBe(
            true
        );


        if (
            !isErrors(
                result
            )
        ) {
            throw new Error(
                "expected UTF-8 decoding error"
            );
        }


        expect(
            result.errors
        ).toHaveLength(
            1
        );

        expect(
            result.errors[0]
        ).toContain(
            "JSON parse"
        );
    }
);


test(
    "does not validate the representation shape",
    () => {
        interface Customer {
            id: string;
            name: string;
        }


        const parser =
            new JsonParser<Customer>();


        const result =
            parser.parse(
                bytes(
                    `{"somethingElse":123}`
                )
            );


        expect(
            isErrors(
                result
            )
        ).toBe(
            false
        );


        if (
            isErrors(
                result
            )
        ) {
            throw new Error(
                "expected parsed JSON"
            );
        }


        expect(
            result
        ).toEqual({
            somethingElse: 123
        });
    }
);