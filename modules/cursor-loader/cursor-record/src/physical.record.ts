import {
    createRefCountedPool,
    type RefCountedPool
} from "@cobol-ts/ref_counted_pool";

import {
    type FileBufferPool,
    type FillFileBuffer,
    type PhysicalContentPool,
    type PooledPhysicalRecordContent
} from "@cobol-ts/cursor-loader-types";


/*
 * Configuration required by one physical record.
 *
 * Pool creation is deliberately outside the physical-record mechanics.
 *
 * createDefaultPhysicalRecordConfig() below provides the normal pool
 * configuration, while callers remain free to inject their own pools.
 */
export interface PhysicalRecordConfig<
    TRecordState,
    TFile
> {

    readonly source:
        string;

    readonly file:
        TFile;

    readonly bufferSize:
        number;

    readonly byteBufferPool:
        FileBufferPool;

    readonly physicalContentPool:
        PhysicalContentPool<
            TRecordState
        >;

    readonly fillFileBuffer:
        FillFileBuffer<
            TFile
        >;

    readonly readMore:
        (
            this:
            PooledPhysicalRecordContent<
                TRecordState
            >
        ) => Promise<void>;
}


/*
 * Inputs required to construct the normal physical-record configuration.
 *
 * recordState belongs entirely to the parser.
 *
 * The generic physical-record machinery creates it once when the pooled
 * physical-record object itself is created and does not reset or interpret it
 * between leases.
 */
export interface DefaultPhysicalRecordConfig<
    TRecordState,
    TFile
> {

    readonly source:
        string;

    readonly file:
        TFile;

    readonly bufferSize:
        number;

    readonly fillFileBuffer:
        FillFileBuffer<
            TFile
        >;

    readonly createRecordState:
        () => TRecordState;
}


/**
 * Create the normal physical-record configuration.
 *
 * Two pools are created:
 *
 *     byteBufferPool
 *         owns fixed-capacity Uint8Array instances;
 *
 *     physicalContentPool
 *         owns the physical-record objects themselves.
 *
 * A physical-record object permanently contains its pool dependencies and
 * parser-specific recordState.
 *
 * Per-lease physical range state is reset by createPhysicalRecord().
 */
export function createDefaultPhysicalRecordConfig<
    TRecordState,
    TFile
>(
    options:
    DefaultPhysicalRecordConfig<
        TRecordState,
        TFile
    >
): PhysicalRecordConfig<
    TRecordState,
    TFile
> {

    const byteBufferPool:
        RefCountedPool<
            Uint8Array
        > =
        createRefCountedPool(
            () =>
                new Uint8Array(
                    options.bufferSize
                )
        );


    let physicalContentPool:
        PhysicalContentPool<
            TRecordState
        >;


    let config:
        PhysicalRecordConfig<
            TRecordState,
            TFile
        >;


    /*
     * Every pooled physical-record object uses the same function object for
     * readMore().
     *
     * No per-read or per-record closure is allocated here.
     */
    const readMore =
        function (
            this:
            PooledPhysicalRecordContent<
                TRecordState
            >
        ): Promise<void> {

            return readMorePhysicalRecord(
                this,
                config
            );
        };


    physicalContentPool =
        createRefCountedPool<
            PooledPhysicalRecordContent<
                TRecordState
            >
        >(
            () => ({
                buffers:
                    [],

                source:
                options.source,

                recordNumber:
                    0,

                startByte:
                    0,

                endByte:
                    0,

                lastValidByte:
                    0,

                fileFinished:
                    false,

                recordState:
                    options.createRecordState(),

                byteBufferPool,

                physicalContentPool,

                readMore,

                close:
                closePhysicalRecord
            })
        );


    config = {
        source:
        options.source,

        file:
        options.file,

        bufferSize:
        options.bufferSize,

        byteBufferPool,

        physicalContentPool,

        fillFileBuffer:
        options.fillFileBuffer,

        readMore
    };


    return config;
}


/**
 * Acquire one physical-record object for a new lease.
 *
 * The object itself is pooled.
 *
 * buffers must already have been cleared by the previous close().
 *
 * Per-record physical range state is reset here.
 *
 * recordState is deliberately untouched. It belongs to the parser and the
 * generic physical-record machinery does not interpret or reset it.
 */
export function createPhysicalRecord<
    TRecordState,
    TFile
>(
    config:
    PhysicalRecordConfig<
        TRecordState,
        TFile
    >
): PooledPhysicalRecordContent<
    TRecordState
> {

    const record =
        config.physicalContentPool.acquire();


    /*
     * A pooled physical record may only become available after close() has
     * released all byte-buffer references and cleared this reusable array.
     */
    if (
        record.buffers.length !== 0
    ) {
        throw new Error(
            "Acquired physical record still owns byte buffers"
        );
    }


    /*
     * Diagnostic context belongs to the current lease.
     *
     * source is invariant for this configuration but is rebound explicitly so
     * injected/shared physical-record pools remain safe.
     *
     * recordNumber is assigned by createRecordCursor() before parsing.
     */
    record.source =
        config.source;

    record.recordNumber =
        0;


    /*
     * These are lease-specific physical facts.
     *
     * startByte
     *     established by the cursor before parsing;
     *
     * endByte
     *     established by the parser;
     *
     * lastValidByte
     *     advanced by readMore();
     *
     * fileFinished
     *     established by readMore() when EOF is discovered.
     */
    record.startByte =
        0;

    record.endByte =
        0;

    record.lastValidByte =
        0;

    record.fileFinished =
        false;


    /*
     * Rebind the reader capability from this configuration.
     *
     * Normally this is the same function already stored on the pooled object,
     * but assigning it here preserves the explicit configuration contract.
     */
    record.readMore =
        config.readMore;


    return record;
}


/**
 * Read one additional physical byte buffer.
 *
 * The exact pooled Uint8Array acquired here is the object passed to
 * fillFileBuffer() and, after a successful read, the object appended to
 * record.buffers.
 *
 * There is no byte copy.
 * There is no slice.
 * There is no subarray.
 * There is no replacement Uint8Array view.
 *
 * fillFileBuffer() returns the number of actual file bytes written into the
 * buffer.
 *
 * readMore() owns the corresponding I/O facts:
 *
 *     record.lastValidByte
 *         advances by exactly bytesRead;
 *
 *     record.fileFinished
 *         becomes true when bytesRead is smaller than the physical buffer
 *         capacity.
 *
 * readMore() does not modify startByte or endByte.
 *
 * startByte belongs to the cursor.
 * endByte belongs to the parser.
 *
 * If filling throws, ownership of the newly acquired buffer never transfers
 * to the physical record and the buffer is immediately released.
 */
async function readMorePhysicalRecord<
    TRecordState,
    TFile
>(
    record:
    PooledPhysicalRecordContent<
        TRecordState
    >,

    config:
    PhysicalRecordConfig<
        TRecordState,
        TFile
    >
): Promise<void> {

    const buffer =
        config.byteBufferPool.acquire();


    let transferred =
        false;


    try {
        if (
            buffer.length
            !== config.bufferSize
        ) {
            throw new Error(
                "Pooled byte buffer has incorrect size"
            );
        }


        const bytesRead =
            await config.fillFileBuffer(
                config.file,
                buffer
            );


        if (
            bytesRead < 0
            || bytesRead > buffer.length
        ) {
            throw new Error(
                "fillFileBuffer returned an invalid byte count"
            );
        }


        /*
         * Transfer ownership of the acquired buffer reference directly to the
         * physical record.
         *
         * No reuse() is required: the reference created by acquire() is the
         * reference now owned by record.buffers.
         */
        record.buffers.push(
            buffer
        );


        transferred =
            true;


        /*
         * lastValidByte is the exclusive logical end of actual file bytes
         * currently available across this physical record's buffers.
         *
         * The physical capacity of the final Uint8Array is irrelevant here.
         */
        record.lastValidByte +=
            bytesRead;


        /*
         * fillFileBuffer() fills the complete physical buffer unless EOF is
         * encountered.
         *
         * Therefore any short read proves that no more file bytes exist.
         *
         * This also covers bytesRead === 0 when EOF occurs exactly on a
         * physical-buffer boundary.
         */
        if (
            bytesRead
            < buffer.length
        ) {
            record.fileFinished =
                true;
        }
    } catch (
        error
        ) {
        /*
         * Until the buffer has been appended to record.buffers, this function
         * still owns the acquired reference.
         */
        if (
            !transferred
        ) {
            config.byteBufferPool.release(
                buffer
            );
        }


        throw error;
    }
}


/**
 * Release one physical-record lease.
 *
 * Every buffer reference owned by this physical record is released exactly
 * once.
 *
 * The same buffers may simultaneously be referenced by another physical
 * record or by the cursor carry reference. Ref counting determines when the
 * underlying Uint8Array actually becomes available for reuse.
 *
 * The buffers array itself belongs permanently to the pooled physical-record
 * object, so it is cleared in place rather than replaced.
 *
 * No semantic state is reset here merely for neatness.
 *
 * In particular recordState belongs to the parser and is untouched.
 *
 * After all owned byte-buffer references have been released, this physical
 * record object is returned to its pool.
 *
 * close() must be called exactly once for a lease.
 */
function closePhysicalRecord<
    TRecordState
>(
    this:
    PooledPhysicalRecordContent<
        TRecordState
    >
): void {

    while (
        this.buffers.length !== 0
        ) {
        const index =
            this.buffers.length
            - 1;


        const buffer =
            this.buffers[
                index
                ];


        /*
         * Release first.
         *
         * Only remove the reference from the physical record after the pool
         * accepted the release. A failed release therefore does not silently
         * discard our bookkeeping.
         */
        this.byteBufferPool.release(
            buffer
        );


        this.buffers.length =
            index;
    }


    this.physicalContentPool.release(
        this
    );
}
