import {
    type RecordBoundaryDetector
} from "@cobol-ts/cursor-loader-types";

import {
    createFixedWidthRecordBoundaryDetector,
    newlineRecordBoundaryDetector
} from "./cursor.loader.physical.detectors";


describe(
    "newlineRecordBoundaryDetector",
    () => {

        test(
            "finds LF within one buffer",
            () => {

                const buffers =
                    bytes(
                        "abc\nXYZ"
                    );


                expect(
                    newlineRecordBoundaryDetector.nextRecordStart(
                        buffers,
                        0,
                        0
                    )
                ).toBe(
                    4
                );


                expect(
                    newlineRecordBoundaryDetector.recordEnd(
                        buffers,
                        4
                    )
                ).toBe(
                    2
                );
            }
        );


        test(
            "finds CRLF within one buffer",
            () => {

                const buffers =
                    bytes(
                        "abc\r\nXYZ"
                    );


                expect(
                    newlineRecordBoundaryDetector.nextRecordStart(
                        buffers,
                        0,
                        0
                    )
                ).toBe(
                    5
                );


                expect(
                    newlineRecordBoundaryDetector.recordEnd(
                        buffers,
                        5
                    )
                ).toBe(
                    2
                );
            }
        );


        test(
            "finds LF when LF is the final byte of a buffer",
            () => {

                const buffers =
                    bytes(
                        "abc\n",
                        "XYZ"
                    );


                expect(
                    newlineRecordBoundaryDetector.nextRecordStart(
                        buffers,
                        0,
                        0
                    )
                ).toBe(
                    4
                );


                expect(
                    newlineRecordBoundaryDetector.recordEnd(
                        buffers,
                        4
                    )
                ).toBe(
                    2
                );
            }
        );


        test(
            "finds LF when LF is the first byte of the next buffer",
            () => {

                const buffers =
                    bytes(
                        "abc",
                        "\nXYZ"
                    );


                expect(
                    newlineRecordBoundaryDetector.nextRecordStart(
                        buffers,
                        0,
                        0
                    )
                ).toBe(
                    4
                );


                expect(
                    newlineRecordBoundaryDetector.recordEnd(
                        buffers,
                        4
                    )
                ).toBe(
                    2
                );
            }
        );


        test(
            "handles CRLF split across byte buffers",
            () => {

                const buffers =
                    bytes(
                        "abc\r",
                        "\nXYZ"
                    );


                expect(
                    newlineRecordBoundaryDetector.nextRecordStart(
                        buffers,
                        0,
                        0
                    )
                ).toBe(
                    5
                );


                expect(
                    newlineRecordBoundaryDetector.recordEnd(
                        buffers,
                        5
                    )
                ).toBe(
                    2
                );
            }
        );


        test(
            "handles CR as the final byte of one buffer and LF alone in the next",
            () => {

                const buffers =
                    bytes(
                        "abc\r",
                        "\n",
                        "XYZ"
                    );


                expect(
                    newlineRecordBoundaryDetector.nextRecordStart(
                        buffers,
                        0,
                        0
                    )
                ).toBe(
                    5
                );


                expect(
                    newlineRecordBoundaryDetector.recordEnd(
                        buffers,
                        5
                    )
                ).toBe(
                    2
                );
            }
        );


        test(
            "returns -1 when LF is not yet available",
            () => {

                const buffers =
                    bytes(
                        "abc",
                        "def"
                    );


                expect(
                    newlineRecordBoundaryDetector.nextRecordStart(
                        buffers,
                        0,
                        0
                    )
                ).toBe(
                    -1
                );
            }
        );


        test(
            "continues searching from searchStart without rescanning the earlier bytes",
            () => {

                /*
                 * The first four bytes have already been searched.
                 *
                 * A new buffer has now arrived containing LF as its
                 * first byte.
                 *
                 * recordStart remains zero because the record itself
                 * still begins at byte zero.
                 *
                 * searchStart advances to four because bytes 0..3 have
                 * already been examined.
                 */
                const buffers =
                    bytes(
                        "abcd",
                        "\nXYZ"
                    );


                expect(
                    newlineRecordBoundaryDetector.nextRecordStart(
                        buffers,
                        0,
                        4
                    )
                ).toBe(
                    5
                );


                expect(
                    newlineRecordBoundaryDetector.recordEnd(
                        buffers,
                        5
                    )
                ).toBe(
                    3
                );
            }
        );


        test(
            "continues searching from searchStart across several retained buffers",
            () => {

                /*
                 * Logical content:
                 *
                 *     abcdefghijkl\nXYZ
                 *
                 * Bytes 0..7 have already been searched.
                 */
                const buffers =
                    bytes(
                        "abcd",
                        "efgh",
                        "ijkl",
                        "\nXYZ"
                    );


                expect(
                    newlineRecordBoundaryDetector.nextRecordStart(
                        buffers,
                        0,
                        8
                    )
                ).toBe(
                    13
                );


                expect(
                    newlineRecordBoundaryDetector.recordEnd(
                        buffers,
                        13
                    )
                ).toBe(
                    11
                );
            }
        );


        test(
            "recognises an empty LF record",
            () => {

                const buffers =
                    bytes(
                        "\nXYZ"
                    );


                expect(
                    newlineRecordBoundaryDetector.nextRecordStart(
                        buffers,
                        0,
                        0
                    )
                ).toBe(
                    1
                );


                expect(
                    newlineRecordBoundaryDetector.recordEnd(
                        buffers,
                        1
                    )
                ).toBe(
                    -1
                );
            }
        );


        test(
            "recognises an empty CRLF record",
            () => {

                const buffers =
                    bytes(
                        "\r\nXYZ"
                    );


                expect(
                    newlineRecordBoundaryDetector.nextRecordStart(
                        buffers,
                        0,
                        0
                    )
                ).toBe(
                    2
                );


                expect(
                    newlineRecordBoundaryDetector.recordEnd(
                        buffers,
                        2
                    )
                ).toBe(
                    -1
                );
            }
        );


        test(
            "recognises an empty CRLF record split across buffers",
            () => {

                const buffers =
                    bytes(
                        "\r",
                        "\nXYZ"
                    );


                expect(
                    newlineRecordBoundaryDetector.nextRecordStart(
                        buffers,
                        0,
                        0
                    )
                ).toBe(
                    2
                );


                expect(
                    newlineRecordBoundaryDetector.recordEnd(
                        buffers,
                        2
                    )
                ).toBe(
                    -1
                );
            }
        );


        test(
            "recognises an empty CRLF record when only the new buffer must be searched",
            () => {

                const buffers =
                    bytes(
                        "\r",
                        "\nXYZ"
                    );


                expect(
                    newlineRecordBoundaryDetector.nextRecordStart(
                        buffers,
                        0,
                        1
                    )
                ).toBe(
                    2
                );


                expect(
                    newlineRecordBoundaryDetector.recordEnd(
                        buffers,
                        2
                    )
                ).toBe(
                    -1
                );
            }
        );


        test(
            "does not lose consecutive empty LF records",
            () => {

                const buffers =
                    bytes(
                        "\n\n\nX\n"
                    );


                const first =
                    newlineRecordBoundaryDetector.nextRecordStart(
                        buffers,
                        0,
                        0
                    );


                expect(
                    first
                ).toBe(
                    1
                );

                expect(
                    newlineRecordBoundaryDetector.recordEnd(
                        buffers,
                        first
                    )
                ).toBe(
                    -1
                );


                const second =
                    newlineRecordBoundaryDetector.nextRecordStart(
                        buffers,
                        first,
                        first
                    );


                expect(
                    second
                ).toBe(
                    2
                );

                expect(
                    newlineRecordBoundaryDetector.recordEnd(
                        buffers,
                        second
                    )
                ).toBe(
                    0
                );


                const third =
                    newlineRecordBoundaryDetector.nextRecordStart(
                        buffers,
                        second,
                        second
                    );


                expect(
                    third
                ).toBe(
                    3
                );

                expect(
                    newlineRecordBoundaryDetector.recordEnd(
                        buffers,
                        third
                    )
                ).toBe(
                    1
                );


                const fourth =
                    newlineRecordBoundaryDetector.nextRecordStart(
                        buffers,
                        third,
                        third
                    );


                expect(
                    fourth
                ).toBe(
                    5
                );

                expect(
                    newlineRecordBoundaryDetector.recordEnd(
                        buffers,
                        fourth
                    )
                ).toBe(
                    3
                );
            }
        );


        test(
            "does not lose consecutive empty CRLF records",
            () => {

                const buffers =
                    bytes(
                        "\r\n\r\nX\r\n"
                    );


                const first =
                    newlineRecordBoundaryDetector.nextRecordStart(
                        buffers,
                        0,
                        0
                    );


                expect(
                    first
                ).toBe(
                    2
                );

                expect(
                    newlineRecordBoundaryDetector.recordEnd(
                        buffers,
                        first
                    )
                ).toBe(
                    -1
                );


                const second =
                    newlineRecordBoundaryDetector.nextRecordStart(
                        buffers,
                        first,
                        first
                    );


                expect(
                    second
                ).toBe(
                    4
                );

                expect(
                    newlineRecordBoundaryDetector.recordEnd(
                        buffers,
                        second
                    )
                ).toBe(
                    1
                );


                const third =
                    newlineRecordBoundaryDetector.nextRecordStart(
                        buffers,
                        second,
                        second
                    );


                expect(
                    third
                ).toBe(
                    7
                );

                expect(
                    newlineRecordBoundaryDetector.recordEnd(
                        buffers,
                        third
                    )
                ).toBe(
                    4
                );
            }
        );


        test(
            "handles consecutive empty records across buffer boundaries",
            () => {

                const buffers =
                    bytes(
                        "\r",
                        "\n",
                        "\r",
                        "\nX\r",
                        "\n"
                    );


                const first =
                    newlineRecordBoundaryDetector.nextRecordStart(
                        buffers,
                        0,
                        0
                    );


                expect(
                    first
                ).toBe(
                    2
                );

                expect(
                    newlineRecordBoundaryDetector.recordEnd(
                        buffers,
                        first
                    )
                ).toBe(
                    -1
                );


                const second =
                    newlineRecordBoundaryDetector.nextRecordStart(
                        buffers,
                        first,
                        first
                    );


                expect(
                    second
                ).toBe(
                    4
                );

                expect(
                    newlineRecordBoundaryDetector.recordEnd(
                        buffers,
                        second
                    )
                ).toBe(
                    1
                );


                const third =
                    newlineRecordBoundaryDetector.nextRecordStart(
                        buffers,
                        second,
                        second
                    );


                expect(
                    third
                ).toBe(
                    7
                );

                expect(
                    newlineRecordBoundaryDetector.recordEnd(
                        buffers,
                        third
                    )
                ).toBe(
                    4
                );
            }
        );


        test(
            "starts searching at a non-zero record offset",
            () => {

                const buffers =
                    bytes(
                        "one\ntwo\nthree\n"
                    );


                expect(
                    newlineRecordBoundaryDetector.nextRecordStart(
                        buffers,
                        4,
                        4
                    )
                ).toBe(
                    8
                );


                expect(
                    newlineRecordBoundaryDetector.recordEnd(
                        buffers,
                        8
                    )
                ).toBe(
                    6
                );
            }
        );


        test(
            "starts searching at a non-zero offset across several buffers",
            () => {

                const buffers =
                    bytes(
                        "one\n",
                        "tw",
                        "o\nthr",
                        "ee\n"
                    );


                expect(
                    newlineRecordBoundaryDetector.nextRecordStart(
                        buffers,
                        4,
                        4
                    )
                ).toBe(
                    8
                );


                expect(
                    newlineRecordBoundaryDetector.recordEnd(
                        buffers,
                        8
                    )
                ).toBe(
                    6
                );
            }
        );


        test(
            "recordEnd rejects a boundary which does not follow LF",
            () => {

                const buffers =
                    bytes(
                        "abcd"
                    );


                expect(
                    () =>
                        newlineRecordBoundaryDetector.recordEnd(
                            buffers,
                            4
                        )
                ).toThrow(
                    "byte 3 is not LF"
                );
            }
        );
    }
);


describe(
    "createFixedWidthRecordBoundaryDetector",
    () => {

        test(
            "finds a record within one buffer",
            () => {

                const detector =
                    createFixedWidthRecordBoundaryDetector(
                        4
                    );


                const buffers =
                    bytes(
                        "abcdWXYZ"
                    );


                expect(
                    detector.nextRecordStart(
                        buffers,
                        0,
                        0
                    )
                ).toBe(
                    4
                );


                expect(
                    detector.recordEnd(
                        buffers,
                        4
                    )
                ).toBe(
                    3
                );
            }
        );


        test(
            "finds the second record using a non-zero start",
            () => {

                const detector =
                    createFixedWidthRecordBoundaryDetector(
                        4
                    );


                const buffers =
                    bytes(
                        "abcdWXYZ"
                    );


                expect(
                    detector.nextRecordStart(
                        buffers,
                        4,
                        4
                    )
                ).toBe(
                    8
                );


                expect(
                    detector.recordEnd(
                        buffers,
                        8
                    )
                ).toBe(
                    7
                );
            }
        );


        test(
            "ignores searchStart when locating a fixed-width boundary",
            () => {

                const detector =
                    createFixedWidthRecordBoundaryDetector(
                        4
                    );


                const buffers =
                    bytes(
                        "abcdefgh"
                    );


                expect(
                    detector.nextRecordStart(
                        buffers,
                        0,
                        3
                    )
                ).toBe(
                    4
                );
            }
        );


        test(
            "finds a record spanning two buffers",
            () => {

                const detector =
                    createFixedWidthRecordBoundaryDetector(
                        6
                    );


                const buffers =
                    bytes(
                        "abcd",
                        "efgh"
                    );


                expect(
                    detector.nextRecordStart(
                        buffers,
                        0,
                        0
                    )
                ).toBe(
                    6
                );


                expect(
                    detector.recordEnd(
                        buffers,
                        6
                    )
                ).toBe(
                    5
                );
            }
        );


        test(
            "finds a record spanning many buffers",
            () => {

                const detector =
                    createFixedWidthRecordBoundaryDetector(
                        10
                    );


                const buffers =
                    bytes(
                        "ab",
                        "cd",
                        "ef",
                        "gh",
                        "ij",
                        "kl"
                    );


                expect(
                    detector.nextRecordStart(
                        buffers,
                        0,
                        0
                    )
                ).toBe(
                    10
                );


                expect(
                    detector.recordEnd(
                        buffers,
                        10
                    )
                ).toBe(
                    9
                );
            }
        );


        test(
            "accepts a record ending exactly at available data",
            () => {

                const detector =
                    createFixedWidthRecordBoundaryDetector(
                        8
                    );


                const buffers =
                    bytes(
                        "abcd",
                        "WXYZ"
                    );


                expect(
                    detector.nextRecordStart(
                        buffers,
                        0,
                        0
                    )
                ).toBe(
                    8
                );


                expect(
                    detector.recordEnd(
                        buffers,
                        8
                    )
                ).toBe(
                    7
                );
            }
        );


        test(
            "returns -1 when one byte short",
            () => {

                const detector =
                    createFixedWidthRecordBoundaryDetector(
                        8
                    );


                const buffers =
                    bytes(
                        "abcd",
                        "WXY"
                    );


                expect(
                    detector.nextRecordStart(
                        buffers,
                        0,
                        0
                    )
                ).toBe(
                    -1
                );
            }
        );


        test(
            "returns -1 when no data is available",
            () => {

                const detector =
                    createFixedWidthRecordBoundaryDetector(
                        4
                    );


                expect(
                    detector.nextRecordStart(
                        [],
                        0,
                        0
                    )
                ).toBe(
                    -1
                );
            }
        );


        test(
            "handles a fixed record starting part way through the first buffer",
            () => {

                const detector =
                    createFixedWidthRecordBoundaryDetector(
                        4
                    );


                const buffers =
                    bytes(
                        "xxabcdyy"
                    );


                expect(
                    detector.nextRecordStart(
                        buffers,
                        2,
                        2
                    )
                ).toBe(
                    6
                );


                expect(
                    detector.recordEnd(
                        buffers,
                        6
                    )
                ).toBe(
                    5
                );
            }
        );


        test(
            "handles a fixed record starting part way through one buffer and ending in another",
            () => {

                const detector =
                    createFixedWidthRecordBoundaryDetector(
                        5
                    );


                const buffers =
                    bytes(
                        "xxab",
                        "cdeZ"
                    );


                expect(
                    detector.nextRecordStart(
                        buffers,
                        2,
                        2
                    )
                ).toBe(
                    7
                );


                expect(
                    detector.recordEnd(
                        buffers,
                        7
                    )
                ).toBe(
                    6
                );
            }
        );


        test.each(
            [
                0,
                -1,
                -100,
                1.5,
                Number.NaN,
                Number.POSITIVE_INFINITY,
                Number.NEGATIVE_INFINITY
            ]
        )(
            "rejects invalid record size %s",
            recordSize => {

                expect(
                    () =>
                        createFixedWidthRecordBoundaryDetector(
                            recordSize
                        )
                ).toThrow(
                    "Fixed record size must be a positive integer"
                );
            }
        );
    }
);


function bytes(
    ...values: string[]
): readonly Uint8Array[] {

    const encoder =
        new TextEncoder();


    return values.map(
        value =>
            encoder.encode(
                value
            )
    );
}