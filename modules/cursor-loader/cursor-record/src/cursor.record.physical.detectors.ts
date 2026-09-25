import {
    type RecordBoundaryDetector
} from "@cobol-ts/cursor-loader-types";


const LINE_FEED =
    10;

const CARRIAGE_RETURN =
    13;


/**
 * Detect LF and CRLF terminated physical records.
 *
 * nextRecordStart() searches for LF because LF is the final byte of both
 * supported line terminators:
 *
 *     LF
 *     CR LF
 *
 * recordStart identifies the first byte of the current record.
 *
 * searchStart identifies the first byte which has not already been searched
 * for the boundary of that record.
 *
 * This allows a record which spans many physical buffers to be searched
 * incrementally without rescanning bytes which have already been examined.
 *
 * The method returns the logical offset immediately following LF.
 *
 * recordEnd() then examines the byte immediately preceding LF to determine
 * whether the terminator is LF or CRLF and returns the inclusive offset of
 * the final data byte.
 *
 * All offsets are logical offsets across the supplied buffers.
 */
export const newlineRecordBoundaryDetector:
    RecordBoundaryDetector = {

    nextRecordStart(
        buffers,
        _recordStart,
        searchStart
    ): number {

        const lineFeed =
            findByte(
                buffers,
                searchStart,
                LINE_FEED
            );


        return lineFeed === -1
            ? -1
            : lineFeed + 1;
    },


    recordEnd(
        buffers,
        nextRecordStart
    ): number {

        /**
         * nextRecordStart is the first byte following LF.
         */
        const lineFeed =
            nextRecordStart - 1;


        if (
            byteAt(
                buffers,
                lineFeed
            ) !== LINE_FEED
        ) {
            throw new Error(
                "Cannot determine newline record end: "
                + `byte ${lineFeed} is not LF`
            );
        }


        const previousByte =
            lineFeed - 1;


        /**
         * CRLF:
         *
         *     a b c CR LF
         *     0 1 2  3  4
         *
         *     nextRecordStart = 5
         *     recordEnd       = 2
         *
         * byteAt() uses logical offsets, so this also works when CR and LF
         * are in different physical buffers.
         */
        if (
            previousByte >= 0
            && byteAt(
                buffers,
                previousByte
            ) === CARRIAGE_RETURN
        ) {
            return previousByte
                - 1;
        }


        /**
         * LF:
         *
         *     a b c LF
         *     0 1 2  3
         *
         *     nextRecordStart = 4
         *     recordEnd       = 2
         */
        return lineFeed
            - 1;
    }
};


/**
 * Create a boundary detector for fixed-width physical records.
 *
 * Fixed-width records contain no framing bytes.
 *
 * recordStart identifies the first byte of the current record.
 *
 * searchStart is irrelevant for fixed-width records because no search is
 * required. The next record boundary is known directly from recordStart and
 * recordSize.
 *
 * For recordSize 4:
 *
 *     a b c d W X Y Z
 *     0 1 2 3 4 5 6 7
 *
 *     recordStart     = 0
 *     nextRecordStart = 4
 *     recordEnd       = 3
 */
export function createFixedWidthRecordBoundaryDetector(
    recordSize: number
): RecordBoundaryDetector {

    if (
        !Number.isInteger(
            recordSize
        )
        || recordSize <= 0
    ) {
        throw new Error(
            "Fixed record size must be a positive integer; "
            + `received ${recordSize}`
        );
    }


    return {
        nextRecordStart(
            buffers,
            recordStart,
            _searchStart
        ): number {

            const nextRecordStart =
                recordStart
                + recordSize;


            return nextRecordStart
            <= totalLength(
                buffers
            )
                ? nextRecordStart
                : -1;
        },


        recordEnd(
            _buffers,
            nextRecordStart
        ): number {

            return nextRecordStart
                - 1;
        }
    };
}


/**
 * Find the first occurrence of wanted at or after startByte.
 *
 * All offsets are logical offsets across the complete sequence of supplied
 * buffers.
 */
function findByte(
    buffers: readonly Uint8Array[],
    startByte: number,
    wanted: number
): number {

    let logicalOffset =
        0;


    for (
        const buffer
        of buffers
        ) {
        const bufferEnd =
            logicalOffset
            + buffer.length;


        /**
         * The complete buffer lies before the requested starting point.
         */
        if (
            startByte
            >= bufferEnd
        ) {
            logicalOffset =
                bufferEnd;

            continue;
        }


        const bufferStart =
            Math.max(
                0,
                startByte
                - logicalOffset
            );


        const found =
            buffer.indexOf(
                wanted,
                bufferStart
            );


        if (
            found !== -1
        ) {
            return logicalOffset
                + found;
        }


        logicalOffset =
            bufferEnd;
    }


    return -1;
}


/**
 * Read one byte using a logical offset across the supplied physical
 * buffers.
 */
function byteAt(
    buffers: readonly Uint8Array[],
    offset: number
): number {

    let remaining =
        offset;


    for (
        const buffer
        of buffers
        ) {
        if (
            remaining
            < buffer.length
        ) {
            return buffer[
                remaining
                ];
        }


        remaining -=
            buffer.length;
    }


    throw new Error(
        `Cannot read logical byte ${offset}: `
        + "the offset is outside the buffered content"
    );
}


/**
 * Return the total number of logical bytes currently available.
 */
function totalLength(
    buffers: readonly Uint8Array[]
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