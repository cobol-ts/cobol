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
    isErrors
} from "@cobol-ts/errors";

import {
    type CursorOptions,
    type FileDetails,
    type Parser,
    type ParserMap,
    type PhysicalRecordContent,
    type RecordReaderMap
} from "@cobol-ts/cursor-loader-types";

import {
    createFileBufferPool,
    createFileCursor,
    createFixedRecordReader,
    createLineRecordReader
} from "@cobol-ts/cursor-loader";


describe(
    "fixed-width file integration",
    () => {

        let directory:
            string;


        beforeEach(
            async () => {

                directory =
                    await mkdtemp(
                        join(
                            tmpdir(),
                            "cursor-loader-fixed-integration-"
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
            "reads several fixed-width records",
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
                 * Logical records are five bytes:
                 *
                 *     abcde
                 *     fghij
                 *     klmno
                 *
                 * Physical buffers are four bytes:
                 *
                 *     abcd
                 *     efgh
                 *     ijkl
                 *     mno
                 *
                 * Record and buffer boundaries therefore deliberately do
                 * not coincide.
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
            "reads records larger than the physical buffer",
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
            "reads records spanning many physical buffers",
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
            "handles EOF exactly at a fixed-width record boundary",
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
            "yields no records for an empty fixed-width file",
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


        test(
            "reports an incomplete final fixed-width record",
            async () => {

                const filename =
                    await createFile(
                        "abcdefghXY"
                    );


                const {
                    details,
                    options
                } =
                    createConfiguration(
                        filename,
                        4,
                        3
                    );


                const results =
                    [];


                for await (
                    const result
                    of createFileCursor(
                    details,
                    options
                )
                    ) {
                    results.push(
                        result
                    );
                }


                expect(
                    results
                ).toHaveLength(
                    3
                );


                expect(
                    results[
                        0
                        ]
                ).toBe(
                    "abcd"
                );

                expect(
                    results[
                        1
                        ]
                ).toBe(
                    "efgh"
                );


                const incomplete =
                    results[
                        2
                        ];


                if (
                    !isErrors(
                        incomplete
                    )
                ) {
                    throw new Error(
                        "expected incomplete fixed-width record to produce Errors"
                    );
                }


                expect(
                    incomplete.errors
                ).toHaveLength(
                    1
                );

                expect(
                    incomplete.errors[
                        0
                        ]
                ).toContain(
                    "Incomplete physical record at end of file"
                );

                expect(
                    incomplete.errors[
                        0
                        ]
                ).toContain(
                    "2 byte(s) remain"
                );
            }
        );


        async function readFixedFile(
            contents: string,
            recordSize: number,
            bufferSize: number
        ): Promise<string[]> {

            const filename =
                await createFile(
                    contents
                );


            const {
                details,
                options
            } =
                createConfiguration(
                    filename,
                    recordSize,
                    bufferSize
                );


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
                    isErrors(
                        result
                    )
                ) {
                    throw new Error(
                        result.errors.join(
                            "; "
                        )
                    );
                }


                actual.push(
                    result
                );
            }


            return actual;
        }


        async function createFile(
            contents: string
        ): Promise<string> {

            const filename =
                join(
                    directory,
                    "fixed.dat"
                );


            await writeFile(
                filename,
                contents,
                "utf8"
            );


            return filename;
        }


        function createConfiguration(
            filename: string,
            recordSize: number,
            bufferSize: number
        ) {

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


            const recordReaders:
                RecordReaderMap = {

                line:
                    createLineRecordReader(),

                fixed:
                    createFixedRecordReader(
                        undefined,
                        createFileBufferPool(
                            bufferSize
                        )
                    ),

                "length-prefixed":
                    async function* () {

                        throw new Error(
                            "length-prefixed reader should not be used"
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


            return {
                details,
                options
            };
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