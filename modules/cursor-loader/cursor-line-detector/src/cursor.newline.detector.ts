import {nullRecordStart, type RecordBoundaryDetector} from "@cobol-ts/cursor-loader-types";
import {byteAt, findByte} from "./cursor.record.helpers";


const CARRIAGE_RETURN =
    13;

const LINE_FEED =
    10;


/**
 * Physical record detector for LF and CRLF terminated records.
 *
 * The line terminator is framing and is not included in the
 * PhysicalRecordContent presented to the parser.
 *
 * Both:
 *
 *     abc\n
 *
 * and:
 *
 *     abc\r\n
 *
 * therefore expose:
 *
 *     abc
 *
 * as the record data.
 */
export const newlineRecordBoundaryDetector:
    RecordBoundaryDetector = {

    /**
     * Search for the LF which terminates the current physical record.
     *
     * searchStart is used rather than frameStart so that when a line spans
     * several physical buffers, bytes which have already been searched are
     * not examined again.
     */
    nextRecordStart(
        buffers,
        _frameStart,
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


    /**
     * Line framing has no prefix, so record data begins at frameStart.
     */
    recordStart:
    nullRecordStart,


    /**
     * Remove the physical line terminator from the record.
     *
     * nextRecordStart points immediately after LF.
     *
     * For LF:
     *
     *     [data][LF][next record]
     *              ^
     *              nextRecordStart
     *
     * recordEnd is nextRecordStart - 2.
     *
     * For CRLF:
     *
     *     [data][CR][LF][next record]
     *                  ^
     *                  nextRecordStart
     *
     * recordEnd is nextRecordStart - 3.
     */
    recordEnd(
        buffers,
        nextRecordStart
    ): number {

        const lineFeed =
            nextRecordStart - 1;

        const beforeLineFeed =
            lineFeed - 1;


        if (
            beforeLineFeed >= 0
            && byteAt(
                buffers,
                beforeLineFeed
            ) === CARRIAGE_RETURN
        ) {
            return beforeLineFeed - 1;
        }


        return lineFeed - 1;
    }
};

