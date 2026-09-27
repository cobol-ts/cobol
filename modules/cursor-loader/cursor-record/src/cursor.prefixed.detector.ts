import {
    type RecordBoundaryDetector
} from "@cobol-ts/cursor-loader-types";

import {
    totalLength
} from "./cursor.record.helpers";


/**
 * Create a boundary detector for length-prefixed physical records.
 *
 * The prefix is framing and is not exposed to the parser.
 *
 * `recordLength` receives the existing physical buffers and the logical
 * offset at which the prefix begins. It returns the number of
 * parser-visible record-data bytes following the prefix.
 *
 * No prefix or record data is copied.
 *
 * For a four-byte prefix and a six-byte record:
 *
 *     [p p p p][a b c d e f][next prefix]
 *      ^        ^            ^
 *      |        |            nextRecordStart
 *      |        recordStart
 *      frameStart
 *
 *     recordStart     = frameStart + 4
 *     nextRecordStart = frameStart + 4 + 6
 *     recordEnd       = nextRecordStart - 1
 *
 * The prefix may span physical buffers.
 */
export function createLengthPrefixedRecordBoundaryDetector(
    prefixSize:
    number,

    recordLength: (
        buffers:
        readonly Uint8Array[],

        prefixStart:
        number
    ) => number
): RecordBoundaryDetector {

    if (
        !Number.isInteger(
            prefixSize
        )
        || prefixSize <= 0
    ) {
        throw new Error(
            "Length prefix size must be a positive integer; "
            + `received ${prefixSize}`
        );
    }


    return {
        nextRecordStart(
            buffers,
            frameStart,
            _searchStart
        ): number {

            const availableLength =
                totalLength(
                    buffers
                );


            const prefixEnd =
                frameStart
                + prefixSize;


            /**
             * The complete prefix is not yet available.
             *
             * recordLength must never be called until the complete prefix
             * is present in the logical buffer sequence.
             */
            if (
                prefixEnd
                > availableLength
            ) {
                return -1;
            }


            const length =
                recordLength(
                    buffers,
                    frameStart
                );


            if (
                !Number.isInteger(
                    length
                )
                || length < 0
            ) {
                throw new Error(
                    "Length-prefixed record length must be a "
                    + "non-negative integer; "
                    + `recordLength returned ${length}`
                );
            }


            const nextRecordStart =
                prefixEnd
                + length;


            /**
             * The prefix is complete, but the complete record may not yet
             * have arrived.
             */
            return nextRecordStart
            <= availableLength
                ? nextRecordStart
                : -1;
        },


        recordStart(
            frameStart
        ): number {

            return frameStart
                + prefixSize;
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