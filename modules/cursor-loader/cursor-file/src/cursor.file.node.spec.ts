import type {FileHandle} from 'node:fs/promises';
import {fillNodeFileBuffer} from './cursor.file.node';

test('short positive Node reads fill the existing destination until full or true EOF', async () => {
    const bytes = Uint8Array.from([1,2,3,4,5]);
    let offset = 0;
    let calls = 0;
    const file = {
        async read(destination: Uint8Array, position: number, length: number) {
            calls++;
            const count = Math.min(length, 2, bytes.length - offset);
            destination.set(bytes.subarray(offset, offset + count), position);
            offset += count;
            return {bytesRead: count};
        }
    } as unknown as FileHandle;
    const target = new Uint8Array(7);
    expect(await fillNodeFileBuffer(file, target)).toBe(5);
    expect(Array.from(target)).toEqual([1,2,3,4,5,0,0]);
    expect(calls).toBe(4); // three short reads, then the *actual* EOF
    expect(await fillNodeFileBuffer(file, target)).toBe(0);
});
