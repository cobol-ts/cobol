import {
    byteAt,
    findByte,
    totalLength
} from "./cursor.record.helpers";


describe(
    "cursor record helpers",
    () => {

        describe(
            "totalLength",
            () => {

                it(
                    "returns zero for no buffers",
                    () => {

                        expect(
                            totalLength(
                                []
                            )
                        ).toBe(
                            0
                        );
                    }
                );


                it(
                    "returns the length of one buffer",
                    () => {

                        expect(
                            totalLength(
                                [
                                    bytes(
                                        "abc"
                                    )
                                ]
                            )
                        ).toBe(
                            3
                        );
                    }
                );


                it(
                    "adds the lengths of several buffers",
                    () => {

                        expect(
                            totalLength(
                                [
                                    bytes(
                                        "abc"
                                    ),

                                    bytes(
                                        "de"
                                    ),

                                    bytes(
                                        "fghi"
                                    )
                                ]
                            )
                        ).toBe(
                            9
                        );
                    }
                );
            }
        );


        describe(
            "byteAt",
            () => {

                it(
                    "reads from a single buffer",
                    () => {

                        const buffers = [
                            bytes(
                                "abc"
                            )
                        ];


                        expect(
                            byteAt(
                                buffers,
                                1
                            )
                        ).toBe(
                            "b".charCodeAt(
                                0
                            )
                        );
                    }
                );


                it(
                    "reads across buffer boundaries",
                    () => {

                        const buffers = [
                            bytes(
                                "abc"
                            ),

                            bytes(
                                "def"
                            )
                        ];


                        expect(
                            byteAt(
                                buffers,
                                3
                            )
                        ).toBe(
                            "d".charCodeAt(
                                0
                            )
                        );


                        expect(
                            byteAt(
                                buffers,
                                5
                            )
                        ).toBe(
                            "f".charCodeAt(
                                0
                            )
                        );
                    }
                );


                it(
                    "throws for a negative offset",
                    () => {

                        expect(
                            () =>
                                byteAt(
                                    [
                                        bytes(
                                            "abc"
                                        )
                                    ],
                                    -1
                                )
                        ).toThrow(
                            "Byte offset must be a non-negative integer"
                        );
                    }
                );


                it(
                    "throws for a non-integer offset",
                    () => {

                        expect(
                            () =>
                                byteAt(
                                    [
                                        bytes(
                                            "abc"
                                        )
                                    ],
                                    1.5
                                )
                        ).toThrow(
                            "Byte offset must be a non-negative integer"
                        );
                    }
                );


                it(
                    "throws when the offset is beyond the available bytes",
                    () => {

                        expect(
                            () =>
                                byteAt(
                                    [
                                        bytes(
                                            "abc"
                                        ),

                                        bytes(
                                            "de"
                                        )
                                    ],
                                    5
                                )
                        ).toThrow(
                            "Cannot read byte at logical offset 5; only 5 bytes are available"
                        );
                    }
                );
            }
        );


        describe(
            "findByte",
            () => {

                it(
                    "finds a byte in the first buffer",
                    () => {

                        expect(
                            findByte(
                                [
                                    bytes(
                                        "abc"
                                    )
                                ],
                                0,
                                "b".charCodeAt(
                                    0
                                )
                            )
                        ).toBe(
                            1
                        );
                    }
                );


                it(
                    "finds a byte in a later buffer",
                    () => {

                        expect(
                            findByte(
                                [
                                    bytes(
                                        "abc"
                                    ),

                                    bytes(
                                        "def"
                                    )
                                ],
                                0,
                                "e".charCodeAt(
                                    0
                                )
                            )
                        ).toBe(
                            4
                        );
                    }
                );


                it(
                    "starts searching from the supplied logical offset",
                    () => {

                        expect(
                            findByte(
                                [
                                    bytes(
                                        "a\nbc"
                                    ),

                                    bytes(
                                        "def\n"
                                    )
                                ],
                                4,
                                "\n".charCodeAt(
                                    0
                                )
                            )
                        ).toBe(
                            7
                        );
                    }
                );


                it(
                    "finds a byte at a physical buffer boundary",
                    () => {

                        expect(
                            findByte(
                                [
                                    bytes(
                                        "abc"
                                    ),

                                    bytes(
                                        "\ndef"
                                    )
                                ],
                                3,
                                "\n".charCodeAt(
                                    0
                                )
                            )
                        ).toBe(
                            3
                        );
                    }
                );


                it(
                    "returns -1 when the byte is not present",
                    () => {

                        expect(
                            findByte(
                                [
                                    bytes(
                                        "abc"
                                    ),

                                    bytes(
                                        "def"
                                    )
                                ],
                                0,
                                "\n".charCodeAt(
                                    0
                                )
                            )
                        ).toBe(
                            -1
                        );
                    }
                );


                it(
                    "returns -1 when startOffset is at the end",
                    () => {

                        expect(
                            findByte(
                                [
                                    bytes(
                                        "abc"
                                    )
                                ],
                                3,
                                "a".charCodeAt(
                                    0
                                )
                            )
                        ).toBe(
                            -1
                        );
                    }
                );


                it(
                    "throws for a negative start offset",
                    () => {

                        expect(
                            () =>
                                findByte(
                                    [
                                        bytes(
                                            "abc"
                                        )
                                    ],
                                    -1,
                                    "a".charCodeAt(
                                        0
                                    )
                                )
                        ).toThrow(
                            "Search start offset must be a non-negative integer"
                        );
                    }
                );


                it(
                    "throws for a non-integer start offset",
                    () => {

                        expect(
                            () =>
                                findByte(
                                    [
                                        bytes(
                                            "abc"
                                        )
                                    ],
                                    0.5,
                                    "a".charCodeAt(
                                        0
                                    )
                                )
                        ).toThrow(
                            "Search start offset must be a non-negative integer"
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