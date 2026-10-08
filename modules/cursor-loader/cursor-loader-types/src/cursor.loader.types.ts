/*
 * Cursor Loader — shared public and internal types
 */

import {type Errors} from "@cobol-ts/errors";

import {type RefCountedPool} from "@cobol-ts/ref_counted_pool";
import {type HasByteBuffers} from "./debug.string";


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

    readonly filename: string;
}


export interface FixedFile {
    readonly type:
        "fixed";

    readonly filename: string;

    readonly recordSize: number;
}


export interface LengthPrefixedFile {
    readonly type:
        "length-prefixed";

    readonly filename: string;

    readonly prefixSize: number;

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
 * Physical record data
 *
 * buffers contains the physical byte buffers required to keep the current
 * record alive. A record may begin part way through its first buffer, span any
 * number of buffers, and end in a buffer which also contains bytes belonging to
 * later records.
 *
 * recordState contains parser-specific state associated with this physical
 * record. Generic cursor and lifetime machinery do not interpret or reset it.
 */
export interface PhysicalRecordData<TRecordState> {
    readonly buffers: readonly Uint8Array[];
    readonly recordState: TRecordState;
}


/*
 * Physical record range
 *
 * startByte
 *     Inclusive logical byte offset at which the current record begins.
 *
 * endByte
 *     Exclusive logical byte offset at which the completed record ends.
 *     The parser establishes this value.
 *
 * lastValidByte
 *     Exclusive logical end of bytes currently known to have been read.
 *     readMore() advances it and the parser must not inspect beyond it.
 *
 * All offsets are across buffers treated as one contiguous byte sequence.
 * endByte may be less than lastValidByte when bytes for later records have
 * already been read.
 */
export interface PhysicalRecordRange {
    startByte: number;
    endByte: number;
    lastValidByte: number;
}


/*
 * Physical file state
 *
 * fileFinished means lastValidByte is the end of the underlying file and no
 * future readMore() call can make more bytes available.
 */
export interface PhysicalRecordFileState {
    fileFinished: boolean;
}


/*
 * Physical record lifetime
 */
export interface PhysicalRecordLifetime {
    /**
     * Finish using the current lease of this physical record.
     *
     * close() releases this record's references to its physical byte buffers
     * and returns the physical-record object to its pool.
     *
     * The current lease must be closed exactly once. After close() the caller
     * must not use this object again; the same pooled JavaScript object may
     * subsequently represent another physical record.
     */
    close(): void;
}


/*
 * Physical record diagnostic context
 *
 * source identifies the physical source.
 *
 * recordNumber is one-based within that source.
 *
 * The internal pooled view is mutable because the same JavaScript object is
 * reused. Parser and completed/public views expose this context as readonly.
 */
export interface PhysicalRecordContext {
    source: string;
    recordNumber: number;
}


/*
 * Completed physical record
 *
 * This is the public/downstream view. Parsing has completed, so range, file
 * state and provenance are readonly. buffers and recordState remain valid until
 * close() is called.
 */
export type PhysicalRecordContent<TRecordState> =
    PhysicalRecordData<TRecordState>
    & Readonly<PhysicalRecordRange>
    & Readonly<PhysicalRecordFileState>
    & PhysicalRecordLifetime
    & Readonly<PhysicalRecordContext>;


/*
 * Physical record reader capability
 *
 * readMore() acquires another pooled byte buffer, fills it from the current file
 * position, appends that exact buffer to buffers, advances lastValidByte and
 * sets fileFinished when EOF is discovered.
 *
 * readMore() does not modify startByte or endByte. The cursor establishes
 * startByte; the parser establishes endByte.
 *
 * The parser remains inside one prepare() or parse() invocation while further
 * I/O occurs, so ordinary parser-local state does not need to be serialised and
 * reconstructed.
 */
export interface PhysicalRecordReader {
    readMore(): Promise<void>;
}


/*
 * Parser construction capability for a physical record.
 *
 * This is the common mutable physical capability used by both the parser view
 * and the internal pooled view. It deliberately excludes provenance so the
 * parser can receive provenance readonly while the cursor retains a mutable
 * view.
 *
 * This is still one JavaScript object. No wrapper is created.
 */
type PhysicalRecordParserContent<TRecordState> =
    PhysicalRecordData<TRecordState>
    & PhysicalRecordRange
    & PhysicalRecordFileState
    & PhysicalRecordLifetime
    & PhysicalRecordReader;


/*
 * Parser view of a physical record
 *
 * The parser may mutate range/file state as part of recognition and parsing,
 * call readMore(), and read source/recordNumber for diagnostics.
 *
 * Provenance is readonly: the cursor owns source identity and record numbering.
 *
 * The parser does not see pool implementation details.
 */
export type ParserPhysicalRecordContent<TRecordState> =
    PhysicalRecordParserContent<TRecordState>
    & Readonly<PhysicalRecordContext>;


/*
 * File byte buffer pool
 */
export type FileBufferPool = RefCountedPool<Uint8Array>;


/*
 * Internal pooled physical-record state
 *
 * buffers is mutable internally so readMore() can append buffers, the cursor
 * can transfer the carried final buffer into a new record, and close() can
 * clear references without replacing the array object.
 *
 * Pool references are permanent dependencies of the pooled object.
 */
export interface PooledPhysicalRecordState<TRecordState> {
    buffers: Uint8Array[];
    readonly byteBufferPool: FileBufferPool;
    readonly physicalContentPool: PhysicalContentPool<TRecordState>;
}


/*
 * Internal cursor/lifetime view
 *
 * This is the same JavaScript object with the additional mutable capabilities
 * required by cursor and lifetime code.
 */
export type PooledPhysicalRecordContent<TRecordState> =
    PhysicalRecordParserContent<TRecordState>
    & PooledPhysicalRecordState<TRecordState>
    & PhysicalRecordContext;


/*
 * Physical record object pool
 */
export type PhysicalContentPool<TRecordState> =
    RefCountedPool<PooledPhysicalRecordContent<TRecordState>>;


/*
 * Physical byte-buffer fill operation
 *
 * Fill the supplied pooled Uint8Array from the current position of file.
 *
 * The implementation must continue reading until either:
 *
 *     - buffer is completely full; or
 *     - end of file is reached.
 *
 * The returned number is therefore:
 *
 *     buffer.length
 *         a completely filled physical byte buffer;
 *
 *     1 .. buffer.length - 1
 *         the final partially-filled physical byte buffer;
 *
 *     0
 *         EOF before any additional bytes were read.
 *
 * A short result therefore means EOF.
 *
 * The supplied Uint8Array must remain the same object. Implementations must
 * not replace it with a subarray, slice or another view.
 *
 * readMore() consumes this returned count internally and advances
 * lastValidByte by that amount.
 *
 * If the returned count is less than buffer.length, readMore() also sets
 * fileFinished.
 *
 * The parser does not require the byte count as a separate readMore() return
 * value.
 *
 * The Promise deliberately leaks through this abstraction.
 *
 * This is an intentional trade-off. It creates asynchronous garbage at
 * physical-buffer granularity rather than forcing callback-style continuation
 * throughout the parser and cursor stack.
 */

export type FillFileBuffer<TFile> = (
    file:
    TFile,
    buffer:
    Uint8Array
) => Promise<
    number
>;


/*
 * Record cursor dependencies
 *
 * TFile is deliberately opaque to the shared cursor types.
 *
 * A Node implementation may use FileHandle. Tests may supply a much smaller
 * in-memory file abstraction.
 *
 * This keeps the physical cursor independent of Node-specific file types while
 * retaining a fully typed relationship between the file and its fill
 * operation.
 */

export interface RecordCursorOptions<
    TRecordState,
    TFile
> {

    readonly source: string;

    readonly byteBufferPool: FileBufferPool;

    readonly physicalContentPool:
        PhysicalContentPool<
            TRecordState
        >;

    readonly fillFileBuffer:
        FillFileBuffer<
            TFile
        >;
}


/*
 * Record cursor result
 *
 * result is the representation produced by the parser.
 *
 * physicalRecord is the completed physical record from which that
 * representation was produced.
 *
 * This is the same physical-record object used by the parser. No physical
 * record wrapper is allocated and no bytes are copied.
 *
 * The client owns the lifetime of physicalRecord and calls close() when it no
 * longer requires the physical bytes or anything borrowing from them.
 */

export interface RecordCursorResult<
    TRepresentation,
    TRecordState
> {

    readonly result:
        ParserResult<
            TRepresentation
        >;

    readonly physicalRecord:
        PhysicalRecordContent<
            TRecordState
        >;
}


/*
 * Record cursor
 *
 * The cursor supplies pooled physical-record objects.
 *
 * It does not understand physical record syntax.
 *
 * In particular the cursor has no knowledge of:
 *
 *     - line endings;
 *     - fixed-width records;
 *     - length prefixes;
 *     - CSV quoting;
 *     - RecordBoundaryDetector.
 *
 * The cursor establishes startByte for each physical record.
 *
 * The parser:
 *
 *     - examines bytes from startByte up to lastValidByte;
 *     - calls record.readMore() when it needs more bytes;
 *     - establishes endByte when it finds the current physical-record
 *       boundary.
 *
 * readMore():
 *
 *     - appends byte buffers;
 *     - advances lastValidByte;
 *     - establishes fileFinished when it discovers EOF.
 *
 * Between records, the cursor retains one additional reference only:
 *
 *     the final byte buffer of the previous physical record.
 *
 * That exact Uint8Array is transferred into the next physical record.
 *
 * The cursor also transfers the valid-byte range associated with that carried
 * buffer so the next parser can immediately inspect already-read bytes.
 *
 * The cursor does not close yielded physical records. Their lifetime belongs
 * to the client.
 *
 * Operational I/O failures are reported by throwing.
 */

export type RecordCursor<
    TRepresentation,
    TRecordState
> =
    AsyncGenerator<
        RecordCursorResult<
            TRepresentation,
            TRecordState
        >,
        void,
        void
    >;


/*
 * Optional physical-record boundary helper
 *
 * This is an optional parser implementation helper.
 *
 * The generic RecordCursor has no visibility of this interface and must not
 * import or depend upon it.
 *
 * Parsers whose physical boundary can be located independently of their other
 * parsing work may use a RecordBoundaryDetector.
 *
 * Parsers for which boundary detection and structural parsing should be fused
 * may ignore it completely. CSV is the primary example.
 *
 * The supplied buffers are treated as one logical contiguous byte sequence.
 *
 * lastValidByte is the exclusive logical end of bytes which currently exist.
 *
 * Implementations must never inspect bytes at or beyond lastValidByte.
 *
 * No method may modify the supplied buffers.
 *
 * Implementations should not allocate per record.
 */

export interface RecordBoundaryDetector {

    /**
     * Find the logical offset at which the next physical record starts.
     *
     * frameStart is the beginning of the current physical frame, including
     * any prefix framing.
     *
     * searchStart is the first byte not already examined while searching for
     * the physical boundary.
     *
     * lastValidByte is the exclusive logical end of currently available file
     * bytes.
     *
     * Returns -1 when the currently available bytes do not yet contain a
     * complete physical record.
     */
    nextRecordStart(
        buffers:
        readonly Uint8Array[],
        frameStart:
        number,
        searchStart:
        number,
        lastValidByte:
        number
    ): number;


    /**
     * Find the logical offset of the first parser-visible byte within the
     * physical frame.
     *
     * For a format with no prefix framing this will normally be frameStart.
     */
    recordStart(
        frameStart:
        number
    ): number;


    /**
     * Find the inclusive logical offset of the final parser-visible byte
     * within the physical frame.
     *
     * An empty parser-visible record may be represented by a result one less
     * than recordStart().
     */
    recordEnd(
        buffers:
        readonly Uint8Array[],
        nextRecordStart:
        number
    ): number;
}


export const nullRecordStart =
    (
        frameStart:
        number
    ) =>
        frameStart;


/*
 * Parser result
 */

export type ParserResult<T> =
    | T
    | Errors;


/*
 * Projection definition
 *
 * The authoring form is ergonomic:
 *
 *     age: {
 *         type: "integer"
 *     }
 *
 * The canonical form is explicit:
 *
 *     age: {
 *         type: "integer",
 *         path: [
 *             "age"
 *         ]
 *     }
 *
 * Canonicalisation happens once when configuration is prepared. Runtime
 * projection code consumes only the canonical form.
 */


/*
 * Supported projected scalar kinds.
 */

export type ProjectionFieldType =
    | "integer"
    | "float"
    | "character"
    | "string";


/*
 * Authoring projection field.
 *
 * path is optional. When omitted, canonicalisation uses the field name as a
 * single path component.
 */

export interface ProjectionFieldAuthoring<
    TType extends ProjectionFieldType =
        ProjectionFieldType
> {

    readonly type: TType;

    readonly path?: readonly string[];
}


/*
 * Authoring projection.
 */

export type ProjectionAuthoring =
    Readonly<
        Record<
            string,
            ProjectionFieldAuthoring
        >
    >;


/*
 * Canonical projection field.
 *
 * Runtime projection code never needs to handle a missing path.
 */

export interface ProjectionField<
    TType extends ProjectionFieldType =
        ProjectionFieldType
> {

    readonly type: TType;

    readonly path: readonly string[];
}


/*
 * Canonical version of an authoring projection.
 *
 * The author's exact field names and field types are preserved while every
 * path becomes explicit.
 */

export type CanonicalProjection<
    TProjection extends ProjectionAuthoring
> = {
    readonly [K in keyof TProjection]:
    ProjectionField<
        TProjection[K]["type"]
    >;
};


/*
 * TypeScript value represented by one projection field.
 */

export type ProjectionFieldValue<
    TField extends ProjectionFieldAuthoring
> =
    TField["type"] extends | "integer"
        | "float"
        ? number
        : TField["type"] extends | "character"
            | "string"
            ? string
            : never;


/*
 * Application-facing projected view.
 *
 * Projection fields become lazy accessors rather than materialised values.
 */

export type ProjectionView<
    TProjection extends ProjectionAuthoring
> = {
    readonly [K in keyof TProjection]:
    () => ProjectionFieldValue<
        TProjection[K]
    >;
};


/*
 * Projection field compatible with one application-facing accessor.
 *
 * The application interface is authoritative. A numeric accessor may be
 * backed by either an integer or float projection. A string accessor may be
 * backed by either a character or string projection.
 */

export type ProjectionFieldFor<TAccessor> =
    TAccessor extends () => number
        ? ProjectionFieldAuthoring<
            | "integer"
            | "float"
        >
        : TAccessor extends () => string
            ? ProjectionFieldAuthoring<
                | "character"
                | "string"
            >
            : never;


/*
 * Authoring projection for one application-facing interface.
 *
 * Every member of TResult must be represented by one compatible projection
 * field.
 */

export type ProjectionDefinition<TResult> = {
    readonly [K in keyof TResult]:
    ProjectionFieldFor<
        TResult[K]
    >;
};

/*
 * Physical-record capability retained by a lazy projection.
 *
 * Projection accessors need only:
 *
 *     - the physical byte buffers;
 *     - the completed physical byte range;
 *     - diagnostic provenance.
 *
 * They deliberately do not receive parser-owned recordState, readMore(),
 * file-state mutation, lifetime operations or pool internals.
 *
 * The actual runtime object is still the same PhysicalRecordContent object.
 * This interface merely exposes the narrower capability required by projection.
 */
export interface ProjectionPhysicalRecord
    extends HasByteBuffers,
        Readonly<PhysicalRecordRange>,
        Readonly<PhysicalRecordContext> {
}


/*
 * Format-specific physical-byte diagnostic rendering.
 *
 * Rendering requires only the physical byte buffers and a requested logical
 * range. It does not require parser-owned record state, provenance, lifetime
 * operations or I/O capability.
 *
 * startByte is inclusive.
 * endByte is exclusive.
 */
export interface PhysicalRecordDebugRenderer {

    toDebugString(
        record:
        HasByteBuffers,
        startByte:
        number,
        endByte:
        number
    ): string;
}

/**
 * Runtime factory for one reusable application-facing projection.
 *
 * TProjection
 *     The application interface exposed to callers, for example Customer.
 *
 * TRepresentation
 *     The parser-specific representation consumed by the projection accessors.
 *
 * A projection object is created once and may then be rebound to successive
 * records.
 *
 * Lifecycle:
 *
 *     create()
 *         creates one complete, unbound projection object;
 *
 *     bind()
 *         associates that existing projection with the current parser
 *         representation and physical record;
 *
 *     clear()
 *         removes those lease-specific references before the projection is
 *         retained for reuse.
 *
 * create() may allocate the projection object and its accessor functions.
 *
 * bind() and clear() must not allocate another projection object or change its
 * runtime shape.
 *
 * The supplied physical record is the authoritative source of physical
 * provenance, including source name and record number.
 *
 * A projection must not be bound again until clear() has been called.
 * Accessing a projection while it is unbound is invalid.
 */
export interface ProjectionFactory<
    TProjection,
    TRepresentation
> {

    /**
     * Create one complete reusable projection object in its unbound state.
     */
    create():
        TProjection;


    /**
     * Bind an existing projection to one logical record.
     *
     * The projection borrows both representation and physicalRecord for the
     * duration of the current lease.
     */
    bind(
        projection:
        TProjection,
        representation:
        TRepresentation,
        physicalRecord:
        ProjectionPhysicalRecord
    ): void;


    /**
     * Return an existing projection to its unbound state.
     *
     * All references to the previous representation and physical record must be
     * removed so neither is retained by the reusable projection.
     */
    clear(
        projection:
        TProjection
    ): void;
}

/*
 * Projection support
 *
 * ProjectionSupport exposes the parser-specific operations required by the
 * parser-independent projection layer.
 *
 * The projection describes a logical field using an already-tokenised path.
 * The parser decides what that path means for the representation it produces.
 *
 * Examples:
 *
 *     JSONL
 *         ["customer", "age"]
 *         traverses object properties.
 *
 *     CSV
 *         ["AGE"]
 *         identifies a column.
 *
 *     COBOL
 *         ["CUSTOMER", "PERSON", "AGE"]
 *         identifies a field through the record layout.
 *
 * Paths are supplied as string arrays so implementations do not need to parse
 * compound path strings such as "customer.person.age" on the processing path.
 *
 * ProjectionSupport is deliberately coupled to Parser. It is not an
 * independently configurable strategy. Each parser has exactly one projection
 * interpretation for the representation it produces.
 */

export interface ProjectionSupport<TRepresentation> {

    integer(
        representation:
        TRepresentation,
        path:
        readonly string[]
    ): number;

    float(
        representation:
        TRepresentation,
        path:
        readonly string[]
    ): number;

    character(
        representation:
        TRepresentation,
        path:
        readonly string[]
    ): string;

    string(
        representation:
        TRepresentation,
        path:
        readonly string[]
    ): string;
}

/*
 * Parser
 *
 * A parser has four associated types:
 *
 * TRepresentation
 *     The successfully parsed representation produced for each data record.
 *
 * TParserConfig
 *     Static source-specific configuration supplied for this parser.
 *
 * TParserDetails
 *     Opened-source details derived once for this physical source.
 *
 *     These may simply be TParserConfig, but may instead contain information
 *     derived from a bootstrap physical record.
 *
 *     For example, a CSV parser may combine configured column definitions
 *     with information obtained from a header record.
 *
 * TRecordState
 *     Parser-specific mutable or immutable state associated with one physical
 *     record.
 *
 *     Examples include CSV field start/end offsets and field flags.
 *
 *     The state belongs to the parser. Generic cursor and lifetime code do not
 *     interpret or reset it.
 *
 *
 * Physical input model
 *
 * prepare() and parse() are each invoked once for their respective physical
 * record.
 *
 * The parser remains inside that invocation while it determines how much
 * physical input belongs to the record.
 *
 * If more file data is required it calls:
 *
 *     await record.readMore()
 *
 * and continues directly from the same ordinary local parsing state.
 *
 * There is deliberately no separate recognition phase and no need-more-data
 * result which would require parser state to be dehydrated and reconstructed.
 *
 * readMore() may append a physical byte buffer containing bytes belonging to
 * later records as well as the current one.
 *
 * Each readMore() advances lastValidByte by the number of additional physical
 * file bytes obtained.
 *
 * If a read discovers EOF, readMore() also sets fileFinished.
 *
 * The parser scans only bytes before lastValidByte.
 *
 * Before returning successfully, the parser must set endByte to the exclusive
 * physical end of the current record.
 *
 * endByte may be less than lastValidByte when already-read bytes belong to
 * later records.
 *
 * startByte and endByte describe the physical record including framing.
 *
 * Parser-visible ranges within that record belong to parser logic and, where
 * they must survive parsing, TRecordState.
 *
 * Successful operations return their value inside the Promise.
 *
 * Recoverable data failures return Errors.
 *
 * prepare() and parse() receive readonly source and recordNumber provenance so
 * parser-specific failures can be fully contextualised where they are created.
 *
 * The Promise is intentional. It preserves ordinary parser-local state across
 * readMore() without requiring callback-style continuation throughout the
 * parser stack.
 *
 *
 * Projection model
 *
 * A parser also supplies ProjectionSupport for the representation it produces.
 *
 * This keeps the declarative projection layer independent of physical format.
 * Projection code asks for typed values at logical paths; the parser owns the
 * format-specific meaning and execution of those paths.
 *
 * ProjectionSupport is part of the parser contract rather than a separately
 * selectable strategy.
 *
 *
 * Diagnostic rendering
 *
 * A parser also supplies PhysicalRecordDebugRenderer because the parser knows
 * how bytes belonging to its physical format should be represented to a
 * developer.
 *
 * Generic cursor, projection and lifetime code deliberately treats physical
 * record contents as opaque bytes. It does not know whether those bytes are
 * UTF-8 JSON, CSV text, EBCDIC COBOL data, binary data, or another future
 * format.
 *
 * Diagnostic rendering deliberately receives only HasByteBuffers plus an
 * explicit logical range. It does not receive TRecordState and therefore does
 * not force parser-owned record state through the projection type system.
 *
 * startByte is inclusive and endByte is exclusive.
 *
 * The method is diagnostic only. It must not modify the physical record,
 * advance the cursor, perform additional I/O, or change parser state.
 *
 * The returned string is raw diagnostic context. Parser and projection code
 * combine it with readonly physical provenance when constructing errors.
 */


/**
 * Parser for one logical record format.
 *
 * prepare() and parse() receive the parser capability of one physical-record
 * object:
 *
 *     PhysicalRecordData
 *         &
 *     mutable PhysicalRecordRange
 *         &
 *     mutable PhysicalRecordFileState
 *         &
 *     PhysicalRecordLifetime
 *         &
 *     PhysicalRecordReader
 *         &
 *     readonly PhysicalRecordContext
 *
 * This is one JavaScript object. No parser wrapper is allocated.
 *
 * The parser also supplies:
 *
 *     ProjectionSupport<TRepresentation>
 *         typed logical access to the representation;
 *
 *     PhysicalRecordDebugRenderer
 *         format-specific rendering of physical bytes.
 *
 * PhysicalRecordDebugRenderer is deliberately independent of TRecordState.
 */
export type Parser<
    TRepresentation,
    TParserConfig,
    TParserDetails,
    TRecordState
> =
    ProjectionSupport<
        TRepresentation
    >
    & PhysicalRecordDebugRenderer
    & {

    /**
     * Prepare this parser for one physical source.
     *
     * prepare() is optional because many formats need no bootstrap record.
     *
     * When present, the first physical record is supplied here.
     *
     * The parser may inspect bytes from firstRecord.startByte up to
     * firstRecord.lastValidByte and call firstRecord.readMore() as often as
     * necessary.
     *
     * Each readMore() advances lastValidByte and may set fileFinished if that
     * read discovers EOF.
     *
     * Typical work includes:
     *
     *     - interpreting a header;
     *     - validating source-specific structure;
     *     - mapping physical fields to logical fields;
     *     - compiling parser configuration into hot-path runtime details.
     *
     * Before returning successfully, endByte must describe the exclusive
     * physical end of this first record.
     *
     * The returned TParserDetails are retained and supplied to parse() for
     * subsequent data records.
     *
     * Returning Errors represents a recoverable preparation failure.
     */
    readonly prepare?: (
        firstRecord:
        ParserPhysicalRecordContent<
            TRecordState
        >,
        config:
        TParserConfig
    ) => Promise<
        ParserResult<
            TParserDetails
        >
    >;


    /**
     * Parse one physical data record.
     *
     * parse() owns physical scanning as well as interpretation of this record.
     *
     * It may inspect bytes from record.startByte up to record.lastValidByte and
     * call record.readMore() whenever additional physical input is required.
     *
     * readMore() advances lastValidByte as new physical bytes become available.
     *
     * record.fileFinished indicates that record.lastValidByte is the end of the
     * underlying file.
     *
     * Parser-local scanning state remains ordinary local state across those
     * awaits.
     *
     * Parser-specific structural facts which must survive with the completed
     * physical record belong in record.recordState.
     *
     * Before returning successfully, record.endByte must describe the exclusive
     * physical end of the current record.
     *
     * record.endByte may be less than record.lastValidByte when bytes belonging
     * to later records have already been read.
     *
     * The returned representation may be materialised or may borrow from the
     * physical record.
     *
     * A borrowed representation remains valid only while the corresponding
     * PhysicalRecordContent remains open.
     *
     * Returning Errors represents a recoverable parsing failure.
     */
    readonly parse: (
        record:
        ParserPhysicalRecordContent<
            TRecordState
        >,
        details:
        TParserDetails
    ) => Promise<
        ParserResult<
            TRepresentation
        >
    >;
};


/*
 * Heterogeneous parser registry
 */

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
 * Parsers whose configuration type is undefined do not require parserConfig.
 *
 * Parsers with a concrete configuration type require parserConfig and retain
 * that parser-specific type.
 *
 * Prepared ParserDetails are opened-file state and are not part of
 * FileDetails.
 */

export type FileParserConfig<TParser> =
    [ParserConfig<TParser>] extends [undefined]
        ? {
            readonly parserConfig?: undefined;
        }
        : {
            readonly parserConfig: ParserConfig<TParser>;
        };


/*
 * Data errors
 */

export interface DataError {

    readonly source?: string;

    readonly message: string;
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
    & FileParserConfig<
    TParsers[KParser]
>
    & {
    readonly parser: KParser;

    readonly project: (
        representation:
        ParserRepresentation<
            TParsers[KParser]
        >
    ) => T;

    readonly cardinality: Cardinality;

    readonly entityId: (
        value:
        T
    ) => EntityId;

    readonly checkRepresentation?: (
        representation:
        ParserRepresentation<
            TParsers[KParser]
        >
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
            cardinality: infer C extends Cardinality;
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
        ProjectedValue<
            TConfig[K]
        >,
        SourceCardinality<
            TConfig[K]
        >
    >;
};


/*
 * Dataset error API
 */

export interface EntityDataSetErrors<TConfig> {

    hasErrors(): boolean;

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
 * / errors(). The type system represents the valid logical shape rather than
 * encoding malformed input into every consumer access.
 */

export type EntityDataSet<TConfig> =
    EntityDataSetType<
        TConfig
    >
    & EntityDataSetErrors<
    TConfig
>;


/*
 * Internal dataset mutation API
 */

export interface EntityDataSetMutation<TConfig> {

    clear(): void;

    set<
        K extends keyof TConfig & string
    >(
        name:
        K,
        value:
        ProjectedValue<
            TConfig[K]
        >
    ): void;

    add<
        K extends keyof TConfig & string
    >(
        name:
        K,
        value:
        ProjectedValue<
            TConfig[K]
        >
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
    EntityDataSet<
        TConfig
    >
    & EntityDataSetMutation<
    TConfig
>;


/*
 * Cursor options
 *
 * The parser registry and entity-id ordering are higher-level concerns.
 *
 * Physical-record I/O and pooling are configured when the corresponding
 * RecordCursor is constructed.
 */

export interface CursorOptions<
    TParsers extends ParserMap,
    EntityId
> {

    readonly parsers: TParsers;

    readonly compareEntityId: (
        left:
        EntityId,
        right:
        EntityId
    ) => number;
}


/*
 * Entity cursor
 */

export type EntityCursor<TConfig> =
    AsyncGenerator<
        EntityDataSet<
            TConfig
        >,
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
    EntityCursor<
        TConfig
    >
) => Promise<R>;
