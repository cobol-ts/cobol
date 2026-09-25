import { type RecordBoundaryDetector } from "@cobol-ts/cursor-loader-types";
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
export declare const newlineRecordBoundaryDetector: RecordBoundaryDetector;
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
export declare function createFixedWidthRecordBoundaryDetector(recordSize: number): RecordBoundaryDetector;
