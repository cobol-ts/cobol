import {
    nullRecordStart,
    type RecordBoundaryDetector
} from "@cobol-ts/cursor-loader-types";

import {
    totalLength
} from "./cursor.record.helpers";


/**
 * Create a boundary detector for fixed-width physical records.
 *
 * Fixed-width records contain no framing bytes, so the physical frame and
 * the record data begin at the same logical offset.
 *
 * No search is required. The next record boundary is determined directly
 * from frameStart and recordSize.
 *
 * For recordSize 4:
 *
 *     a b c d W X Y Z
 *     0 1 2 3 4 5 6 7
 *
 *     frameStart      = 0
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
            frameStart,
            _searchStart
        ): number {

            const nextRecordStart =
                frameStart
                + recordSize;


            return nextRecordStart
            <= totalLength(
                buffers
            )
                ? nextRecordStart
                : -1;
        },


        recordStart:
        nullRecordStart,


        recordEnd(
            _buffers,
            nextRecordStart
        ): number {

            return nextRecordStart
                - 1;
        }
    };
}