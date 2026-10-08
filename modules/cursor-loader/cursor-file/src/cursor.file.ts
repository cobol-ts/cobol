import {
    type Errors,
    ErrorsException,
    type ErrorsOr,
    isErrors,
    value
} from "@cobol-ts/errors";

import {
    type ProjectionFactory,
    type RecordCursor,
    type RecordCursorResult
} from "@cobol-ts/cursor-loader-types";

import {
    createFileCursorResult,
    createFileCursorResultPool,
    type FileCursorResult,
    type FileCursorResultPool
} from "./cursor.file.result";


type ProjectRecordResult<TProjection> =
    Errors | FileCursorResult<TProjection>;


/**
 * Return either the projected row or its error messages.
 *
 * No success wrapper is allocated.
 */
export async function* createFileCursor<
    TProjection,
    TRepresentation,
    TRecordState
>(
    recordCursor:
    RecordCursor<
        TRepresentation,
        TRecordState
    >,

    projection:
    ProjectionFactory<
        TProjection,
        TRepresentation
    >
): AsyncGenerator<
    FileCursorResult<TProjection> | string[],
    void,
    void
> {

    const resultPool =
        createFileCursorResultPool(
            projection
        );


    for await (const record of recordCursor) {
        const result =
            projectRecord(
                record,
                resultPool
            );

        yield isErrors(result)
            ? result.errors
            : result;
    }
}


/**
 * Return every row as an ErrorsOr.
 *
 * Successful rows allocate the ErrorsOr value wrapper.
 */
export async function* createErrorsOrFileCursor<
    TProjection,
    TRepresentation,
    TRecordState
>(
    recordCursor:
    RecordCursor<
        TRepresentation,
        TRecordState
    >,

    projection:
    ProjectionFactory<
        TProjection,
        TRepresentation
    >
): AsyncGenerator<
    ErrorsOr<
        FileCursorResult<TProjection>
    >,
    void,
    void
> {

    const resultPool =
        createFileCursorResultPool(
            projection
        );


    for await (const record of recordCursor) {
        const result =
            projectRecord(
                record,
                resultPool
            );

        yield isErrors(result)
            ? result
            : value(result);
    }
}


/**
 * Throw when a recoverable row error is encountered.
 */
export async function* createThrowingFileCursor<
    TProjection,
    TRepresentation,
    TRecordState
>(
    recordCursor:
    RecordCursor<
        TRepresentation,
        TRecordState
    >,

    projection:
    ProjectionFactory<
        TProjection,
        TRepresentation
    >
): AsyncGenerator<
    FileCursorResult<TProjection>,
    void,
    void
> {

    const resultPool =
        createFileCursorResultPool(
            projection
        );


    for await (const record of recordCursor) {
        const result =
            projectRecord(
                record,
                resultPool
            );

        if (isErrors(result)) {
            throw new ErrorsException(
                result.errors,
                result.reference
            );
        }

        yield result;
    }
}


/**
 * Ignore recoverable row errors and continue processing.
 *
 * onError is optional. When present it receives the complete Errors object,
 * including reference and extras.
 */
export async function* createIgnoringFileCursor<
    TProjection,
    TRepresentation,
    TRecordState
>(
    recordCursor:
    RecordCursor<
        TRepresentation,
        TRecordState
    >,

    projection:
    ProjectionFactory<
        TProjection,
        TRepresentation
    >,

    onError?:
    (errors: Errors) => void
): AsyncGenerator<
    FileCursorResult<TProjection>,
    void,
    void
> {

    const resultPool =
        createFileCursorResultPool(
            projection
        );


    for await (const record of recordCursor) {
        const result =
            projectRecord(
                record,
                resultPool
            );

        if (isErrors(result)) {
            onError?.(
                result
            );

            continue;
        }

        yield result;
    }
}


/**
 * Project one record and transfer its physical lifetime.
 *
 * Success:
 *     a pooled FileCursorResult is acquired;
 *
 *     its permanent projection object is bound to record.result and
 *     record.physicalRecord;
 *
 *     ownership of physicalRecord transfers to FileCursorResult.
 *
 * Error:
 *     physicalRecord is closed here because no public result owns it.
 *
 * Exception:
 *     physicalRecord is closed before the exception propagates.
 *
 * Projection objects are not created here. Each pooled result already owns
 * one reusable projection object.
 */
function projectRecord<
    TProjection,
    TRepresentation,
    TRecordState
>(
    record:
    RecordCursorResult<
        TRepresentation,
        TRecordState
    >,

    resultPool:
    FileCursorResultPool<
        TProjection,
        TRepresentation
    >
): ProjectRecordResult<
    TProjection
> {

    if (isErrors(record.result)) {
        record.physicalRecord.close();

        return record.result;
    }


    try {
        return createFileCursorResult(
            record.result,
            record.physicalRecord,
            resultPool
        );
    } catch (error) {
        record.physicalRecord.close();

        throw error;
    }
}