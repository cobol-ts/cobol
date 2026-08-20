import {
    defaultFileCodecRegistry,
} from "@cobol-ts/cobolcodec";
import {
    FileMetadata,
} from "@cobol-ts/copybookfiles";
import {
    valueOrThrow,
} from "@cobol-ts/errors";
import {
    FileHandleLike,
    withFileWriter,
    writeAll,
} from "./cobol.file.writer";


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


describe(
    "writeAll",
    () => {
        it(
            "writes the whole buffer",
            async () => {
                const written: number[] = [];

                const file: FileHandleLike = {
                    async write(
                        _buffer,
                        _offset,
                        length,
                    ) {
                        written.push(
                            length,
                        );

                        return {
                            bytesWritten: length,
                            buffer: new Uint8Array(),
                        };
                    },

                    async close() {
                    },
                };

                await writeAll(
                    file,
                    new Uint8Array([
                        1, 2, 3, 4,
                    ]),
                );

                expect(written)
                    .toEqual([
                        4,
                    ]);
            },
        );


        it(
            "handles partial writes",
            async () => {
                const writes: {
                    offset: number;
                    length: number;
                }[] = [];

                const sizes = [
                    2,
                    1,
                    1,
                ];

                let index = 0;

                const file: FileHandleLike = {
                    async write(
                        buffer,
                        offset,
                        length,
                    ) {
                        writes.push({
                            offset,
                            length,
                        });

                        const bytesWritten =
                            Math.min(
                                sizes[index++] ?? length,
                                length,
                            );

                        return {
                            bytesWritten,
                            buffer,
                        };
                    },

                    async close() {
                    },
                };

                await writeAll(
                    file,
                    new Uint8Array([
                        1, 2, 3, 4,
                    ]),
                );

                expect(writes)
                    .toEqual([
                        {
                            offset: 0,
                            length: 4,
                        },
                        {
                            offset: 2,
                            length: 2,
                        },
                        {
                            offset: 3,
                            length: 1,
                        },
                    ]);
            },
        );


        it(
            "rejects a zero byte write",
            async () => {
                const file: FileHandleLike = {
                    async write(
                        buffer,
                    ) {
                        return {
                            bytesWritten: 0,
                            buffer,
                        };
                    },

                    async close() {
                    },
                };

                await expect(
                    writeAll(
                        file,
                        new Uint8Array([
                            1, 2, 3,
                        ]),
                    ),
                ).rejects.toThrow(
                    "wrote zero bytes with 3 bytes remaining",
                );
            },
        );
    },
);


describe(
    "withFileWriter",
    () => {
        it(
            "writes records",
            async () => {
                const written: number[] = [];
                let closed = false;

                const openFile =
                    async () => ({
                        async write(
                            buffer: Uint8Array,
                            offset: number,
                            length: number,
                        ) {
                            written.push(
                                ...buffer.subarray(
                                    offset,
                                    offset + length,
                                ),
                            );

                            return {
                                bytesWritten: length,
                                buffer,
                            };
                        },

                        async close() {
                            closed = true;
                        },
                    });

                await withFileWriter(
                    "ignored.dat",
                    metadata,
                    defaultFileCodecRegistry,
                    async write => {
                        valueOrThrow(
                            await write([
                                "ABC",
                                1n,
                            ]),
                        );

                        valueOrThrow(
                            await write([
                                "DEF",
                                2n,
                            ]),
                        );
                    },
                    openFile,
                );

                expect(written)
                    .toEqual([
                        65, 66, 67, 0, 1,
                        68, 69, 70, 0, 2,
                    ]);

                expect(closed)
                    .toBe(true);
            },
        );


        it(
            "opens the file for writing",
            async () => {
                let actualFilename: string | undefined;
                let actualFlags: string | undefined;

                const openFile =
                    async (
                        filename: string,
                        flags: string,
                    ) => {
                        actualFilename =
                            filename;

                        actualFlags =
                            flags;

                        return {
                            async write(
                                buffer: Uint8Array,
                                _offset: number,
                                length: number,
                            ) {
                                return {
                                    bytesWritten: length,
                                    buffer,
                                };
                            },

                            async close() {
                            },
                        };
                    };

                await withFileWriter(
                    "customers.dat",
                    metadata,
                    defaultFileCodecRegistry,
                    async () => {
                    },
                    openFile,
                );

                expect(actualFilename)
                    .toBe(
                        "customers.dat",
                    );

                expect(actualFlags)
                    .toBe(
                        "w",
                    );
            },
        );


        it(
            "closes the file when the callback throws",
            async () => {
                let closed = false;

                const openFile =
                    async () => ({
                        async write(
                            buffer: Uint8Array,
                            _offset: number,
                            length: number,
                        ) {
                            return {
                                bytesWritten: length,
                                buffer,
                            };
                        },

                        async close() {
                            closed = true;
                        },
                    });

                await expect(
                    withFileWriter(
                        "ignored.dat",
                        metadata,
                        defaultFileCodecRegistry,
                        async () => {
                            throw new Error(
                                "boom",
                            );
                        },
                        openFile,
                    ),
                ).rejects.toThrow(
                    "boom",
                );

                expect(closed)
                    .toBe(true);
            },
        );


        it(
            "does not open the file when metadata is invalid",
            async () => {
                let opened = false;

                const openFile =
                    async () => {
                        opened = true;

                        return {
                            async write(
                                buffer: Uint8Array,
                                _offset: number,
                                length: number,
                            ) {
                                return {
                                    bytesWritten: length,
                                    buffer,
                                };
                            },

                            async close() {
                            },
                        };
                    };

                await expect(
                    withFileWriter(
                        "ignored.dat",
                        {
                            ...metadata,
                            size: 0,
                        },
                        defaultFileCodecRegistry,
                        async () => {
                        },
                        openFile,
                    ),
                ).rejects.toThrow(
                    "record size must be greater than zero",
                );

                expect(opened)
                    .toBe(false);
            },
        );


        it(
            "does not write an invalid record",
            async () => {
                let writes = 0;

                const openFile =
                    async () => ({
                        async write(
                            buffer: Uint8Array,
                            _offset: number,
                            length: number,
                        ) {
                            writes++;

                            return {
                                bytesWritten: length,
                                buffer,
                            };
                        },

                        async close() {
                        },
                    });

                await withFileWriter(
                    "ignored.dat",
                    metadata,
                    defaultFileCodecRegistry,
                    async write => {
                        const result =
                            await write([
                                "TOO LONG",
                                1n,
                            ]);

                        expect(
                            "errors" in result,
                        )
                            .toBe(true);
                    },
                    openFile,
                );

                expect(writes)
                    .toBe(
                        0,
                    );
            },
        );
    },
);