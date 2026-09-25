import { type FileLineBufferPool, type FixedFile, type LineFile, type RecordBoundaryDetector, type RecordReader } from "@cobol-ts/cursor-loader-types";
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
export declare function createLineRecordReader(boundaryDetector?: RecordBoundaryDetector, bufferPool?: FileLineBufferPool): RecordReader<LineFile>;
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
export declare function createFixedRecordReader(boundaryDetector?: RecordBoundaryDetector | undefined, bufferPool?: FileLineBufferPool): RecordReader<FixedFile>;
