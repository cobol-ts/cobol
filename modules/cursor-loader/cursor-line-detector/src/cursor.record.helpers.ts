/**
 * Return the total logical length of a sequence of byte buffers.
 *
 * The buffers are treated as one contiguous logical byte sequence.
 */
export function totalLength(
    buffers:
    readonly Uint8Array[]
): number {

    let length =
        0;


    for (
        const buffer
        of buffers
        ) {
        length +=
            buffer.length;
    }


    return length;
}


/**
 * Read a byte at a logical offset across a sequence of byte buffers.
 *
 * The buffers are treated as one contiguous logical byte sequence.
 *
 * Throws when the requested offset is outside the available data.
 */
export function byteAt(
    buffers:
    readonly Uint8Array[],
    offset:
    number
): number {

    if (
        !Number.isInteger(
            offset
        )
        || offset < 0
    ) {
        throw new Error(
            "Byte offset must be a non-negative integer; "
            + `received ${offset}`
        );
    }


    let remainingOffset =
        offset;


    for (
        const buffer
        of buffers
        ) {
        if (
            remainingOffset
            < buffer.length
        ) {
            return buffer[
                remainingOffset
                ];
        }


        remainingOffset -=
            buffer.length;
    }


    throw new Error(
        "Cannot read byte at logical offset "
        + `${offset}; only ${
            totalLength(
                buffers
            )
        } bytes are available`
    );
}


/**
 * Find the first occurrence of a byte value at or after a logical offset.
 *
 * The buffers are treated as one contiguous logical byte sequence.
 *
 * Returns the logical offset of the matching byte, or -1 when the value
 * is not present at or after startOffset.
 */
export function findByte(
    buffers:
    readonly Uint8Array[],
    startOffset:
    number,
    value:
    number
): number {

    if (
        !Number.isInteger(
            startOffset
        )
        || startOffset < 0
    ) {
        throw new Error(
            "Search start offset must be a non-negative integer; "
            + `received ${startOffset}`
        );
    }


    let logicalOffset =
        0;


    for (
        const buffer
        of buffers
        ) {
        const bufferEnd =
            logicalOffset
            + buffer.length;


        if (
            startOffset
            < bufferEnd
        ) {
            const startInBuffer =
                Math.max(
                    0,
                    startOffset
                    - logicalOffset
                );


            const found =
                buffer.indexOf(
                    value,
                    startInBuffer
                );


            if (
                found !== -1
            ) {
                return logicalOffset
                    + found;
            }
        }


        logicalOffset =
            bufferEnd;
    }


    return -1;
}