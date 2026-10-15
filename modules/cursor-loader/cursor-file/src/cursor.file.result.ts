import {
    createRefCountedPool,
    type RefCountedPool
} from "@cobol-ts/ref_counted_pool";

import {
    type PhysicalRecordContent,
    type PhysicalRecordLifetime,
    type ProjectionFactory
} from "@cobol-ts/cursor-loader-types";


/**
 * Public file-cursor result.
 *
 * The result remains valid until close() is called.
 *
 * close() must be called exactly once for each returned lease.
 *
 * After close() the caller must not use this object again.
 */
export interface FileCursorResult<TResult> {

    readonly result:
        TResult;

    close():
        void;
}


/**
 * Pooled file-cursor result.
 *
 * The complete JavaScript object is created once and never changes shape.
 *
 * result is permanent. It is one reusable projection object created with
 * ProjectionFactory.create() when this pooled entry is first constructed.
 *
 * physicalRecord is:
 *
 *     undefined
 *         while the pooled entry is inactive;
 *
 *     PhysicalRecordLifetime
 *         while the entry owns an active lease.
 *
 * Releasing the lease clears the projection binding and restores
 * physicalRecord to undefined.
 */
export interface PooledFileCursorResult<
    TProjection,
    TRepresentation
> {

    readonly resultPool:
        FileCursorResultPool<
            TProjection,
            TRepresentation
        >;

    readonly projection:
        ProjectionFactory<
            TProjection,
            TRepresentation
        >;

    readonly result:
        TProjection;

    physicalRecord:
        PhysicalRecordLifetime
        | undefined;

    close():
        void;
}


/**
 * Pool containing file-cursor result objects.
 *
 * Each pooled entry owns one reusable projection object for its entire
 * lifetime.
 */
export type FileCursorResultPool<
    TProjection,
    TRepresentation
> =
    RefCountedPool<
        PooledFileCursorResult<
            TProjection,
            TRepresentation
        >
    >;


/**
 * Create a pool of file-cursor result objects.
 *
 * Each pooled entry is created once with its complete runtime shape:
 *
 *     resultPool
 *     projection
 *     result
 *     physicalRecord
 *     close
 *
 * result is created once here and is retained for the lifetime of the pooled
 * entry.
 *
 * Pool reuse changes only lease-specific values and projection binding. It
 * never replaces result and never changes the wrapper object's shape.
 */
export function createFileCursorResultPool<
    TProjection,
    TRepresentation
>(
    projection:
    ProjectionFactory<
        TProjection,
        TRepresentation
    >
): FileCursorResultPool<
    TProjection,
    TRepresentation
> {

    let resultPool:
        FileCursorResultPool<
            TProjection,
            TRepresentation
        >;


    resultPool =
        createRefCountedPool<
            PooledFileCursorResult<
                TProjection,
                TRepresentation
            >
        >(
            () => ({
                resultPool,

                projection,

                result:
                    projection.create(),

                physicalRecord:
                undefined,

                close:
                closeFileCursorResult
            })
        );


    return resultPool;
}


/**
 * Acquire a file-cursor result lease.
 *
 * The pooled entry already owns its permanent projection object.
 *
 * This operation binds that projection to representation and physicalRecord,
 * then transfers ownership of physicalRecord to the returned FileCursorResult.
 *
 * No projection object or accessor function is created here.
 */
export function createFileCursorResult<
    TProjection,
    TRepresentation,
    TRecordState
>(
    representation:
    TRepresentation,

    physicalRecord:
    PhysicalRecordContent<
        TRecordState
    >,

    resultPool:
    FileCursorResultPool<
        TProjection,
        TRepresentation
    >
): FileCursorResult<
    TProjection
> {

    const pooled =
        resultPool.acquire();


    try {
        pooled.projection.bind(
            pooled.result,
            representation,
            physicalRecord
        );

        pooled.physicalRecord =
            physicalRecord;


        return pooled;
    } catch (error) {
        pooled.projection.clear(
            pooled.result
        );

        resultPool.release(
            pooled
        );

        throw error;
    }
}


/**
 * Close an active file-cursor result lease.
 *
 * The projection is cleared first so it no longer retains either the parser
 * representation or the physical record.
 *
 * physicalRecord is then removed from the pooled wrapper and its own lifetime
 * is closed.
 *
 * Only after both references have been removed is the unchanged wrapper object
 * returned to the result pool.
 */
function closeFileCursorResult<
    TProjection,
    TRepresentation
>(
    this:
    PooledFileCursorResult<
        TProjection,
        TRepresentation
    >
): void {

    const physicalRecord =
        this.physicalRecord;

    if (physicalRecord === undefined) {
        throw new Error(
            "File cursor result is not active"
        );
    }


    this.projection.clear(
        this.result
    );

    this.physicalRecord =
        undefined;


    physicalRecord.close();


    this.resultPool.release(
        this
    );
}