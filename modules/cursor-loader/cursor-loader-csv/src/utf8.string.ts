import {HasByteBuffers} from "@cobol-ts/cursor-loader-types";


const UTF8_DECODER = new TextDecoder("utf-8",{fatal: true});


/**
 * Convert a logical byte range to a UTF-8 string.
 *
 * startByte is inclusive and endByte is exclusive.
 *
 * If escaped is true, an escape byte is omitted and the following byte is
 * copied literally.
 *
 * The parser has already validated the range and escape syntax.
 */
export function utf8String(
    record: HasByteBuffers,
    startByte: number,
    endByte: number,
    escaped: boolean,
    escape: number
): string {
    if (startByte === endByte) {
        return "";
    }

    const output = new Uint8Array(endByte - startByte);

    let bufferIndex = 0;
    let bufferStart = 0;

    while (
        bufferIndex < record.buffers.length
        && startByte >= bufferStart + record.buffers[bufferIndex].length
        ) {
        bufferStart += record.buffers[bufferIndex].length;
        bufferIndex++;
    }

    let bufferOffset = startByte - bufferStart;
    let inputByte = startByte;
    let outputByte = 0;
    let escapeNext = false;

    while (inputByte < endByte) {
        const buffer = record.buffers[bufferIndex];
        const value = buffer[bufferOffset];

        if (escapeNext) {
            output[outputByte++] = value;
            escapeNext = false;
        } else if (escaped && value === escape) {
            escapeNext = true;
        } else {
            output[outputByte++] = value;
        }

        inputByte++;
        bufferOffset++;

        if (bufferOffset === buffer.length) {
            bufferIndex++;
            bufferOffset = 0;
        }
    }

    return UTF8_DECODER.decode(
        outputByte === output.length
            ? output
            : output.subarray(0,outputByte)
    );
}