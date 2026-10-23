/** A byte sequence is the ordered concatenation of these buffers.  It can be
 * a complete file, a physical record or a small synthetic fixture. */
export type FragmentedBytes = Readonly<{buffers: readonly Uint8Array[]}>;

/** Reusable, forward-only byte cursor over an exclusive-end logical range.
 * No join(), slice(), subarray() or per-byte scanning of all record buffers.
 * Bind at each scalar access; the caller owns this cursor (normally the pooled
 * record state). Calling bind does not borrow or retain data beyond the lease.
 */
export class FragmentedByteCursor {
    private buffers: readonly Uint8Array[] = [];
    private bufferIndex = 0;
    private offset = 0;
    private remainingBytes = 0;
    private byteLength = 0;

    bind(source: FragmentedBytes, from: number, to: number): this {
        if (!Number.isSafeInteger(from) || !Number.isSafeInteger(to) || from < 0 || to < from)
            throw new RangeError(`Invalid fragmented byte range [${from}, ${to})`);
        const buffers = source.buffers;
        this.buffers = buffers;
        this.byteLength = to - from;
        this.remainingBytes = this.byteLength;
        // Contiguous record: one bounds check, no iteration or allocation.
        if (buffers.length === 1) {
            if (to > buffers[0].length) throw new RangeError(`Byte range exceeds ${buffers[0].length} bytes`);
            this.bufferIndex = 0;
            this.offset = from;
            return this;
        }
        // Locate the field's first byte and establish its end with a single
        // pass. No need to scan buffers after its exclusive end.
        let physicalOffset = 0, firstIndex = -1, firstOffset = 0;
        for (let i = 0; i < buffers.length; i++) {
            const end = physicalOffset + buffers[i].length;
            if (firstIndex < 0 && from < end) {
                firstIndex = i;
                firstOffset = from - physicalOffset;
            }
            physicalOffset = end;
            if (to <= end) break;
        }
        if (to > physicalOffset) throw new RangeError(`Byte range [${from}, ${to}) exceeds available bytes`);
        this.bufferIndex = firstIndex < 0 ? buffers.length : firstIndex;
        this.offset = firstIndex < 0 ? 0 : firstOffset;
        return this;
    }

    get length(): number { return this.byteLength; }
    get remaining(): number { return this.remainingBytes; }

    next(): number {
        if (this.remainingBytes === 0) throw new RangeError('End of fragmented byte range');
        const buffers = this.buffers;
        while (this.bufferIndex < buffers.length && this.offset >= buffers[this.bufferIndex].length) {
            this.offset = 0;
            this.bufferIndex++;
        }
        if (this.bufferIndex >= buffers.length) throw new RangeError('Incomplete fragmented byte range');
        const byte = buffers[this.bufferIndex][this.offset++];
        this.remainingBytes--;
        return byte;
    }
}
