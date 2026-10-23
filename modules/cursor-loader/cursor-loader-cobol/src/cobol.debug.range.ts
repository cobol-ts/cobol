import {bytesToDebugString, type ProjectionPhysicalRecord} from "@cobol-ts/cursor-loader-types";

/** Exclusive-end, record-relative byte coordinates. */
export type CobolDebugRange = Readonly<{from: number; to: number}>;

const MAX_16_BIT = 0xffff;

/**
 * Diagnostic numeric projection: upper 16 bits = from, lower 16 bits = to.
 * Arithmetic (not signed bitwise operations) preserves unsigned offsets.
 */
export function cobolDebugRangeNumber(range: CobolDebugRange): number {
    validateRange(range);
    if (range.to > MAX_16_BIT) {
        throw new RangeError("COBOL debug range exceeds unsigned 16-bit coordinate capacity");
    }
    return range.from * 0x10000 + range.to;
}

/**
 * Diagnostic string projection: 'from/to/hex-bytes'.
 * The hex is the actual borrowed record content, not a decoded COBOL value.
 */
export function cobolDebugRangeString(
    record: ProjectionPhysicalRecord,
    range: CobolDebugRange
): string {
    validateRange(range);
    if (record.startByte + range.to > record.endByte) {
        throw new RangeError("COBOL debug field extends beyond the completed record");
    }
    const start = record.startByte + range.from;
    const end = record.startByte + range.to;
    return `${range.from}/${range.to}/${bytesToDebugString(record, start, end)}`;
}

/** Convert already-evaluated COBOL bit geometry to byte coordinates. */
export function cobolDebugRangeFromBits(offsetBits: number, sizeBits: number,
                                        into?: {from:number;to:number}): CobolDebugRange {
    if (
        !Number.isSafeInteger(offsetBits) || offsetBits < 0 || offsetBits % 8 !== 0 ||
        !Number.isSafeInteger(sizeBits) || sizeBits < 0 || sizeBits % 8 !== 0 ||
        !Number.isSafeInteger(offsetBits + sizeBits)
    ) {
        throw new RangeError("COBOL debug geometry must be nonnegative, byte-aligned safe integers");
    }
    const from=offsetBits/8,to=(offsetBits+sizeBits)/8;
    if(into){into.from=from;into.to=to;return into;}
    return {from,to};
}

function validateRange(range: CobolDebugRange): void {
    if (
        !Number.isSafeInteger(range.from) || range.from < 0 ||
        !Number.isSafeInteger(range.to) || range.to < range.from
    ) {
        throw new RangeError("Invalid COBOL debug byte range");
    }
}
