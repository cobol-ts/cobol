import {createRefCountedPool, type RefCountedPool} from "@cobol-ts/ref_counted_pool";
import {
    type FileBufferPool,
    type FillFileBuffer,
    type PhysicalContentPool,
    type PooledPhysicalRecordContent
} from "@cobol-ts/cursor-loader-types";


/*
 * Narrow dependency used by createRecordCursor().
 *
 * The cursor does not know how records or buffers are pooled, how physical I/O
 * is performed, or which file is being read. It only needs to acquire a record,
 * retain/release the one carried byte buffer, and know the physical buffer size
 * used when rebasing offsets between records.
 */
export interface RecordCursorPhysicalRecord<TRecordState> {
    buffers: Uint8Array[];
    readonly recordState: TRecordState;
    startByte: number;
    endByte: number;
    lastValidByte: number;
    fileFinished: boolean;
    source: string;
    recordNumber: number;
    readMore(): Promise<void>;
    close(): void;
}


export interface RecordCursorResources<TRecordState> {
    readonly bufferSize: number;
    acquireRecord(): RecordCursorPhysicalRecord<TRecordState>;
    retainBuffer(buffer: Uint8Array): void;
    releaseBuffer(buffer: Uint8Array): void;
}


/*
 * Full configuration used by the default physical-record implementation.
 *
 * This extends the narrow cursor dependency, but cursor code should depend only
 * on RecordCursorResources.
 */
export interface PhysicalRecordConfig<TRecordState,TFile> extends RecordCursorResources<TRecordState> {
    readonly source: string;
    readonly file: TFile;
    readonly byteBufferPool: FileBufferPool;
    readonly physicalContentPool: PhysicalContentPool<TRecordState>;
    readonly fillFileBuffer: FillFileBuffer<TFile>;
    readonly readMore: (this: PooledPhysicalRecordContent<TRecordState>) => Promise<void>;
}


export interface DefaultPhysicalRecordConfig<TRecordState,TFile> {
    readonly source: string;
    readonly file: TFile;
    readonly bufferSize: number;
    readonly fillFileBuffer: FillFileBuffer<TFile>;
    readonly createRecordState: () => TRecordState;
}


/** Create the normal pooled physical-record resources for one opened source. */
export function createDefaultPhysicalRecordConfig<TRecordState,TFile>(
    options: DefaultPhysicalRecordConfig<TRecordState,TFile>
): PhysicalRecordConfig<TRecordState,TFile> {
    const byteBufferPool: RefCountedPool<Uint8Array> = createRefCountedPool(
        () => new Uint8Array(options.bufferSize)
    );

    let physicalContentPool: PhysicalContentPool<TRecordState>;
    let config: PhysicalRecordConfig<TRecordState,TFile>;

    /* One shared function object for every pooled record. */
    const readMore = function(this: PooledPhysicalRecordContent<TRecordState>): Promise<void> {
        return readMorePhysicalRecord(this, config);
    };

    physicalContentPool = createRefCountedPool<PooledPhysicalRecordContent<TRecordState>>(
        () => ({
            buffers: [],
            source: options.source,
            recordNumber: 0,
            startByte: 0,
            endByte: 0,
            lastValidByte: 0,
            fileFinished: false,
            recordState: options.createRecordState(),
            byteBufferPool,
            physicalContentPool,
            readMore,
            close: closePhysicalRecord
        })
    );

    config = {
        source: options.source,
        file: options.file,
        bufferSize: options.bufferSize,
        byteBufferPool,
        physicalContentPool,
        fillFileBuffer: options.fillFileBuffer,
        readMore,
        acquireRecord: () => createPhysicalRecord(config),
        retainBuffer: buffer => byteBufferPool.reuse(buffer),
        releaseBuffer: buffer => byteBufferPool.release(buffer)
    };

    return config;
}


/** Acquire and initialise one pooled physical-record lease. */
export function createPhysicalRecord<TRecordState,TFile>(
    config: PhysicalRecordConfig<TRecordState,TFile>
): PooledPhysicalRecordContent<TRecordState> {
    const record = config.physicalContentPool.acquire();

    if (record.buffers.length !== 0) {
        throw new Error("Acquired physical record still owns byte buffers");
    }

    record.source = config.source;
    record.recordNumber = 0;
    record.startByte = 0;
    record.endByte = 0;
    record.lastValidByte = 0;
    record.fileFinished = false;
    record.readMore = config.readMore;

    /* recordState belongs to the parser and is deliberately not reset. */
    return record;
}


/** Read one additional pooled physical byte buffer into a record. */
async function readMorePhysicalRecord<TRecordState,TFile>(
    record: PooledPhysicalRecordContent<TRecordState>,
    config: PhysicalRecordConfig<TRecordState,TFile>
): Promise<void> {
    const buffer = config.byteBufferPool.acquire();
    let transferred = false;

    try {
        if (buffer.length !== config.bufferSize) {
            throw new Error("Pooled byte buffer has incorrect size");
        }

        const bytesRead = await config.fillFileBuffer(config.file, buffer);

        if (bytesRead < 0 || bytesRead > buffer.length) {
            throw new Error("fillFileBuffer returned an invalid byte count");
        }

        /* Ownership of the acquired reference transfers directly to record. */
        record.buffers.push(buffer);
        transferred = true;
        record.lastValidByte += bytesRead;

        if (bytesRead < buffer.length) {
            record.fileFinished = true;
        }
    } catch (error) {
        if (!transferred) {
            config.byteBufferPool.release(buffer);
        }
        throw error;
    }
}


/** Release one physical-record lease and all byte-buffer references it owns. */
function closePhysicalRecord<TRecordState>(this: PooledPhysicalRecordContent<TRecordState>): void {
    while (this.buffers.length !== 0) {
        const index = this.buffers.length - 1;
        const buffer = this.buffers[index];
        this.byteBufferPool.release(buffer);
        this.buffers.length = index;
    }

    this.physicalContentPool.release(this);
}