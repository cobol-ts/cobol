import {
    open
} from "node:fs/promises";

import {
    type FileLineBufferPool
} from "@cobol-ts/cursor-loader-types";


export const FILE_BUFFER_SIZE =
    8192;


export type FileByteCursor =
    AsyncGenerator<
        Uint8Array,
        void,
        unknown
    >;


/**
 * Create a pool of fixed-size buffers used for physical file reads.
 *
 * Buffers are not cleared when returned to the pool because every byte
 * exposed by createFileByteCursor has been overwritten by the current
 * file read.
 */
export function createFileBufferPool(
    bufferSize: number = FILE_BUFFER_SIZE
): FileLineBufferPool {

    if (
        !Number.isInteger(
            bufferSize
        )
        || bufferSize <= 0
    ) {
        throw new Error(
            `File buffer size must be a positive integer; received ${bufferSize}`
        );
    }
    const available:
        Uint8Array[] =
        [];


    return {
        acquire():
            Uint8Array {

            return available.pop()
                ?? new Uint8Array(
                    bufferSize
                );
        },


        release(
            buffer: Uint8Array
        ): void {

            /*
             * A final partial read may be represented by a zero-offset
             * subarray of the original pooled allocation.
             */
            if (
                buffer.byteOffset !== 0
                || buffer.buffer.byteLength
                !== bufferSize
            ) {
                throw new Error(
                    "Cannot return byte buffer to file buffer pool: "
                    + "the buffer is not backed by a pool-sized "
                    + "zero-offset allocation"
                );
            }


            available.push(
                new Uint8Array(
                    buffer.buffer
                )
            );
        }
    };
}


/**
 * Read a file into pooled byte buffers.
 *
 * Ownership of a yielded buffer transfers to the consumer. The consumer
 * must eventually return it to the same pool.
 *
 * A full buffer is yielded directly. The final partial buffer is yielded
 * as a zero-copy subarray of the pooled allocation.
 */
export async function* createFileByteCursor(
    filename: string,
    bufferPool:
    FileLineBufferPool
): FileByteCursor {

    const file =
        await open(
            filename,
            "r"
        );


    let buffer:
        Uint8Array | undefined;


    try {
        while (
            true
            ) {
            buffer =
                bufferPool.acquire();


            let length =
                0;


            while (
                length
                < buffer.length
                ) {
                const result =
                    await file.read(
                        buffer,
                        length,
                        buffer.length
                        - length,
                        null
                    );


                if (
                    result.bytesRead === 0
                ) {
                    break;
                }


                length +=
                    result.bytesRead;
            }


            if (
                length === 0
            ) {
                bufferPool.release(
                    buffer
                );

                buffer =
                    undefined;

                return;
            }


            if (
                length === buffer.length
            ) {
                const yielded =
                    buffer;

                /*
                 * Ownership transfers to the consumer before yielding.
                 */
                buffer =
                    undefined;

                yield yielded;

                continue;
            }


            const yielded =
                buffer.subarray(
                    0,
                    length
                );

            /*
             * The subarray refers to the same pooled allocation.
             * Ownership therefore transfers exactly as it does for a
             * full buffer.
             */
            buffer =
                undefined;

            yield yielded;

            return;
        }
    }
    finally {
        /*
         * Only an acquired buffer which has not been yielded remains our
         * responsibility here.
         */
        if (
            buffer !== undefined
        ) {
            bufferPool.release(
                buffer
            );
        }


        await file.close();
    }
}