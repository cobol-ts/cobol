"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createLineRecordReader = createLineRecordReader;
exports.createFixedRecordReader = createFixedRecordReader;
const cursor_record_physical_detectors_1 = require("./cursor.record.physical.detectors");
const cursor_file_1 = require("@cobol-ts/cursor-file");
/**
 * Create a line-oriented physical record reader.
 *
 * The default boundary detector recognises LF and CRLF records.
 *
 * EOF without a physical record terminator is treated as a valid final
 * record.
 *
 * Both the boundary detector and buffer pool may be supplied explicitly
 * for tests or alternative physical formats.
 */
function createLineRecordReader(boundaryDetector = cursor_record_physical_detectors_1.newlineRecordBoundaryDetector, bufferPool = (0, cursor_file_1.createFileBufferPool)()) {
    return details => createRecordCursor(details.filename, boundaryDetector, "final-record", bufferPool);
}
/**
 * Create a fixed-width physical record reader.
 *
 * By default the boundary detector is created from details.recordSize.
 *
 * A boundary detector may be supplied explicitly for tests or alternative
 * fixed-width framing rules.
 *
 * EOF with bytes remaining which do not form a complete record is reported
 * as a physical record error.
 */
function createFixedRecordReader(boundaryDetector = undefined, bufferPool = (0, cursor_file_1.createFileBufferPool)()) {
    return details => createRecordCursor(details.filename, boundaryDetector
        ?? (0, cursor_record_physical_detectors_1.createFixedWidthRecordBoundaryDetector)(details.recordSize), "incomplete-record-error", bufferPool);
}
/**
 * Read one file as complete physical records.
 *
 * The reader:
 *
 * - reads pooled byte buffers from the file byte cursor;
 * - retains buffers while a physical record spans them;
 * - delegates physical record-boundary semantics to boundaryDetector;
 * - yields zero-copy PhysicalRecordContent views;
 * - releases buffers once no current or future record can refer to them.
 *
 * buffers contains every buffer still required by the current or a future
 * physical record.
 *
 * startByte is the logical offset, across buffers, of the first byte of
 * the current record.
 *
 * searchStart is the logical offset of the first byte which has not already
 * been examined while searching for the boundary of the current record.
 *
 * boundaryDetector.nextRecordStart() returns the logical offset of the
 * first byte of the following record.
 *
 * boundaryDetector.recordEnd() returns the inclusive final data byte of
 * the current record, excluding any physical framing bytes.
 */
async function* createRecordCursor(filename, boundaryDetector, endOfFileBehaviour, bufferPool) {
    const buffers = [];
    let bufferedLength = 0;
    let startByte = 0;
    let searchStart = 0;
    try {
        for await (const buffer of (0, cursor_file_1.createFileByteCursor)(filename, bufferPool)) {
            buffers.push(buffer);
            bufferedLength += buffer.length;
            /**
             * Do not invoke the detector when there are no bytes available
             * for the current record.
             */
            while (startByte
                < bufferedLength) {
                const nextRecordStart = boundaryDetector.nextRecordStart(buffers, startByte, searchStart);
                if (nextRecordStart === -1) {
                    /**
                     * The complete boundary is not yet available.
                     *
                     * Every currently available byte has now been examined
                     * by a searching detector.
                     *
                     * Retain the existing buffers, remember how far the
                     * search progressed, and obtain another buffer from the
                     * byte cursor.
                     *
                     * Detectors which do not search, such as fixed-width
                     * detectors, may ignore searchStart.
                     */
                    searchStart =
                        bufferedLength;
                    break;
                }
                validateNextRecordStart(nextRecordStart, startByte, bufferedLength);
                const recordEnd = boundaryDetector.recordEnd(buffers, nextRecordStart);
                validateRecordEnd(recordEnd, startByte, nextRecordStart);
                /**
                 * recordEnd is inclusive.
                 *
                 * An empty record is represented by:
                 *
                 *     recordEnd === startByte - 1
                 *
                 * and therefore correctly has length zero.
                 */
                const recordLength = recordEnd
                    - startByte
                    + 1;
                const record = {
                    buffers,
                    firstBufferOffset: startByte,
                    length: recordLength
                };
                /**
                 * The generator is suspended while the consumer uses this
                 * record, so all referenced buffers remain valid.
                 */
                yield record;
                /**
                 * The consumer has advanced the cursor.
                 *
                 * Every byte before nextRecordStart belongs either to the
                 * completed record or to its physical framing and can now
                 * be discarded.
                 */
                const releasedBytes = releaseConsumedBuffers(buffers, nextRecordStart, bufferPool);
                bufferedLength -=
                    releasedBytes;
                startByte =
                    nextRecordStart
                        - releasedBytes;
                /**
                 * A new record begins at startByte.
                 *
                 * No bytes belonging to this new record have yet been
                 * searched for its boundary.
                 */
                searchStart =
                    startByte;
            }
        }
        if (startByte
            < bufferedLength) {
            const remainingLength = bufferedLength
                - startByte;
            if (endOfFileBehaviour
                === "final-record") {
                /**
                 * EOF without a physical terminator is a valid final record
                 * for formats which permit it.
                 */
                yield {
                    buffers,
                    firstBufferOffset: startByte,
                    length: remainingLength
                };
            }
            else {
                /**
                 * The boundary detector could not identify another complete
                 * physical record before EOF.
                 */
                yield [
                    "Incomplete physical record at end of file: "
                        + `${remainingLength} byte(s) remain but do not form `
                        + "a complete physical record"
                ];
            }
        }
    }
    finally {
        /**
         * This also handles early cursor closure.
         *
         * Any buffers still retained by this cursor can no longer be
         * observed and are returned to the pool.
         */
        for (const buffer of buffers) {
            bufferPool.release(buffer);
        }
    }
}
/**
 * Release complete buffers which contain no bytes belonging to the next
 * physical record.
 *
 * consumedBytes is expressed as a logical offset relative to the first
 * currently retained buffer.
 *
 * The return value is the number of logical bytes removed from the front
 * of the buffer sequence. The caller uses this value to rebase its
 * remaining offsets.
 */
function releaseConsumedBuffers(buffers, consumedBytes, bufferPool) {
    let releasedBytes = 0;
    let releaseCount = 0;
    while (releaseCount
        < buffers.length) {
        const buffer = buffers[releaseCount];
        if (consumedBytes
            - releasedBytes
            < buffer.length) {
            break;
        }
        releasedBytes +=
            buffer.length;
        releaseCount++;
    }
    for (let index = 0; index < releaseCount; index++) {
        bufferPool.release(buffers[index]);
    }
    if (releaseCount !== 0) {
        buffers.splice(0, releaseCount);
    }
    return releasedBytes;
}
/**
 * Validate nextRecordStart returned by RecordBoundaryDetector.
 *
 * The next record must begin after the current record begins and cannot
 * begin beyond the currently buffered content.
 *
 * nextRecordStart may equal bufferedLength. This occurs when the current
 * record consumes all currently available bytes.
 *
 * An invalid value indicates a programming or configuration error rather
 * than malformed input data.
 */
function validateNextRecordStart(nextRecordStart, startByte, bufferedLength) {
    if (!Number.isInteger(nextRecordStart)
        || nextRecordStart
            <= startByte
        || nextRecordStart
            > bufferedLength) {
        throw new Error("RecordBoundaryDetector returned invalid next record start "
            + `${nextRecordStart}; expected -1 or an integer greater than `
            + `${startByte} and no greater than ${bufferedLength}`);
    }
}
/**
 * Validate recordEnd returned by RecordBoundaryDetector.
 *
 * recordEnd is the inclusive offset of the final data byte belonging to
 * the current record.
 *
 * For an empty record it is valid for recordEnd to equal startByte - 1.
 *
 * recordEnd must always be before nextRecordStart because bytes at or
 * after nextRecordStart belong to the following record.
 *
 * An invalid value indicates a programming or configuration error rather
 * than malformed input data.
 */
function validateRecordEnd(recordEnd, startByte, nextRecordStart) {
    if (!Number.isInteger(recordEnd)
        || recordEnd
            < startByte - 1
        || recordEnd
            >= nextRecordStart) {
        throw new Error("RecordBoundaryDetector returned invalid record end "
            + `${recordEnd}; expected an integer between ${startByte - 1} and ${nextRecordStart - 1}`);
    }
}
//# sourceMappingURL=cursor.record.physical.record.js.map