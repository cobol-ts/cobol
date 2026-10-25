import {
    type Errors,
    ErrorsException,
    type ErrorsOr,
    isErrors,
    value
} from "@cobol-ts/errors";

import {
    type AnyParser,
    type CanonicalProjection,
    type FillFileBuffer,
    type ParserRegistry,
    type ProjectionDefinition,
    type ProjectionFactory,
    type RecordCursor,
    type RecordCursorResult
} from "@cobol-ts/cursor-loader-types";

import {
    createDefaultPhysicalRecordConfig,
    openRecordCursor,
    type RecordCursorVisitor,
    createSimpleRecordPool,
    type RecordObjectPool, createReferenceCountedRecordPool
} from "@cobol-ts/cursor-record";

import {
    createProjection
} from "@cobol-ts/cursor-projection";

import {
    createFileCursorResult,
    createFileCursorResultPool,
    type FileCursorResult,
    type FileCursorResultPool
} from "./cursor.file.result";
import {createRefCountedPool} from "@cobol-ts/ref_counted_pool";


type ProjectRecordResult<TProjection> =
    Errors | FileCursorResult<TProjection>;


export interface CursorFileDefinition<
    TProjection,
    TFileType extends string
> {
    readonly filename: string;
    readonly fileType: TFileType;

    readonly projection:
        CanonicalProjection<
            ProjectionDefinition<TProjection>
        >;
}


export interface FileCursorInfrastructure<
    TFile,
    TFileType extends string
> {
    readonly parsers: ParserRegistry<TFileType>;
    readonly bufferSize: number;
    readonly fillFileBuffer: FillFileBuffer<TFile>;
    /** Physical record-object pool; independent of the shared byte-buffer pool. */
    readonly recordPool?: RecordObjectPool<any>;
    /** Shared buffers must support retain/release for records crossing boundaries. */
    readonly byteBufferPool?: import("@cobol-ts/cursor-loader-types").FileBufferPool;
}


interface OpenedFileCursor<TProjection> {
    readonly recordCursor: RecordCursor<any,any>;
    readonly projection: ProjectionFactory<TProjection,any>;
    scanRecords(visitor:RecordCursorVisitor<any,any>):Promise<void>;
    close(): void;
}


/**
 * Callback alternative to createThrowingFileCursor.
 *
 * The callback receives the projected row, not a lease. Its lifetime ends
 * when the callback returns, so callers must not retain it or await inside
 * the callback. Returning false stops iteration (e.g. during warm-up).
 *
 * Unlike an async generator, the file cursor can process buffered records
 * synchronously when the parser implements parseBuffered(). Projection and
 * physical-record objects are pooled/reused throughout the scan.
 */
export async function scanThrowingFileCursor<
    TProjection,TFile,TFileType extends string
>(
    definition: CursorFileDefinition<TProjection,TFileType>,
    file: TFile,
    infrastructure: FileCursorInfrastructure<TFile,TFileType>,
    onRecord: (record:TProjection) => void | boolean
): Promise<void> {
    const opened = await openFileCursor(definition,file,{
        ...infrastructure,
        recordPool: infrastructure.recordPool ?? createReferenceCountedRecordPool()gi
    });
    const projected = opened.projection.create();
    try {
        await opened.scanRecords((result,physicalRecord) => {
            if (isErrors(result)) {
                throw new ErrorsException(result.errors,result.reference);
            }
            opened.projection.bind(projected,result,physicalRecord);
            try {
                return onRecord(projected);
            } finally {
                opened.projection.clear(projected);
            }
        });
    } finally {
        opened.close();
    }
}


/**
 * Return successful projected rows directly.
 *
 * Recoverable row parser errors are returned as string[].
 *
 * Configuration, parser preparation and projection configuration failures
 * throw before the data-row run.
 */
export async function* createFileCursor<
    TProjection,
    TFile,
    TFileType extends string
>(
    definition: CursorFileDefinition<TProjection,TFileType>,
    file: TFile,
    infrastructure: FileCursorInfrastructure<TFile,TFileType>
): AsyncGenerator<FileCursorResult<TProjection> | string[],void,void> {
    const opened =
        await openFileCursor(
            definition,
            file,
            infrastructure
        );

    const resultPool =
        createFileCursorResultPool(
            opened.projection
        );

    try {
        for await (const record of opened.recordCursor) {
            const result =
                projectRecord(
                    record,
                    resultPool
                );

            yield isErrors(result)
                ? result.errors
                : result;
        }
    } finally {
        opened.close();
    }
}


/**
 * Return every data row as ErrorsOr.
 *
 * Configuration/preparation failures throw.
 */
export async function* createErrorsOrFileCursor<
    TProjection,
    TFile,
    TFileType extends string
>(
    definition: CursorFileDefinition<TProjection,TFileType>,
    file: TFile,
    infrastructure: FileCursorInfrastructure<TFile,TFileType>
): AsyncGenerator<ErrorsOr<FileCursorResult<TProjection>>,void,void> {
    const opened =
        await openFileCursor(
            definition,
            file,
            infrastructure
        );

    const resultPool =
        createFileCursorResultPool(
            opened.projection
        );

    try {
        for await (const record of opened.recordCursor) {
            const result =
                projectRecord(
                    record,
                    resultPool
                );

            yield isErrors(result)
                ? result
                : value(result);
        }
    } finally {
        opened.close();
    }
}


/**
 * Throw when a recoverable row parser error is encountered.
 *
 * Configuration/preparation failures also throw.
 */
export async function* createThrowingFileCursor<
    TProjection,
    TFile,
    TFileType extends string
>(
    definition: CursorFileDefinition<TProjection,TFileType>,
    file: TFile,
    infrastructure: FileCursorInfrastructure<TFile,TFileType>
): AsyncGenerator<FileCursorResult<TProjection>,void,void> {
    const opened =
        await openFileCursor(
            definition,
            file,
            infrastructure
        );

    const resultPool =
        createFileCursorResultPool(
            opened.projection
        );

    try {
        for await (const record of opened.recordCursor) {
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
    } finally {
        opened.close();
    }
}


/**
 * Ignore recoverable row parser errors and continue.
 *
 * Configuration/preparation failures always throw.
 */
export async function* createIgnoringFileCursor<
    TProjection,
    TFile,
    TFileType extends string
>(
    definition: CursorFileDefinition<TProjection,TFileType>,
    file: TFile,
    infrastructure: FileCursorInfrastructure<TFile,TFileType>,
    onError?: (errors: Errors) => void
): AsyncGenerator<FileCursorResult<TProjection>,void,void> {
    const opened =
        await openFileCursor(
            definition,
            file,
            infrastructure
        );

    const resultPool =
        createFileCursorResultPool(
            opened.projection
        );

    try {
        for await (const record of opened.recordCursor) {
            const result =
                projectRecord(
                    record,
                    resultPool
                );

            if (isErrors(result)) {
                onError?.(result);
                continue;
            }

            yield result;
        }
    } finally {
        opened.close();
    }
}


/**
 * Resolve the parser from the file definition and prepare all file-scoped
 * state before entering the row-processing hot path.
 *
 * Projection paths are compiled against that prepared state. Where preparation
 * used a physical record, its thin PhysicalRecordContext is supplied so parser-
 * specific projection compilation can report source and record provenance
 * without retaining the preparation record itself.
 */
async function openFileCursor<
    TProjection,
    TFile,
    TFileType extends string
>(
    definition: CursorFileDefinition<TProjection,TFileType>,
    file: TFile,
    infrastructure: FileCursorInfrastructure<TFile,TFileType>
): Promise<OpenedFileCursor<TProjection>> {
    const registered =
        infrastructure.parsers[
            definition.fileType
            ];

    if (registered === undefined) {
        throw new Error(
            `No parser registered for file type ${definition.fileType}`
        );
    }

    const parser: AnyParser =
        registered.parser;

    const parserConfig =
        registered.parserConfig(
            definition
        );

    const physical =
        createDefaultPhysicalRecordConfig({
            source:
            definition.filename,

            file,

            bufferSize:
            infrastructure.bufferSize,

            fillFileBuffer:
            infrastructure.fillFileBuffer,

            createRecordState:
            registered.createRecordState,

            cleanRecordState:
            registered.cleanRecordState,

            recordPool: infrastructure.recordPool,
            byteBufferPool: infrastructure.byteBufferPool
        });

    const opened =
        await openRecordCursor(
            parser,
            parserConfig,
            physical
        );

    try {
        const projection =
            createProjection(
                parser,
                opened.details,
                opened.preparationContext,
                definition.projection
            );

        return {
            recordCursor:
            opened.recordCursor,

            projection,

            scanRecords: opened.scanRecords,

            close:
            opened.close
        };
    } catch (error) {
        opened.close();
        throw error;
    }
}


/**
 * Project one parsed record and transfer ownership of its physical record.
 */
function projectRecord<
    TProjection,
    TRepresentation,
    TRecordState
>(
    record: RecordCursorResult<TRepresentation,TRecordState>,
    resultPool: FileCursorResultPool<TProjection,TRepresentation>
): ProjectRecordResult<TProjection> {
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