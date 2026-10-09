import {
    type Parser,
    type PhysicalRecordContent,
    type RecordCursorResult
} from "@cobol-ts/cursor-loader-types";
import {type RecordCursorPhysicalRecord, type RecordCursorResources} from "./physical.record";


/**
 * Iterate over physical records without knowing their syntax.
 *
 * The cursor establishes startByte and recordNumber. The parser scans available
 * bytes, calls readMore() as needed, and establishes endByte. The cursor carries
 * the final physical buffer into the next record without copying it.
 *
 * Ownership is explicit:
 *
 *     before yield     cursor owns the record lease;
 *     after yield      consumer owns the record lease;
 *     carried buffer   cursor owns one additional reference until transferred
 *                      to the next record or iteration ends.
 */
export async function* createRecordCursor<TRepresentation,TParserConfig,TParserDetails,TRecordState>(
    parser: Parser<TRepresentation,TParserConfig,TParserDetails,TRecordState>,
    details: TParserDetails,
    resources: RecordCursorResources<TRecordState>
): AsyncGenerator<RecordCursorResult<TRepresentation,TRecordState>,void,void> {
    let nextBuffer: Uint8Array | undefined;
    let nextStartByte = 0;
    let nextLastValidByte = 0;
    let nextFileFinished = false;
    let recordNumber = 0;
    let record: RecordCursorPhysicalRecord<TRecordState> | undefined;

    try {
        while (true) {
            record = resources.acquireRecord();

            if (nextBuffer !== undefined) {
                record.buffers.push(nextBuffer);
                nextBuffer = undefined;
            }

            record.startByte = nextStartByte;
            record.endByte = nextStartByte;
            record.lastValidByte = nextLastValidByte;
            record.fileFinished = nextFileFinished;
            record.recordNumber = ++recordNumber;

            const result = await parser.parse(record, details);
            validateCompletedRecord(record, resources.bufferSize);

            const physicalRecord: PhysicalRecordContent<TRecordState> = record;

            if (record.fileFinished && record.endByte === record.lastValidByte) {
                const cursorResult: RecordCursorResult<TRepresentation,TRecordState> = {result, physicalRecord};
                record = undefined;
                yield cursorResult;
                return;
            }

            if (record.buffers.length === 0) {
                throw new Error("Parser completed a non-final physical record without a byte buffer");
            }

            const finalBufferStart = (record.buffers.length - 1) * resources.bufferSize;
            nextStartByte = record.endByte - finalBufferStart;
            nextLastValidByte = record.lastValidByte - finalBufferStart;
            nextFileFinished = record.fileFinished;

            if (
                nextStartByte < 0
                || nextStartByte > resources.bufferSize
                || nextLastValidByte < nextStartByte
                || nextLastValidByte > resources.bufferSize
            ) {
                throw new Error("Parser returned a physical record range outside its byte buffers");
            }

            const lastBuffer = record.buffers[record.buffers.length - 1];
            resources.retainBuffer(lastBuffer);
            nextBuffer = lastBuffer;

            const cursorResult: RecordCursorResult<TRepresentation,TRecordState> = {result, physicalRecord};
            record = undefined;
            yield cursorResult;
        }
    } finally {
        /* An unyielded record lease still belongs to the cursor. */
        if (record !== undefined) {
            record.close();
        }

        if (nextBuffer !== undefined) {
            resources.releaseBuffer(nextBuffer);
        }
    }
}


function validateCompletedRecord<TRecordState>(
    record: RecordCursorPhysicalRecord<TRecordState>,
    bufferSize: number
): void {
    const capacity = record.buffers.length * bufferSize;

    if (
        record.startByte < 0
        || record.endByte < record.startByte
        || record.endByte > record.lastValidByte
        || record.lastValidByte > capacity
    ) {
        throw new Error("Parser returned a physical record range outside its byte buffers");
    }
}