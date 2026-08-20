import {
    defaultFileCodecRegistry,
} from "@cobol-ts/cobolcodec";
import {
    FileMetadata,
} from "@cobol-ts/copybookfiles";
import {
    ErrorsOr,
    valueOrThrow,
} from "@cobol-ts/errors";
import {
    FileHandleLike,
    readFileRecords,
    readFixedRecords,
} from "./cobol.file.reader";


const metadata = {
    size: 5,

    fields: [
        {
            name: "NAME",
            from: 0,
            to: 3,

            type: {
                kind: "text",
                encoding: "ascii",
            },
        },

        {
            name: "COUNT",
            from: 3,
            to: 5,

            type: {
                kind: "integer",
                encoding: "binary-integer",
                byteOrder: "big-endian",
                semantics: "native",
                signed: false,
            },
        },
    ],
} as const satisfies FileMetadata;


type Equal<TActual, TExpected, > =
    (<T>() => T extends TActual ? 1 : 2) extends
        (<T>() => T extends TExpected ? 1 : 2)
        ? true
        : false;

type Expect<T extends true, > = T;

type AsyncGeneratorValue<T> =
    T extends AsyncGenerator<infer TValue>
        ? TValue
        : never;


function fakeFile(
    source: Uint8Array,
    readSizes?: number[],
): FileHandleLike {
    let position = 0;
    let readIndex = 0;

    return {
        async read(
            buffer,
            offset,
            length,
        ) {
            const requested =
                readSizes
                    ? readSizes[readIndex++] ?? length
                    : length;

            const bytesRead =
                Math.min(
                    requested,
                    length,
                    source.length - position,
                );

            buffer.set(
                source.subarray(
                    position,
                    position + bytesRead,
                ),
                offset,
            );

            position += bytesRead;

            return {
                bytesRead,
                buffer,
            };
        },

        async close() {
        },
    };
}


describe(
    "readFixedRecords",
    () => {
        it(
            "reads complete records",
            async () => {
                const file =
                    fakeFile(
                        new Uint8Array([
                            1, 2, 3, 4,
                            5, 6, 7, 8,
                        ]),
                    );

                const records: Uint8Array[] = [];

                for await (
                    const record of readFixedRecords(
                    file,
                    4,
                )
                    )
                    records.push(
                        record.slice(),
                    );

                expect(records)
                    .toEqual([
                        new Uint8Array([
                            1, 2, 3, 4,
                        ]),
                        new Uint8Array([
                            5, 6, 7, 8,
                        ]),
                    ]);
            },
        );


        it(
            "combines partial reads into one record",
            async () => {
                const file =
                    fakeFile(
                        new Uint8Array([
                            1, 2, 3, 4, 5,
                        ]),
                        [
                            2,
                            1,
                            2,
                            0,
                        ],
                    );

                const records: Uint8Array[] = [];

                for await (
                    const record of readFixedRecords(
                    file,
                    5,
                )
                    )
                    records.push(
                        record.slice(),
                    );

                expect(records)
                    .toEqual([
                        new Uint8Array([
                            1, 2, 3, 4, 5,
                        ]),
                    ]);
            },
        );


        it(
            "handles partial reads across multiple records",
            async () => {
                const file =
                    fakeFile(
                        new Uint8Array([
                            1, 2, 3, 4,
                            5, 6, 7, 8,
                        ]),
                        [
                            1,
                            2,
                            1,
                            3,
                            1,
                            0,
                        ],
                    );

                const records: Uint8Array[] = [];

                for await (
                    const record of readFixedRecords(
                    file,
                    4,
                )
                    )
                    records.push(
                        record.slice(),
                    );

                expect(records)
                    .toEqual([
                        new Uint8Array([
                            1, 2, 3, 4,
                        ]),
                        new Uint8Array([
                            5, 6, 7, 8,
                        ]),
                    ]);
            },
        );


        it(
            "handles a record split into single byte reads",
            async () => {
                const file =
                    fakeFile(
                        new Uint8Array([
                            1, 2, 3, 4,
                        ]),
                        [
                            1,
                            1,
                            1,
                            1,
                            0,
                        ],
                    );

                const records: Uint8Array[] = [];

                for await (
                    const record of readFixedRecords(
                    file,
                    4,
                )
                    )
                    records.push(
                        record.slice(),
                    );

                expect(records)
                    .toEqual([
                        new Uint8Array([
                            1, 2, 3, 4,
                        ]),
                    ]);
            },
        );


        it(
            "returns no records for an empty file",
            async () => {
                const file =
                    fakeFile(
                        new Uint8Array(),
                    );

                const records: Uint8Array[] = [];

                for await (
                    const record of readFixedRecords(
                    file,
                    4,
                )
                    )
                    records.push(
                        record.slice(),
                    );

                expect(records)
                    .toEqual([]);
            },
        );


        it(
            "rejects an incomplete first record",
            async () => {
                const file =
                    fakeFile(
                        new Uint8Array([
                            1, 2, 3,
                        ]),
                    );

                const read =
                    async () => {
                        for await (
                            const _ of readFixedRecords(
                            file,
                            4,
                        )
                            ) {
                        }
                    };

                await expect(
                    read(),
                ).rejects.toThrow(
                    "final record has 3 bytes but expected 4",
                );
            },
        );


        it(
            "rejects an incomplete final record",
            async () => {
                const file =
                    fakeFile(
                        new Uint8Array([
                            1, 2, 3, 4,
                            5, 6,
                        ]),
                    );

                const records: Uint8Array[] = [];

                const read =
                    async () => {
                        for await (
                            const record of readFixedRecords(
                            file,
                            4,
                        )
                            )
                            records.push(
                                record.slice(),
                            );
                    };

                await expect(
                    read(),
                ).rejects.toThrow(
                    "final record has 2 bytes but expected 4",
                );

                expect(records)
                    .toEqual([
                        new Uint8Array([
                            1, 2, 3, 4,
                        ]),
                    ]);
            },
        );


        it(
            "rejects an incomplete final record after partial reads",
            async () => {
                const file =
                    fakeFile(
                        new Uint8Array([
                            1, 2, 3, 4,
                            5, 6, 7,
                        ]),
                        [
                            2,
                            2,
                            1,
                            1,
                            1,
                            0,
                        ],
                    );

                const read =
                    async () => {
                        for await (
                            const _ of readFixedRecords(
                            file,
                            4,
                        )
                            ) {
                        }
                    };

                await expect(
                    read(),
                ).rejects.toThrow(
                    "final record has 3 bytes but expected 4",
                );
            },
        );
    },
);


describe(
    "readFileRecords",
    () => {
        it(
            "parses records one at a time",
            async () => {
                const readRecords =
                    async function* () {
                        yield new Uint8Array([
                            65, 66, 67, 0, 1,
                        ]);

                        yield new Uint8Array([
                            68, 69, 70, 0, 2,
                        ]);
                    };

                const records = [];

                for await (
                    const record of readFileRecords(
                    "ignored.dat",
                    metadata,
                    defaultFileCodecRegistry,
                    readRecords,
                )
                    )
                    records.push(
                        valueOrThrow(
                            record,
                        ),
                    );

                expect(records)
                    .toEqual([
                        [
                            "ABC",
                            1n,
                        ],
                        [
                            "DEF",
                            2n,
                        ],
                    ]);
            },
        );


        it(
            "passes the filename and record size to the reader",
            async () => {
                let actualFilename: string | undefined;
                let actualRecordSize: number | undefined;

                const readRecords =
                    async function* (
                        filename: string,
                        recordSize: number,
                    ) {
                        actualFilename =
                            filename;

                        actualRecordSize =
                            recordSize;
                    };

                for await (
                    const _ of readFileRecords(
                    "customers.dat",
                    metadata,
                    defaultFileCodecRegistry,
                    readRecords,
                )
                    ) {
                }

                expect(actualFilename)
                    .toBe(
                        "customers.dat",
                    );

                expect(actualRecordSize)
                    .toBe(
                        5,
                    );
            },
        );


        it(
            "reads an empty file",
            async () => {
                const readRecords =
                    async function* () {
                    };

                const records = [];

                for await (
                    const record of readFileRecords(
                    "ignored.dat",
                    metadata,
                    defaultFileCodecRegistry,
                    readRecords,
                )
                    )
                    records.push(
                        record,
                    );

                expect(records)
                    .toEqual([]);
            },
        );


        it(
            "rejects zero record size",
            async () => {
                const invalidMetadata = {
                    ...metadata,
                    size: 0,
                };

                const read =
                    async () => {
                        for await (
                            const _ of readFileRecords(
                            "ignored.dat",
                            invalidMetadata,
                            defaultFileCodecRegistry,
                            async function* () {
                            },
                        )
                            ) {
                        }
                    };

                await expect(
                    read(),
                ).rejects.toThrow(
                    "record size must be greater than zero but was 0",
                );
            },
        );


        it(
            "rejects negative record size",
            async () => {
                const invalidMetadata = {
                    ...metadata,
                    size: -1,
                };

                const read =
                    async () => {
                        for await (
                            const _ of readFileRecords(
                            "ignored.dat",
                            invalidMetadata,
                            defaultFileCodecRegistry,
                            async function* () {
                            },
                        )
                            ) {
                        }
                    };

                await expect(
                    read(),
                ).rejects.toThrow(
                    "record size must be greater than zero but was -1",
                );
            },
        );


        it(
            "does not call the reader when the record size is invalid",
            async () => {
                let called = false;

                const readRecords =
                    async function* () {
                        called = true;
                    };

                const invalidMetadata = {
                    ...metadata,
                    size: 0,
                };

                const read =
                    async () => {
                        for await (
                            const _ of readFileRecords(
                            "ignored.dat",
                            invalidMetadata,
                            defaultFileCodecRegistry,
                            readRecords,
                        )
                            ) {
                        }
                    };

                await expect(
                    read(),
                ).rejects.toThrow();

                expect(called)
                    .toBe(false);
            },
        );


        it(
            "preserves strong record typing",
            () => {
                const readRecords =
                    async function* () {
                    };

                const result =
                    readFileRecords(
                        "ignored.dat",
                        metadata,
                        defaultFileCodecRegistry,
                        readRecords,
                    );

                type Actual =
                    AsyncGeneratorValue<typeof result>;

                type _ =
                    Expect<
                        Equal<
                            Actual,
                            ErrorsOr<[string, bigint]>
                        >
                    >;
            },
        );
        it(
            "reuses the record buffer",
            async () => {
                const file =
                    fakeFile(
                        new Uint8Array([
                            1, 2, 3, 4,
                            5, 6, 7, 8,
                        ]),
                    );

                const records: Uint8Array[] = [];

                for await (
                    const record of readFixedRecords(
                    file,
                    4,
                )
                    )
                    records.push(
                        record,
                    );

                expect(records[0])
                    .toBe(
                        records[1],
                    );
            },
        );
    },
);