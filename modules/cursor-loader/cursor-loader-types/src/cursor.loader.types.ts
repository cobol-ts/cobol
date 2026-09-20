/*
 * Cursor Loader — shared public and internal types
 */

import {
    type Errors
} from "@cobol-ts/errors";


/*
 * Cardinality
 */

export type Cardinality =
    | "one"
    | "optional"
    | "many";


/*
 * Physical files
 */

export interface LineFile {
    readonly type:
        "line";

    readonly filename:
        string;
}


export interface FixedFile {
    readonly type:
        "fixed";

    readonly filename:
        string;

    readonly recordSize:
        number;
}


export interface LengthPrefixedFile {
    readonly type:
        "length-prefixed";

    readonly filename:
        string;

    readonly prefixSize:
        number;

    readonly recordLength: (
        prefix: Uint8Array
    ) => number;
}


export type PhysicalFileDetails =
    | LineFile
    | FixedFile
    | LengthPrefixedFile;


/*
 * Validation
 */

export type ValidationErrors =
    readonly string[];


export const NO_VALIDATION_ERRORS =
    Object.freeze(
        []
    ) satisfies ValidationErrors;


/*
 * Physical record content
 *
 * A read-only view of one complete physical record.
 *
 * The record may span one or more byte buffers.
 *
 * firstBufferOffset is the offset of the first record byte within the
 * first buffer.
 *
 * length is the total number of record bytes across all buffers.
 *
 * Buffers are densely packed after firstBufferOffset. Every intermediate
 * buffer is used to its end; length determines where the record ends in
 * the final buffer.
 *
 * The buffers are owned by the RecordCursor, not by this object.
 *
 * The content remains valid until the cursor is advanced or closed.
 */

export interface PhysicalRecordContent {
    readonly buffers:
        readonly Uint8Array[];

    readonly firstBufferOffset:
        number;

    readonly length:
        number;
}


/*
 * Record readers
 *
 * A record reader turns one configured physical file into a cursor of
 * complete physical records or recoverable record-level errors.
 *
 * Operational failures that prevent reliable continued processing are
 * reported by throwing.
 */

export type RecordReaderResult =
    | PhysicalRecordContent
    | ValidationErrors;


/*
 * The RecordCursor owns the storage referenced by each
 * PhysicalRecordContent.
 *
 * A yielded record remains valid only until the cursor is advanced
 * to the next result or the cursor is closed.
 *
 * Consumers must therefore finish parsing, validation and projection
 * before advancing the cursor, and must copy any data that needs to
 * outlive the current record.
 */

export type RecordCursor =
    AsyncGenerator<
        RecordReaderResult,
        void,
        unknown
    >;


/*
 * Record reader
 *
 * Each physical-file implementation creates its own RecordCursor.
 *
 * Reader-specific dependencies are supplied when the RecordReader itself
 * is constructed.
 *
 * For example, a line reader may be constructed with a RecordEndDetector
 * and a shared byte-buffer pool. Those details are deliberately hidden
 * from consumers of the RecordReader.
 */

export type RecordReader<
    TDetails extends PhysicalFileDetails
> = (
    details: TDetails
) => RecordCursor;


/*
 * The reader map is derived from PhysicalFileDetails.
 *
 * This means that every known physical file type must have exactly the
 * appropriately typed reader entry.
 */

export type RecordReaderMap = {
    [TDetails in PhysicalFileDetails as TDetails["type"]]:
    RecordReader<TDetails>;
};

/**
 * Describes how physical record boundaries are located within a sequence
 * of byte buffers.
 *
 * All offsets used by this interface are logical offsets across the
 * supplied buffers, as though the buffers had been concatenated into one
 * continuous byte sequence.
 *
 * No method may modify the supplied buffers.
 *
 * Implementations should not allocate per record. This interface is used
 * on the physical-record hot path.
 */
export interface RecordBoundaryDetector {

    /**
     * Find the first byte of the record following the current record.
     *
     * @param buffers
     * The currently available physical byte buffers.
     *
     * Logical offset 0 refers to buffers[0][0]. Offsets then continue
     * through each subsequent buffer.
     *
     * @param recordStart
     * The logical offset of the first byte of the current record.
     *
     * This remains unchanged while additional physical buffers are acquired
     * for the current record.
     *
     * @param searchStart
     * The logical offset of the first byte which has not already been
     * examined while locating the boundary of the current record.
     *
     * searchStart is always greater than or equal to recordStart.
     *
     * When nextRecordStart() returns -1, the caller may later invoke it
     * again after adding more buffers. The caller will then advance
     * searchStart so that bytes already examined need not be searched again.
     *
     * A detector which searches for a terminator should therefore begin its
     * search at searchStart rather than recordStart.
     *
     * A detector which does not search, such as a fixed-width detector, may
     * ignore searchStart and calculate its boundary directly from
     * recordStart.
     *
     * @returns
     * The logical offset of the first byte of the next record.
     *
     * Return -1 when the complete boundary between the current record and
     * the next record is not yet present in buffers.
     *
     * The number of physical bytes consumed by the current record,
     * including any framing bytes, is:
     *
     *     nextRecordStart - recordStart
     *
     * Examples:
     *
     * Fixed-width record of four bytes:
     *
     *     a b c d W X Y Z
     *     0 1 2 3 4 5 6 7
     *
     *     recordStart     = 0
     *     nextRecordStart = 4
     *
     * LF-terminated record:
     *
     *     a b c \n W X Y Z
     *     0 1 2  3 4 5 6 7
     *
     *     recordStart     = 0
     *     nextRecordStart = 4
     *
     * CRLF-terminated record:
     *
     *     a b c \r \n W X Y Z
     *     0 1 2  3  4 5 6 7 8
     *
     *     recordStart     = 0
     *     nextRecordStart = 5
     *
     * A record terminator may span physical buffers. For example:
     *
     *     buffers[0] = "abc\r"
     *     buffers[1] = "\nXYZ"
     *
     * is logically equivalent to:
     *
     *     "abc\r\nXYZ"
     *
     * and nextRecordStart must still return 5.
     *
     * Incremental searching may proceed without rescanning previously
     * examined bytes. For example, after searching:
     *
     *     buffers[0] = "abc\r"
     *
     * without finding LF:
     *
     *     recordStart = 0
     *     searchStart = 0
     *
     * the caller may append:
     *
     *     buffers[1] = "\nXYZ"
     *
     * and invoke the detector again with:
     *
     *     recordStart = 0
     *     searchStart = 4
     *
     * The detector then needs to search only the newly available bytes.
     */
    nextRecordStart(
        buffers: readonly Uint8Array[],
        recordStart: number,
        searchStart: number
    ): number;


    /**
     * Find the logical offset of the final data byte belonging to the
     * current record.
     *
     * This method is called only after nextRecordStart() has successfully
     * returned the start of the following record.
     *
     * @param buffers
     * The same logical byte sequence used to locate the record boundary.
     *
     * @param nextRecordStart
     * The logical offset previously returned by nextRecordStart().
     *
     * @returns
     * The logical offset of the final byte which belongs to the current
     * record's data.
     *
     * Physical framing bytes, such as LF or CRLF, are not part of the
     * record data and must therefore be excluded.
     *
     * Examples:
     *
     * Fixed-width record of four bytes:
     *
     *     a b c d W X Y Z
     *     0 1 2 3 4 5 6 7
     *
     *     nextRecordStart = 4
     *     recordEnd       = 3
     *
     * LF-terminated record:
     *
     *     a b c \n W X Y Z
     *     0 1 2  3 4 5 6 7
     *
     *     nextRecordStart = 4
     *     recordEnd       = 2
     *
     * CRLF-terminated record:
     *
     *     a b c \r \n W X Y Z
     *     0 1 2  3  4 5 6 7 8
     *
     *     nextRecordStart = 5
     *     recordEnd       = 2
     *
     * Empty records are valid.
     *
     * For an empty LF-terminated record:
     *
     *     \n
     *     0
     *
     *     recordStart     = 0
     *     nextRecordStart = 1
     *     recordEnd       = -1
     *
     * Therefore recordEnd may legitimately be one less than the first
     * byte of the current record.
     *
     * Record length is consequently calculated as:
     *
     *     recordEnd - recordStart + 1
     *
     * which correctly produces zero for an empty record.
     *
     * This method must not search for a later record boundary. Its purpose
     * is only to translate the already-known next-record boundary into the
     * inclusive end of the current record's data.
     */
    recordEnd(
        buffers: readonly Uint8Array[],
        nextRecordStart: number
    ): number;
}

/*
 * Parser
 *
 * A parser has three associated types:
 *
 * Representation
 *     The successfully parsed representation produced for each data record.
 *
 * ParserConfig
 *     Static source-specific configuration supplied in FileDetails.
 *
 * ParserDetails
 *     Runtime details used while parsing this particular file.
 *
 *     These may simply be the ParserConfig, but they are allowed to be a
 *     different type derived from it.
 *
 *     For example, a CSV parser may combine its configured columns and
 *     separator rules with information read from the header row to produce
 *     prepared details containing the resolved physical column positions.
 *
 * For simple parsers, ParserDetails defaults to ParserConfig.
 *
 * A parser may optionally consume the first physical record to prepare its
 * ParserDetails. This supports formats where the first record contains file
 * metadata, such as a CSV header.
 *
 * Parsers receive PhysicalRecordContent rather than assuming that every
 * physical record is represented by one contiguous Uint8Array.
 *
 * Successful operations return their value directly.
 * Recoverable data failures return Errors.
 *
 * This deliberately avoids allocating a success wrapper on the per-record
 * hot path.
 */

export type ParserResult<T> =
    | T
    | Errors;


export interface Parser<
    Representation = unknown,
    ParserConfig = undefined,
    ParserDetails = ParserConfig
> {
    prepare?: (
        firstRecord: PhysicalRecordContent,
        config: ParserConfig
    ) => ParserResult<ParserDetails>;

    parse(
        record: PhysicalRecordContent,
        details: ParserDetails
    ): ParserResult<Representation>;
}


export type ParserMap =
    Record<
        string,
        Parser<any, any, any>
    >;


/*
 * Parser associated type extraction
 */

export type ParserRepresentation<TParser> =
    TParser extends Parser<
            infer Representation,
            infer _Config,
            infer _Details
        >
        ? Representation
        : never;


export type ParserConfig<TParser> =
    TParser extends Parser<
            infer _Representation,
            infer Config,
            infer _Details
        >
        ? Config
        : never;


export type ParserDetails<TParser> =
    TParser extends Parser<
            infer _Representation,
            infer _Config,
            infer Details
        >
        ? Details
        : never;


/*
 * Parser configuration within FileDetails
 *
 * FileDetails contains the static parser configuration supplied by the
 * consumer.
 *
 * Parsers whose configuration type is undefined do not require
 * parserConfig in the source definition.
 *
 * Parsers with a concrete configuration type require parserConfig and
 * retain that parser-specific type.
 *
 * Prepared ParserDetails are runtime state and are not part of
 * FileDetails.
 */

export type FileParserConfig<TParser> =
    [ParserConfig<TParser>] extends [undefined]
        ? {
            readonly parserConfig?:
                undefined;
        }
        : {
            readonly parserConfig:
                ParserConfig<TParser>;
        };


/*
 * Data errors
 */

export interface DataError {
    readonly source?:
        string;

    readonly message:
        string;
}


/*
 * File details
 */

export type FileDetails<
    TParsers extends ParserMap,
    KParser extends keyof TParsers & string,
    T,
    EntityId
> =
    PhysicalFileDetails
    & FileParserConfig<TParsers[KParser]>
    & {
    readonly parser:
        KParser;

    readonly project: (
        representation:
        ParserRepresentation<TParsers[KParser]>
    ) => T;

    readonly cardinality:
        Cardinality;

    readonly entityId: (
        value: T
    ) => EntityId;

    readonly checkRepresentation?: (
        representation:
        ParserRepresentation<TParsers[KParser]>
    ) => ValidationErrors;
};


/*
 * Heterogeneous file details
 */

export type AnyFileDetails<
    TParsers extends ParserMap,
    EntityId
> = {
    [K in keyof TParsers & string]:
    FileDetails<
        TParsers,
        K,
        any,
        EntityId
    >
}[keyof TParsers & string];


/*
 * Configuration
 */

export type CursorLoaderConfig<
    TParsers extends ParserMap,
    EntityId
> =
    Record<
        string,
        AnyFileDetails<
            TParsers,
            EntityId
        >
    >;


/*
 * Source type extraction
 */

export type ProjectedValue<TDetails> =
    TDetails extends {
            project:
                (...args: any[]) => infer T;
        }
        ? T
        : never;


export type SourceCardinality<TDetails> =
    TDetails extends {
            cardinality:
                infer C extends Cardinality;
        }
        ? C
        : never;


/*
 * Cardinality resolution
 */

export type ResolveCardinality<
    T,
    C extends Cardinality
> =
    C extends "one"
        ? T
        : C extends "optional"
            ? T | undefined
            : C extends "many"
                ? T[]
                : never;


/*
 * Dataset shape
 */

export type EntityDataSetType<TConfig> = {
    readonly [K in keyof TConfig]:
    ResolveCardinality<
        ProjectedValue<TConfig[K]>,
        SourceCardinality<TConfig[K]>
    >;
};


/*
 * Dataset error API
 */

export interface EntityDataSetErrors<TConfig> {
    hasErrors():
        boolean;

    errors():
        readonly DataError[];

    errorsFor(
        name:
            keyof TConfig & string
    ): readonly DataError[];
}


/*
 * Public dataset
 *
 * A source with cardinality "one" is exposed as T, not T | undefined.
 *
 * A missing value is a data error and is reported through hasErrors()
 * / errors(). The type system deliberately represents the valid logical
 * shape rather than attempting to encode malformed input into every
 * consumer access.
 */

export type EntityDataSet<TConfig> =
    EntityDataSetType<TConfig>
    & EntityDataSetErrors<TConfig>;


/*
 * Internal dataset mutation API
 *
 * This is used by the loader/composite cursor and is not intended to be
 * exposed as part of the normal consumer-facing contract.
 */

export interface EntityDataSetMutation<TConfig> {
    clear():
        void;

    set<
        K extends keyof TConfig & string
    >(
        name: K,
        value: ProjectedValue<TConfig[K]>
    ): void;

    add<
        K extends keyof TConfig & string
    >(
        name: K,
        value: ProjectedValue<TConfig[K]>
    ): void;

    addError(
        source:
            | (keyof TConfig & string)
            | undefined,
        message:
        string
    ): void;

    addErrors(
        source:
            | (keyof TConfig & string)
            | undefined,
        messages:
        readonly string[]
    ): void;
}


export type MutableEntityDataSet<TConfig> =
    EntityDataSet<TConfig>
    & EntityDataSetMutation<TConfig>;


/*
 * Cursor options
 *
 * Parsers interpret complete physical records.
 *
 * RecordReaders perform physical I/O and record framing.
 *
 * The supplied RecordReaderMap contains already-configured physical reader
 * implementations. Reader-specific dependencies such as record-boundary
 * detectors and byte-buffer pools are therefore not concerns of the
 * higher-level cursor.
 */

export interface CursorOptions<
    TParsers extends ParserMap,
    EntityId
> {
    readonly parsers:
        TParsers;

    readonly recordReaders:
        RecordReaderMap;

    readonly compareEntityId: (
        left: EntityId,
        right: EntityId
    ) => number;
}


/*
 * Entity cursor
 */

export type EntityCursor<TConfig> =
    AsyncGenerator<
        EntityDataSet<TConfig>,
        void,
        unknown
    >;


/*
 * Scoped cursor callback
 */

export type EntityCursorBlock<
    TConfig,
    R
> = (
    cursor:
    EntityCursor<TConfig>
) => Promise<R>;


/*
 * File-line byte buffer pool
 *
 * End-of-line cursors use fixed-size Uint8Array buffers while reading.
 *
 * Buffers are shared between cursors and returned to the pool once no
 * current or future physical record can refer to them.
 */

export interface FileLineBufferPool {
    acquire():
        Uint8Array;

    release(
        buffer: Uint8Array
    ): void;
}