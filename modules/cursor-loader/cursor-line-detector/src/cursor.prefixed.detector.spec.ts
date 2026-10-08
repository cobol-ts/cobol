import {
    createLengthPrefixedRecordBoundaryDetector
} from "./cursor.prefixed.detector";


describe(
    "createLengthPrefixedRecordBoundaryDetector",
    () => {

        const rdwLength = (
            buffers:
            readonly Uint8Array[],

            prefixStart:
            number
        ): number =>
            (
                (
                    byteAt(
                        buffers,
                        prefixStart
                    )
                    << 8
                )
                | byteAt(
                    buffers,
                    prefixStart + 1
                )
            )
            - 4;


        test(
            "finds a complete length-prefixed record in one buffer",
            () => {

                const detector =
                    createLengthPrefixedRecordBoundaryDetector(
                        4,
                        rdwLength
                    );


                const buffers = [
                    Uint8Array.from([
                        0x00,
                        0x0a,
                        0x00,
                        0x00,

                        0x61,
                        0x62,
                        0x63,
                        0x64,
                        0x65,
                        0x66
                    ])
                ];


                const nextRecordStart =
                    detector.nextRecordStart(
                        buffers,
                        0,
                        0
                    );


                expect(
                    nextRecordStart
                ).toBe(
                    10
                );


                expect(
                    detector.recordStart(
                        0
                    )
                ).toBe(
                    4
                );


                expect(
                    detector.recordEnd(
                        buffers,
                        nextRecordStart
                    )
                ).toBe(
                    9
                );
            }
        );


        test(
            "reads a prefix split across physical buffers",
            () => {

                const detector =
                    createLengthPrefixedRecordBoundaryDetector(
                        4,
                        rdwLength
                    );


                const buffers = [
                    Uint8Array.from([
                        0x00,
                        0x0a
                    ]),

                    Uint8Array.from([
                        0x00,
                        0x00,

                        0x61,
                        0x62,
                        0x63,
                        0x64,
                        0x65,
                        0x66
                    ])
                ];


                expect(
                    detector.nextRecordStart(
                        buffers,
                        0,
                        0
                    )
                ).toBe(
                    10
                );
            }
        );


        test(
            "reads a payload split across several physical buffers",
            () => {

                const detector =
                    createLengthPrefixedRecordBoundaryDetector(
                        4,
                        rdwLength
                    );


                const buffers = [
                    Uint8Array.from([
                        0x00,
                        0x0a,
                        0x00,
                        0x00,
                        0x61
                    ]),

                    Uint8Array.from([
                        0x62,
                        0x63
                    ]),

                    Uint8Array.from([
                        0x64,
                        0x65,
                        0x66
                    ])
                ];


                expect(
                    detector.nextRecordStart(
                        buffers,
                        0,
                        0
                    )
                ).toBe(
                    10
                );
            }
        );


        test(
            "uses logical frameStart across the supplied buffers",
            () => {

                const detector =
                    createLengthPrefixedRecordBoundaryDetector(
                        4,
                        rdwLength
                    );


                const buffers = [
                    Uint8Array.from([
                        0xff,
                        0xff,
                        0xff
                    ]),

                    Uint8Array.from([
                        0x00,
                        0x0a,
                        0x00,
                        0x00,
                        0x61,
                        0x62
                    ]),

                    Uint8Array.from([
                        0x63,
                        0x64,
                        0x65,
                        0x66
                    ])
                ];


                const nextRecordStart =
                    detector.nextRecordStart(
                        buffers,
                        3,
                        3
                    );


                expect(
                    detector.recordStart(
                        3
                    )
                ).toBe(
                    7
                );


                expect(
                    nextRecordStart
                ).toBe(
                    13
                );


                expect(
                    detector.recordEnd(
                        buffers,
                        nextRecordStart
                    )
                ).toBe(
                    12
                );
            }
        );


        test(
            "returns minus one when the complete prefix is not yet available",
            () => {

                const detector =
                    createLengthPrefixedRecordBoundaryDetector(
                        4,
                        rdwLength
                    );


                expect(
                    detector.nextRecordStart(
                        [
                            Uint8Array.from([
                                0x00,
                                0x0a,
                                0x00
                            ])
                        ],
                        0,
                        0
                    )
                ).toBe(
                    -1
                );
            }
        );


        test(
            "does not call recordLength until the complete prefix is available",
            () => {

                const recordLength =
                    jest.fn(
                        () =>
                            6
                    );


                const detector =
                    createLengthPrefixedRecordBoundaryDetector(
                        4,
                        recordLength
                    );


                expect(
                    detector.nextRecordStart(
                        [
                            Uint8Array.from([
                                0x00,
                                0x0a,
                                0x00
                            ])
                        ],
                        0,
                        0
                    )
                ).toBe(
                    -1
                );


                expect(
                    recordLength
                ).not.toHaveBeenCalled();
            }
        );


        test(
            "returns minus one when the prefix is complete but the payload is incomplete",
            () => {

                const detector =
                    createLengthPrefixedRecordBoundaryDetector(
                        4,
                        rdwLength
                    );


                expect(
                    detector.nextRecordStart(
                        [
                            Uint8Array.from([
                                0x00,
                                0x0a,
                                0x00,
                                0x00,

                                0x61,
                                0x62
                            ])
                        ],
                        0,
                        0
                    )
                ).toBe(
                    -1
                );
            }
        );


        test(
            "supports a zero-length record",
            () => {

                const detector =
                    createLengthPrefixedRecordBoundaryDetector(
                        4,
                        rdwLength
                    );


                const buffers = [
                    Uint8Array.from([
                        0x00,
                        0x04,
                        0x00,
                        0x00
                    ])
                ];


                const nextRecordStart =
                    detector.nextRecordStart(
                        buffers,
                        0,
                        0
                    );


                expect(
                    nextRecordStart
                ).toBe(
                    4
                );


                expect(
                    detector.recordStart(
                        0
                    )
                ).toBe(
                    4
                );


                expect(
                    detector.recordEnd(
                        buffers,
                        nextRecordStart
                    )
                ).toBe(
                    3
                );
            }
        );


        test(
            "rejects zero prefix size",
            () => {

                expect(
                    () =>
                        createLengthPrefixedRecordBoundaryDetector(
                            0,
                            () =>
                                10
                        )
                ).toThrow(
                    "Length prefix size must be a positive integer"
                );
            }
        );


        test(
            "rejects negative prefix size",
            () => {

                expect(
                    () =>
                        createLengthPrefixedRecordBoundaryDetector(
                            -1,
                            () =>
                                10
                        )
                ).toThrow(
                    "Length prefix size must be a positive integer"
                );
            }
        );


        test(
            "rejects non-integer prefix size",
            () => {

                expect(
                    () =>
                        createLengthPrefixedRecordBoundaryDetector(
                            1.5,
                            () =>
                                10
                        )
                ).toThrow(
                    "Length prefix size must be a positive integer"
                );
            }
        );


        test(
            "rejects a negative decoded record length",
            () => {

                const detector =
                    createLengthPrefixedRecordBoundaryDetector(
                        4,
                        () =>
                            -1
                    );


                expect(
                    () =>
                        detector.nextRecordStart(
                            [
                                Uint8Array.from([
                                    0x00,
                                    0x00,
                                    0x00,
                                    0x00
                                ])
                            ],
                            0,
                            0
                        )
                ).toThrow(
                    "Length-prefixed record length must be a non-negative integer"
                );
            }
        );


        test(
            "rejects a non-integer decoded record length",
            () => {

                const detector =
                    createLengthPrefixedRecordBoundaryDetector(
                        4,
                        () =>
                            1.5
                    );


                expect(
                    () =>
                        detector.nextRecordStart(
                            [
                                Uint8Array.from([
                                    0x00,
                                    0x00,
                                    0x00,
                                    0x00
                                ])
                            ],
                            0,
                            0
                        )
                ).toThrow(
                    "Length-prefixed record length must be a non-negative integer"
                );
            }
        );


        test(
            "passes the physical buffers and logical prefix start to recordLength",
            () => {

                const buffers = [
                    Uint8Array.from([
                        0xaa,
                        0xbb,

                        0x01,
                        0x02
                    ]),

                    Uint8Array.from([
                        0x03,
                        0x04,

                        0x61,
                        0x62
                    ])
                ];


                const recordLength =
                    jest.fn(
                        (
                            receivedBuffers:
                            readonly Uint8Array[],

                            prefixStart:
                            number
                        ) => {

                            expect(
                                receivedBuffers
                            ).toBe(
                                buffers
                            );

                            expect(
                                prefixStart
                            ).toBe(
                                2
                            );


                            expect(
                                byteAt(
                                    receivedBuffers,
                                    prefixStart
                                )
                            ).toBe(
                                0x01
                            );

                            expect(
                                byteAt(
                                    receivedBuffers,
                                    prefixStart + 1
                                )
                            ).toBe(
                                0x02
                            );

                            expect(
                                byteAt(
                                    receivedBuffers,
                                    prefixStart + 2
                                )
                            ).toBe(
                                0x03
                            );

                            expect(
                                byteAt(
                                    receivedBuffers,
                                    prefixStart + 3
                                )
                            ).toBe(
                                0x04
                            );


                            return 2;
                        }
                    );


                const detector =
                    createLengthPrefixedRecordBoundaryDetector(
                        4,
                        recordLength
                    );


                expect(
                    detector.nextRecordStart(
                        buffers,
                        2,
                        2
                    )
                ).toBe(
                    8
                );


                expect(
                    recordLength
                ).toHaveBeenCalledTimes(
                    1
                );
            }
        );
    }
);


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