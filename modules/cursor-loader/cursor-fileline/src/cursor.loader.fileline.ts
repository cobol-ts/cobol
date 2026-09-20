import {
    type FileLineBufferPool
} from "@cobol-ts/cursor-loader-types";


export const FILE_LINE_BUFFER_SIZE =
    8192;


/*
 * Shared fixed-size byte-buffer pool used by end-of-line cursors.
 *
 * Each cursor acquires buffers as required while reading from its file.
 *
 * A single buffer may contain bytes belonging to several physical lines.
 * A long physical line may span several buffers.
 *
 * The cursor owns each acquired buffer until no current or future
 * physical record can refer to it. At that point the cursor returns the
 * buffer to this pool.
 *
 * Released buffers are retained for reuse.
 *
 * The pool has no maximum size. It therefore grows to the high-water
 * number of buffers required concurrently and then reuses them.
 */

export function createFileLineBufferPool():
    FileLineBufferPool {

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
                FILE_LINE_BUFFER_SIZE
            );
        },


        release(
            buffer: Uint8Array
        ): void {

            if (
                buffer.length
                !== FILE_LINE_BUFFER_SIZE
            ) {
                throw new Error(
                    "File line buffer has an invalid size"
                );
            }


            available.push(
                buffer
            );
        }
    };
}