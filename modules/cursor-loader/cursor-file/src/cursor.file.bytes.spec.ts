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
    FILE_BUFFER_SIZE,
    createFileBufferPool,
    createFileByteCursor
} from "./cursor.file.bytes";


const decoder =
    new TextDecoder();

const encoder =
    new TextEncoder();


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
            "expected file content"
        );
    }


    return result.value;
}


async function withTempFile(
    contents: Uint8Array,
    action: (
        filename: string
    ) => Promise<void>
): Promise<void> {

    const directory =
        await mkdtemp(
            join(
                tmpdir(),
                "cursor-file-bytes-"
            )
        );

    const filename =
        join(
            directory,
            "test.dat"
        );


    try {
        await writeFile(
            filename,
            contents
        );

        await action(
            filename
        );
    } finally {
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
}


function bytes(
    value: string
): Uint8Array {

    return encoder.encode(
        value
    );
}


test(
    "reads a small file as one final partial buffer",
    async () => {

        await withTempFile(
            bytes(
                "hello world"
            ),
            async filename => {

                const cursor =
                    createFileByteCursor(
                        filename
                    );


                const first =
                    yieldedBuffer(
                        await cursor.next()
                    );


                expect(
                    first.length
                ).toBe(
                    11
                );

                expect(
                    decoder.decode(
                        first
                    )
                ).toBe(
                    "hello world"
                );


                const end =
                    await cursor.next();


                expect(
                    end.done
                ).toBe(
                    true
                );
            }
        );
    }
);


test(
    "yields full buffers before the final partial buffer",
    async () => {

        const content =
            new Uint8Array(
                FILE_BUFFER_SIZE
                + 17
            );


        for (
            let index =
                0;
            index
            < content.length;
            index++
        ) {
            content[
                index
                ] =
                index
                % 251;
        }


        await withTempFile(
            content,
            async filename => {

                const cursor =
                    createFileByteCursor(
                        filename
                    );


                const first =
                    yieldedBuffer(
                        await cursor.next()
                    );

                const second =
                    yieldedBuffer(
                        await cursor.next()
                    );

                const end =
                    await cursor.next();


                expect(
                    first.length
                ).toBe(
                    FILE_BUFFER_SIZE
                );

                expect(
                    second.length
                ).toBe(
                    17
                );

                expect(
                    end.done
                ).toBe(
                    true
                );


                expect(
                    Array.from(
                        first
                    )
                ).toEqual(
                    Array.from(
                        content.subarray(
                            0,
                            FILE_BUFFER_SIZE
                        )
                    )
                );

                expect(
                    Array.from(
                        second
                    )
                ).toEqual(
                    Array.from(
                        content.subarray(
                            FILE_BUFFER_SIZE
                        )
                    )
                );
            }
        );
    }
);


test(
    "preserves bytes exactly across several buffers",
    async () => {

        const content =
            new Uint8Array(
                (
                    FILE_BUFFER_SIZE
                    * 3
                )
                + 37
            );


        for (
            let index =
                0;
            index
            < content.length;
            index++
        ) {
            content[
                index
                ] =
                (
                    index
                    * 17
                )
                % 256;
        }


        await withTempFile(
            content,
            async filename => {

                const cursor =
                    createFileByteCursor(
                        filename
                    );

                const actual:
                    number[] =
                    [];


                for await (
                    const buffer
                    of cursor
                    ) {
                    actual.push(
                        ...buffer
                    );
                }


                expect(
                    actual
                ).toEqual(
                    Array.from(
                        content
                    )
                );
            }
        );
    }
);


test(
    "final partial buffer is a zero-offset view over the pooled allocation",
    async () => {

        const pool =
            createFileBufferPool();


        await withTempFile(
            bytes(
                "abc"
            ),
            async filename => {

                const cursor =
                    createFileByteCursor(
                        filename,
                        pool
                    );


                const buffer =
                    yieldedBuffer(
                        await cursor.next()
                    );


                expect(
                    buffer.length
                ).toBe(
                    3
                );

                expect(
                    buffer.byteOffset
                ).toBe(
                    0
                );

                expect(
                    buffer.buffer.byteLength
                ).toBe(
                    FILE_BUFFER_SIZE
                );


                pool.release(
                    buffer
                );


                await cursor.return();
            }
        );
    }
);


test(
    "a yielded buffer remains valid after the cursor advances",
    async () => {

        const content =
            new Uint8Array(
                FILE_BUFFER_SIZE
                + 4
            );


        content.fill(
            65,
            0,
            FILE_BUFFER_SIZE
        );

        content.set(
            bytes(
                "BBBB"
            ),
            FILE_BUFFER_SIZE
        );


        await withTempFile(
            content,
            async filename => {

                const cursor =
                    createFileByteCursor(
                        filename
                    );


                const firstBuffer =
                    yieldedBuffer(
                        await cursor.next()
                    );


                expect(
                    firstBuffer[
                        0
                        ]
                ).toBe(
                    65
                );


                const secondBuffer =
                    yieldedBuffer(
                        await cursor.next()
                    );


                /*
                 * Ownership of firstBuffer transferred to the consumer.
                 *
                 * Advancing the byte cursor must therefore not reuse or
                 * modify that buffer.
                 */

                expect(
                    firstBuffer[
                        0
                        ]
                ).toBe(
                    65
                );

                expect(
                    firstBuffer[
                    FILE_BUFFER_SIZE
                    - 1
                        ]
                ).toBe(
                    65
                );

                expect(
                    decoder.decode(
                        secondBuffer
                    )
                ).toBe(
                    "BBBB"
                );


                await cursor.return();
            }
        );
    }
);


test(
    "released buffers are reused by the pool",
    () => {

        const pool =
            createFileBufferPool();

        const first =
            pool.acquire();


        first[
            0
            ] =
            123;


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

        expect(
            second[
                0
                ]
        ).toBe(
            123
        );
    }
);


test(
    "pool accepts a final partial zero-offset view",
    () => {

        const pool =
            createFileBufferPool();

        const full =
            pool.acquire();

        const partial =
            full.subarray(
                0,
                37
            );


        pool.release(
            partial
        );


        const reused =
            pool.acquire();


        expect(
            reused.length
        ).toBe(
            FILE_BUFFER_SIZE
        );

        expect(
            reused.buffer
        ).toBe(
            full.buffer
        );
    }
);


test(
    "pool rejects a view which does not start at the pooled buffer origin",
    () => {

        const pool =
            createFileBufferPool();

        const full =
            pool.acquire();

        const invalid =
            full.subarray(
                1,
                37
            );


        expect(
            () =>
                pool.release(
                    invalid
                )
        ).toThrow(
            "File buffer does not belong to this buffer pool"
        );
    }
);


test(
    "missing file is an operational failure",
    async () => {

        const filename =
            join(
                tmpdir(),
                `does-not-exist-${
                    process.pid
                }.dat`
            );


        const cursor =
            createFileByteCursor(
                filename
            );


        await expect(
            cursor.next()
        ).rejects.toThrow();
    }
);


test(
    "empty file yields no buffers",
    async () => {

        await withTempFile(
            new Uint8Array(
                0
            ),
            async filename => {

                const cursor =
                    createFileByteCursor(
                        filename
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
    }
);