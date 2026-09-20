import {
    open
} from "node:fs/promises";


export const FILE_BUFFER_SIZE =
    8192;


export interface FileBufferPool {
    acquire():
        Uint8Array;

    release(
        buffer: Uint8Array
    ): void;
}


/*
 * A cursor of raw bytes read from a file.
 *
 * Ownership of each yielded Uint8Array is transferred to the consumer.
 *
 * The consumer may retain a yielded buffer while advancing this cursor.
 * It is therefore also responsible for returning the buffer to the
 * FileBufferPool when it is no longer required.
 *
 * This allows record cursors to retain several physical buffers when a
 * logical record spans read boundaries.
 */

export type FileByteCursor =
    AsyncGenerator<
        Uint8Array,
        void,
        unknown
    >;


/*
 * Create the shared pool of physical file buffers.
 *
 * The pool retains buffers for reuse and grows to the maximum number of
 * buffers required concurrently.
 *
 * A partial final read may be represented by a shorter Uint8Array view
 * over one of these buffers. release() accepts either the complete buffer
 * or such a view and returns the complete backing buffer to the pool.
 */

export function createFileBufferPool():
    FileBufferPool {

    const available:
        Uint8Array[] =
        [];


    return {
        acquire():
            Uint8Array {

            const buffer =
                available.pop();


            if (
                buffer !== undefined
            ) {
                return buffer;
            }


            return new Uint8Array(
                FILE_BUFFER_SIZE
            );
        },


        release(
            buffer: Uint8Array
        ): void {

            if (
                buffer.byteOffset
                !== 0
                || buffer.buffer.byteLength
                !== FILE_BUFFER_SIZE
            ) {
                throw new Error(
                    "File buffer does not belong to this buffer pool"
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


/*
 * Create a cursor over the raw bytes of a file.
 *
 * The cursor knows nothing about physical records.
 *
 * In particular, it does not know about:
 *
 *     line endings
 *     fixed record sizes
 *     CSV
 *     JSON
 *     COBOL
 *
 * It simply reads the file into pooled buffers and transfers ownership
 * of each populated buffer to its consumer.
 *
 * Full reads are yielded as the complete pooled buffer.
 *
 * The final partial read is yielded as a shorter Uint8Array view over
 * the pooled buffer so that buffer.length always describes the number
 * of valid bytes.
 *
 * File-system failures are operational failures and therefore throw.
 */

export function createFileByteCursor(
    filename: string,
    pool:
    FileBufferPool =
    createFileBufferPool()
): FileByteCursor {

    return (
        async function* () {

            const file =
                await open(
                    filename,
                    "r"
                );


            /*
             * A buffer remains owned by this cursor only until it is
             * yielded.
             *
             * Once yielded, ownership has transferred to the consumer
             * and this variable is cleared so that the finally block
             * cannot accidentally return somebody else's buffer.
             */

            let buffer:
                Uint8Array | undefined;


            try {
                while (
                    true
                    ) {
                    buffer =
                        pool.acquire();


                    const bytesRead =
                        await fillBuffer(
                            file,
                            buffer
                        );


                    if (
                        bytesRead
                        === 0
                    ) {
                        pool.release(
                            buffer
                        );

                        buffer =
                            undefined;

                        return;
                    }


                    const content =
                        bytesRead
                        === buffer.length
                            ? buffer
                            : buffer.subarray(
                                0,
                                bytesRead
                            );


                    /*
                     * Ownership transfers before yield.
                     *
                     * This matters if the consumer closes the generator
                     * while execution is suspended at the yield.
                     */

                    buffer =
                        undefined;


                    yield content;


                    /*
                     * There is deliberately no release here.
                     *
                     * The consumer may still require this buffer after
                     * asking for the next one, for example when a line
                     * spans several physical file buffers.
                     */
                }
            } finally {
                /*
                 * Only a buffer which has not yet been yielded can still
                 * belong to this cursor.
                 */

                if (
                    buffer
                    !== undefined
                ) {
                    pool.release(
                        buffer
                    );
                }


                await file.close();
            }
        }
    )();
}


/*
 * Fill a pooled buffer.
 *
 * FileHandle.read() may return fewer bytes than requested without
 * necessarily indicating EOF, so reads continue until either:
 *
 *     the buffer is full
 *
 * or:
 *
 *     read() returns zero bytes.
 *
 * Consequently every non-final yielded buffer is full.
 */

async function fillBuffer(
    file: Awaited<
        ReturnType<
            typeof open
        >
    >,
    buffer: Uint8Array
): Promise<number> {

    let offset =
        0;


    while (
        offset
        < buffer.length
        ) {
        const result =
            await file.read(
                buffer,
                offset,
                buffer.length - offset,
                null
            );


        if (
            result.bytesRead
            === 0
        ) {
            break;
        }


        offset +=
            result.bytesRead;
    }


    return offset;
}