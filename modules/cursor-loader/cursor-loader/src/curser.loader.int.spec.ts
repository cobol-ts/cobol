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
    type CursorOptions,
    type FileDetails,
    type Parser,
    type ParserMap,
    type PhysicalRecordContent,
    type RecordReaderMap
} from "@cobol-ts/cursor-loader-types";





import {
    createFileCursor
} from "./cursor.loader.file.cursor";
import {createFileBufferPool} from "@cobol-ts/cursor-file";
import {
    createFixedRecordReader,
    createFixedWidthRecordBoundaryDetector, createLineRecordReader, newlineRecordBoundaryDetector
} from "@cobol-ts/cursor-record";


describe(
    "file cursor integration",
    () => {

        let directory:
            string;


        beforeEach(
            async () => {

                directory =
                    await mkdtemp(
                        join(
                            tmpdir(),
                            "cursor-loader-integration-"
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
            "reads LF records spanning one, two and many byte buffers",
            async () => {

                /*
                 * With a four-byte physical buffer:
                 *
                 *     a\n
                 *
                 * fits comfortably within one buffer.
                 *
                 *     abcdef\n
                 *
                 * spans two buffers.
                 *
                 *     abcdefghijklmnop\n
                 *
                 * spans many buffers.
                 *
                 * The final record deliberately has no terminating LF.
                 */
                expect(
                    await readLineFile(
                        [
                            "a",
                            "abcdef",
                            "abcdefghijklmnop",
                            "xyz"
                        ].join(
                            "\n"
                        ),
                        4
                    )
                ).toEqual(
                    [
                        "a",
                        "abcdef",
                        "abcdefghijklmnop",
                        "xyz"
                    ]
                );
            }
        );


        test(
            "reads several LF records sharing physical buffers",
            async () => {

                expect(
                    await readLineFile(
                        "a\nbb\nccc\ndddd\n",
                        8
                    )
                ).toEqual(
                    [
                        "a",
                        "bb",
                        "ccc",
                        "dddd"
                    ]
                );
            }
        );


        test(
            "preserves empty LF records",
            async () => {

                expect(
                    await readLineFile(
                        "\n\none\n\nthree\n",
                        4
                    )
                ).toEqual(
                    [
                        "",
                        "",
                        "one",
                        "",
                        "three"
                    ]
                );
            }
        );


        test(
            "handles LF as the final byte of a physical buffer",
            async () => {

                /*
                 * Four-byte buffers:
                 *
                 *     "abc\n"
                 *     "def\n"
                 */
                expect(
                    await readLineFile(
                        "abc\ndef\n",
                        4
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
            "handles LF as the first byte of a physical buffer",
            async () => {

                /*
                 * Four-byte buffers:
                 *
                 *     "abcd"
                 *     "\nxyz"
                 *     "\n"
                 */
                expect(
                    await readLineFile(
                        "abcd\nxyz\n",
                        4
                    )
                ).toEqual(
                    [
                        "abcd",
                        "xyz"
                    ]
                );
            }
        );


        test(
            "reads CRLF records",
            async () => {

                expect(
                    await readLineFile(
                        "one\r\ntwo\r\nthree\r\n",
                        32
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
            "handles CRLF split across physical buffers",
            async () => {

                /*
                 * Four-byte buffers:
                 *
                 *     "abc\r"
                 *     "\ndef"
                 *     "\r\n"
                 *
                 * The first CRLF is split exactly across the physical
                 * buffer boundary.
                 */
                expect(
                    await readLineFile(
                        "abc\r\ndef\r\n",
                        4
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
            "preserves empty CRLF records",
            async () => {

                expect(
                    await readLineFile(
                        "\r\n\r\none\r\n\r\nthree\r\n",
                        4
                    )
                ).toEqual(
                    [
                        "",
                        "",
                        "one",
                        "",
                        "three"
                    ]
                );
            }
        );


        test(
            "preserves empty CRLF records when CRLF crosses physical buffers",
            async () => {

                /*
                 * One-byte physical buffers deliberately put every CR
                 * and LF into separate Uint8Arrays.
                 */
                expect(
                    await readLineFile(
                        "\r\n\r\nX\r\n",
                        1
                    )
                ).toEqual(
                    [
                        "",
                        "",
                        "X"
                    ]
                );
            }
        );


        test(
            "reads LF records using one-byte physical buffers",
            async () => {

                expect(
                    await readLineFile(
                        "one\ntwo\nthree",
                        1
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
            "reads a long LF record spanning many one-byte physical buffers",
            async () => {

                expect(
                    await readLineFile(
                        "abcdefghijklmnop\nx\n",
                        1
                    )
                ).toEqual(
                    [
                        "abcdefghijklmnop",
                        "x"
                    ]
                );
            }
        );


        test(
            "does not invent an empty LF record after a final terminator",
            async () => {

                expect(
                    await readLineFile(
                        "one\ntwo\n",
                        4
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
            "accepts an unterminated final line",
            async () => {

                expect(
                    await readLineFile(
                        "one\ntwo",
                        4
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
            "yields no line records for an empty file",
            async () => {

                expect(
                    await readLineFile(
                        "",
                        4
                    )
                ).toEqual(
                    []
                );
            }
        );


        test(
            "reads fixed-width records from one physical buffer",
            async () => {

                expect(
                    await readFixedFile(
                        "abcdefghijkl",
                        4,
                        32
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


        test(
            "reads fixed-width records across awkward physical buffer boundaries",
            async () => {

                /*
                 * Record size 5, physical buffer size 4:
                 *
                 *     physical buffers:
                 *
                 *         "abcd"
                 *         "efgh"
                 *         "ijkl"
                 *         "mno"
                 *
                 *     logical records:
                 *
                 *         "abcde"
                 *         "fghij"
                 *         "klmno"
                 *
                 * No record boundary coincides consistently with a physical
                 * buffer boundary.
                 */
                expect(
                    await readFixedFile(
                        "abcdefghijklmno",
                        5,
                        4
                    )
                ).toEqual(
                    [
                        "abcde",
                        "fghij",
                        "klmno"
                    ]
                );
            }
        );


        test(
            "reads fixed-width records larger than a physical buffer",
            async () => {

                expect(
                    await readFixedFile(
                        "abcdefghijklmnopqrst",
                        10,
                        3
                    )
                ).toEqual(
                    [
                        "abcdefghij",
                        "klmnopqrst"
                    ]
                );
            }
        );


        test(
            "reads fixed-width records spanning many physical buffers",
            async () => {

                expect(
                    await readFixedFile(
                        "abcdefghijklmnopqrstuvwx",
                        12,
                        2
                    )
                ).toEqual(
                    [
                        "abcdefghijkl",
                        "mnopqrstuvwx"
                    ]
                );
            }
        );


        test(
            "reads fixed-width records using one-byte physical buffers",
            async () => {

                expect(
                    await readFixedFile(
                        "abcdefghijkl",
                        4,
                        1
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


        test(
            "handles fixed-width EOF exactly at a record boundary",
            async () => {

                expect(
                    await readFixedFile(
                        "abcdefgh",
                        4,
                        3
                    )
                ).toEqual(
                    [
                        "abcd",
                        "efgh"
                    ]
                );
            }
        );


        test(
            "reads a single fixed-width record",
            async () => {

                expect(
                    await readFixedFile(
                        "abcde",
                        5,
                        2
                    )
                ).toEqual(
                    [
                        "abcde"
                    ]
                );
            }
        );


        test(
            "yields no fixed-width records for an empty file",
            async () => {

                expect(
                    await readFixedFile(
                        "",
                        5,
                        3
                    )
                ).toEqual(
                    []
                );
            }
        );


        async function readLineFile(
            contents: string,
            bufferSize: number
        ): Promise<string[]> {

            const filename =
                join(
                    directory,
                    "test-line.txt"
                );


            await writeFile(
                filename,
                contents,
                "utf8"
            );


            const parser:
                Parser<
                    string,
                    undefined
                > = {

                parse(
                    record
                ): string {

                    return decodeRecord(
                        record
                    );
                }
            };


            const parsers = {
                text:
                parser
            } satisfies ParserMap;


            const lineReader =
                createLineRecordReader(
                    newlineRecordBoundaryDetector,
                    createFileBufferPool(
                        bufferSize
                    )
                );


            const recordReaders:
                RecordReaderMap = {

                line:
                lineReader,

                fixed:
                    async function* () {

                        throw new Error(
                            "Fixed reader must not be used"
                        );
                    },

                "length-prefixed":
                    async function* () {

                        throw new Error(
                            "Length-prefixed reader must not be used"
                        );
                    }
            };


            const options:
                CursorOptions<
                    typeof parsers,
                    number
                > = {

                parsers,

                recordReaders,

                compareEntityId: (
                    left,
                    right
                ) =>
                    left - right
            };


            const details:
                FileDetails<
                    typeof parsers,
                    "text",
                    string,
                    number
                > = {

                type:
                    "line",

                filename,

                parser:
                    "text",

                cardinality:
                    "many",

                project:
                    value =>
                        value,

                entityId:
                    value =>
                        value.length
            };


            return readCursor(
                details,
                options
            );
        }


        async function readFixedFile(
            contents: string,
            recordSize: number,
            bufferSize: number
        ): Promise<string[]> {

            const filename =
                join(
                    directory,
                    "test-fixed.dat"
                );


            await writeFile(
                filename,
                contents,
                "utf8"
            );


            const parser:
                Parser<
                    string,
                    undefined
                > = {

                parse(
                    record
                ): string {

                    return decodeRecord(
                        record
                    );
                }
            };


            const parsers = {
                text:
                parser
            } satisfies ParserMap;


            const fixedReader =
                createFixedRecordReader(
                    createFixedWidthRecordBoundaryDetector(
                        recordSize
                    ),
                    createFileBufferPool(
                        bufferSize
                    )
                );


            const recordReaders:
                RecordReaderMap = {

                line:
                    async function* () {

                        throw new Error(
                            "Line reader must not be used"
                        );
                    },

                fixed:
                fixedReader,

                "length-prefixed":
                    async function* () {

                        throw new Error(
                            "Length-prefixed reader must not be used"
                        );
                    }
            };


            const options:
                CursorOptions<
                    typeof parsers,
                    number
                > = {

                parsers,

                recordReaders,

                compareEntityId: (
                    left,
                    right
                ) =>
                    left - right
            };


            const details:
                FileDetails<
                    typeof parsers,
                    "text",
                    string,
                    number
                > = {

                type:
                    "fixed",

                filename,

                recordSize,

                parser:
                    "text",

                cardinality:
                    "many",

                project:
                    value =>
                        value,

                entityId:
                    value =>
                        value.length
            };


            return readCursor(
                details,
                options
            );
        }


        async function readCursor<
            TParsers extends ParserMap
        >(
            details:
            FileDetails<
                TParsers,
                keyof TParsers & string,
                string,
                number
            >,
            options:
            CursorOptions<
                TParsers,
                number
            >
        ): Promise<string[]> {

            const actual:
                string[] =
                [];


            for await (
                const result
                of createFileCursor(
                details,
                options
            )
                ) {
                if (
                    typeof result
                    !== "string"
                ) {
                    throw new Error(
                        `Unexpected integration error: ${
                            result.errors.join(
                                "; "
                            )
                        }`
                    );
                }


                actual.push(
                    result
                );
            }


            return actual;
        }
    }
);


function decodeRecord(
    record: PhysicalRecordContent
): string {

    const result =
        new Uint8Array(
            record.length
        );


    let remaining =
        record.length;

    let sourceOffset =
        record.firstBufferOffset;

    let targetOffset =
        0;


    for (
        const buffer
        of record.buffers
        ) {
        if (
            remaining === 0
        ) {
            break;
        }


        const length =
            Math.min(
                remaining,
                buffer.length
                - sourceOffset
            );


        result.set(
            buffer.subarray(
                sourceOffset,
                sourceOffset
                + length
            ),
            targetOffset
        );


        remaining -=
            length;

        targetOffset +=
            length;

        sourceOffset =
            0;
    }


    if (
        remaining !== 0
    ) {
        throw new Error(
            `Physical record exposes ${
                record.length - remaining
            } bytes but declares length ${
                record.length
            }`
        );
    }


    return new TextDecoder().decode(
        result
    );
}