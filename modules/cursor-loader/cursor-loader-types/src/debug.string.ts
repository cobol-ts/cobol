export interface HasByteBuffers {
    readonly buffers: readonly Uint8Array[];
}


const UTF8_DECODER = new TextDecoder();


export function utf8RangeToString(
    record: HasByteBuffers,
    startByte: number,
    endByte: number
): string {
    const chunks: string[] = [];

    let bufferStart = 0;

    for (const buffer of record.buffers) {
        const bufferEnd = bufferStart + buffer.length;

        if (endByte <= bufferStart) {
            break;
        }

        if (
            startByte < bufferEnd
            && endByte > bufferStart
        ) {
            const start =
                Math.max(
                    startByte - bufferStart,
                    0
                );

            const end =
                Math.min(
                    endByte - bufferStart,
                    buffer.length
                );

            chunks.push(
                UTF8_DECODER.decode(
                    buffer.subarray(
                        start,
                        end
                    ),
                    {
                        stream:
                            endByte > bufferEnd
                    }
                )
            );
        }

        bufferStart = bufferEnd;
    }

    chunks.push(
        UTF8_DECODER.decode()
    );

    return chunks.join("");
}


export function bytesToDebugString(
    record: HasByteBuffers,
    startByte: number,
    endByte: number
): string {
    const bytes: string[] = [];

    let bufferStart = 0;

    for (const buffer of record.buffers) {
        const bufferEnd = bufferStart + buffer.length;

        if (endByte <= bufferStart) {
            break;
        }

        if (
            startByte < bufferEnd
            && endByte > bufferStart
        ) {
            const start =
                Math.max(
                    startByte - bufferStart,
                    0
                );

            const end =
                Math.min(
                    endByte - bufferStart,
                    buffer.length
                );

            for (
                let index = start;
                index < end;
                index++
            ) {
                bytes.push(
                    buffer[index]
                        .toString(16)
                        .padStart(2, "0")
                );
            }
        }

        bufferStart = bufferEnd;
    }

    return bytes.join(" ");
}