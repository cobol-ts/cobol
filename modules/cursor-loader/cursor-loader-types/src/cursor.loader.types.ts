/*
 * Cursor Loader — shared public and internal types
 */

import {type Errors} from "@cobol-ts/errors";


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
        buffers:
        readonly Uint8Array[],
        prefixStart:
        number
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
 * A borrowed view of one complete physical record together with the
 * parser-specific state associated with that record.
 *
 * TRecordState is deliberately required. There is no default state type:
 * every caller which handles physical records must make the record-state
 * ownership explicit. Parsers which require no per-record state should use
 * `undefined`.
 *
 * The record may span one or more byte buffers.
 *
 * startOffset is the logical offset of the first parser-visible record byte
 * across `buffers`, treating them as one contiguous byte sequence.
 *
 * length is the total number of parser-visible record bytes.
 *
 * Buffers are densely packed after startOffset. Every intermediate buffer is
 * used to its end; length determines where the record ends in the final
 * buffer.
 *
 * recordState contains mutable or immutable parser-specific information which
 * describes this particular record. The property reference is read-only, but
 * the state object itself may be mutable and reused when the pooled physical
 * record holder is safely rebound.
 *
 * The buffers are owned by the RecordCursor, not by this object.
 *
 * The bytes and recordState remain valid until the cursor is advanced or
 * closed.
 */
export interface PhysicalRecordContent<
    TRecordState
> {

    readonly buffers:
        readonly Uint8Array[];

    /**
     * Logical offset of the first parser-visible record byte across `buffers`,
     * treating the supplied buffers as one contiguous byte sequence.
     *
     * This is not necessarily an offset within `buffers[0]`: framing bytes may
     * occupy part or all of one or more earlier buffers.
     */
    readonly startOffset:
        number;

    readonly length:
        number;

    /**
     * Parser-specific state describing this physical record.
     *
     * Examples include CSV field start/end offsets and flags derived while
     * recognising the record.
     *
     * State which is invariant for the opened file belongs in ParserDetails
     * instead. Temporary machinery which does not describe this record belongs
     * in parser/reader scratch rather than here.
     */
    readonly recordState:
        TRecordState;
}


/*
 * Record readers
 *
 * A record reader turns one configured physical file into a cursor of
 * complete physical records or recoverable record-level errors.
 *
 * TRecordState is the state carried by every successful physical record
 * yielded by that cursor.
 *
 * Operational failures that prevent reliable continued processing are
 * reported by throwing.
 */

export type RecordReaderResult<
    TRecordState
> =
    | PhysicalRecordContent<TRecordState>
    | ValidationErrors;


/*
 * The RecordCursor owns the byte storage referenced by each
 * PhysicalRecordContent and controls the borrowed lifetime of its
 * recordState.
 *
 * A yielded record remains valid only until the cursor is advanced
 * to the next result or the cursor is closed.
 *
 * Consumers must therefore finish parsing, validation and projection
 * before advancing the cursor, and must copy any data that needs to
 * outlive the current record.
 */

export type RecordCursor<
    TRecordState
> =
    AsyncGenerator<
        RecordReaderResult<TRecordState>,
        void,
        unknown
    >;


/*
 * Record reader
 *
 * Each physical-file implementation creates its own RecordCursor.
 *
 * Reader-specific dependencies are supplied when the RecordReader itself
 * is constructed. Those dependencies are responsible for ensuring that
 * every yielded PhysicalRecordContent carries the declared TRecordState.
 *
 * For simple readers this state may be `undefined`. Format-aware readers may
 * populate parser-specific structural state while recognising the record.
 *
 * The mechanism used to create, reset and pool record state is deliberately
 * hidden from consumers of the RecordReader.
 */

export type RecordReader<
    TDetails extends PhysicalFileDetails,
    TRecordState
> = (
    details: TDetails
) => RecordCursor<TRecordState>;


/*
 * The reader map is derived from PhysicalFileDetails and parameterised by
 * the state carried by its physical records.
 *
 * This means that every known physical file type must have exactly the
 * appropriately typed reader entry, and that all consumers of the map must
 * explicitly propagate the record-state type.
 */

export type RecordReaderMap<
    TRecordState
> = {
    [TDetails in PhysicalFileDetails as TDetails["type"]]:
    RecordReader<
        TDetails,
        TRecordState
    >;
};

/**
 * Optional helper for record readers whose physical record boundary can be
 * located independently of parser-specific structural state.
 *
 * It is not a universal parser boundary. A format-aware RecordReader may
 * bypass RecordBoundaryDetector completely when record recognition and
 * structural parsing should be fused; CSV is the primary example.
 *
 * The supplied buffers are treated as one logical contiguous byte sequence.
 * All offsets passed to or returned from this interface are offsets into
 * that logical sequence, not offsets into an individual Uint8Array.
 *
 * A physical record may contain framing bytes which are not part of the
 * data presented to the parser.
 *
 * For example:
 *
 *     fixed:
 *         [record data]
 *
 *     line:
 *         [record data][CR][LF]
 *
 *     length-prefixed:
 *         [prefix][record data]
 *
 * No method may modify the supplied buffers.
 *
 * Implementations should not allocate per record. This interface is used
 * on the physical-record hot path.
 */
export interface RecordBoundaryDetector {

    /**
     * Find the logical offset at which the next physical record starts.
     *
     * @param buffers
     * The currently available physical byte buffers.
     *
     * @param frameStart
     * The logical offset of the first byte of the current physical record,
     * including any prefix framing.
     *
     * @param searchStart
     * The logical offset of the first byte which has not already been
     * examined while locating the end of the current physical record.
     *
     * When this method returns -1, the caller may append more buffers and
     * call it again with searchStart advanced past bytes already examined.
     *
     * Detectors which search for a terminator should therefore begin at
     * searchStart rather than frameStart.
     *
     * Detectors which can calculate the boundary directly, such as
     * fixed-width or length-prefixed detectors, may ignore searchStart.
     *
     * @returns
     * The logical offset of the first byte of the next physical record.
     *
     * Returns -1 when the currently supplied buffers do not yet contain a
     * complete current record.
     *
     * Examples:
     *
     * Fixed-width:
     *
     *     [a b c d][W X Y Z]
     *      ^        ^
     *      |        nextRecordStart
     *      frameStart
     *
     * Line-oriented:
     *
     *     [a b c][CR][LF][W X Y Z]
     *      ^             ^
     *      |             nextRecordStart
     *      frameStart
     *
     * Length-prefixed:
     *
     *     [prefix][a b c d][next prefix]
     *      ^              ^
     *      |              nextRecordStart
     *      frameStart
     */
    nextRecordStart(
        buffers: readonly Uint8Array[],
        frameStart: number,
        searchStart: number
    ): number;


    /**
     * Find the logical offset of the first byte of record data.
     *
     * `frameStart` identifies the beginning of the physical record,
     * including any prefix framing.
     *
     * For fixed-width and line-oriented records there is no prefix, so the
     * record starts at frameStart:
     *
     *     [record data]
     *      ^
     *
     *     [record data][LF]
     *      ^
     *
     * For a length-prefixed record the prefix is framing and is excluded
     * from the data presented to the parser:
     *
     *     [prefix][record data]
     *             ^
     *
     * The returned offset must be greater than or equal to frameStart.
     */
    recordStart(
        frameStart: number
    ): number;


    /**
     * Find the logical offset of the final byte of record data.
     *
     * This method is called only after nextRecordStart() has successfully
     * returned the beginning of the following physical record.
     *
     * @param buffers
     * The logical byte sequence containing the complete current record.
     *
     * @param nextRecordStart
     * The logical offset previously returned by nextRecordStart().
     *
     * @returns
     * The logical offset of the final byte belonging to the current record's
     * data.
     *
     * Any suffix framing bytes are excluded.
     *
     * Fixed-width:
     *
     *     [record data][next record]
     *                 ^
     *                 nextRecordStart
     *
     *     recordEnd = nextRecordStart - 1
     *
     * Line-oriented:
     *
     *     [record data][CR][LF][next record]
     *                         ^
     *                         nextRecordStart
     *
     *     recordEnd is the byte immediately before CR.
     *
     * Length-prefixed:
     *
     *     [prefix][record data][next prefix]
     *                          ^
     *                          nextRecordStart
     *
     *     recordEnd = nextRecordStart - 1
     *
     * The result is inclusive.
     *
     * An empty record is valid where the framing format permits it. In that
     * case recordEnd may be one less than recordStart().
     */
    recordEnd(
        buffers: readonly Uint8Array[],
        nextRecordStart: number
    ): number;
}

export const nullRecordStart = (frameStart: number) => frameStart;
/*
 * Parser
 *
 * A parser has four associated types:
 *
 * Representation
 *     The successfully parsed representation produced for each data record.
 *
 * ParserConfig
 *     Static source-specific configuration supplied in FileDetails.
 *
 * ParserDetails
 *     Opened-file details used while parsing this particular file.
 *
 *     These may simply be the ParserConfig, but they are allowed to be a
 *     different type derived from it.
 *
 *     For example, a CSV parser may combine its configured columns and
 *     separator rules with information read from the header row to produce
 *     prepared details containing the resolved physical column positions.
 *
 *     ParserDetails must not contain mutable structural state describing the
 *     current data record. That belongs in TRecordState.
 *
 * TRecordState
 *     Parser-specific state whose lifetime is exactly the lifetime of one
 *     PhysicalRecordContent.
 *
 *     Examples include CSV field start/end offsets and field flags.
 *
 *     This type is deliberately required and has no default. Parsers which
 *     require no per-record state should use `undefined` explicitly.
 *
 * A parser may optionally consume the first physical record to prepare its
 * ParserDetails. This supports formats where the first record contains file
 * metadata, such as a CSV header.
 *
 * Parsers receive PhysicalRecordContent<TRecordState> rather than assuming
 * that every physical record is represented by one contiguous Uint8Array or
 * that current-record structural state is held separately from the record.
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
    Representation,
    ParserConfig,
    ParserDetails,
    TRecordState
> {
    prepare?: (
        firstRecord:
        PhysicalRecordContent<TRecordState>,
        config:
        ParserConfig
    ) => ParserResult<ParserDetails>;

    parse(
        record:
        PhysicalRecordContent<TRecordState>,
        details:
        ParserDetails
    ): ParserResult<Representation>;
}


export type ParserMap =
    Record<
        string,
        Parser<
            any,
            any,
            any,
            any
        >
    >;


/*
 * Parser associated type extraction
 */

export type ParserRepresentation<TParser> =
    TParser extends Parser<
            infer Representation,
            infer _Config,
            infer _Details,
            infer _RecordState
        >
        ? Representation
        : never;


export type ParserConfig<TParser> =
    TParser extends Parser<
            infer _Representation,
            infer Config,
            infer _Details,
            infer _RecordState
        >
        ? Config
        : never;


export type ParserDetails<TParser> =
    TParser extends Parser<
            infer _Representation,
            infer _Config,
            infer Details,
            infer _RecordState
        >
        ? Details
        : never;


export type ParserRecordState<TParser> =
    TParser extends Parser<
            infer _Representation,
            infer _Config,
            infer _Details,
            infer RecordState
        >
        ? RecordState
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
 * Prepared ParserDetails are opened-file state and are not part of
 * FileDetails.
 *
 * Current-record parser state is represented separately by
 * ParserRecordState<TParser> and lives inside PhysicalRecordContent.
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


/**
 * Cursor options
 *
 * Parsers interpret complete physical records together with their associated
 * parser-specific record state.
 *
 * RecordReaders perform physical I/O and logical record recognition. A
 * format-aware reader may also populate parser-specific structural state
 * while recognising a record.
 *
 * Record readers may carry different record-state types. CursorOptions is
 * therefore a heterogeneous registry boundary: there is no single
 * TRecordState shared by every entry in RecordReaderMap.
 *
 * The registry exposes those entries as RecordReaderMap<unknown>. Once a
 * particular source selects both a parser and a record reader, higher-level
 * cursor code recovers the concrete relationship between that parser's
 * record-state type and the selected reader.
 *
 * The supplied RecordReaderMap contains already-configured physical reader
 * implementations. Reader-specific dependencies such as record-boundary
 * detectors, record-state or pool factories, and byte-buffer pools are
 * therefore not concerns of the higher-level cursor.
 */
export interface CursorOptions<
    TParsers extends ParserMap,
    EntityId
> {
    readonly parsers:
        TParsers;

    readonly recordReaders:
        RecordReaderMap<
            unknown
        >;

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
 * Physical file byte cursor
 *
 * A byte cursor yields physical file buffers.
 *
 * Ownership of each yielded buffer transfers to the consumer. The consumer
 * must eventually return it to the FileBufferPool supplied when the
 * cursor was created.
 */

export type FileByteCursor =
    AsyncGenerator<
        Uint8Array,
        void,
        unknown
    >;


/*
 * Physical file byte cursor factory
 *
 * Creates a byte cursor for one physical file using the supplied buffer pool.
 *
 * This contract allows higher physical layers, such as record readers, to
 * depend on byte I/O without depending directly on its implementation.
 */

export type FileByteCursorFactory = (
    filename: string,
    bufferPool: FileBufferPool
) => FileByteCursor;

/*
 * File byte buffer pool
 *
 * Physical file cursors use fixed-size Uint8Array buffers while reading.
 *
 * Buffers are shared between cursors and returned to the pool once no
 * current or future physical record can refer to them.
 */

export interface FileBufferPool {
    acquire():
        Uint8Array;

    release(
        buffer: Uint8Array
    ): void;
}
