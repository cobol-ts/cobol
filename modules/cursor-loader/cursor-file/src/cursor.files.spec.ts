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
    createFileBufferPool,
    createFileByteCursor
} from "./cursor.files";


describe(
    "cursor.loader.physical.bytes",
    () => {

        let directory:
            string;


        beforeEach(
            async () => {

                directory =
                    await mkdtemp(
                        join(
                            tmpdir(),
                            "cursor-loader-bytes-"
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
            "rejects a zero buffer size",
            () => {

                expect(
                    () =>
                        createFileBufferPool(
                            0
                        )
                ).toThrow(
                    "File buffer size must be a positive integer; received 0"
                );
            }
        );


        test(
            "rejects a negative buffer size",
            () => {

                expect(
                    () =>
                        createFileBufferPool(
                            -1
                        )
                ).toThrow(
                    "File buffer size must be a positive integer; received -1"
                );
            }
        );


        test(
            "rejects a non-integer buffer size",
            () => {

                expect(
                    () =>
                        createFileBufferPool(
                            4.5
                        )
                ).toThrow(
                    "File buffer size must be a positive integer; received 4.5"
                );
            }
        );


        test(
            "reuses a released buffer",
            () => {

                const pool =
                    createFileBufferPool(
                        4
                    );


                const first =
                    pool.acquire();


                first.set(
                    [
                        1,
                        2,
                        3,
                        4
                    ]
                );


                pool.release(
                    first
                );


                const second =
                    pool.acquire();


                expect(
                    second.buffer
                ).toBe(
                    first.buffer
                );
            }
        );


        test(
            "accepts a zero-offset partial view of a pooled allocation",
            () => {

                const pool =
                    createFileBufferPool(
                        4
                    );


                const buffer =
                    pool.acquire();


                const partial =
                    buffer.subarray(
                        0,
                        2
                    );


                expect(
                    () =>
                        pool.release(
                            partial
                        )
                ).not.toThrow();


                const reused =
                    pool.acquire();


                expect(
                    reused.buffer
                ).toBe(
                    buffer.buffer
                );

                expect(
                    reused.length
                ).toBe(
                    4
                );
            }
        );


        test(
            "rejects a non-zero-offset view",
            () => {

                const pool =
                    createFileBufferPool(
                        4
                    );


                const buffer =
                    pool.acquire();


                const invalid =
                    buffer.subarray(
                        1
                    );


                expect(
                    () =>
                        pool.release(
                            invalid
                        )
                ).toThrow(
                    "Cannot return byte buffer to file buffer pool"
                );
            }
        );


        test(
            "rejects a buffer backed by an allocation of the wrong size",
            () => {

                const pool =
                    createFileBufferPool(
                        4
                    );


                expect(
                    () =>
                        pool.release(
                            new Uint8Array(
                                5
                            )
                        )
                ).toThrow(
                    "Cannot return byte buffer to file buffer pool"
                );
            }
        );


        test(
            "yields no buffers for an empty file",
            async () => {

                const filename =
                    join(
                        directory,
                        "empty.dat"
                    );


                await writeFile(
                    filename,
                    new Uint8Array()
                );


                const pool =
                    createFileBufferPool(
                        4
                    );


                const cursor =
                    createFileByteCursor(
                        filename,
                        pool
                    );


                const result =
                    await cursor.next();


                expect(
                    result.done
                ).toBe(
                    true
                );
            }
        );


        test(
            "yields a small file as one partial buffer",
            async () => {

                const filename =
                    join(
                        directory,
                        "small.dat"
                    );


                await writeFile(
                    filename,
                    Uint8Array.from(
                        [
                            1,
                            2,
                            3
                        ]
                    )
                );


                const pool =
                    createFileBufferPool(
                        4
                    );


                const cursor =
                    createFileByteCursor(
                        filename,
                        pool
                    );


                const first =
                    yieldedBuffer(
                        await cursor.next()
                    );


                expect(
                    Array.from(
                        first
                    )
                ).toEqual(
                    [
                        1,
                        2,
                        3
                    ]
                );


                /*
                 * The yielded view contains only the file bytes but is
                 * backed by the complete pooled allocation.
                 */
                expect(
                    first.length
                ).toBe(
                    3
                );

                expect(
                    first.byteOffset
                ).toBe(
                    0
                );

                expect(
                    first.buffer.byteLength
                ).toBe(
                    4
                );


                pool.release(
                    first
                );


                expect(
                    (
                        await cursor.next()
                    ).done
                ).toBe(
                    true
                );
            }
        );


        test(
            "yields an exact buffer-sized file as one full buffer",
            async () => {

                const filename =
                    join(
                        directory,
                        "exact.dat"
                    );


                await writeFile(
                    filename,
                    Uint8Array.from(
                        [
                            1,
                            2,
                            3,
                            4
                        ]
                    )
                );


                const pool =
                    createFileBufferPool(
                        4
                    );


                const cursor =
                    createFileByteCursor(
                        filename,
                        pool
                    );


                const first =
                    yieldedBuffer(
                        await cursor.next()
                    );


                expect(
                    Array.from(
                        first
                    )
                ).toEqual(
                    [
                        1,
                        2,
                        3,
                        4
                    ]
                );


                pool.release(
                    first
                );


                expect(
                    (
                        await cursor.next()
                    ).done
                ).toBe(
                    true
                );
            }
        );


        test(
            "yields full buffers followed by a final partial buffer",
            async () => {

                const filename =
                    join(
                        directory,
                        "multiple.dat"
                    );


                await writeFile(
                    filename,
                    Uint8Array.from(
                        [
                            1,
                            2,
                            3,
                            4,
                            5,
                            6,
                            7,
                            8,
                            9,
                            10
                        ]
                    )
                );


                const pool =
                    createFileBufferPool(
                        4
                    );


                const cursor =
                    createFileByteCursor(
                        filename,
                        pool
                    );


                const first =
                    yieldedBuffer(
                        await cursor.next()
                    );


                expect(
                    Array.from(
                        first
                    )
                ).toEqual(
                    [
                        1,
                        2,
                        3,
                        4
                    ]
                );


                /*
                 * Do not release first yet.
                 *
                 * Advancing the cursor must therefore use another pooled
                 * allocation and must not overwrite first.
                 */
                const second =
                    yieldedBuffer(
                        await cursor.next()
                    );


                expect(
                    Array.from(
                        second
                    )
                ).toEqual(
                    [
                        5,
                        6,
                        7,
                        8
                    ]
                );


                expect(
                    Array.from(
                        first
                    )
                ).toEqual(
                    [
                        1,
                        2,
                        3,
                        4
                    ]
                );


                expect(
                    second.buffer
                ).not.toBe(
                    first.buffer
                );


                pool.release(
                    first
                );

                pool.release(
                    second
                );


                const third =
                    yieldedBuffer(
                        await cursor.next()
                    );


                expect(
                    Array.from(
                        third
                    )
                ).toEqual(
                    [
                        9,
                        10
                    ]
                );


                expect(
                    third.length
                ).toBe(
                    2
                );

                expect(
                    third.byteOffset
                ).toBe(
                    0
                );

                expect(
                    third.buffer.byteLength
                ).toBe(
                    4
                );


                pool.release(
                    third
                );


                expect(
                    (
                        await cursor.next()
                    ).done
                ).toBe(
                    true
                );
            }
        );


        test(
            "preserves the complete contents of a file spanning several buffers",
            async () => {

                const filename =
                    join(
                        directory,
                        "content.dat"
                    );


                const expected =
                    Uint8Array.from(
                        [
                            11,
                            12,
                            13,
                            14,
                            15,
                            16,
                            17,
                            18,
                            19,
                            20,
                            21
                        ]
                    );


                await writeFile(
                    filename,
                    expected
                );


                const pool =
                    createFileBufferPool(
                        4
                    );


                const actual:
                    number[] =
                    [];


                for await (
                    const buffer
                    of createFileByteCursor(
                    filename,
                    pool
                )
                    ) {
                    actual.push(
                        ...buffer
                    );


                    pool.release(
                        buffer
                    );
                }


                expect(
                    actual
                ).toEqual(
                    Array.from(
                        expected
                    )
                );
            }
        );


        test(
            "propagates an error when the file does not exist",
            async () => {

                const filename =
                    join(
                        directory,
                        "does-not-exist.dat"
                    );


                const pool =
                    createFileBufferPool(
                        4
                    );


                const cursor =
                    createFileByteCursor(
                        filename,
                        pool
                    );


                await expect(
                    cursor.next()
                ).rejects.toThrow();
            }
        );
    }
);


function yieldedBuffer(
    result:
    IteratorResult<
        Uint8Array,
        void
    >
): Uint8Array {

    if (
        result.done === true
    ) {
        throw new Error(
            "Expected file content"
        );
    }


    return result.value;
}