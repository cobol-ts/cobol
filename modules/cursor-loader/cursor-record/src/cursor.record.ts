import {
    type FileBufferPool,
    type FileByteCursorFactory,
    type FixedFile, LengthPrefixedFile,
    type LineFile,
    type PhysicalRecordContent,
    type RecordBoundaryDetector,
    type RecordCursor,
    type RecordReader
} from "@cobol-ts/cursor-loader-types";

import {
    createFileBufferPool,
    createFileByteCursor
} from "@cobol-ts/cursor-file";

import {
    newlineRecordBoundaryDetector
} from "./cursor.newline.detector";

import {
    createFixedWidthRecordBoundaryDetector
} from "./cursor.fixed.detector";
import {createLengthPrefixedRecordBoundaryDetector} from "./cursor.prefixed.detector";


type EndOfFileBehaviour =
    "final-record"
    | "incomplete-record-error";


export interface RecordReaderOptions {

    readonly bufferPool?:
        FileBufferPool;

    readonly createFileByteCursor?:
        FileByteCursorFactory;
}


/**
 * Create a line-oriented physical record reader.
 *
 * The default boundary detector recognises LF and CRLF records.
 *
 * EOF without a physical record terminator is treated as a valid final
 * record.
 *
 * Physical byte I/O dependencies may be supplied through options. This is
 * useful for tests and for applications which provide an alternative byte
 * source.
 */
export function createLineRecordReader(
    boundaryDetector:
    RecordBoundaryDetector =
    newlineRecordBoundaryDetector,

    options:
    RecordReaderOptions = {}
): RecordReader<LineFile> {

    const bufferPool =
        options.bufferPool
        ?? createFileBufferPool();

    const fileByteCursorFactory =
        options.createFileByteCursor
        ?? createFileByteCursor;


    return details =>
        createRecordCursor(
            details.filename,
            boundaryDetector,
            "final-record",
            bufferPool,
            fileByteCursorFactory
        );
}


/**
 * Create a fixed-width physical record reader.
 *
 * By default the boundary detector is created from details.recordSize.
 *
 * EOF with bytes remaining which do not form a complete record is reported
 * as a physical record error.
 *
 * Physical byte I/O dependencies may be supplied through options.
 */
export function createFixedRecordReader(
    boundaryDetector:
        RecordBoundaryDetector
        | undefined =
    undefined,

    options:
    RecordReaderOptions = {}
): RecordReader<FixedFile> {

    const bufferPool =
        options.bufferPool
        ?? createFileBufferPool();

    const fileByteCursorFactory =
        options.createFileByteCursor
        ?? createFileByteCursor;


    return details =>
        createRecordCursor(
            details.filename,

            boundaryDetector
            ?? createFixedWidthRecordBoundaryDetector(
                details.recordSize
            ),

            "incomplete-record-error",

            bufferPool,
            fileByteCursorFactory
        );
}
/**
 * Create a length-prefixed physical record reader.
 *
 * By default the boundary detector is created from details.prefixSize
 * and details.recordLength.
 *
 * The prefix is physical framing and is excluded from the parser-visible
 * record.
 *
 * EOF with an incomplete prefix or record is reported as a physical
 * record error.
 */
export function createLengthPrefixedRecordReader(
    boundaryDetector:
        RecordBoundaryDetector
        | undefined =
    undefined,

    options:
    RecordReaderOptions = {}
): RecordReader<LengthPrefixedFile> {

    const bufferPool =
        options.bufferPool
        ?? createFileBufferPool();

    const createByteCursor =
        options.createFileByteCursor
        ?? createFileByteCursor;


    return details =>
        createRecordCursor(
            details.filename,

            boundaryDetector
            ?? createLengthPrefixedRecordBoundaryDetector(
                details.prefixSize,
                details.recordLength
            ),

            "incomplete-record-error",

            bufferPool,

            createByteCursor
        );
}

/**
 * Read one file as complete physical records.
 *
 * The reader:
 *
 * - obtains physical byte buffers from the injected byte cursor factory;
 * - retains buffers while a physical record spans them;
 * - delegates all physical framing semantics to boundaryDetector;
 * - yields zero-copy PhysicalRecordContent views;
 * - releases buffers once no current or future record can refer to them.
 *
 * `buffers` contains every buffer still required by the current or a future
 * physical record.
 *
 * `frameStart` is the logical offset, across buffers, of the first byte of
 * the current physical frame. This may include framing bytes such as a
 * length prefix.
 *
 * `searchStart` is the logical offset of the first byte which has not already
 * been examined while searching for the boundary of the current frame.
 *
 * boundaryDetector.nextRecordStart() returns the logical offset of the first
 * byte of the following physical frame.
 *
 * boundaryDetector.recordStart() returns the logical offset of the first byte
 * of parser-visible record data within the current frame.
 *
 * boundaryDetector.recordEnd() returns the inclusive final data byte of the
 * current record, excluding any suffix framing bytes.
 *
 * Fixed width:
 *
 *     [record data][next record]
 *      ^           ^
 *      |           nextRecordStart
 *      frameStart
 *      recordStart
 *
 * Line:
 *
 *     [record data][CR][LF][next record]
 *      ^                     ^
 *      |                     nextRecordStart
 *      frameStart
 *      recordStart
 *
 * Length-prefixed:
 *
 *     [prefix][record data][next prefix]
 *      ^       ^            ^
 *      |       |            nextRecordStart
 *      |       recordStart
 *      frameStart
 */
async function* createRecordCursor(
    filename: string,
    boundaryDetector: RecordBoundaryDetector,
    endOfFileBehaviour: EndOfFileBehaviour,
    bufferPool: FileBufferPool,
    fileByteCursorFactory: FileByteCursorFactory
): RecordCursor {

    const buffers:
        Uint8Array[] =
        [];


    let bufferedLength =
        0;

    let frameStart =
        0;

    let searchStart =
        0;


    try {
        for await (
            const buffer
            of fileByteCursorFactory(
            filename,
            bufferPool
        )
            ) {
            buffers.push(
                buffer
            );

            bufferedLength +=
                buffer.length;


            /**
             * Do not invoke the detector when there are no bytes available
             * for the current physical frame.
             */
            while (
                frameStart
                < bufferedLength
                ) {
                const nextRecordStart =
                    boundaryDetector.nextRecordStart(
                        buffers,
                        frameStart,
                        searchStart
                    );


                if (
                    nextRecordStart === -1
                ) {
                    /**
                     * The complete physical frame is not yet available.
                     *
                     * Searching detectors have examined all currently
                     * available bytes. Retain the buffers and continue when
                     * another physical file buffer arrives.
                     *
                     * Detectors which calculate their boundary directly may
                     * ignore searchStart.
                     */
                    searchStart =
                        bufferedLength;

                    break;
                }


                validateNextRecordStart(
                    nextRecordStart,
                    frameStart,
                    bufferedLength
                );


                const recordStart =
                    boundaryDetector.recordStart(
                        frameStart
                    );


                validateRecordStart(
                    recordStart,
                    frameStart,
                    nextRecordStart
                );


                const recordEnd =
                    boundaryDetector.recordEnd(
                        buffers,
                        nextRecordStart
                    );


                validateRecordEnd(
                    recordEnd,
                    recordStart,
                    nextRecordStart
                );


                /**
                 * recordEnd is inclusive.
                 *
                 * An empty record is represented by:
                 *
                 *     recordEnd === recordStart - 1
                 *
                 * and therefore correctly has length zero.
                 */
                const recordLength =
                    recordEnd
                    - recordStart
                    + 1;


                const record:
                    PhysicalRecordContent = {

                    buffers,

                    startOffset:
                    recordStart,

                    length:
                    recordLength
                };


                /**
                 * The generator is suspended while the consumer uses this
                 * record, so all referenced buffers remain valid.
                 *
                 * Framing bytes remain retained as well. There is no need to
                 * release prefix or suffix framing separately from the record.
                 */
                yield record;


                /**
                 * The consumer has advanced the cursor.
                 *
                 * Every byte before nextRecordStart belongs either to the
                 * completed physical record or to its framing and can now
                 * be discarded.
                 */
                const releasedBytes =
                    releaseConsumedBuffers(
                        buffers,
                        nextRecordStart,
                        bufferPool
                    );


                bufferedLength -=
                    releasedBytes;


                frameStart =
                    nextRecordStart
                    - releasedBytes;


                /**
                 * A new physical frame begins at frameStart.
                 *
                 * No bytes belonging to this frame have yet been searched
                 * for its boundary.
                 */
                searchStart =
                    frameStart;
            }
        }


        if (
            frameStart
            < bufferedLength
        ) {
            if (
                endOfFileBehaviour
                === "final-record"
            ) {
                /**
                 * EOF without an explicit terminator is permitted for formats
                 * such as line-oriented files.
                 */
                const recordStart =
                    boundaryDetector.recordStart(
                        frameStart
                    );


                validateFinalRecordStart(
                    recordStart,
                    frameStart,
                    bufferedLength
                );


                yield {
                    buffers,

                    startOffset:
                    recordStart,

                    length:
                        bufferedLength
                        - recordStart
                };
            } else {
                /**
                 * The detector could not identify another complete physical
                 * frame before EOF.
                 *
                 * For fixed-width files this means a partial fixed record.
                 *
                 * For length-prefixed files this may mean either an incomplete
                 * prefix or a complete prefix followed by an incomplete
                 * payload.
                 */
                const remainingLength =
                    bufferedLength
                    - frameStart;


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
         * Any buffers still retained by this cursor can no longer be observed
         * and are returned to the pool.
         */
        for (
            const buffer
            of buffers
            ) {
            bufferPool.release(
                buffer
            );
        }
    }
}


/**
 * Release complete buffers which contain no bytes belonging to the next
 * physical frame.
 *
 * consumedBytes is expressed as a logical offset relative to the first
 * currently retained buffer.
 *
 * The return value is the number of logical bytes removed from the front
 * of the buffer sequence. The caller uses this value to rebase its
 * remaining offsets.
 */
function releaseConsumedBuffers(
    buffers: Uint8Array[],
    consumedBytes: number,
    bufferPool: FileBufferPool
): number {

    let releasedBytes =
        0;

    let releaseCount =
        0;


    while (
        releaseCount
        < buffers.length
        ) {
        const buffer =
            buffers[
                releaseCount
                ];


        if (
            consumedBytes
            - releasedBytes
            < buffer.length
        ) {
            break;
        }


        releasedBytes +=
            buffer.length;

        releaseCount++;
    }


    for (
        let index = 0;
        index < releaseCount;
        index++
    ) {
        bufferPool.release(
            buffers[
                index
                ]
        );
    }


    if (
        releaseCount !== 0
    ) {
        buffers.splice(
            0,
            releaseCount
        );
    }


    return releasedBytes;
}


/**
 * Validate nextRecordStart returned by RecordBoundaryDetector.
 *
 * The next physical frame must begin after the current frame begins and
 * cannot begin beyond the currently buffered content.
 *
 * nextRecordStart may equal bufferedLength when the current frame consumes
 * all currently available bytes.
 *
 * An invalid value indicates a programming or configuration error rather
 * than malformed input data.
 */
function validateNextRecordStart(
    nextRecordStart: number,
    frameStart: number,
    bufferedLength: number
): void {

    if (
        !Number.isInteger(
            nextRecordStart
        )
        || nextRecordStart
        <= frameStart
        || nextRecordStart
        > bufferedLength
    ) {
        throw new Error(
            "RecordBoundaryDetector returned invalid next record start "
            + `${nextRecordStart}; expected -1 or an integer greater than `
            + `${frameStart} and no greater than ${bufferedLength}`
        );
    }
}


/**
 * Validate recordStart returned by RecordBoundaryDetector.
 *
 * recordStart is the first byte presented to the parser.
 *
 * It may equal frameStart when the physical format has no prefix framing.
 *
 * It may be greater than frameStart when framing bytes precede the record,
 * as with a length-prefixed physical record.
 *
 * recordStart may equal nextRecordStart for a valid zero-length record.
 */
function validateRecordStart(
    recordStart: number,
    frameStart: number,
    nextRecordStart: number
): void {

    if (
        !Number.isInteger(
            recordStart
        )
        || recordStart
        < frameStart
        || recordStart
        > nextRecordStart
    ) {
        throw new Error(
            "RecordBoundaryDetector returned invalid record start "
            + `${recordStart}; expected an integer between `
            + `${frameStart} and ${nextRecordStart}`
        );
    }
}


/**
 * Validate recordEnd returned by RecordBoundaryDetector.
 *
 * recordEnd is the inclusive offset of the final parser-visible data byte
 * belonging to the current record.
 *
 * For an empty record it is valid for:
 *
 *     recordEnd === recordStart - 1
 *
 * recordEnd must always be before nextRecordStart because bytes at or after
 * nextRecordStart belong to the following physical frame.
 *
 * An invalid value indicates a programming or configuration error rather
 * than malformed input data.
 */
function validateRecordEnd(
    recordEnd: number,
    recordStart: number,
    nextRecordStart: number
): void {

    if (
        !Number.isInteger(
            recordEnd
        )
        || recordEnd
        < recordStart - 1
        || recordEnd
        >= nextRecordStart
    ) {
        throw new Error(
            "RecordBoundaryDetector returned invalid record end "
            + `${recordEnd}; expected an integer between ${
                recordStart - 1
            } and ${
                nextRecordStart - 1
            }`
        );
    }
}


/**
 * Validate recordStart for a final unterminated physical record.
 *
 * There is no nextRecordStart at EOF, so the start merely has to lie within
 * the remaining physical frame.
 */
function validateFinalRecordStart(
    recordStart: number,
    frameStart: number,
    bufferedLength: number
): void {

    if (
        !Number.isInteger(
            recordStart
        )
        || recordStart
        < frameStart
        || recordStart
        > bufferedLength
    ) {
        throw new Error(
            "RecordBoundaryDetector returned invalid final record start "
            + `${recordStart}; expected an integer between `
            + `${frameStart} and ${bufferedLength}`
        );
    }
}