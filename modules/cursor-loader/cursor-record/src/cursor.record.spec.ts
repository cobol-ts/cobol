import {
    type FileBufferPool,
    type FileByteCursorFactory,
    type PhysicalRecordContent,
    type RecordBoundaryDetector,
    type RecordCursor,
    type RecordReaderResult
} from "@cobol-ts/cursor-loader-types";

import {
    createFixedRecordReader,
    createLengthPrefixedRecordReader,
    createLineRecordReader
} from "./cursor.record";

import {
    newlineRecordBoundaryDetector
} from "./cursor.newline.detector";


/*
 * These record readers perform physical framing only.
 *
 * They do not derive parser-specific record state, so their records carry
 * an explicit undefined state.
 */

type StatelessPhysicalRecord =
    PhysicalRecordContent<
        undefined
    >;


type StatelessRecordReaderResult =
    RecordReaderResult<
        undefined
    >;


type StatelessRecordCursor =
    RecordCursor<
        undefined
    >;


describe(
    "physical record readers",
    () => {

        describe(
            "fixed-width records",
            () => {

                it(
                    "yields several fixed-width records",
                    async () => {

                        const reader =
                            createFixedRecordReader(
                                undefined,
                                testOptions(
                                    "abcdefgh"
                                )
                            );


                        const results =
                            await collect(
                                reader({
                                    type:
                                        "fixed",

                                    filename:
                                        "test.dat",

                                    recordSize:
                                        4
                                })
                            );


                        expect(
                            recordStrings(
                                results
                            )
                        ).toEqual(
                            [
                                "abcd",
                                "efgh"
                            ]
                        );
                    }
                );


                it(
                    "handles records across physical buffer boundaries",
                    async () => {

                        const reader =
                            createFixedRecordReader(
                                undefined,
                                testOptions(
                                    "abcd",
                                    "efgh",
                                    "ij"
                                )
                            );


                        const results =
                            await collect(
                                reader({
                                    type:
                                        "fixed",

                                    filename:
                                        "test.dat",

                                    recordSize:
                                        5
                                })
                            );


                        expect(
                            recordStrings(
                                results
                            )
                        ).toEqual(
                            [
                                "abcde",
                                "fghij"
                            ]
                        );
                    }
                );


                it(
                    "handles a record larger than every physical buffer",
                    async () => {

                        const reader =
                            createFixedRecordReader(
                                undefined,
                                testOptions(
                                    "ab",
                                    "cd",
                                    "ef",
                                    "gh",
                                    "ij"
                                )
                            );


                        const results =
                            await collect(
                                reader({
                                    type:
                                        "fixed",

                                    filename:
                                        "test.dat",

                                    recordSize:
                                        10
                                })
                            );


                        expect(
                            recordStrings(
                                results
                            )
                        ).toEqual(
                            [
                                "abcdefghij"
                            ]
                        );
                    }
                );


                it(
                    "handles several records within one physical buffer",
                    async () => {

                        const reader =
                            createFixedRecordReader(
                                undefined,
                                testOptions(
                                    "abcdefghijkl"
                                )
                            );


                        const results =
                            await collect(
                                reader({
                                    type:
                                        "fixed",

                                    filename:
                                        "test.dat",

                                    recordSize:
                                        4
                                })
                            );


                        expect(
                            recordStrings(
                                results
                            )
                        ).toEqual(
                            [
                                "abcd",
                                "efgh",
                                "ijkl"
                            ]
                        );
                    }
                );


                it(
                    "reports an incomplete final record",
                    async () => {

                        const reader =
                            createFixedRecordReader(
                                undefined,
                                testOptions(
                                    "abcd",
                                    "ef"
                                )
                            );


                        const results =
                            await collect(
                                reader({
                                    type:
                                        "fixed",

                                    filename:
                                        "test.dat",

                                    recordSize:
                                        4
                                })
                            );


                        expect(
                            recordStrings(
                                results
                            )
                        ).toEqual(
                            [
                                "abcd"
                            ]
                        );


                        expect(
                            results[
                                1
                                ]
                        ).toEqual(
                            [
                                "Incomplete physical record at end of file: "
                                + "2 byte(s) remain but do not form "
                                + "a complete physical record"
                            ]
                        );
                    }
                );


                it(
                    "produces no records for an empty file",
                    async () => {

                        const reader =
                            createFixedRecordReader(
                                undefined,
                                testOptions()
                            );


                        const results =
                            await collect(
                                reader({
                                    type:
                                        "fixed",

                                    filename:
                                        "test.dat",

                                    recordSize:
                                        4
                                })
                            );


                        expect(
                            results
                        ).toEqual(
                            []
                        );
                    }
                );
            }
        );


        describe(
            "line records",
            () => {

                it(
                    "excludes LF framing",
                    async () => {

                        const reader =
                            createLineRecordReader(
                                newlineRecordBoundaryDetector,
                                testOptions(
                                    "abc\ndef\n"
                                )
                            );


                        const results =
                            await collect(
                                reader({
                                    type:
                                        "line",

                                    filename:
                                        "test.txt"
                                })
                            );


                        expect(
                            recordStrings(
                                results
                            )
                        ).toEqual(
                            [
                                "abc",
                                "def"
                            ]
                        );
                    }
                );


                it(
                    "excludes CRLF framing",
                    async () => {

                        const reader =
                            createLineRecordReader(
                                newlineRecordBoundaryDetector,
                                testOptions(
                                    "abc\r\ndef\r\n"
                                )
                            );


                        const results =
                            await collect(
                                reader({
                                    type:
                                        "line",

                                    filename:
                                        "test.txt"
                                })
                            );


                        expect(
                            recordStrings(
                                results
                            )
                        ).toEqual(
                            [
                                "abc",
                                "def"
                            ]
                        );
                    }
                );


                it(
                    "handles CRLF split across physical buffers",
                    async () => {

                        const reader =
                            createLineRecordReader(
                                newlineRecordBoundaryDetector,
                                testOptions(
                                    "abc\r",
                                    "\ndef",
                                    "\n"
                                )
                            );


                        const results =
                            await collect(
                                reader({
                                    type:
                                        "line",

                                    filename:
                                        "test.txt"
                                })
                            );


                        expect(
                            recordStrings(
                                results
                            )
                        ).toEqual(
                            [
                                "abc",
                                "def"
                            ]
                        );
                    }
                );


                it(
                    "handles a line spanning many physical buffers",
                    async () => {

                        const reader =
                            createLineRecordReader(
                                newlineRecordBoundaryDetector,
                                testOptions(
                                    "ab",
                                    "cd",
                                    "ef",
                                    "gh",
                                    "\n"
                                )
                            );


                        const results =
                            await collect(
                                reader({
                                    type:
                                        "line",

                                    filename:
                                        "test.txt"
                                })
                            );


                        expect(
                            recordStrings(
                                results
                            )
                        ).toEqual(
                            [
                                "abcdefgh"
                            ]
                        );
                    }
                );


                it(
                    "yields an unterminated final line",
                    async () => {

                        const reader =
                            createLineRecordReader(
                                newlineRecordBoundaryDetector,
                                testOptions(
                                    "abc\n",
                                    "def"
                                )
                            );


                        const results =
                            await collect(
                                reader({
                                    type:
                                        "line",

                                    filename:
                                        "test.txt"
                                })
                            );


                        expect(
                            recordStrings(
                                results
                            )
                        ).toEqual(
                            [
                                "abc",
                                "def"
                            ]
                        );
                    }
                );


                it(
                    "supports empty lines",
                    async () => {

                        const reader =
                            createLineRecordReader(
                                newlineRecordBoundaryDetector,
                                testOptions(
                                    "\n\n"
                                )
                            );


                        const results =
                            await collect(
                                reader({
                                    type:
                                        "line",

                                    filename:
                                        "test.txt"
                                })
                            );


                        expect(
                            recordStrings(
                                results
                            )
                        ).toEqual(
                            [
                                "",
                                ""
                            ]
                        );
                    }
                );
            }
        );


        describe(
            "record state",
            () => {

                it(
                    "carries explicit undefined record state",
                    async () => {

                        const reader =
                            createFixedRecordReader(
                                undefined,
                                testOptions(
                                    "abcd"
                                )
                            );


                        const results =
                            await collect(
                                reader({
                                    type:
                                        "fixed",

                                    filename:
                                        "test.dat",

                                    recordSize:
                                        4
                                })
                            );


                        const result =
                            results[
                                0
                                ];


                        if (
                            !(
                                "buffers"
                                in result
                            )
                        ) {
                            throw new Error(
                                "Expected a physical record"
                            );
                        }


                        expect(
                            result
                        ).toHaveProperty(
                            "recordState",
                            undefined
                        );
                    }
                );
            }
        );


        describe(
            "record framing",
            () => {

                it(
                    "uses recordStart rather than frameStart",
                    async () => {

                        const detector:
                            RecordBoundaryDetector = {

                            nextRecordStart(
                                buffers,
                                frameStart,
                                _searchStart
                            ): number {

                                const nextRecordStart =
                                    frameStart
                                    + 7;


                                return nextRecordStart
                                <= totalLength(
                                    buffers
                                )
                                    ? nextRecordStart
                                    : -1;
                            },


                            recordStart(
                                frameStart
                            ): number {

                                return frameStart
                                    + 2;
                            },


                            recordEnd(
                                _buffers,
                                nextRecordStart
                            ): number {

                                return nextRecordStart
                                    - 3;
                            }
                        };


                        const reader =
                            createFixedRecordReader(
                                detector,
                                testOptions(
                                    "XX",
                                    "abc",
                                    "YY"
                                )
                            );


                        const results =
                            await collect(
                                reader({
                                    type:
                                        "fixed",

                                    filename:
                                        "test.dat",

                                    recordSize:
                                        7
                                })
                            );


                        expect(
                            recordStrings(
                                results
                            )
                        ).toEqual(
                            [
                                "abc"
                            ]
                        );
                    }
                );


                it(
                    "supports prefix framing spanning physical buffers",
                    async () => {

                        const detector:
                            RecordBoundaryDetector = {

                            nextRecordStart(
                                buffers,
                                frameStart,
                                _searchStart
                            ): number {

                                const nextRecordStart =
                                    frameStart
                                    + 9;


                                return nextRecordStart
                                <= totalLength(
                                    buffers
                                )
                                    ? nextRecordStart
                                    : -1;
                            },


                            recordStart(
                                frameStart
                            ): number {

                                return frameStart
                                    + 6;
                            },


                            recordEnd(
                                _buffers,
                                nextRecordStart
                            ): number {

                                return nextRecordStart
                                    - 1;
                            }
                        };


                        const reader =
                            createFixedRecordReader(
                                detector,
                                testOptions(
                                    "PR",
                                    "EF",
                                    "IX",
                                    "abc"
                                )
                            );


                        const results =
                            await collect(
                                reader({
                                    type:
                                        "fixed",

                                    filename:
                                        "test.dat",

                                    recordSize:
                                        9
                                })
                            );


                        expect(
                            recordStrings(
                                results
                            )
                        ).toEqual(
                            [
                                "abc"
                            ]
                        );
                    }
                );


                it(
                    "supports zero-length framed records",
                    async () => {

                        const detector:
                            RecordBoundaryDetector = {

                            nextRecordStart(
                                buffers,
                                frameStart,
                                _searchStart
                            ): number {

                                const nextRecordStart =
                                    frameStart
                                    + 2;


                                return nextRecordStart
                                <= totalLength(
                                    buffers
                                )
                                    ? nextRecordStart
                                    : -1;
                            },


                            recordStart(
                                frameStart
                            ): number {

                                return frameStart
                                    + 2;
                            },


                            recordEnd(
                                _buffers,
                                nextRecordStart
                            ): number {

                                return nextRecordStart
                                    - 1;
                            }
                        };


                        const reader =
                            createFixedRecordReader(
                                detector,
                                testOptions(
                                    "AA",
                                    "BB"
                                )
                            );


                        const results =
                            await collect(
                                reader({
                                    type:
                                        "fixed",

                                    filename:
                                        "test.dat",

                                    recordSize:
                                        2
                                })
                            );


                        expect(
                            recordStrings(
                                results
                            )
                        ).toEqual(
                            [
                                "",
                                ""
                            ]
                        );
                    }
                );
            }
        );


        describe(
            "detector validation",
            () => {

                it(
                    "rejects nextRecordStart before the end of the frame",
                    async () => {

                        const detector:
                            RecordBoundaryDetector = {

                            nextRecordStart():
                                number {

                                return 0;
                            },


                            recordStart(
                                frameStart
                            ): number {

                                return frameStart;
                            },


                            recordEnd():
                                number {

                                return -1;
                            }
                        };


                        const reader =
                            createFixedRecordReader(
                                detector,
                                testOptions(
                                    "abcd"
                                )
                            );


                        await expect(
                            collect(
                                reader({
                                    type:
                                        "fixed",

                                    filename:
                                        "test.dat",

                                    recordSize:
                                        4
                                })
                            )
                        ).rejects.toThrow(
                            "RecordBoundaryDetector returned invalid next record start"
                        );
                    }
                );


                it(
                    "rejects nextRecordStart beyond buffered data",
                    async () => {

                        const detector:
                            RecordBoundaryDetector = {

                            nextRecordStart():
                                number {

                                return 5;
                            },


                            recordStart(
                                frameStart
                            ): number {

                                return frameStart;
                            },


                            recordEnd():
                                number {

                                return 3;
                            }
                        };


                        const reader =
                            createFixedRecordReader(
                                detector,
                                testOptions(
                                    "abcd"
                                )
                            );


                        await expect(
                            collect(
                                reader({
                                    type:
                                        "fixed",

                                    filename:
                                        "test.dat",

                                    recordSize:
                                        4
                                })
                            )
                        ).rejects.toThrow(
                            "RecordBoundaryDetector returned invalid next record start"
                        );
                    }
                );


                it(
                    "rejects recordStart before frameStart",
                    async () => {

                        const detector:
                            RecordBoundaryDetector = {

                            nextRecordStart():
                                number {

                                return 4;
                            },


                            recordStart():
                                number {

                                return -1;
                            },


                            recordEnd():
                                number {

                                return 3;
                            }
                        };


                        const reader =
                            createFixedRecordReader(
                                detector,
                                testOptions(
                                    "abcd"
                                )
                            );


                        await expect(
                            collect(
                                reader({
                                    type:
                                        "fixed",

                                    filename:
                                        "test.dat",

                                    recordSize:
                                        4
                                })
                            )
                        ).rejects.toThrow(
                            "RecordBoundaryDetector returned invalid record start"
                        );
                    }
                );


                it(
                    "rejects recordStart after nextRecordStart",
                    async () => {

                        const detector:
                            RecordBoundaryDetector = {

                            nextRecordStart():
                                number {

                                return 4;
                            },


                            recordStart():
                                number {

                                return 5;
                            },


                            recordEnd():
                                number {

                                return 3;
                            }
                        };


                        const reader =
                            createFixedRecordReader(
                                detector,
                                testOptions(
                                    "abcd"
                                )
                            );


                        await expect(
                            collect(
                                reader({
                                    type:
                                        "fixed",

                                    filename:
                                        "test.dat",

                                    recordSize:
                                        4
                                })
                            )
                        ).rejects.toThrow(
                            "RecordBoundaryDetector returned invalid record start"
                        );
                    }
                );


                it(
                    "rejects recordEnd before recordStart minus one",
                    async () => {

                        const detector:
                            RecordBoundaryDetector = {

                            nextRecordStart():
                                number {

                                return 4;
                            },


                            recordStart():
                                number {

                                return 2;
                            },


                            recordEnd():
                                number {

                                return 0;
                            }
                        };


                        const reader =
                            createFixedRecordReader(
                                detector,
                                testOptions(
                                    "abcd"
                                )
                            );


                        await expect(
                            collect(
                                reader({
                                    type:
                                        "fixed",

                                    filename:
                                        "test.dat",

                                    recordSize:
                                        4
                                })
                            )
                        ).rejects.toThrow(
                            "RecordBoundaryDetector returned invalid record end"
                        );
                    }
                );


                it(
                    "rejects recordEnd at nextRecordStart",
                    async () => {

                        const detector:
                            RecordBoundaryDetector = {

                            nextRecordStart():
                                number {

                                return 4;
                            },


                            recordStart():
                                number {

                                return 0;
                            },


                            recordEnd():
                                number {

                                return 4;
                            }
                        };


                        const reader =
                            createFixedRecordReader(
                                detector,
                                testOptions(
                                    "abcd"
                                )
                            );


                        await expect(
                            collect(
                                reader({
                                    type:
                                        "fixed",

                                    filename:
                                        "test.dat",

                                    recordSize:
                                        4
                                })
                            )
                        ).rejects.toThrow(
                            "RecordBoundaryDetector returned invalid record end"
                        );
                    }
                );
            }
        );


        describe(
            "byte cursor dependency",
            () => {

                it(
                    "passes the configured filename to the byte cursor",
                    async () => {

                        let receivedFilename:
                            string | undefined;


                        const createFileByteCursor:
                            FileByteCursorFactory =
                            async function* (
                                filename,
                                _bufferPool
                            ) {

                                receivedFilename =
                                    filename;

                                yield bytes(
                                    "abcd"
                                );
                            };


                        const reader =
                            createFixedRecordReader(
                                undefined,
                                {
                                    bufferPool:
                                    testBufferPool,

                                    createFileByteCursor
                                }
                            );


                        await collect(
                            reader({
                                type:
                                    "fixed",

                                filename:
                                    "customers.dat",

                                recordSize:
                                    4
                            })
                        );


                        expect(
                            receivedFilename
                        ).toBe(
                            "customers.dat"
                        );
                    }
                );
            }
        );
    }
);


function testOptions(
    ...contents:
    readonly string[]
): {
    readonly bufferPool:
        FileBufferPool;

    readonly createFileByteCursor:
        FileByteCursorFactory;
} {

    return {
        bufferPool:
        testBufferPool,

        createFileByteCursor:
            createTestFileByteCursor(
                ...contents
            )
    };
}


function createTestFileByteCursor(
    ...contents:
    readonly string[]
): FileByteCursorFactory {

    return async function* (
        _filename,
        _bufferPool
    ) {

        for (
            const content
            of contents
            ) {
            yield bytes(
                content
            );
        }
    };
}


/**
 * The record reader owns buffer lifetime, but buffer allocation/reuse is
 * tested by @cobol-ts/cursor-file.
 *
 * Record-reader unit tests therefore need only a pool capable of accepting
 * released buffers.
 */
const testBufferPool:
    FileBufferPool = {

    acquire():
        Uint8Array {

        throw new Error(
            "Record reader test byte source must not acquire buffers"
        );
    },


    release(
        _buffer:
        Uint8Array
    ): void {
        // Intentionally empty.
    }
};


async function collect(
    cursor:
    StatelessRecordCursor
): Promise<
    StatelessRecordReaderResult[]
> {

    const results:
        StatelessRecordReaderResult[] =
        [];


    for await (
        const result
        of cursor
        ) {
        if (
            "buffers"
            in result
        ) {
            results.push(
                detachRecord(
                    result
                )
            );
        } else {
            results.push(
                result
            );
        }
    }


    return results;
}


function detachRecord(
    record:
    StatelessPhysicalRecord
): StatelessPhysicalRecord {

    const content =
        readRecordBytes(
            record
        );


    return {
        buffers: [
            content
        ],

        startOffset:
            0,

        length:
        content.length,

        recordState:
        record.recordState
    };
}


function recordStrings(
    results:
    readonly StatelessRecordReaderResult[]
): string[] {

    return results
        .filter(
            (
                result
            ): result is StatelessPhysicalRecord =>
                "buffers"
                in result
        )
        .map(
            record =>
                new TextDecoder()
                    .decode(
                        readRecordBytes(
                            record
                        )
                    )
        );
}


function readRecordBytes(
    record:
    StatelessPhysicalRecord
): Uint8Array {

    const result =
        new Uint8Array(
            record.length
        );


    const recordEnd =
        record.startOffset
        + record.length;


    let logicalOffset =
        0;

    let outputOffset =
        0;


    for (
        const buffer
        of record.buffers
        ) {
        const bufferStart =
            logicalOffset;

        const bufferEnd =
            logicalOffset
            + buffer.length;


        const copyStart =
            Math.max(
                record.startOffset,
                bufferStart
            );

        const copyEnd =
            Math.min(
                recordEnd,
                bufferEnd
            );


        if (
            copyStart
            < copyEnd
        ) {
            const sourceStart =
                copyStart
                - bufferStart;

            const sourceEnd =
                copyEnd
                - bufferStart;


            result.set(
                buffer.subarray(
                    sourceStart,
                    sourceEnd
                ),
                outputOffset
            );


            outputOffset +=
                sourceEnd
                - sourceStart;
        }


        logicalOffset =
            bufferEnd;
    }


    return result;
}


function byteAt(
    buffers:
    readonly Uint8Array[],

    offset:
    number
): number {

    let logicalOffset =
        0;


    for (
        const buffer
        of buffers
        ) {
        const bufferEnd =
            logicalOffset
            + buffer.length;


        if (
            offset
            < bufferEnd
        ) {
            return buffer[
            offset
            - logicalOffset
                ];
        }


        logicalOffset =
            bufferEnd;
    }


    throw new Error(
        `Byte offset ${offset} is outside buffered data`
    );
}


function totalLength(
    buffers:
    readonly Uint8Array[]
): number {

    let length =
        0;


    for (
        const buffer
        of buffers
        ) {
        length +=
            buffer.length;
    }


    return length;
}


function bytes(
    value:
    string
): Uint8Array {

    return new TextEncoder()
        .encode(
            value
        );
}


describe(
    "length-prefixed records",
    () => {

        const recordLength = (
            buffers:
            readonly Uint8Array[],

            prefixStart:
            number
        ): number =>
            (
                byteAt(
                    buffers,
                    prefixStart
                )
                - "0".charCodeAt(
                    0
                )
            )
            * 10
            + (
                byteAt(
                    buffers,
                    prefixStart + 1
                )
                - "0".charCodeAt(
                    0
                )
            );


        it(
            "yields several length-prefixed records",
            async () => {

                const reader =
                    createLengthPrefixedRecordReader(
                        undefined,
                        testOptions(
                            "03abc02de04wxyz"
                        )
                    );


                const results =
                    await collect(
                        reader({
                            type:
                                "length-prefixed",

                            filename:
                                "test.dat",

                            prefixSize:
                                2,

                            recordLength
                        })
                    );


                expect(
                    recordStrings(
                        results
                    )
                ).toEqual(
                    [
                        "abc",
                        "de",
                        "wxyz"
                    ]
                );
            }
        );


        it(
            "handles a prefix split across physical buffers",
            async () => {

                const reader =
                    createLengthPrefixedRecordReader(
                        undefined,
                        testOptions(
                            "0",
                            "3a",
                            "bc",
                            "0",
                            "2",
                            "de"
                        )
                    );


                const results =
                    await collect(
                        reader({
                            type:
                                "length-prefixed",

                            filename:
                                "test.dat",

                            prefixSize:
                                2,

                            recordLength
                        })
                    );


                expect(
                    recordStrings(
                        results
                    )
                ).toEqual(
                    [
                        "abc",
                        "de"
                    ]
                );
            }
        );


        it(
            "handles a record spanning many physical buffers",
            async () => {

                const reader =
                    createLengthPrefixedRecordReader(
                        undefined,
                        testOptions(
                            "08",
                            "ab",
                            "cd",
                            "ef",
                            "gh"
                        )
                    );


                const results =
                    await collect(
                        reader({
                            type:
                                "length-prefixed",

                            filename:
                                "test.dat",

                            prefixSize:
                                2,

                            recordLength
                        })
                    );


                expect(
                    recordStrings(
                        results
                    )
                ).toEqual(
                    [
                        "abcdefgh"
                    ]
                );
            }
        );


        it(
            "handles prefixes and records across unrelated buffer boundaries",
            async () => {

                const reader =
                    createLengthPrefixedRecordReader(
                        undefined,
                        testOptions(
                            "03a",
                            "bc0",
                            "5de",
                            "fgh",
                            "02",
                            "ij"
                        )
                    );


                const results =
                    await collect(
                        reader({
                            type:
                                "length-prefixed",

                            filename:
                                "test.dat",

                            prefixSize:
                                2,

                            recordLength
                        })
                    );


                expect(
                    recordStrings(
                        results
                    )
                ).toEqual(
                    [
                        "abc",
                        "defgh",
                        "ij"
                    ]
                );
            }
        );


        it(
            "supports zero-length records",
            async () => {

                const reader =
                    createLengthPrefixedRecordReader(
                        undefined,
                        testOptions(
                            "0003abc00"
                        )
                    );


                const results =
                    await collect(
                        reader({
                            type:
                                "length-prefixed",

                            filename:
                                "test.dat",

                            prefixSize:
                                2,

                            recordLength
                        })
                    );


                expect(
                    recordStrings(
                        results
                    )
                ).toEqual(
                    [
                        "",
                        "abc",
                        ""
                    ]
                );
            }
        );


        it(
            "reports an incomplete final prefix",
            async () => {

                const reader =
                    createLengthPrefixedRecordReader(
                        undefined,
                        testOptions(
                            "03abc0"
                        )
                    );


                const results =
                    await collect(
                        reader({
                            type:
                                "length-prefixed",

                            filename:
                                "test.dat",

                            prefixSize:
                                2,

                            recordLength
                        })
                    );


                expect(
                    recordStrings(
                        results
                    )
                ).toEqual(
                    [
                        "abc"
                    ]
                );


                expect(
                    results[
                        1
                        ]
                ).toEqual(
                    [
                        "Incomplete physical record at end of file: "
                        + "1 byte(s) remain but do not form "
                        + "a complete physical record"
                    ]
                );
            }
        );


        it(
            "reports an incomplete final payload",
            async () => {

                const reader =
                    createLengthPrefixedRecordReader(
                        undefined,
                        testOptions(
                            "03abc05xy"
                        )
                    );


                const results =
                    await collect(
                        reader({
                            type:
                                "length-prefixed",

                            filename:
                                "test.dat",

                            prefixSize:
                                2,

                            recordLength
                        })
                    );


                expect(
                    recordStrings(
                        results
                    )
                ).toEqual(
                    [
                        "abc"
                    ]
                );


                expect(
                    results[
                        1
                        ]
                ).toEqual(
                    [
                        "Incomplete physical record at end of file: "
                        + "4 byte(s) remain but do not form "
                        + "a complete physical record"
                    ]
                );
            }
        );


        it(
            "produces no records for an empty file",
            async () => {

                const reader =
                    createLengthPrefixedRecordReader(
                        undefined,
                        testOptions()
                    );


                const results =
                    await collect(
                        reader({
                            type:
                                "length-prefixed",

                            filename:
                                "test.dat",

                            prefixSize:
                                2,

                            recordLength
                        })
                    );


                expect(
                    results
                ).toEqual(
                    []
                );
            }
        );
    }
);
