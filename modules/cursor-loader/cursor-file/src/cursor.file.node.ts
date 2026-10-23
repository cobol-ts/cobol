import type {FileHandle} from 'node:fs/promises';

/**
 * Fill an existing pooled buffer directly from a Node FileHandle.
 *
 * A short FileHandle.read() is not EOF. Keep writing into the same supplied
 * buffer until full or until an actual zero-byte read. This adapter never
 * assembles records or field fragments into intermediate byte arrays.
 *
 * The caller retains ownership of the handle and must close it when the
 * associated cursor is completed, cancelled, or fails.
 */
export async function fillNodeFileBuffer(handle: FileHandle, destination: Uint8Array): Promise<number> {
    let filled = 0;
    while (filled < destination.length) {
        const {bytesRead} = await handle.read(destination, filled, destination.length - filled, null);
        if (bytesRead === 0) break;
        filled += bytesRead;
    }
    return filled;
}
