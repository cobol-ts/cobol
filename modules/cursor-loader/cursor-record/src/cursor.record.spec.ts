import {
    type Parser,
    type ParserPhysicalRecordContent,
    type RecordCursorResult
} from "@cobol-ts/cursor-loader-types";

import {
    createDefaultPhysicalRecordConfig
} from "./physical.record";

import {
    createRecordCursor
} from "./cursor.record";


interface TestRepresentation {

    readonly recordNumber:
        number;
}


interface TestParserConfig {

    readonly unused:
        boolean;
}


interface TestParserDetails {

    readonly name:
        string;
}


interface TestRecordState {

    value:
        number;
}


interface TestFile {

    readonly name:
        string;
}


const BUFFER_SIZE =
    8;

const SOURCE =
    "test-source";


describe(
    "createRecordCursor",
    () => {

        test(
            "the first physical record starts with no available bytes",
            async () => {

                const parser =
                    createParser(
                        async (
                            record
                        ) => {

                            expect(
                                record.startByte
                            ).toBe(
                                0
                            );


                            expect(
                                record.endByte
                            ).toBe(
                                0
                            );


                            expect(
                                record.lastValidByte
                            ).toBe(
                                0
                            );


                            expect(
                                record.fileFinished
                            ).toBe(
                                false
                            );


                            await record.readMore();


                            expect(
                                record.lastValidByte
                            ).toBe(
                                BUFFER_SIZE
                            );


                            expect(
                                record.fileFinished
                            ).toBe(
                                false
                            );


                            record.endByte =
                                3;


                            return {
                                recordNumber:
                                    1
                            };
                        }
                    );


                const iterator =
                    createRecordCursor(
                        parser,
                        createDetails(),
                        createTestConfig(
                            BUFFER_SIZE
                        )
                    );


                const first =
                    await nextRecord(
                        iterator
                    );


                expect(
                    first.physicalRecord.startByte
                ).toBe(
                    0
                );


                expect(
                    first.physicalRecord.endByte
                ).toBe(
                    3
                );


                expect(
                    first.physicalRecord.lastValidByte
                ).toBe(
                    BUFFER_SIZE
                );


                expect(
                    first.physicalRecord.source
                ).toBe(
                    SOURCE
                );


                expect(
                    first.physicalRecord.recordNumber
                ).toBe(
                    1
                );


                first.physicalRecord.close();


                await iterator.return();
            }
        );


        test(
            "records source and one-based physical record numbers",
            async () => {

                let parseCount =
                    0;


                const parser =
                    createParser(
                        async (
                            record
                        ) => {

                            parseCount++;


                            if (
                                parseCount === 1
                            ) {
                                await record.readMore();


                                record.endByte =
                                    2;


                                return {
                                    recordNumber:
                                        101
                                };
                            }


                            if (
                                parseCount === 2
                            ) {
                                record.endByte =
                                    4;


                                return {
                                    recordNumber:
                                        102
                                };
                            }


                            record.endByte =
                                6;


                            return {
                                recordNumber:
                                    103
                            };
                        }
                    );


                const iterator =
                    createRecordCursor(
                        parser,
                        createDetails(),
                        createTestConfig(
                            6
                        )
                    );


                const first =
                    await nextRecord(
                        iterator
                    );

                const second =
                    await nextRecord(
                        iterator
                    );

                const third =
                    await nextRecord(
                        iterator
                    );


                expect(
                    first.physicalRecord.source
                ).toBe(
                    SOURCE
                );

                expect(
                    second.physicalRecord.source
                ).toBe(
                    SOURCE
                );

                expect(
                    third.physicalRecord.source
                ).toBe(
                    SOURCE
                );


                expect(
                    first.physicalRecord.recordNumber
                ).toBe(
                    1
                );

                expect(
                    second.physicalRecord.recordNumber
                ).toBe(
                    2
                );

                expect(
                    third.physicalRecord.recordNumber
                ).toBe(
                    3
                );


                /*
                 * Physical provenance is independent of the representation
                 * returned by the parser.
                 */
                expect(
                    first.result
                ).toEqual({
                    recordNumber:
                        101
                });

                expect(
                    second.result
                ).toEqual({
                    recordNumber:
                        102
                });

                expect(
                    third.result
                ).toEqual({
                    recordNumber:
                        103
                });


                first.physicalRecord.close();

                second.physicalRecord.close();

                third.physicalRecord.close();


                await expectFinished(
                    iterator
                );
            }
        );


        test(
            "returns the physical record together with the parser result",
            async () => {

                let parserRecord:
                    ParserPhysicalRecordContent<
                        TestRecordState
                    >
                    | undefined;


                const parser =
                    createParser(
                        async (
                            record
                        ) => {

                            parserRecord =
                                record;


                            await record.readMore();


                            record.endByte =
                                2;


                            return {
                                recordNumber:
                                    17
                            };
                        }
                    );


                const iterator =
                    createRecordCursor(
                        parser,
                        createDetails(),
                        createTestConfig(
                            BUFFER_SIZE
                        )
                    );


                const first =
                    await nextRecord(
                        iterator
                    );


                expect(
                    first.result
                ).toEqual({
                    recordNumber:
                        17
                });


                expect(
                    first.physicalRecord
                ).toBe(
                    parserRecord
                );


                first.physicalRecord.close();


                await iterator.return();
            }
        );


        test(
            "does not close a physical record when yielding it",
            async () => {

                const parser =
                    createParser(
                        async (
                            record
                        ) => {

                            await record.readMore();


                            record.endByte =
                                3;


                            return {
                                recordNumber:
                                    1
                            };
                        }
                    );


                const config =
                    createTestConfig(
                        BUFFER_SIZE
                    );


                const release =
                    jest.spyOn(
                        config.physicalContentPool,
                        "release"
                    );


                const iterator =
                    createRecordCursor(
                        parser,
                        createDetails(),
                        config
                    );


                const first =
                    await nextRecord(
                        iterator
                    );


                expect(
                    release
                ).not.toHaveBeenCalled();


                first.physicalRecord.close();


                expect(
                    release
                ).toHaveBeenCalledTimes(
                    1
                );


                expect(
                    release
                ).toHaveBeenCalledWith(
                    first.physicalRecord
                );


                await iterator.return();
            }
        );


        test(
            "readMore advances lastValidByte",
            async () => {

                const parser =
                    createParser(
                        async (
                            record
                        ) => {

                            expect(
                                record.lastValidByte
                            ).toBe(
                                0
                            );


                            await record.readMore();


                            expect(
                                record.lastValidByte
                            ).toBe(
                                BUFFER_SIZE
                            );


                            await record.readMore();


                            expect(
                                record.lastValidByte
                            ).toBe(
                                BUFFER_SIZE
                                * 2
                            );


                            record.endByte =
                                BUFFER_SIZE
                                + 3;


                            return {
                                recordNumber:
                                    1
                            };
                        }
                    );


                const iterator =
                    createRecordCursor(
                        parser,
                        createDetails(),
                        createTestConfig(
                            BUFFER_SIZE,
                            BUFFER_SIZE
                        )
                    );


                const first =
                    await nextRecord(
                        iterator
                    );


                expect(
                    first.physicalRecord.endByte
                ).toBe(
                    BUFFER_SIZE
                    + 3
                );


                expect(
                    first.physicalRecord.lastValidByte
                ).toBe(
                    BUFFER_SIZE
                    * 2
                );


                first.physicalRecord.close();


                await iterator.return();
            }
        );


        test(
            "readMore sets fileFinished on a partial final read",
            async () => {

                const parser =
                    createParser(
                        async (
                            record
                        ) => {

                            await record.readMore();


                            expect(
                                record.lastValidByte
                            ).toBe(
                                5
                            );


                            expect(
                                record.fileFinished
                            ).toBe(
                                true
                            );


                            record.endByte =
                                5;


                            return {
                                recordNumber:
                                    1
                            };
                        }
                    );


                const iterator =
                    createRecordCursor(
                        parser,
                        createDetails(),
                        createTestConfig(
                            5
                        )
                    );


                const first =
                    await nextRecord(
                        iterator
                    );


                expect(
                    first.physicalRecord.fileFinished
                ).toBe(
                    true
                );


                first.physicalRecord.close();


                await expectFinished(
                    iterator
                );
            }
        );


        test(
            "EOF may be known before the current record reaches EOF",
            async () => {

                let parseCount =
                    0;


                const parser =
                    createParser(
                        async (
                            record
                        ) => {

                            parseCount++;


                            if (
                                parseCount === 1
                            ) {
                                await record.readMore();


                                expect(
                                    record.lastValidByte
                                ).toBe(
                                    6
                                );


                                expect(
                                    record.fileFinished
                                ).toBe(
                                    true
                                );


                                /*
                                 * First record ends at byte 2.
                                 *
                                 * EOF is already known at byte 6, so bytes
                                 * 2..5 belong to later records.
                                 */
                                record.endByte =
                                    2;


                                return {
                                    recordNumber:
                                        1
                                };
                            }


                            expect(
                                record.startByte
                            ).toBe(
                                2
                            );


                            expect(
                                record.lastValidByte
                            ).toBe(
                                6
                            );


                            expect(
                                record.fileFinished
                            ).toBe(
                                true
                            );


                            record.endByte =
                                6;


                            return {
                                recordNumber:
                                    2
                            };
                        }
                    );


                const iterator =
                    createRecordCursor(
                        parser,
                        createDetails(),
                        createTestConfig(
                            6
                        )
                    );


                const first =
                    await nextRecord(
                        iterator
                    );


                const second =
                    await nextRecord(
                        iterator
                    );


                expect(
                    first.physicalRecord.buffers[
                        0
                        ]
                ).toBe(
                    second.physicalRecord.buffers[
                        0
                        ]
                );


                first.physicalRecord.close();

                second.physicalRecord.close();


                await expectFinished(
                    iterator
                );
            }
        );


        test(
            "passes the final byte buffer of one physical record into the next",
            async () => {

                let parseCount =
                    0;

                let firstLastBuffer:
                    Uint8Array | undefined;


                const parser =
                    createParser(
                        async (
                            record
                        ) => {

                            parseCount++;


                            if (
                                parseCount === 1
                            ) {
                                await record.readMore();


                                firstLastBuffer =
                                    record.buffers[
                                        0
                                        ];


                                record.endByte =
                                    3;


                                return {
                                    recordNumber:
                                        1
                                };
                            }


                            expect(
                                record.buffers
                            ).toHaveLength(
                                1
                            );


                            expect(
                                record.buffers[
                                    0
                                    ]
                            ).toBe(
                                firstLastBuffer
                            );


                            expect(
                                record.startByte
                            ).toBe(
                                3
                            );


                            expect(
                                record.lastValidByte
                            ).toBe(
                                BUFFER_SIZE
                            );


                            record.endByte =
                                5;


                            return {
                                recordNumber:
                                    2
                            };
                        }
                    );


                const iterator =
                    createRecordCursor(
                        parser,
                        createDetails(),
                        createTestConfig(
                            BUFFER_SIZE
                        )
                    );


                const first =
                    await nextRecord(
                        iterator
                    );


                first.physicalRecord.close();


                const second =
                    await nextRecord(
                        iterator
                    );


                second.physicalRecord.close();


                await iterator.return();
            }
        );


        test(
            "carries only the final byte buffer when a physical record spans several buffers",
            async () => {

                let parseCount =
                    0;

                let firstBuffer:
                    Uint8Array | undefined;

                let middleBuffer:
                    Uint8Array | undefined;

                let finalBuffer:
                    Uint8Array | undefined;


                const parser =
                    createParser(
                        async (
                            record
                        ) => {

                            parseCount++;


                            if (
                                parseCount === 1
                            ) {
                                await record.readMore();

                                await record.readMore();

                                await record.readMore();


                                firstBuffer =
                                    record.buffers[
                                        0
                                        ];

                                middleBuffer =
                                    record.buffers[
                                        1
                                        ];

                                finalBuffer =
                                    record.buffers[
                                        2
                                        ];


                                expect(
                                    record.lastValidByte
                                ).toBe(
                                    BUFFER_SIZE
                                    * 3
                                );


                                /*
                                 * Record ends three bytes into B2.
                                 */
                                record.endByte =
                                    (
                                        BUFFER_SIZE
                                        * 2
                                    )
                                    + 3;


                                return {
                                    recordNumber:
                                        1
                                };
                            }


                            expect(
                                record.buffers
                            ).toHaveLength(
                                1
                            );


                            expect(
                                record.buffers[
                                    0
                                    ]
                            ).toBe(
                                finalBuffer
                            );


                            expect(
                                record.buffers[
                                    0
                                    ]
                            ).not.toBe(
                                firstBuffer
                            );


                            expect(
                                record.buffers[
                                    0
                                    ]
                            ).not.toBe(
                                middleBuffer
                            );


                            expect(
                                record.startByte
                            ).toBe(
                                3
                            );


                            expect(
                                record.lastValidByte
                            ).toBe(
                                BUFFER_SIZE
                            );


                            record.endByte =
                                4;


                            return {
                                recordNumber:
                                    2
                            };
                        }
                    );


                const iterator =
                    createRecordCursor(
                        parser,
                        createDetails(),
                        createTestConfig(
                            BUFFER_SIZE,
                            BUFFER_SIZE,
                            BUFFER_SIZE
                        )
                    );


                const first =
                    await nextRecord(
                        iterator
                    );


                expect(
                    first.physicalRecord.buffers
                ).toHaveLength(
                    3
                );


                first.physicalRecord.close();


                const second =
                    await nextRecord(
                        iterator
                    );


                second.physicalRecord.close();


                await iterator.return();
            }
        );


        test(
            "handles a record which starts part way through one buffer and ends in a later buffer",
            async () => {

                let parseCount =
                    0;


                const parser =
                    createParser(
                        async (
                            record
                        ) => {

                            parseCount++;


                            if (
                                parseCount === 1
                            ) {
                                await record.readMore();


                                /*
                                 * First record consumes five bytes of B0.
                                 */
                                record.endByte =
                                    5;


                                return {
                                    recordNumber:
                                        1
                                };
                            }


                            if (
                                parseCount === 2
                            ) {
                                expect(
                                    record.startByte
                                ).toBe(
                                    5
                                );


                                expect(
                                    record.lastValidByte
                                ).toBe(
                                    BUFFER_SIZE
                                );


                                await record.readMore();


                                expect(
                                    record.buffers
                                ).toHaveLength(
                                    2
                                );


                                expect(
                                    record.lastValidByte
                                ).toBe(
                                    BUFFER_SIZE
                                    * 2
                                );


                                /*
                                 * Three bytes remain in B0.
                                 * Four bytes consumed from B1.
                                 *
                                 * Logical end = 12.
                                 */
                                record.endByte =
                                    BUFFER_SIZE
                                    + 4;


                                return {
                                    recordNumber:
                                        2
                                };
                            }


                            expect(
                                record.startByte
                            ).toBe(
                                4
                            );


                            expect(
                                record.lastValidByte
                            ).toBe(
                                BUFFER_SIZE
                            );


                            record.endByte =
                                5;


                            return {
                                recordNumber:
                                    3
                            };
                        }
                    );


                const iterator =
                    createRecordCursor(
                        parser,
                        createDetails(),
                        createTestConfig(
                            BUFFER_SIZE,
                            BUFFER_SIZE
                        )
                    );


                const first =
                    await nextRecord(
                        iterator
                    );

                first.physicalRecord.close();


                const second =
                    await nextRecord(
                        iterator
                    );

                second.physicalRecord.close();


                const third =
                    await nextRecord(
                        iterator
                    );


                third.physicalRecord.close();


                await iterator.return();
            }
        );


        test(
            "supports a very long physical record spanning many byte buffers",
            async () => {

                let parseCount =
                    0;

                let finalBuffer:
                    Uint8Array | undefined;


                const parser =
                    createParser(
                        async (
                            record
                        ) => {

                            parseCount++;


                            if (
                                parseCount === 1
                            ) {
                                for (
                                    let index =
                                        0;

                                    index < 10;

                                    index++
                                ) {
                                    await record.readMore();
                                }


                                expect(
                                    record.buffers
                                ).toHaveLength(
                                    10
                                );


                                expect(
                                    record.lastValidByte
                                ).toBe(
                                    BUFFER_SIZE
                                    * 10
                                );


                                finalBuffer =
                                    record.buffers[
                                        9
                                        ];


                                /*
                                 * Record ends two bytes into B9.
                                 */
                                record.endByte =
                                    (
                                        BUFFER_SIZE
                                        * 9
                                    )
                                    + 2;


                                return {
                                    recordNumber:
                                        1
                                };
                            }


                            expect(
                                record.buffers
                            ).toHaveLength(
                                1
                            );


                            expect(
                                record.buffers[
                                    0
                                    ]
                            ).toBe(
                                finalBuffer
                            );


                            expect(
                                record.startByte
                            ).toBe(
                                2
                            );


                            expect(
                                record.lastValidByte
                            ).toBe(
                                BUFFER_SIZE
                            );


                            record.endByte =
                                3;


                            return {
                                recordNumber:
                                    2
                            };
                        }
                    );


                const iterator =
                    createRecordCursor(
                        parser,
                        createDetails(),
                        createTestConfig(
                            BUFFER_SIZE,
                            BUFFER_SIZE,
                            BUFFER_SIZE,
                            BUFFER_SIZE,
                            BUFFER_SIZE,
                            BUFFER_SIZE,
                            BUFFER_SIZE,
                            BUFFER_SIZE,
                            BUFFER_SIZE,
                            BUFFER_SIZE
                        )
                    );


                const first =
                    await nextRecord(
                        iterator
                    );

                first.physicalRecord.close();


                const second =
                    await nextRecord(
                        iterator
                    );

                second.physicalRecord.close();


                await iterator.return();
            }
        );


        test(
            "passes the final buffer when the physical record stops exactly at its end",
            async () => {

                let parseCount =
                    0;

                let finalBuffer:
                    Uint8Array | undefined;


                const parser =
                    createParser(
                        async (
                            record
                        ) => {

                            parseCount++;


                            if (
                                parseCount === 1
                            ) {
                                await record.readMore();

                                await record.readMore();


                                finalBuffer =
                                    record.buffers[
                                        1
                                        ];


                                record.endByte =
                                    BUFFER_SIZE
                                    * 2;


                                return {
                                    recordNumber:
                                        1
                                };
                            }


                            expect(
                                record.buffers[
                                    0
                                    ]
                            ).toBe(
                                finalBuffer
                            );


                            expect(
                                record.startByte
                            ).toBe(
                                BUFFER_SIZE
                            );


                            expect(
                                record.lastValidByte
                            ).toBe(
                                BUFFER_SIZE
                            );


                            await record.readMore();


                            expect(
                                record.lastValidByte
                            ).toBe(
                                BUFFER_SIZE
                                + 3
                            );


                            expect(
                                record.fileFinished
                            ).toBe(
                                true
                            );


                            record.endByte =
                                BUFFER_SIZE
                                + 3;


                            return {
                                recordNumber:
                                    2
                            };
                        }
                    );


                const iterator =
                    createRecordCursor(
                        parser,
                        createDetails(),
                        createTestConfig(
                            BUFFER_SIZE,
                            BUFFER_SIZE,
                            3
                        )
                    );


                const first =
                    await nextRecord(
                        iterator
                    );

                first.physicalRecord.close();


                const second =
                    await nextRecord(
                        iterator
                    );

                second.physicalRecord.close();


                await expectFinished(
                    iterator
                );
            }
        );


        test(
            "takes an additional reference to the final byte buffer before yielding",
            async () => {

                const parser =
                    createParser(
                        async (
                            record
                        ) => {

                            await record.readMore();


                            record.endByte =
                                3;


                            return {
                                recordNumber:
                                    1
                            };
                        }
                    );


                const config =
                    createTestConfig(
                        BUFFER_SIZE
                    );


                const reuse =
                    jest.spyOn(
                        config.byteBufferPool,
                        "reuse"
                    );


                const iterator =
                    createRecordCursor(
                        parser,
                        createDetails(),
                        config
                    );


                const first =
                    await nextRecord(
                        iterator
                    );


                const finalBuffer =
                    first.physicalRecord.buffers[
                        0
                        ];


                expect(
                    reuse
                ).toHaveBeenCalledTimes(
                    1
                );


                expect(
                    reuse
                ).toHaveBeenCalledWith(
                    finalBuffer
                );


                await iterator.return();


                first.physicalRecord.close();
            }
        );


        test(
            "releases the cursor-owned carry reference when iteration is abandoned",
            async () => {

                const parser =
                    createParser(
                        async (
                            record
                        ) => {

                            await record.readMore();


                            record.endByte =
                                3;


                            return {
                                recordNumber:
                                    1
                            };
                        }
                    );


                const config =
                    createTestConfig(
                        BUFFER_SIZE
                    );


                const release =
                    jest.spyOn(
                        config.byteBufferPool,
                        "release"
                    );


                const iterator =
                    createRecordCursor(
                        parser,
                        createDetails(),
                        config
                    );


                const first =
                    await nextRecord(
                        iterator
                    );


                const finalBuffer =
                    first.physicalRecord.buffers[
                        0
                        ];


                expect(
                    release
                ).not.toHaveBeenCalled();


                await iterator.return();


                expect(
                    release
                ).toHaveBeenCalledTimes(
                    1
                );


                expect(
                    release
                ).toHaveBeenCalledWith(
                    finalBuffer
                );


                first.physicalRecord.close();


                expect(
                    release
                ).toHaveBeenCalledTimes(
                    2
                );
            }
        );


        test(
            "does not retain a carry reference for the final physical record",
            async () => {

                const parser =
                    createParser(
                        async (
                            record
                        ) => {

                            await record.readMore();


                            expect(
                                record.fileFinished
                            ).toBe(
                                true
                            );


                            record.endByte =
                                record.lastValidByte;


                            return {
                                recordNumber:
                                    1
                            };
                        }
                    );


                const config =
                    createTestConfig(
                        4
                    );


                const reuse =
                    jest.spyOn(
                        config.byteBufferPool,
                        "reuse"
                    );


                const iterator =
                    createRecordCursor(
                        parser,
                        createDetails(),
                        config
                    );


                const first =
                    await nextRecord(
                        iterator
                    );


                expect(
                    reuse
                ).not.toHaveBeenCalled();


                first.physicalRecord.close();


                await expectFinished(
                    iterator
                );
            }
        );


        test(
            "allows the previous physical record to remain open while parsing the next",
            async () => {

                let parseCount =
                    0;

                let sharedBuffer:
                    Uint8Array | undefined;


                const parser =
                    createParser(
                        async (
                            record
                        ) => {

                            parseCount++;


                            if (
                                parseCount === 1
                            ) {
                                await record.readMore();


                                sharedBuffer =
                                    record.buffers[
                                        0
                                        ];


                                record.endByte =
                                    3;


                                return {
                                    recordNumber:
                                        1
                                };
                            }


                            expect(
                                record.buffers[
                                    0
                                    ]
                            ).toBe(
                                sharedBuffer
                            );


                            expect(
                                record.startByte
                            ).toBe(
                                3
                            );


                            record.endByte =
                                5;


                            return {
                                recordNumber:
                                    2
                            };
                        }
                    );


                const iterator =
                    createRecordCursor(
                        parser,
                        createDetails(),
                        createTestConfig(
                            BUFFER_SIZE
                        )
                    );


                const first =
                    await nextRecord(
                        iterator
                    );


                const second =
                    await nextRecord(
                        iterator
                    );


                expect(
                    first.physicalRecord.buffers[
                        0
                        ]
                ).toBe(
                    second.physicalRecord.buffers[
                        0
                        ]
                );


                first.physicalRecord.close();

                second.physicalRecord.close();


                await iterator.return();
            }
        );


        test(
            "does not copy the carried byte buffer",
            async () => {

                let parseCount =
                    0;

                let originalBuffer:
                    Uint8Array | undefined;


                const parser =
                    createParser(
                        async (
                            record
                        ) => {

                            parseCount++;


                            if (
                                parseCount === 1
                            ) {
                                await record.readMore();


                                originalBuffer =
                                    record.buffers[
                                        0
                                        ];


                                originalBuffer[
                                    6
                                    ] =
                                    201;


                                record.endByte =
                                    4;


                                return {
                                    recordNumber:
                                        1
                                };
                            }


                            expect(
                                record.buffers[
                                    0
                                    ]
                            ).toBe(
                                originalBuffer
                            );


                            expect(
                                record.buffers[
                                    0
                                    ][
                                    6
                                    ]
                            ).toBe(
                                201
                            );


                            record.endByte =
                                5;


                            return {
                                recordNumber:
                                    2
                            };
                        }
                    );


                const iterator =
                    createRecordCursor(
                        parser,
                        createDetails(),
                        createTestConfig(
                            BUFFER_SIZE
                        )
                    );


                const first =
                    await nextRecord(
                        iterator
                    );


                const second =
                    await nextRecord(
                        iterator
                    );


                expect(
                    second.physicalRecord.buffers[
                        0
                        ]
                ).toBe(
                    originalBuffer
                );


                first.physicalRecord.close();

                second.physicalRecord.close();


                await iterator.return();
            }
        );


        test(
            "passes parser details through unchanged",
            async () => {

                const details =
                    createDetails();


                let receivedDetails:
                    TestParserDetails | undefined;


                const parser =
                    createParser(
                        async (
                            record,
                            actualDetails
                        ) => {

                            receivedDetails =
                                actualDetails;


                            await record.readMore();


                            record.endByte =
                                1;


                            return {
                                recordNumber:
                                    1
                            };
                        }
                    );


                const iterator =
                    createRecordCursor(
                        parser,
                        details,
                        createTestConfig(
                            1
                        )
                    );


                const first =
                    await nextRecord(
                        iterator
                    );


                expect(
                    receivedDetails
                ).toBe(
                    details
                );


                first.physicalRecord.close();


                await expectFinished(
                    iterator
                );
            }
        );


        test(
            "rejects a non-final physical record containing no byte buffers",
            async () => {

                const parser =
                    createParser(
                        async (
                            record
                        ) => {

                            record.endByte =
                                0;


                            return {
                                recordNumber:
                                    1
                            };
                        }
                    );


                const iterator =
                    createRecordCursor(
                        parser,
                        createDetails(),
                        createTestConfig()
                    );


                await expect(
                    iterator.next()
                ).rejects.toThrow(
                    "Parser completed a non-final physical record without "
                    + "a byte buffer"
                );
            }
        );


        test(
            "rejects an endByte beyond the final byte buffer",
            async () => {

                const parser =
                    createParser(
                        async (
                            record
                        ) => {

                            await record.readMore();


                            record.endByte =
                                BUFFER_SIZE
                                + 1;


                            return {
                                recordNumber:
                                    1
                            };
                        }
                    );


                const iterator =
                    createRecordCursor(
                        parser,
                        createDetails(),
                        createTestConfig(
                            BUFFER_SIZE
                        )
                    );


                await expect(
                    iterator.next()
                ).rejects.toThrow(
                    "Parser returned a physical record range outside "
                    + "its byte buffers"
                );
            }
        );


        test(
            "rejects endByte beyond lastValidByte",
            async () => {

                const parser =
                    createParser(
                        async (
                            record
                        ) => {

                            await record.readMore();


                            expect(
                                record.lastValidByte
                            ).toBe(
                                5
                            );


                            record.endByte =
                                6;


                            return {
                                recordNumber:
                                    1
                            };
                        }
                    );


                const iterator =
                    createRecordCursor(
                        parser,
                        createDetails(),
                        createTestConfig(
                            5
                        )
                    );


                await expect(
                    iterator.next()
                ).rejects.toThrow(
                    "Parser returned a physical record range outside "
                    + "its byte buffers"
                );
            }
        );


        test(
            "supports several physical records sharing the same byte buffer",
            async () => {

                let parseCount =
                    0;

                let sharedBuffer:
                    Uint8Array | undefined;


                const parser =
                    createParser(
                        async (
                            record
                        ) => {

                            parseCount++;


                            if (
                                parseCount === 1
                            ) {
                                await record.readMore();


                                sharedBuffer =
                                    record.buffers[
                                        0
                                        ];


                                record.endByte =
                                    2;


                                return {
                                    recordNumber:
                                        1
                                };
                            }


                            if (
                                parseCount === 2
                            ) {
                                expect(
                                    record.buffers[
                                        0
                                        ]
                                ).toBe(
                                    sharedBuffer
                                );


                                expect(
                                    record.startByte
                                ).toBe(
                                    2
                                );


                                expect(
                                    record.lastValidByte
                                ).toBe(
                                    BUFFER_SIZE
                                );


                                record.endByte =
                                    5;


                                return {
                                    recordNumber:
                                        2
                                };
                            }


                            expect(
                                record.buffers[
                                    0
                                    ]
                            ).toBe(
                                sharedBuffer
                            );


                            expect(
                                record.startByte
                            ).toBe(
                                5
                            );


                            expect(
                                record.lastValidByte
                            ).toBe(
                                BUFFER_SIZE
                            );


                            record.endByte =
                                7;


                            return {
                                recordNumber:
                                    3
                            };
                        }
                    );


                const iterator =
                    createRecordCursor(
                        parser,
                        createDetails(),
                        createTestConfig(
                            BUFFER_SIZE
                        )
                    );


                const first =
                    await nextRecord(
                        iterator
                    );


                const second =
                    await nextRecord(
                        iterator
                    );


                const third =
                    await nextRecord(
                        iterator
                    );


                expect(
                    first.physicalRecord.buffers[
                        0
                        ]
                ).toBe(
                    sharedBuffer
                );


                expect(
                    second.physicalRecord.buffers[
                        0
                        ]
                ).toBe(
                    sharedBuffer
                );


                expect(
                    third.physicalRecord.buffers[
                        0
                        ]
                ).toBe(
                    sharedBuffer
                );


                first.physicalRecord.close();

                second.physicalRecord.close();

                third.physicalRecord.close();


                await iterator.return();
            }
        );


        test(
            "carries EOF state together with already-read bytes",
            async () => {

                let parseCount =
                    0;


                const parser =
                    createParser(
                        async (
                            record
                        ) => {

                            parseCount++;


                            if (
                                parseCount === 1
                            ) {
                                await record.readMore();


                                expect(
                                    record.fileFinished
                                ).toBe(
                                    true
                                );


                                expect(
                                    record.lastValidByte
                                ).toBe(
                                    7
                                );


                                /*
                                 * First record ends before EOF.
                                 */
                                record.endByte =
                                    3;


                                return {
                                    recordNumber:
                                        1
                                };
                            }


                            /*
                             * No further read is required to know that the
                             * remaining bytes end at EOF.
                             */
                            expect(
                                record.startByte
                            ).toBe(
                                3
                            );


                            expect(
                                record.lastValidByte
                            ).toBe(
                                7
                            );


                            expect(
                                record.fileFinished
                            ).toBe(
                                true
                            );


                            record.endByte =
                                7;


                            return {
                                recordNumber:
                                    2
                            };
                        }
                    );


                const iterator =
                    createRecordCursor(
                        parser,
                        createDetails(),
                        createTestConfig(
                            7
                        )
                    );


                const first =
                    await nextRecord(
                        iterator
                    );


                const second =
                    await nextRecord(
                        iterator
                    );


                first.physicalRecord.close();

                second.physicalRecord.close();


                await expectFinished(
                    iterator
                );
            }
        );


        test(
            "handles repeated same-buffer and cross-buffer transitions",
            async () => {

                let parseCount =
                    0;

                let firstBuffer:
                    Uint8Array | undefined;

                let secondBuffer:
                    Uint8Array | undefined;


                const parser =
                    createParser(
                        async (
                            record
                        ) => {

                            parseCount++;


                            if (
                                parseCount === 1
                            ) {
                                await record.readMore();


                                firstBuffer =
                                    record.buffers[
                                        0
                                        ];


                                record.endByte =
                                    3;


                                return {
                                    recordNumber:
                                        1
                                };
                            }


                            if (
                                parseCount === 2
                            ) {
                                expect(
                                    record.buffers[
                                        0
                                        ]
                                ).toBe(
                                    firstBuffer
                                );


                                expect(
                                    record.startByte
                                ).toBe(
                                    3
                                );


                                await record.readMore();


                                secondBuffer =
                                    record.buffers[
                                        1
                                        ];


                                /*
                                 * Record starts at B0[3] and ends at B1[2].
                                 */
                                record.endByte =
                                    BUFFER_SIZE
                                    + 2;


                                return {
                                    recordNumber:
                                        2
                                };
                            }


                            if (
                                parseCount === 3
                            ) {
                                expect(
                                    record.buffers[
                                        0
                                        ]
                                ).toBe(
                                    secondBuffer
                                );


                                expect(
                                    record.startByte
                                ).toBe(
                                    2
                                );


                                record.endByte =
                                    5;


                                return {
                                    recordNumber:
                                        3
                                };
                            }


                            expect(
                                record.buffers[
                                    0
                                    ]
                            ).toBe(
                                secondBuffer
                            );


                            expect(
                                record.startByte
                            ).toBe(
                                5
                            );


                            record.endByte =
                                6;


                            return {
                                recordNumber:
                                    4
                            };
                        }
                    );


                const iterator =
                    createRecordCursor(
                        parser,
                        createDetails(),
                        createTestConfig(
                            BUFFER_SIZE,
                            BUFFER_SIZE
                        )
                    );


                const first =
                    await nextRecord(
                        iterator
                    );

                first.physicalRecord.close();


                const second =
                    await nextRecord(
                        iterator
                    );

                second.physicalRecord.close();


                const third =
                    await nextRecord(
                        iterator
                    );

                third.physicalRecord.close();


                const fourth =
                    await nextRecord(
                        iterator
                    );

                fourth.physicalRecord.close();


                await iterator.return();
            }
        );


        test(
            "does not close a physical record when the parser throws",
            async () => {

                const expectedError =
                    new Error(
                        "parser failed"
                    );


                let parserRecord:
                    ParserPhysicalRecordContent<
                        TestRecordState
                    >
                    | undefined;


                const parser =
                    createParser(
                        async (
                            record
                        ) => {

                            parserRecord =
                                record;


                            await record.readMore();


                            throw expectedError;
                        }
                    );


                const config =
                    createTestConfig(
                        BUFFER_SIZE
                    );


                const physicalRelease =
                    jest.spyOn(
                        config.physicalContentPool,
                        "release"
                    );


                const iterator =
                    createRecordCursor(
                        parser,
                        createDetails(),
                        config
                    );


                await expect(
                    iterator.next()
                ).rejects.toBe(
                    expectedError
                );


                expect(
                    physicalRelease
                ).not.toHaveBeenCalled();


                if (
                    parserRecord === undefined
                ) {
                    throw new Error(
                        "Expected parser to receive a physical record"
                    );
                }


                parserRecord.close();


                expect(
                    physicalRelease
                ).toHaveBeenCalledTimes(
                    1
                );
            }
        );


        test(
            "reuses released physical record objects",
            async () => {

                let parseCount =
                    0;


                const parser =
                    createParser(
                        async (
                            record
                        ) => {

                            parseCount++;


                            if (
                                parseCount === 1
                            ) {
                                await record.readMore();


                                record.endByte =
                                    2;


                                return {
                                    recordNumber:
                                        1
                                };
                            }


                            record.endByte =
                                3;


                            return {
                                recordNumber:
                                    2
                            };
                        }
                    );


                const config =
                    createTestConfig(
                        BUFFER_SIZE
                    );


                const iterator =
                    createRecordCursor(
                        parser,
                        createDetails(),
                        config
                    );


                const first =
                    await nextRecord(
                        iterator
                    );


                const firstPhysicalRecord =
                    first.physicalRecord;


                firstPhysicalRecord.close();


                const second =
                    await nextRecord(
                        iterator
                    );


                expect(
                    second.physicalRecord
                ).toBe(
                    firstPhysicalRecord
                );


                expect(
                    second.physicalRecord.source
                ).toBe(
                    SOURCE
                );


                expect(
                    second.physicalRecord.recordNumber
                ).toBe(
                    2
                );


                second.physicalRecord.close();


                await iterator.return();
            }
        );
    }
);


/**
 * Normal client code uses for-await and never sees the generator's void return
 * value.
 *
 * Tests sometimes need to advance exactly one iteration, so this helper hides
 * the IteratorResult narrowing in one place.
 */
async function nextRecord<
    TRepresentation,
    TRecordState
>(
    iterator:
    AsyncGenerator<
        RecordCursorResult<
            TRepresentation,
            TRecordState
        >,
        void,
        void
    >
): Promise<
    RecordCursorResult<
        TRepresentation,
        TRecordState
    >
> {

    const next =
        await iterator.next();


    if (
        next.done
    ) {
        throw new Error(
            "Expected another record"
        );
    }


    return next.value as RecordCursorResult<
        TRepresentation,
        TRecordState
    >;
}


/**
 * Assert that an iterator has completed.
 */
async function expectFinished<
    TRepresentation,
    TRecordState
>(
    iterator:
    AsyncGenerator<
        RecordCursorResult<
            TRepresentation,
            TRecordState
        >,
        void,
        void
    >
): Promise<void> {

    const next =
        await iterator.next();


    expect(
        next.done
    ).toBe(
        true
    );
}


function createParser(
    parse:
    (
        record:
        ParserPhysicalRecordContent<
            TestRecordState
        >,

        details:
        TestParserDetails
    ) => Promise<
        TestRepresentation
    >
): Parser<
    TestRepresentation,
    TestParserConfig,
    TestParserDetails,
    TestRecordState
> {

    const unsupported =
        () => {
            throw new Error(
                "Record cursor must not use projection support"
            );
        };


    return {
        parse,

        integer:
        unsupported,

        float:
        unsupported,

        character:
        unsupported,

        string:
        unsupported,

        toDebugString:
            () => {
                throw new Error(
                    "Record cursor must not render diagnostics"
                );
            }
    };
}


function createDetails():
    TestParserDetails {

    return {
        name:
            "test"
    };
}


/**
 * Completely in-memory physical-record configuration.
 *
 * Each number specifies how many bytes the next fill operation reads.
 *
 * A value equal to BUFFER_SIZE represents a full read. EOF is not yet known.
 *
 * A value smaller than BUFFER_SIZE represents the final read.
 *
 * readMore() is responsible for:
 *
 *     - appending the supplied pooled Uint8Array;
 *     - advancing lastValidByte by the returned byte count;
 *     - setting fileFinished when the returned count is less than BUFFER_SIZE.
 *
 * A zero-byte result therefore represents EOF exactly at a physical-buffer
 * boundary.
 */
function createTestConfig(
    ...readLengths:
    number[]
) {

    const file:
        TestFile = {
        name:
            "test"
    };


    let readIndex =
        0;

    let fillNumber =
        1;


    return createDefaultPhysicalRecordConfig<
        TestRecordState,
        TestFile
    >({
        source:
        SOURCE,

        file,

        bufferSize:
        BUFFER_SIZE,

        fillFileBuffer:
            async (
                actualFile,
                buffer
            ) => {

                expect(
                    actualFile
                ).toBe(
                    file
                );


                const bytesRead =
                    readLengths[
                        readIndex
                        ]
                    ?? 0;


                readIndex++;


                if (
                    bytesRead < 0
                    || bytesRead > buffer.length
                ) {
                    throw new Error(
                        "Invalid test read length"
                    );
                }


                for (
                    let index =
                        0;

                    index < bytesRead;

                    index++
                ) {
                    buffer[
                        index
                        ] =
                        fillNumber;
                }


                fillNumber++;


                return bytesRead;
            },

        createRecordState:
            () => ({
                value:
                    0
            })
    });
}
