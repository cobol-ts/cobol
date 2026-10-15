import {ErrorsException,isErrors} from "@cobol-ts/errors";

import {
    type Parser,
    type ParserPhysicalRecordContent,
    type ParserResult,
    type PhysicalRecordContent,
    type PhysicalRecordContext,
    type RecordCursorResult
} from "@cobol-ts/cursor-loader-types";

import {
    type RecordCursorPhysicalRecord,
    type RecordCursorResources
} from "./physical.record";


export interface OpenedRecordCursor<
    TRepresentation,
    TParserDetails,
    TRecordState
> {
    readonly details: TParserDetails;
    readonly preparationContext?: PhysicalRecordContext;

    readonly recordCursor:
        AsyncGenerator<
            RecordCursorResult<TRepresentation,TRecordState>,
            void,
            void
        >;

    close(): void;
}


interface RecordParser<
    TRepresentation,
    TParserDetails,
    TRecordState
> {
    readonly parse: (
        record: ParserPhysicalRecordContent<TRecordState>,
        details: TParserDetails
    ) => Promise<ParserResult<TRepresentation>>;
}


interface RecordCursorState<TRecordState> {
    readonly resources: RecordCursorResources<TRecordState>;

    nextBuffer: Uint8Array | undefined;
    nextStartByte: number;
    nextLastValidByte: number;
    nextFileFinished: boolean;
    recordNumber: number;
    finished: boolean;
}


/**
 * Low-level entry point when parser details are already known.
 */
export function createRecordCursor<
    TRepresentation,
    TParserDetails,
    TRecordState
>(
    parser: RecordParser<TRepresentation,TParserDetails,TRecordState>,
    details: TParserDetails,
    resources: RecordCursorResources<TRecordState>
): AsyncGenerator<RecordCursorResult<TRepresentation,TRecordState>,void,void> {
    return createRecordCursorFromState(
        parser,
        details,
        createRecordCursorState(resources)
    );
}


/**
 * Open one parser against one source.
 *
 * prepare(), when present, consumes its bootstrap record through the same
 * cursor state subsequently used for data records. Bytes already read beyond
 * the bootstrap record therefore become the start of the first data record
 * without copying or rereading.
 *
 * The physical bootstrap record itself is released after preparation. Only its
 * thin source/record-number context is retained for later setup diagnostics.
 *
 * Preparation failures are configuration/setup failures and throw.
 */
export async function openRecordCursor<
    TRepresentation,
    TParserConfig,
    TParserDetails,
    TRecordState,
    TProjectionPath
>(
    parser: Parser<
        TRepresentation,
        TParserConfig,
        TParserDetails,
        TRecordState,
        TProjectionPath
    >,
    config: TParserConfig,
    resources: RecordCursorResources<TRecordState>
): Promise<
    OpenedRecordCursor<
        TRepresentation,
        TParserDetails,
        TRecordState
    >
> {
    const state =
        createRecordCursorState(resources);

    if (parser.prepare === undefined) {
        const details =
            config as unknown as TParserDetails;

        return {
            details,

            recordCursor:
                createRecordCursorFromState(
                    parser,
                    details,
                    state
                ),

            close:
                () => closeRecordCursorState(state)
        };
    }

    let record:
        RecordCursorPhysicalRecord<TRecordState> | undefined =
        acquireRecord(state);

    try {
        const prepared =
            await parser.prepare(
                record,
                config
            );

        /**
         * Preparation errors terminate the source.
         *
         * Do not create a carry reference because no data-record run will
         * follow.
         */
        if (isErrors(prepared)) {
            throw new ErrorsException(
                prepared.errors,
                prepared.reference
            );
        }

        /*
         * Retain only the provenance needed after the bootstrap record itself
         * has been released.
         */
        const preparationContext: PhysicalRecordContext = {
            source: record.source,
            recordNumber: record.recordNumber
        };

        /**
         * Establish the carry before releasing the bootstrap record's own
         * references.
         */
        completeRecord(
            state,
            record
        );

        const completedRecord =
            record;

        record =
            undefined;

        completedRecord.close();

        return {
            details:
            prepared,

            preparationContext,

            recordCursor:
                createRecordCursorFromState(
                    parser,
                    prepared,
                    state
                ),

            close:
                () => closeRecordCursorState(state)
        };
    } catch (error) {
        record?.close();
        closeRecordCursorState(state);
        throw error;
    }
}


async function* createRecordCursorFromState<
    TRepresentation,
    TParserDetails,
    TRecordState
>(
    parser: RecordParser<TRepresentation,TParserDetails,TRecordState>,
    details: TParserDetails,
    state: RecordCursorState<TRecordState>
): AsyncGenerator<RecordCursorResult<TRepresentation,TRecordState>,void,void> {
    let record:
        RecordCursorPhysicalRecord<TRecordState> | undefined;

    try {
        while (!state.finished) {
            record =
                acquireRecord(state);

            const result =
                await parser.parse(
                    record,
                    details
                );

            completeRecord(
                state,
                record
            );

            const physicalRecord:
                PhysicalRecordContent<TRecordState> =
                record;

            const cursorResult:
                RecordCursorResult<TRepresentation,TRecordState> = {
                result,
                physicalRecord
            };

            /**
             * Ownership transfers to the consumer before suspension.
             */
            record =
                undefined;

            yield cursorResult;
        }
    } finally {
        /**
         * Only an unyielded record remains cursor-owned.
         */
        record?.close();

        closeRecordCursorState(
            state
        );
    }
}


function createRecordCursorState<TRecordState>(
    resources: RecordCursorResources<TRecordState>
): RecordCursorState<TRecordState> {
    return {
        resources,
        nextBuffer:
        undefined,
        nextStartByte:
            0,
        nextLastValidByte:
            0,
        nextFileFinished:
            false,
        recordNumber:
            0,
        finished:
            false
    };
}


function acquireRecord<TRecordState>(
    state: RecordCursorState<TRecordState>
): RecordCursorPhysicalRecord<TRecordState> {
    if (state.finished) {
        throw new Error(
            "Cannot acquire a record from a finished record cursor"
        );
    }

    const record =
        state.resources.acquireRecord();

    if (state.nextBuffer !== undefined) {
        record.buffers.push(
            state.nextBuffer
        );

        state.nextBuffer =
            undefined;
    }

    record.startByte =
        state.nextStartByte;

    record.endByte =
        state.nextStartByte;

    record.lastValidByte =
        state.nextLastValidByte;

    record.fileFinished =
        state.nextFileFinished;

    record.recordNumber =
        ++state.recordNumber;

    return record;
}


function completeRecord<TRecordState>(
    state: RecordCursorState<TRecordState>,
    record: RecordCursorPhysicalRecord<TRecordState>
): void {
    validateCompletedRecord(
        record,
        state.resources.bufferSize
    );

    if (
        record.fileFinished
        && record.endByte === record.lastValidByte
    ) {
        state.finished =
            true;

        return;
    }

    if (record.buffers.length === 0) {
        throw new Error(
            "Parser completed a non-final physical record without a byte buffer"
        );
    }

    const finalBufferStart =
        (record.buffers.length - 1)
        * state.resources.bufferSize;

    const nextStartByte =
        record.endByte
        - finalBufferStart;

    const nextLastValidByte =
        record.lastValidByte
        - finalBufferStart;

    if (
        nextStartByte < 0
        || nextStartByte > state.resources.bufferSize
        || nextLastValidByte < nextStartByte
        || nextLastValidByte > state.resources.bufferSize
    ) {
        throw new Error(
            "Parser returned a physical record range outside its byte buffers"
        );
    }

    const lastBuffer =
        record.buffers[
        record.buffers.length - 1
            ];

    state.resources.retainBuffer(
        lastBuffer
    );

    state.nextBuffer =
        lastBuffer;

    state.nextStartByte =
        nextStartByte;

    state.nextLastValidByte =
        nextLastValidByte;

    state.nextFileFinished =
        record.fileFinished;
}


function closeRecordCursorState<TRecordState>(
    state: RecordCursorState<TRecordState>
): void {
    state.finished =
        true;

    if (state.nextBuffer === undefined) {
        return;
    }

    state.resources.releaseBuffer(
        state.nextBuffer
    );

    state.nextBuffer =
        undefined;
}


function validateCompletedRecord<TRecordState>(
    record: RecordCursorPhysicalRecord<TRecordState>,
    bufferSize: number
): void {
    const capacity =
        record.buffers.length
        * bufferSize;

    if (
        record.startByte < 0
        || record.endByte < record.startByte
        || record.endByte > record.lastValidByte
        || record.lastValidByte > capacity
    ) {
        throw new Error(
            "Parser returned a physical record range outside its byte buffers"
        );
    }
}