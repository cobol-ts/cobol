import {
    newlineRecordBoundaryDetector
} from "./cursor.newline.detector";


describe(
    "newlineRecordBoundaryDetector",
    () => {

        describe(
            "nextRecordStart",
            () => {

                it(
                    "finds an LF terminated record",
                    () => {

                        const buffers = [
                            bytes(
                                "abc\nxyz"
                            )
                        ];


                        expect(
                            newlineRecordBoundaryDetector
                                .nextRecordStart(
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
                    "finds a CRLF terminated record",
                    () => {

                        const buffers = [
                            bytes(
                                "abc\r\nxyz"
                            )
                        ];


                        expect(
                            newlineRecordBoundaryDetector
                                .nextRecordStart(
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
                    "returns -1 when the current buffers do not contain LF",
                    () => {

                        const buffers = [
                            bytes(
                                "abcdef"
                            )
                        ];


                        expect(
                            newlineRecordBoundaryDetector
                                .nextRecordStart(
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
                    "finds LF in a later physical buffer",
                    () => {

                        const buffers = [
                            bytes(
                                "abcd"
                            ),

                            bytes(
                                "efgh"
                            ),

                            bytes(
                                "ij\nxyz"
                            )
                        ];


                        expect(
                            newlineRecordBoundaryDetector
                                .nextRecordStart(
                                    buffers,
                                    0,
                                    0
                                )
                        ).toBe(
                            11
                        );
                    }
                );


                it(
                    "continues searching from searchStart",
                    () => {

                        const buffers = [
                            bytes(
                                "abcd"
                            ),

                            bytes(
                                "efgh"
                            ),

                            bytes(
                                "ij\n"
                            )
                        ];


                        expect(
                            newlineRecordBoundaryDetector
                                .nextRecordStart(
                                    buffers,
                                    0,
                                    8
                                )
                        ).toBe(
                            11
                        );
                    }
                );


                it(
                    "does not return an LF before searchStart",
                    () => {

                        const buffers = [
                            bytes(
                                "a\nbc"
                            ),

                            bytes(
                                "def\n"
                            )
                        ];


                        expect(
                            newlineRecordBoundaryDetector
                                .nextRecordStart(
                                    buffers,
                                    0,
                                    4
                                )
                        ).toBe(
                            8
                        );
                    }
                );


                it(
                    "finds LF when CRLF is split across buffers",
                    () => {

                        const buffers = [
                            bytes(
                                "abc\r"
                            ),

                            bytes(
                                "\nxyz"
                            )
                        ];


                        expect(
                            newlineRecordBoundaryDetector
                                .nextRecordStart(
                                    buffers,
                                    0,
                                    4
                                )
                        ).toBe(
                            5
                        );
                    }
                );


                it(
                    "supports an empty LF terminated record",
                    () => {

                        const buffers = [
                            bytes(
                                "\nabc"
                            )
                        ];


                        expect(
                            newlineRecordBoundaryDetector
                                .nextRecordStart(
                                    buffers,
                                    0,
                                    0
                                )
                        ).toBe(
                            1
                        );
                    }
                );


                it(
                    "supports an empty CRLF terminated record",
                    () => {

                        const buffers = [
                            bytes(
                                "\r\nabc"
                            )
                        ];


                        expect(
                            newlineRecordBoundaryDetector
                                .nextRecordStart(
                                    buffers,
                                    0,
                                    0
                                )
                        ).toBe(
                            2
                        );
                    }
                );
            }
        );


        describe(
            "recordStart",
            () => {

                it(
                    "returns frameStart unchanged",
                    () => {

                        expect(
                            newlineRecordBoundaryDetector
                                .recordStart(
                                    17
                                )
                        ).toBe(
                            17
                        );
                    }
                );
            }
        );


        describe(
            "recordEnd",
            () => {

                it(
                    "excludes LF from the record",
                    () => {

                        const buffers = [
                            bytes(
                                "abc\nxyz"
                            )
                        ];


                        expect(
                            newlineRecordBoundaryDetector
                                .recordEnd(
                                    buffers,
                                    4
                                )
                        ).toBe(
                            2
                        );
                    }
                );


                it(
                    "excludes CRLF from the record",
                    () => {

                        const buffers = [
                            bytes(
                                "abc\r\nxyz"
                            )
                        ];


                        expect(
                            newlineRecordBoundaryDetector
                                .recordEnd(
                                    buffers,
                                    5
                                )
                        ).toBe(
                            2
                        );
                    }
                );


                it(
                    "excludes CRLF when split across physical buffers",
                    () => {

                        const buffers = [
                            bytes(
                                "abc\r"
                            ),

                            bytes(
                                "\nxyz"
                            )
                        ];


                        expect(
                            newlineRecordBoundaryDetector
                                .recordEnd(
                                    buffers,
                                    5
                                )
                        ).toBe(
                            2
                        );
                    }
                );


                it(
                    "returns -1 for an empty LF terminated record",
                    () => {

                        const buffers = [
                            bytes(
                                "\nabc"
                            )
                        ];


                        expect(
                            newlineRecordBoundaryDetector
                                .recordEnd(
                                    buffers,
                                    1
                                )
                        ).toBe(
                            -1
                        );
                    }
                );


                it(
                    "returns -1 for an empty CRLF terminated record",
                    () => {

                        const buffers = [
                            bytes(
                                "\r\nabc"
                            )
                        ];


                        expect(
                            newlineRecordBoundaryDetector
                                .recordEnd(
                                    buffers,
                                    2
                                )
                        ).toBe(
                            -1
                        );
                    }
                );


                it(
                    "returns the correct logical offset when the record spans buffers",
                    () => {

                        const buffers = [
                            bytes(
                                "abcd"
                            ),

                            bytes(
                                "efgh"
                            ),

                            bytes(
                                "ij\nxyz"
                            )
                        ];


                        expect(
                            newlineRecordBoundaryDetector
                                .recordEnd(
                                    buffers,
                                    11
                                )
                        ).toBe(
                            9
                        );
                    }
                );


                it(
                    "only treats CR immediately before LF as framing",
                    () => {

                        const buffers = [
                            bytes(
                                "ab\rc\nxyz"
                            )
                        ];


                        expect(
                            newlineRecordBoundaryDetector
                                .recordEnd(
                                    buffers,
                                    5
                                )
                        ).toBe(
                            3
                        );
                    }
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