import {
    isErrors
} from "@cobol-ts/errors";

import {
    type ParserPhysicalRecordContent
} from "@cobol-ts/cursor-loader-types";

import {
    createRecordCursor
} from "@cobol-ts/cursor-record";

import {
    createDefaultPhysicalRecordConfig
} from "@cobol-ts/cursor-record/src/physical.record";

import {
    jsonParser
} from "./cursor.loader.json.parser";


const encoder =
    new TextEncoder();


describe(
    "jsonParser",
    () => {

        test(
            "renders physical JSON bytes as UTF-8 for diagnostics",
            () => {

                const bytes =
                    encode(
                        `xx{"name":"£"}yy`
                    );


                const record =
                    createRecord(
                        [
                            bytes
                        ],
                        true
                    );


                expect(
                    jsonParser.toDebugString(
                        record,
                        2,
                        bytes.length
                        - 2
                    )
                ).toBe(
                    `{"name":"£"}`
                );
            }
        );


        test(
            "renders diagnostic UTF-8 spanning physical buffers",
            () => {

                const content =
                    encode(
                        `{"name":"£"}`
                    );


                /*
                 * £ is encoded as:
                 *
                 *     c2 a3
                 *
                 * Split between those two bytes.
                 */
                const split =
                    content.indexOf(
                        0xc2
                    )
                    + 1;


                const record =
                    createRecord(
                        [
                            content.slice(
                                0,
                                split
                            ),
                            content.slice(
                                split
                            )
                        ],
                        true
                    );


                expect(
                    jsonParser.toDebugString(
                        record,
                        0,
                        content.length
                    )
                ).toBe(
                    `{"name":"£"}`
                );
            }
        );


        test(
            "parses a JSON object ending at EOF",
            async () => {



                const record =
                    createRecord(
                        [
                            encode(
                                `{"id":"123","name":"Fred"}`
                            )
                        ],
                        true
                    );


                const result =
                    await jsonParser.parse(
                        record,
                        undefined
                    );


                expect(
                    result
                ).toEqual({
                    id:
                        "123",

                    name:
                        "Fred"
                });


                expect(
                    record.endByte
                ).toBe(
                    record.lastValidByte
                );
            }
        );


        test(
            "parses a JSON array",
            async () => {



                const record =
                    createRecord(
                        [
                            encode(
                                `[1,2,3]`
                            )
                        ],
                        true
                    );


                const result =
                    await jsonParser.parse(
                        record,
                        undefined
                    );


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
            async () => {



                const record =
                    createRecord(
                        [
                            encode(
                                `"hello"`
                            )
                        ],
                        true
                    );


                const result =
                    await jsonParser.parse(
                        record,
                        undefined
                    );


                expect(
                    result
                ).toBe(
                    "hello"
                );
            }
        );


        test(
            "parses a JSON number primitive",
            async () => {



                const record =
                    createRecord(
                        [
                            encode(
                                `42`
                            )
                        ],
                        true
                    );


                const result =
                    await jsonParser.parse(
                        record,
                        undefined
                    );


                expect(
                    result
                ).toBe(
                    42
                );
            }
        );


        test(
            "parses JSON null",
            async () => {



                const record =
                    createRecord(
                        [
                            encode(
                                `null`
                            )
                        ],
                        true
                    );


                const result =
                    await jsonParser.parse(
                        record,
                        undefined
                    );


                expect(
                    result
                ).toBeNull();
            }
        );


        test(
            "ends a physical record immediately after LF",
            async () => {



                const json =
                    encode(
                        `{"id":123}\n`
                    );


                const record =
                    createRecord(
                        [
                            json
                        ],
                        false
                    );


                const result =
                    await jsonParser.parse(
                        record,
                        undefined
                    );


                expect(
                    result
                ).toEqual({
                    id:
                        123
                });


                expect(
                    record.endByte
                ).toBe(
                    json.length
                );


                expect(
                    record.fileFinished
                ).toBe(
                    false
                );
            }
        );


        test(
            "stops at LF when later records have already been read",
            async () => {



                const first =
                    `{"id":1}\n`;

                const all =
                    encode(
                        first
                        + `{"id":2}\n`
                    );


                const record =
                    createRecord(
                        [
                            all
                        ],
                        true
                    );


                const result =
                    await jsonParser.parse(
                        record,
                        undefined
                    );


                expect(
                    result
                ).toEqual({
                    id:
                        1
                });


                expect(
                    record.endByte
                ).toBe(
                    encode(
                        first
                    ).length
                );


                expect(
                    record.lastValidByte
                ).toBe(
                    all.length
                );


                expect(
                    record.fileFinished
                ).toBe(
                    true
                );
            }
        );


        test(
            "parses an already-read carried record starting part way through a buffer",
            async () => {



                const prefix =
                    encode(
                        `{"previous":1}\n`
                    );

                const json =
                    encode(
                        `{"id":123}`
                    );


                const buffer =
                    new Uint8Array(
                        prefix.length
                        + json.length
                    );


                buffer.set(
                    prefix,
                    0
                );

                buffer.set(
                    json,
                    prefix.length
                );


                let readMoreCalls =
                    0;


                const record =
                    createRecord(
                        [
                            buffer
                        ],
                        true,
                        prefix.length,
                        async () => {

                            readMoreCalls++;
                        }
                    );


                const result =
                    await jsonParser.parse(
                        record,
                        undefined
                    );


                expect(
                    result
                ).toEqual({
                    id:
                        123
                });


                expect(
                    record.endByte
                ).toBe(
                    buffer.length
                );


                expect(
                    readMoreCalls
                ).toBe(
                    0
                );
            }
        );


        test(
            "parses a carried record and stops at its LF before later bytes",
            async () => {



                const prefix =
                    `{"previous":1}\n`;

                const current =
                    `{"id":123}\n`;

                const later =
                    `{"id":456}\n`;


                const buffer =
                    encode(
                        prefix
                        + current
                        + later
                    );


                const startByte =
                    encode(
                        prefix
                    ).length;

                const expectedEnd =
                    startByte
                    + encode(
                        current
                    ).length;


                const record =
                    createRecord(
                        [
                            buffer
                        ],
                        true,
                        startByte
                    );


                const result =
                    await jsonParser.parse(
                        record,
                        undefined
                    );


                expect(
                    result
                ).toEqual({
                    id:
                        123
                });


                expect(
                    record.endByte
                ).toBe(
                    expectedEnd
                );


                expect(
                    record.lastValidByte
                ).toBe(
                    buffer.length
                );
            }
        );


        test(
            "calls readMore when all currently valid bytes have been scanned",
            async () => {



                const first =
                    encode(
                        `{"id":`
                    );

                const second =
                    encode(
                        `123}\n`
                    );


                let readMoreCalls =
                    0;


                const record =
                    createRecord(
                        [
                            first
                        ],
                        false,
                        0,
                        async (
                            buffers,
                            current
                        ) => {

                            readMoreCalls++;


                            buffers.push(
                                second
                            );


                            current.lastValidByte +=
                                second.length;

                            current.fileFinished =
                                true;
                        }
                    );


                const result =
                    await jsonParser.parse(
                        record,
                        undefined
                    );


                expect(
                    result
                ).toEqual({
                    id:
                        123
                });


                expect(
                    readMoreCalls
                ).toBe(
                    1
                );


                expect(
                    record.endByte
                ).toBe(
                    first.length
                    + second.length
                );


                expect(
                    record.lastValidByte
                ).toBe(
                    first.length
                    + second.length
                );


                expect(
                    record.fileFinished
                ).toBe(
                    true
                );
            }
        );


        test(
            "continues through several readMore calls",
            async () => {



                const first =
                    encode(
                        `{"id":"`
                    );

                const second =
                    encode(
                        `123`
                    );

                const third =
                    encode(
                        `"}\n`
                    );


                const remainingBuffers =
                    [
                        second,
                        third
                    ];


                let readMoreCalls =
                    0;


                const record =
                    createRecord(
                        [
                            first
                        ],
                        false,
                        0,
                        async (
                            buffers,
                            current
                        ) => {

                            const buffer =
                                remainingBuffers[
                                    readMoreCalls
                                    ];


                            readMoreCalls++;


                            buffers.push(
                                buffer
                            );


                            current.lastValidByte +=
                                buffer.length;


                            if (
                                readMoreCalls
                                === remainingBuffers.length
                            ) {
                                current.fileFinished =
                                    true;
                            }
                        }
                    );


                const result =
                    await jsonParser.parse(
                        record,
                        undefined
                    );


                expect(
                    result
                ).toEqual({
                    id:
                        "123"
                });


                expect(
                    readMoreCalls
                ).toBe(
                    2
                );


                expect(
                    record.endByte
                ).toBe(
                    first.length
                    + second.length
                    + third.length
                );
            }
        );


        test(
            "parses a final record without LF",
            async () => {



                const json =
                    encode(
                        `{"id":123}`
                    );


                const record =
                    createRecord(
                        [
                            json
                        ],
                        true
                    );


                const result =
                    await jsonParser.parse(
                        record,
                        undefined
                    );


                expect(
                    result
                ).toEqual({
                    id:
                        123
                });


                expect(
                    record.endByte
                ).toBe(
                    json.length
                );
            }
        );


        test(
            "uses lastValidByte rather than physical buffer capacity",
            async () => {



                const json =
                    encode(
                        `{"id":123}`
                    );


                const buffer =
                    new Uint8Array(
                        json.length
                        + 20
                    );


                buffer.set(
                    json,
                    0
                );


                buffer.fill(
                    0xff,
                    json.length
                );


                const record =
                    createRecord(
                        [
                            buffer
                        ],
                        true,
                        0,
                        undefined,
                        json.length
                    );


                const result =
                    await jsonParser.parse(
                        record,
                        undefined
                    );


                expect(
                    result
                ).toEqual({
                    id:
                        123
                });


                expect(
                    record.endByte
                ).toBe(
                    json.length
                );


                expect(
                    record.lastValidByte
                ).toBe(
                    json.length
                );
            }
        );


        test(
            "does not call readMore when EOF is already known",
            async () => {



                let readMoreCalls =
                    0;


                const record =
                    createRecord(
                        [
                            encode(
                                `{"id":123}`
                            )
                        ],
                        true,
                        0,
                        async () => {

                            readMoreCalls++;
                        }
                    );


                const result =
                    await jsonParser.parse(
                        record,
                        undefined
                    );


                expect(
                    result
                ).toEqual({
                    id:
                        123
                });


                expect(
                    readMoreCalls
                ).toBe(
                    0
                );
            }
        );


        test(
            "does not modify startByte",
            async () => {



                const prefix =
                    encode(
                        "ignored"
                    );

                const json =
                    encode(
                        `{"id":123}`
                    );


                const buffer =
                    new Uint8Array(
                        prefix.length
                        + json.length
                    );


                buffer.set(
                    prefix,
                    0
                );

                buffer.set(
                    json,
                    prefix.length
                );


                const record =
                    createRecord(
                        [
                            buffer
                        ],
                        true,
                        prefix.length
                    );


                await jsonParser.parse(
                    record,
                    undefined
                );


                expect(
                    record.startByte
                ).toBe(
                    prefix.length
                );
            }
        );


        test(
            "does not modify lastValidByte while parsing already available bytes",
            async () => {



                const content =
                    encode(
                        `{"id":1}\n{"id":2}`
                    );


                const record =
                    createRecord(
                        [
                            content
                        ],
                        true
                    );


                const originalLastValidByte =
                    record.lastValidByte;


                await jsonParser.parse(
                    record,
                    undefined
                );


                expect(
                    record.lastValidByte
                ).toBe(
                    originalLastValidByte
                );
            }
        );


        test(
            "does not modify fileFinished while parsing already available bytes",
            async () => {



                const record =
                    createRecord(
                        [
                            encode(
                                `{"id":1}\n`
                            )
                        ],
                        false
                    );


                await jsonParser.parse(
                    record,
                    undefined
                );


                expect(
                    record.fileFinished
                ).toBe(
                    false
                );
            }
        );


        test(
            "parses JSON spanning several buffers",
            async () => {



                const first =
                    encode(
                        `{"id":"123",`
                    );

                const second =
                    encode(
                        `"name":"`
                    );

                const third =
                    encode(
                        `Fred"}\n`
                    );


                const record =
                    createRecord(
                        [
                            first,
                            second,
                            third
                        ],
                        true
                    );


                const result =
                    await jsonParser.parse(
                        record,
                        undefined
                    );


                expect(
                    result
                ).toEqual({
                    id:
                        "123",

                    name:
                        "Fred"
                });


                expect(
                    record.endByte
                ).toBe(
                    first.length
                    + second.length
                    + third.length
                );
            }
        );


        test(
            "parses a multi-buffer record starting part way through the first buffer",
            async () => {



                const first =
                    encode(
                        `xxx{"id":"123",`
                    );

                const second =
                    encode(
                        `"name":"Fred"`
                    );

                const third =
                    encode(
                        `}\nyyy`
                    );


                const startByte =
                    3;

                const expectedEnd =
                    startByte
                    + encode(
                        `{"id":"123","name":"Fred"}\n`
                    ).length;


                const record =
                    createRecord(
                        [
                            first,
                            second,
                            third
                        ],
                        true,
                        startByte
                    );


                const result =
                    await jsonParser.parse(
                        record,
                        undefined
                    );


                expect(
                    result
                ).toEqual({
                    id:
                        "123",

                    name:
                        "Fred"
                });


                expect(
                    record.endByte
                ).toBe(
                    expectedEnd
                );
            }
        );


        test(
            "parses UTF-8 characters split across physical buffers",
            async () => {



                const json =
                    encode(
                        `{"name":"£"}\n`
                    );


                /*
                 * £ is encoded as:
                 *
                 *     c2 a3
                 *
                 * Split between those two bytes.
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


                const record =
                    createRecord(
                        [
                            first,
                            second
                        ],
                        true
                    );


                const result =
                    await jsonParser.parse(
                        record,
                        undefined
                    );


                expect(
                    result
                ).toEqual({
                    name:
                        "£"
                });
            }
        );


        test(
            "returns Errors for malformed JSON",
            async () => {



                const record =
                    createRecord(
                        [
                            encode(
                                `{"id":`
                            )
                        ],
                        true
                    );


                const result =
                    await jsonParser.parse(
                        record,
                        undefined
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
                        "Expected JSON parse error"
                    );
                }


                expect(
                    result.errors
                ).toHaveLength(
                    1
                );


                expect(
                    result.errors[
                        0
                        ]
                ).toContain(
                    "JSON parse"
                );
            }
        );


        test(
            "does not validate the representation shape",
            async () => {




                const record =
                    createRecord(
                        [
                            encode(
                                `{"somethingElse":123}`
                            )
                        ],
                        true
                    );


                const result =
                    await jsonParser.parse(
                        record,
                        undefined
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
                        "Expected parsed JSON"
                    );
                }


                expect(
                    result
                ).toEqual({
                    somethingElse:
                        123
                });
            }
        );


        test(
            "propagates readMore failures",
            async () => {



                const expectedError =
                    new Error(
                        "physical read failed"
                    );


                const record =
                    createRecord(
                        [
                            encode(
                                `{"id":`
                            )
                        ],
                        false,
                        0,
                        async () => {

                            throw expectedError;
                        }
                    );


                await expect(
                    jsonParser.parse(
                        record,
                        undefined
                    )
                ).rejects.toBe(
                    expectedError
                );
            }
        );


        test(
            "handles EOF discovered by a zero-byte read",
            async () => {



                const json =
                    encode(
                        `{"id":123}`
                    );


                let readMoreCalls =
                    0;


                const record =
                    createRecord(
                        [
                            json
                        ],
                        false,
                        0,
                        async (
                            buffers,
                            current
                        ) => {

                            readMoreCalls++;


                            /*
                             * Match the current physical readMore() contract:
                             * a zero-byte read still transfers the acquired
                             * physical buffer.
                             */
                            buffers.push(
                                new Uint8Array(
                                    json.length
                                )
                            );


                            /*
                             * Zero bytes were valid, so lastValidByte does not
                             * advance.
                             */
                            current.fileFinished =
                                true;
                        }
                    );


                const result =
                    await jsonParser.parse(
                        record,
                        undefined
                    );


                expect(
                    result
                ).toEqual({
                    id:
                        123
                });


                expect(
                    readMoreCalls
                ).toBe(
                    1
                );


                expect(
                    record.lastValidByte
                ).toBe(
                    json.length
                );


                expect(
                    record.endByte
                ).toBe(
                    json.length
                );
            }
        );


        test(
            "parses several records from the final physical buffer",
            async () => {

                const content =
                    encoder.encode(
                        `{"id":1}\n`
                        + `{"id":2}\n`
                        + `{"id":3}`
                    );




                const config =
                    createDefaultPhysicalRecordConfig({
                        file:
                            {
                                name:
                                    "test"
                            },

                        /*
                         * Deliberately larger than the file content.
                         *
                         * The first physical read is therefore short, so
                         * readMore() establishes:
                         *
                         *     fileFinished = true
                         *     lastValidByte = content.length
                         *
                         * All three JSONL records are already present in the
                         * same final physical buffer.
                         */
                        bufferSize:
                            content.length
                            + 10,

                        fillFileBuffer:
                            async (
                                _file,
                                buffer
                            ) => {

                                buffer.set(
                                    content
                                );


                                return content.length;
                            },

                        createRecordState:
                            () =>
                                undefined
                    });


                const iterator =
                    createRecordCursor(
                        jsonParser,
                        undefined,
                        config
                    );


                const first =
                    await iterator.next();

                const second =
                    await iterator.next();

                const third =
                    await iterator.next();


                if (
                    first.done
                    || second.done
                    || third.done
                ) {
                    throw new Error(
                        "Expected three JSONL records"
                    );
                }


                expect(
                    first.value.result
                ).toEqual({
                    id:
                        1
                });


                expect(
                    second.value.result
                ).toEqual({
                    id:
                        2
                });


                expect(
                    third.value.result
                ).toEqual({
                    id:
                        3
                });


                /*
                 * The cursor carries exactly the same physical Uint8Array
                 * through all three logical records.
                 */
                expect(
                    first.value.physicalRecord.buffers[
                        0
                        ]
                ).toBe(
                    second.value.physicalRecord.buffers[
                        0
                        ]
                );


                expect(
                    second.value.physicalRecord.buffers[
                        0
                        ]
                ).toBe(
                    third.value.physicalRecord.buffers[
                        0
                        ]
                );


                /*
                 * EOF was already known while parsing every record.
                 */
                expect(
                    first.value.physicalRecord.fileFinished
                ).toBe(
                    true
                );


                expect(
                    second.value.physicalRecord.fileFinished
                ).toBe(
                    true
                );


                expect(
                    third.value.physicalRecord.fileFinished
                ).toBe(
                    true
                );


                /*
                 * The final unterminated JSON document ends exactly at the
                 * known EOF position.
                 */
                expect(
                    third.value.physicalRecord.endByte
                ).toBe(
                    third.value.physicalRecord.lastValidByte
                );


                first.value.physicalRecord.close();

                second.value.physicalRecord.close();

                third.value.physicalRecord.close();


                const finished =
                    await iterator.next();


                expect(
                    finished.done
                ).toBe(
                    true
                );
            }
        );
    }
);


function encode(
    value:
    string
): Uint8Array {

    return encoder.encode(
        value
    );
}


/**
 * Construct the parser-visible physical-record contract.
 *
 * The mutable buffers array belongs to this test's fake physical reader.
 *
 * ParserPhysicalRecordContent exposes that same array as readonly, so parser
 * code cannot append buffers itself.
 */
function createRecord(
    initialBuffers:
    Uint8Array[],

    fileFinished:
    boolean,

    startByte =
    0,

    readMore:
        (
            (
                buffers:
                Uint8Array[],

                record:
                ParserPhysicalRecordContent<
                    undefined
                >
            ) => Promise<void>
            )
        | undefined =
    undefined,

    lastValidByte:
    number =
    totalLength(
        initialBuffers
    )
): ParserPhysicalRecordContent<
    undefined
> {

    const buffers =
        initialBuffers;


    let record:
        ParserPhysicalRecordContent<
            undefined
        >;


    record = {
        buffers,

        startByte,

        endByte:
        startByte,

        lastValidByte,

        fileFinished,

        recordState:
        undefined,

        readMore:
            function (): Promise<void> {

                if (
                    readMore === undefined
                ) {
                    throw new Error(
                        "Unexpected readMore()"
                    );
                }


                return readMore(
                    buffers,
                    record
                );
            },

        close:
            () => {
            }
    };


    return record;
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
