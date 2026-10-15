import {
    type Parser,
    type ParserPhysicalRecordContent,
    type ParserRegistry
} from "@cobol-ts/cursor-loader-types";

import {
    defineProjection
} from "@cobol-ts/cursor-projection";

import {
    type CursorFileDefinition,
    type FileCursorInfrastructure
} from "./cursor.file";


export interface Customer {
    name(): string;
}


interface Representation {
    readonly name: string;
}


export interface TestFile {
    readonly bytes: Uint8Array;
    offset: number;
}


type TestParser =
    Parser<
        Representation,
        undefined,
        undefined,
        undefined,
        readonly string[]
    >;


const BUFFER_SIZE = 64;

const ENCODER =
    new TextEncoder();


export const customerProjection =
    defineProjection<Customer>({
        name: {
            type: "string"
        }
    });


export const customerFileDefinition:
    CursorFileDefinition<Customer,"test"> = {
    filename:
        "test.customer",

    fileType:
        "test",

    projection:
    customerProjection
};


/**
 * The test format deliberately uses one byte per logical record.
 *
 *     A   -> Alice
 *     B   -> Bob
 *     !   -> recoverable row error
 *
 * The physical buffer is deliberately much larger than the fixture so several
 * logical records normally share one buffer. cursor-record owns testing that
 * physical lifetime in detail; this fixture merely gives cursor-file a real
 * parser/source pipeline to consume.
 */
const testParser: TestParser = {
    async parse(record) {
        if (
            record.startByte
            === record.lastValidByte
        ) {
            await record.readMore();
        }

        if (
            record.startByte
            >= record.lastValidByte
        ) {
            record.endByte =
                record.lastValidByte;

            return {
                errors: [
                    "Unexpected end of test file"
                ]
            };
        }

        const byte =
            byteAt(
                record,
                record.startByte
            );

        record.endByte =
            record.startByte + 1;

        if (byte === 33) {
            return {
                errors: [
                    "bad row"
                ],

                reference:
                    `row-${record.recordNumber}`
            };
        }

        return {
            name:
                byte === 65
                    ? "Alice"
                    : byte === 66
                        ? "Bob"
                        : String.fromCharCode(byte)
        };
    },

    compileProjectionPath(
        _details,
        _context,
        path
    ) {
        return path;
    },

    integer() {
        throw new Error(
            "Test parser does not support integer projections"
        );
    },

    float() {
        throw new Error(
            "Test parser does not support float projections"
        );
    },

    character() {
        throw new Error(
            "Test parser does not support character projections"
        );
    },

    string(
        representation,
        _details,
        path
    ) {
        if (
            path.length !== 1
            || path[0] !== "name"
        ) {
            throw new Error(
                `Unknown test projection path: ${path.join(".")}`
            );
        }

        return representation.name;
    },

    toDebugString() {
        return "test record";
    }
};


export const testParserRegistry = {
    test: {
        parser:
        testParser,

        parserConfig:
            () => undefined,

        createRecordState:
            () => undefined
    }
} satisfies ParserRegistry<"test">;


export function createTestFile(
    records: string
): TestFile {
    return {
        bytes:
            ENCODER.encode(records),

        offset:
            0
    };
}


export function createTestInfrastructure(
    parserConfig:
    (() => undefined) =
    () => undefined
): FileCursorInfrastructure<TestFile,"test"> {
    return {
        parsers: {
            test: {
                parser:
                testParser,

                parserConfig,

                createRecordState:
                    () => undefined
            }
        },

        bufferSize:
        BUFFER_SIZE,

        fillFileBuffer:
            async (file,target) => {
                const available =
                    file.bytes.length
                    - file.offset;

                const count =
                    Math.min(
                        available,
                        target.length
                    );

                if (count !== 0) {
                    target.set(
                        file.bytes.subarray(
                            file.offset,
                            file.offset + count
                        )
                    );

                    file.offset +=
                        count;
                }

                return count;
            }
    };
}


function byteAt(
    record: ParserPhysicalRecordContent<undefined>,
    offset: number
): number {
    let bufferStart = 0;

    for (const buffer of record.buffers) {
        const bufferEnd =
            bufferStart
            + buffer.length;

        if (offset < bufferEnd) {
            return buffer[
            offset
            - bufferStart
                ];
        }

        bufferStart =
            bufferEnd;
    }

    throw new Error(
        `Byte offset ${offset} is outside the physical record`
    );
}