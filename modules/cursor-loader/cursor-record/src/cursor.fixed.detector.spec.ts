import {
    createFixedWidthRecordBoundaryDetector
} from "./cursor.fixed.detector";


describe(
    "createFixedWidthRecordBoundaryDetector",
    () => {

        it(
            "rejects zero record size",
            () => {

                expect(
                    () =>
                        createFixedWidthRecordBoundaryDetector(
                            0
                        )
                ).toThrow(
                    "Fixed record size must be a positive integer"
                );
            }
        );


        it(
            "rejects negative record size",
            () => {

                expect(
                    () =>
                        createFixedWidthRecordBoundaryDetector(
                            -1
                        )
                ).toThrow(
                    "Fixed record size must be a positive integer"
                );
            }
        );


        it(
            "rejects non-integer record size",
            () => {

                expect(
                    () =>
                        createFixedWidthRecordBoundaryDetector(
                            1.5
                        )
                ).toThrow(
                    "Fixed record size must be a positive integer"
                );
            }
        );


        it(
            "finds the next fixed record boundary",
            () => {

                const detector =
                    createFixedWidthRecordBoundaryDetector(
                        4
                    );

                const buffers = [
                    bytes(
                        "abcdefgh"
                    )
                ];


                expect(
                    detector.nextRecordStart(
                        buffers,
                        0,
                        0
                    )
                ).toBe(
                    4
                );
            }
        );


        it(
            "finds a later fixed record boundary",
            () => {

                const detector =
                    createFixedWidthRecordBoundaryDetector(
                        4
                    );

                const buffers = [
                    bytes(
                        "abcdefgh"
                    )
                ];


                expect(
                    detector.nextRecordStart(
                        buffers,
                        4,
                        4
                    )
                ).toBe(
                    8
                );
            }
        );


        it(
            "returns -1 when the complete record is not buffered",
            () => {

                const detector =
                    createFixedWidthRecordBoundaryDetector(
                        4
                    );

                const buffers = [
                    bytes(
                        "abc"
                    )
                ];


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


        it(
            "finds a boundary across physical buffers",
            () => {

                const detector =
                    createFixedWidthRecordBoundaryDetector(
                        5
                    );

                const buffers = [
                    bytes(
                        "abc"
                    ),

                    bytes(
                        "de"
                    )
                ];


                expect(
                    detector.nextRecordStart(
                        buffers,
                        0,
                        0
                    )
                ).toBe(
                    5
                );
            }
        );


        it(
            "ignores searchStart",
            () => {

                const detector =
                    createFixedWidthRecordBoundaryDetector(
                        4
                    );

                const buffers = [
                    bytes(
                        "abcdefgh"
                    )
                ];


                expect(
                    detector.nextRecordStart(
                        buffers,
                        0,
                        7
                    )
                ).toBe(
                    4
                );
            }
        );


        it(
            "uses frameStart when calculating the next boundary",
            () => {

                const detector =
                    createFixedWidthRecordBoundaryDetector(
                        4
                    );

                const buffers = [
                    bytes(
                        "xxabcdefgh"
                    )
                ];


                expect(
                    detector.nextRecordStart(
                        buffers,
                        2,
                        2
                    )
                ).toBe(
                    6
                );
            }
        );


        it(
            "returns frameStart as recordStart",
            () => {

                const detector =
                    createFixedWidthRecordBoundaryDetector(
                        4
                    );


                expect(
                    detector.recordStart(
                        17
                    )
                ).toBe(
                    17
                );
            }
        );


        it(
            "returns the byte before nextRecordStart as recordEnd",
            () => {

                const detector =
                    createFixedWidthRecordBoundaryDetector(
                        4
                    );


                expect(
                    detector.recordEnd(
                        [],
                        8
                    )
                ).toBe(
                    7
                );
            }
        );
    }
);


function bytes(
    value: string
): Uint8Array {

    return new TextEncoder()
        .encode(
            value
        );
}