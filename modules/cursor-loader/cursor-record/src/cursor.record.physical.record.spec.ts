import {
    mkdtemp,
    rm,
    writeFile
} from "node:fs/promises";

import {
    tmpdir
} from "node:os";

import {
    join
} from "node:path";

import {
    type FileLineBufferPool,
    type PhysicalRecordContent,
    type RecordBoundaryDetector
} from "@cobol-ts/cursor-loader-types";



import {
    createLineRecordReader
} from "./cursor.record.physical.record";
import {createFileBufferPool} from "@cobol-ts/cursor-file";


describe(
    "cursor.loader.physical.record",
    () => {

        let directory:
            string;


        beforeEach(
            async () => {

                directory =
                    await mkdtemp(
                        join(
                            tmpdir(),
                            "cursor-loader-record-"
                        )
                    );
            }
        );


        afterEach(
            async () => {

                await rm(
                    directory,
                    {
                        recursive:
                            true,

                        force:
                            true
                    }
                );
            }
        );


        test(
            "reads several records from one buffer",
            async () => {

                const filename =
                    await createFile(
                        "one\ntwo\nthree\n"
                    );


                const reader =
                    createLineRecordReader(
                        newlineDetector,
                        createFileBufferPool(
                            32
                        )
                    );


                expect(
                    await readRecords(
                        reader({
                            type:
                                "line",

                            filename
                        })
                    )
                ).toEqual(
                    [
                        "one",
                        "two",
                        "three"
                    ]
                );
            }
        );


        test(
            "preserves empty records",
            async () => {

                const filename =
                    await createFile(
                        "\n\nx\n"
                    );


                const reader =
                    createLineRecordReader(
                        newlineDetector,
                        createFileBufferPool(
                            32
                        )
                    );


                expect(
                    await readRecords(
                        reader({
                            type:
                                "line",

                            filename
                        })
                    )
                ).toEqual(
                    [
                        "",
                        "",
                        "x"
                    ]
                );
            }
        );


        test(
            "does not create an additional record after a final terminator",
            async () => {

                const filename =
                    await createFile(
                        "one\n"
                    );


                const reader =
                    createLineRecordReader(
                        newlineDetector,
                        createFileBufferPool(
                            4
                        )
                    );


                expect(
                    await readRecords(
                        reader({
                            type:
                                "line",

                            filename
                        })
                    )
                ).toEqual(
                    [
                        "one"
                    ]
                );
            }
        );


        test(
            "accepts an unterminated final record",
            async () => {

                const filename =
                    await createFile(
                        "one\ntwo"
                    );


                const reader =
                    createLineRecordReader(
                        newlineDetector,
                        createFileBufferPool(
                            4
                        )
                    );


                expect(
                    await readRecords(
                        reader({
                            type:
                                "line",

                            filename
                        })
                    )
                ).toEqual(
                    [
                        "one",
                        "two"
                    ]
                );
            }
        );


        test(
            "reads a record spanning several byte buffers",
            async () => {

                const filename =
                    await createFile(
                        "abcdefghij\nx\n"
                    );


                const reader =
                    createLineRecordReader(
                        newlineDetector,
                        createFileBufferPool(
                            4
                        )
                    );


                expect(
                    await readRecords(
                        reader({
                            type:
                                "line",

                            filename
                        })
                    )
                ).toEqual(
                    [
                        "abcdefghij",
                        "x"
                    ]
                );
            }
        );


        test(
            "advances searchStart when a record spans several byte buffers",
            async () => {

                /*
                 * Four-byte physical buffers produce:
                 *
                 *     "abcd"
                 *     "efgh"
                 *     "ij\n"
                 *
                 * After each unsuccessful search the cursor should remember
                 * that all currently buffered bytes have already been
                 * examined.
                 *
                 * The detector should therefore receive:
                 *
                 *     searchStart = 0
                 *     searchStart = 4
                 *     searchStart = 8
                 *
                 * rather than repeatedly rescanning from zero.
                 */
                const filename =
                    await createFile(
                        "abcdefghij\n"
                    );


                const searchStarts:
                    number[] =
                    [];


                const detector:
                    RecordBoundaryDetector = {

                    nextRecordStart(
                        buffers,
                        _recordStart,
                        searchStart
                    ): number {

                        searchStarts.push(
                            searchStart
                        );


                        const lineFeed =
                            findByte(
                                buffers,
                                searchStart,
                                10
                            );


                        return lineFeed === -1
                            ? -1
                            : lineFeed + 1;
                    },


                    recordEnd(
                        _buffers,
                        nextRecordStart
                    ): number {

                        return nextRecordStart
                            - 2;
                    }
                };


                const reader =
                    createLineRecordReader(
                        detector,
                        createFileBufferPool(
                            4
                        )
                    );


                const cursor =
                    reader({
                        type:
                            "line",

                        filename
                    });


                const first =
                    await cursor.next();


                expect(
                    first.done
                ).toBe(
                    false
                );


                expect(
                    searchStarts
                ).toEqual(
                    [
                        0,
                        4,
                        8
                    ]
                );


                await cursor.return(
                    undefined
                );
            }
        );


        test(
            "handles a record terminator at a byte-buffer boundary",
            async () => {

                const filename =
                    await createFile(
                        "abc\ndef\n"
                    );


                const reader =
                    createLineRecordReader(
                        newlineDetector,
                        createFileBufferPool(
                            4
                        )
                    );


                expect(
                    await readRecords(
                        reader({
                            type:
                                "line",

                            filename
                        })
                    )
                ).toEqual(
                    [
                        "abc",
                        "def"
                    ]
                );
            }
        );


        test(
            "removes CR from CRLF records",
            async () => {

                const filename =
                    await createFile(
                        "one\r\ntwo\r\n"
                    );


                const reader =
                    createLineRecordReader(
                        newlineDetector,
                        createFileBufferPool(
                            32
                        )
                    );


                expect(
                    await readRecords(
                        reader({
                            type:
                                "line",

                            filename
                        })
                    )
                ).toEqual(
                    [
                        "one",
                        "two"
                    ]
                );
            }
        );


        test(
            "handles CRLF split across byte buffers",
            async () => {

                /*
                 * Four-byte buffers produce:
                 *
                 *     "abc\r"
                 *     "\ndef"
                 *     "\r\n"
                 *
                 * The detector must treat the CRLF pair as one logical
                 * record terminator even though it spans two buffers.
                 */
                const filename =
                    await createFile(
                        "abc\r\ndef\r\n"
                    );


                const reader =
                    createLineRecordReader(
                        newlineDetector,
                        createFileBufferPool(
                            4
                        )
                    );


                expect(
                    await readRecords(
                        reader({
                            type:
                                "line",

                            filename
                        })
                    )
                ).toEqual(
                    [
                        "abc",
                        "def"
                    ]
                );
            }
        );


        test(
            "handles an empty CRLF record",
            async () => {

                const filename =
                    await createFile(
                        "\r\nx\r\n"
                    );


                const reader =
                    createLineRecordReader(
                        newlineDetector,
                        createFileBufferPool(
                            4
                        )
                    );


                expect(
                    await readRecords(
                        reader({
                            type:
                                "line",

                            filename
                        })
                    )
                ).toEqual(
                    [
                        "",
                        "x"
                    ]
                );
            }
        );


        test(
            "rejects an invalid next record start",
            async () => {

                const filename =
                    await createFile(
                        "abc\n"
                    );


                const detector:
                    RecordBoundaryDetector = {

                    nextRecordStart():
                        number {

                        return 99;
                    },

                    recordEnd():
                        number {

                        throw new Error(
                            "recordEnd must not be called"
                        );
                    }
                };


                const reader =
                    createLineRecordReader(
                        detector,
                        createFileBufferPool(
                            4
                        )
                    );


                const cursor =
                    reader({
                        type:
                            "line",

                        filename
                    });


                await expect(
                    cursor.next()
                ).rejects.toThrow(
                    "RecordBoundaryDetector returned invalid next record start 99"
                );
            }
        );


        test(
            "rejects a next record start which does not advance",
            async () => {

                const filename =
                    await createFile(
                        "abc\n"
                    );


                const detector:
                    RecordBoundaryDetector = {

                    nextRecordStart(
                        _buffers,
                        recordStart,
                        _searchStart
                    ): number {

                        return recordStart;
                    },

                    recordEnd():
                        number {

                        throw new Error(
                            "recordEnd must not be called"
                        );
                    }
                };


                const reader =
                    createLineRecordReader(
                        detector,
                        createFileBufferPool(
                            4
                        )
                    );


                const cursor =
                    reader({
                        type:
                            "line",

                        filename
                    });


                await expect(
                    cursor.next()
                ).rejects.toThrow(
                    "RecordBoundaryDetector returned invalid next record start 0"
                );
            }
        );


        test(
            "rejects an invalid record end",
            async () => {

                const filename =
                    await createFile(
                        "abc\n"
                    );


                const detector:
                    RecordBoundaryDetector = {

                    nextRecordStart():
                        number {

                        return 4;
                    },

                    recordEnd():
                        number {

                        return 4;
                    }
                };


                const reader =
                    createLineRecordReader(
                        detector,
                        createFileBufferPool(
                            4
                        )
                    );


                const cursor =
                    reader({
                        type:
                            "line",

                        filename
                    });


                await expect(
                    cursor.next()
                ).rejects.toThrow(
                    "RecordBoundaryDetector returned invalid record end 4"
                );
            }
        );


        test(
            "allows record end immediately before record start for an empty record",
            async () => {

                const filename =
                    await createFile(
                        "\n"
                    );


                const reader =
                    createLineRecordReader(
                        newlineDetector,
                        createFileBufferPool(
                            4
                        )
                    );


                expect(
                    await readRecords(
                        reader({
                            type:
                                "line",

                            filename
                        })
                    )
                ).toEqual(
                    [
                        ""
                    ]
                );
            }
        );


        test(
            "returns retained buffers to the pool when closed early",
            async () => {

                const filename =
                    await createFile(
                        "one\ntwo\nthree\n"
                    );


                const underlyingPool =
                    createFileBufferPool(
                        4
                    );


                let acquired =
                    0;

                let released =
                    0;


                const trackingPool:
                    FileLineBufferPool = {

                    acquire():
                        Uint8Array {

                        acquired++;

                        return underlyingPool.acquire();
                    },

                    release(
                        buffer: Uint8Array
                    ): void {

                        released++;

                        underlyingPool.release(
                            buffer
                        );
                    }
                };


                const reader =
                    createLineRecordReader(
                        newlineDetector,
                        trackingPool
                    );


                const cursor =
                    reader({
                        type:
                            "line",

                        filename
                    });


                const first =
                    await cursor.next();


                expect(
                    first.done
                ).toBe(
                    false
                );


                await cursor.return(
                    undefined
                );


                expect(
                    released
                ).toBe(
                    acquired
                );
            }
        );


        test(
            "releases fully consumed buffers while retaining a shared buffer",
            async () => {

                const filename =
                    await createFile(
                        "abcdef\nx\n"
                    );


                const underlyingPool =
                    createFileBufferPool(
                        4
                    );


                const released:
                    ArrayBufferLike[] =
                    [];


                const trackingPool:
                    FileLineBufferPool = {

                    acquire():
                        Uint8Array {

                        return underlyingPool.acquire();
                    },

                    release(
                        buffer: Uint8Array
                    ): void {

                        released.push(
                            buffer.buffer
                        );


                        underlyingPool.release(
                            buffer
                        );
                    }
                };


                const reader =
                    createLineRecordReader(
                        newlineDetector,
                        trackingPool
                    );


                const cursor =
                    reader({
                        type:
                            "line",

                        filename
                    });


                const firstResult =
                    await cursor.next();


                if (
                    firstResult.done
                    === true
                ) {
                    throw new Error(
                        "Expected first physical record"
                    );
                }


                if (
                    !(
                        "buffers"
                        in firstResult.value
                    )
                ) {
                    throw new Error(
                        "Expected physical record content"
                    );
                }


                const firstRecord =
                    firstResult.value;


                expect(
                    decodeRecord(
                        firstRecord
                    )
                ).toBe(
                    "abcdef"
                );


                /*
                 * The first record spans:
                 *
                 *     "abcd"
                 *     "ef\nx"
                 *
                 * No buffer can be released while the record is current.
                 */
                expect(
                    released
                ).toHaveLength(
                    0
                );


                const secondResult =
                    await cursor.next();


                /*
                 * Advancing beyond the first record permits "abcd" to be
                 * released, but "ef\nx" must remain because it also
                 * contains the next record.
                 */
                expect(
                    released
                ).toHaveLength(
                    1
                );


                if (
                    secondResult.done
                    === true
                ) {
                    throw new Error(
                        "Expected second physical record"
                    );
                }


                if (
                    !(
                        "buffers"
                        in secondResult.value
                    )
                ) {
                    throw new Error(
                        "Expected physical record content"
                    );
                }


                expect(
                    decodeRecord(
                        secondResult.value
                    )
                ).toBe(
                    "x"
                );


                await cursor.return(
                    undefined
                );
            }
        );


        test(
            "yields no records for an empty file",
            async () => {

                const filename =
                    await createFile(
                        ""
                    );


                const reader =
                    createLineRecordReader(
                        newlineDetector,
                        createFileBufferPool(
                            4
                        )
                    );


                expect(
                    await readRecords(
                        reader({
                            type:
                                "line",

                            filename
                        })
                    )
                ).toEqual(
                    []
                );
            }
        );


        async function createFile(
            contents: string
        ): Promise<string> {

            const filename =
                join(
                    directory,
                    "test.dat"
                );


            await writeFile(
                filename,
                Buffer.from(
                    contents,
                    "utf8"
                )
            );


            return filename;
        }
    }
);


/*
 * Line-oriented boundary detector used by these tests.
 *
 * nextRecordStart finds LF and returns the first logical byte after it.
 *
 * recordStart identifies the beginning of the current record.
 *
 * searchStart identifies the first byte which has not already been
 * examined for LF. This allows the physical record cursor to retain all
 * buffers belonging to a long record without repeatedly searching their
 * contents.
 *
 * recordEnd converts the known next-record boundary into the inclusive end
 * of the record data:
 *
 *     abc\n       -> 2
 *     abc\r\n     -> 2
 *
 * This deliberately works in logical offsets across all supplied buffers,
 * so CRLF may span a physical buffer boundary.
 */
const newlineDetector:
    RecordBoundaryDetector = {

    nextRecordStart(
        buffers,
        _recordStart,
        searchStart
    ): number {

        const lineFeed =
            findByte(
                buffers,
                searchStart,
                10
            );


        return lineFeed === -1
            ? -1
            : lineFeed + 1;
    },


    recordEnd(
        buffers,
        nextRecordStart
    ): number {

        const lineFeed =
            nextRecordStart - 1;


        if (
            byteAt(
                buffers,
                lineFeed
            ) !== 10
        ) {
            throw new Error(
                "Expected LF immediately before next record start"
            );
        }


        const possibleCarriageReturn =
            lineFeed - 1;


        if (
            possibleCarriageReturn >= 0
            && byteAt(
                buffers,
                possibleCarriageReturn
            ) === 13
        ) {
            return possibleCarriageReturn
                - 1;
        }


        return lineFeed
            - 1;
    }
};


function findByte(
    buffers: readonly Uint8Array[],
    startByte: number,
    wanted: number
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
            startByte
            >= bufferEnd
        ) {
            logicalOffset =
                bufferEnd;

            continue;
        }


        const offset =
            Math.max(
                0,
                startByte
                - logicalOffset
            );


        const found =
            buffer.indexOf(
                wanted,
                offset
            );


        if (
            found !== -1
        ) {
            return logicalOffset
                + found;
        }


        logicalOffset =
            bufferEnd;
    }


    return -1;
}


function byteAt(
    buffers: readonly Uint8Array[],
    offset: number
): number {

    let remaining =
        offset;


    for (
        const buffer
        of buffers
        ) {
        if (
            remaining
            < buffer.length
        ) {
            return buffer[
                remaining
                ];
        }


        remaining -=
            buffer.length;
    }


    throw new Error(
        `Cannot read logical byte ${offset}: `
        + "the offset is outside the buffered content"
    );
}


/*
 * PhysicalRecordContent is cursor-owned and becomes invalid when the
 * cursor advances, so each record is copied while it is current.
 */
async function readRecords(
    cursor:
    AsyncGenerator<
        PhysicalRecordContent | readonly string[],
        void,
        unknown
    >
): Promise<string[]> {

    const records:
        string[] =
        [];


    for await (
        const result
        of cursor
        ) {
        if (
            !(
                "buffers"
                in result
            )
        ) {
            throw new Error(
                `Unexpected physical record error: ${
                    result.join(
                        "; "
                    )
                }`
            );
        }


        records.push(
            decodeRecord(
                result
            )
        );
    }


    return records;
}


function decodeRecord(
    record: PhysicalRecordContent
): string {

    return new TextDecoder().decode(
        copyRecord(
            record
        )
    );
}


function copyRecord(
    record: PhysicalRecordContent
): Uint8Array {

    const result =
        new Uint8Array(
            record.length
        );


    let remaining =
        record.length;

    let targetOffset =
        0;

    let sourceOffset =
        record.firstBufferOffset;


    for (
        const buffer
        of record.buffers
        ) {
        if (
            remaining === 0
        ) {
            break;
        }


        const available =
            buffer.length
            - sourceOffset;


        const length =
            Math.min(
                available,
                remaining
            );


        result.set(
            buffer.subarray(
                sourceOffset,
                sourceOffset
                + length
            ),
            targetOffset
        );


        targetOffset +=
            length;

        remaining -=
            length;

        sourceOffset =
            0;
    }


    if (
        remaining !== 0
    ) {
        throw new Error(
            `PhysicalRecordContent exposes ${
                record.length - remaining
            } bytes but declares length ${
                record.length
            }`
        );
    }


    return result;
}