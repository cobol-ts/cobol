import {
    type Parser,
    type PhysicalRecordContent,
    type PooledPhysicalRecordContent,
    type RecordCursorResult
} from "@cobol-ts/cursor-loader-types";

import {createPhysicalRecord, type PhysicalRecordConfig} from "./physical.record";


/**
 * Iterate over records in a file.
 *
 * The cursor knows nothing about record syntax.
 *
 * A physical record may contain one byte buffer or many. The cursor establishes
 * startByte; the parser scans from startByte to lastValidByte and establishes
 * endByte when it finds the current record boundary.
 *
 * readMore() appends physical byte buffers, advances lastValidByte and sets
 * fileFinished when EOF is discovered.
 *
 * endByte may be less than lastValidByte when bytes belonging to later records
 * have already been read.
 *
 * Between records the cursor retains one additional reference only: the final
 * byte buffer of the previous record, plus the scalar state needed to describe
 * the already-read bytes in that buffer.
 *
 * recordNumber is one-based and exists only for diagnostic provenance.
 *
 * The yielded result contains the physical record itself. Its lifetime belongs
 * to the client, which calls physicalRecord.close() when finished.
 *
 * The cursor never closes a yielded physical record.
 *
 * No bytes are copied.
 * No Uint8Array views are created.
 * No physical-record wrapper is created.
 */
export async function* createRecordCursor<
    TRepresentation,
    TParserConfig,
    TParserDetails,
    TRecordState,
    TFile
>(
    parser: Parser<TRepresentation,TParserConfig,TParserDetails,TRecordState>,
    details: TParserDetails,
    physicalRecordConfig: PhysicalRecordConfig<TRecordState,TFile>
): AsyncGenerator<RecordCursorResult<TRepresentation,TRecordState>,void,void> {

    /*
     * Across a yield the cursor retains only the final byte buffer of the
     * completed physical record.
     */
    let nextBuffer: Uint8Array | undefined;

    /*
     * State describing bytes already present in nextBuffer. These values are
     * relative to nextBuffer, which becomes buffers[0] of the next record.
     */
    let nextStartByte = 0;
    let nextLastValidByte = 0;
    let nextFileFinished = false;

    /*
     * One-based physical record number used only for diagnostics/provenance.
     */
    let recordNumber = 0;


    try {
        while (true) {
            /*
             * The cursor needs the pooled/internal capability because it
             * transfers the carried byte buffer into record.buffers.
             *
             * The parser and client receive narrower capabilities of this same
             * runtime object.
             */
            let record: PooledPhysicalRecordContent<TRecordState> | undefined =
                createPhysicalRecord(physicalRecordConfig);


            /*
             * Transfer the cursor-owned carry reference directly into the new
             * physical record. No reuse() is needed because the cursor already
             * owns this reference.
             */
            if (nextBuffer !== undefined) {
                record.buffers.push(nextBuffer);
                nextBuffer = undefined;
            }


            /*
             * Establish the bytes already available before parsing starts.
             */
            record.startByte = nextStartByte;
            record.endByte = nextStartByte;
            record.lastValidByte = nextLastValidByte;
            record.fileFinished = nextFileFinished;

            /*
             * source was bound by createPhysicalRecord(). The cursor owns the
             * per-record sequence number.
             */
            record.recordNumber = ++recordNumber;


            const result = await parser.parse(record, details);


            /*
             * Same runtime object, narrowed to the client-visible capability.
             */
            const physicalRecord: PhysicalRecordContent<TRecordState> = record;


            /*
             * EOF may have been discovered before this record was reached. The
             * record is final only when its completed end is also the final
             * valid byte in the file.
             */
            if (record.fileFinished && record.endByte === record.lastValidByte) {
                const cursorResult: RecordCursorResult<TRepresentation,TRecordState> = {
                    result,
                    physicalRecord
                };

                record = undefined;
                yield cursorResult;
                return;
            }


            /*
             * A non-final record must contain at least one buffer because its
             * final buffer becomes buffers[0] of the next physical record.
             */
            if (record.buffers.length === 0) {
                throw new Error(
                    "Parser completed a non-final physical record without a byte buffer"
                );
            }


            /*
             * Logical offset at which the final buffer begins. All preceding
             * buffers are complete physical buffers.
             */
            const finalBufferStart =
                (record.buffers.length - 1) * physicalRecordConfig.bufferSize;

            /*
             * Rebase the completed record end and available-data end into the
             * final buffer, which becomes the first buffer of the next record.
             */
            nextStartByte = record.endByte - finalBufferStart;
            nextLastValidByte = record.lastValidByte - finalBufferStart;
            nextFileFinished = record.fileFinished;


            /*
             * Both rebased positions must lie within the carried final buffer.
             * Either may equal bufferSize.
             */
            if (
                nextStartByte < 0
                || nextStartByte > physicalRecordConfig.bufferSize
                || nextLastValidByte < nextStartByte
                || nextLastValidByte > physicalRecordConfig.bufferSize
            ) {
                throw new Error(
                    "Parser returned a physical record range outside its byte buffers"
                );
            }


            const lastBuffer = record.buffers[record.buffers.length - 1];

            /*
             * Take one additional reference before yielding because the client
             * may close this physical record while the generator is suspended.
             */
            physicalRecordConfig.byteBufferPool.reuse(lastBuffer);
            nextBuffer = lastBuffer;


            const cursorResult: RecordCursorResult<TRepresentation,TRecordState> = {
                result,
                physicalRecord
            };

            /*
             * Across suspension the cursor retains only nextBuffer, the scalar
             * carry state and recordNumber.
             */
            record = undefined;
            yield cursorResult;
        }
    } finally {
        /*
         * If iteration is abandoned while suspended, release the additional
         * cursor-owned reference intended for the next physical record.
         */
        if (nextBuffer !== undefined) {
            physicalRecordConfig.byteBufferPool.release(nextBuffer);
        }
    }
}
