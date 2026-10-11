/*
 * Cursor Loader — shared public and internal types
 */

import {type Errors} from "@cobol-ts/errors";
import {type RefCountedPool} from "@cobol-ts/ref_counted_pool";

import {type HasByteBuffers} from "./debug.string";


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
    readonly buffers:
        readonly Uint8Array[];

    readonly recordState:
        TRecordState;
}


/*
 * Completed physical-record range.
 *
 * startByte
 *     Inclusive logical byte offset at which the current record begins.
 *     The cursor establishes this value.
 *
 * endByte
 *     Exclusive logical byte offset at which the completed record ends.
 *     The parser establishes this value.
 *
 * lastValidByte
 *     Exclusive logical end of bytes known to have been read from the physical
 *     source. readMore() advances this value internally. Parsers must not
 *     inspect bytes at or beyond it.
 *
 * All offsets are across buffers treated as one contiguous byte sequence.
 * endByte may be less than lastValidByte when bytes for later records have
 * already been read.
 */
export interface PhysicalRecordRange {
    readonly startByte:
        number;

    readonly endByte:
        number;

    readonly lastValidByte:
        number;
}


/*
 * Physical source state visible on a completed record.
 *
 * fileFinished means lastValidByte is the end of the underlying source and no
 * future readMore() call can make more bytes available.
 */
export interface PhysicalRecordFileState {
    readonly fileFinished:
        boolean;
}


/*
 * Physical record lifetime.
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
    close():
        void;
}


/*
 * Physical record diagnostic context.
 *
 * source identifies the physical source.
 *
 * recordNumber is one-based within that source.
 */
export interface PhysicalRecordContext {
    readonly source:
        string;

    readonly recordNumber:
        number;
}


/*
 * Completed physical record.
 *
 * This is the public/downstream view. Parsing has completed, so physical range,
 * file state and provenance are readonly. buffers and recordState remain valid
 * until close() is called.
 */
export type PhysicalRecordContent<TRecordState> =
    PhysicalRecordData<TRecordState>
    & PhysicalRecordRange
    & PhysicalRecordFileState
    & PhysicalRecordContext
    & PhysicalRecordLifetime;


/*
 * Physical-record reader capability.
 *
 * readMore() acquires another pooled byte buffer, fills it from the current
 * source position, appends that exact buffer to buffers, advances
 * lastValidByte, and sets fileFinished when EOF is discovered.
 *
 * readMore() does not modify startByte or endByte. The cursor establishes
 * startByte; the parser establishes endByte.
 *
 * The parser remains inside one prepare() or parse() invocation while further
 * I/O occurs, so ordinary parser-local state remains ordinary local state.
 */
export interface PhysicalRecordReader {
    readMore():
        Promise<void>;
}


/*
 * Parser view of a physical record.
 *
 * The capability intentionally encodes ownership of physical positions:
 *
 *     cursor
 *         establishes startByte;
 *
 *     readMore()
 *         advances lastValidByte and discovers fileFinished;
 *
 *     parser
 *         establishes endByte.
 *
 * The parser therefore receives startByte, lastValidByte, fileFinished and
 * provenance readonly. endByte is the one physical position it may mutate.
 *
 * The parser does not own the record lifetime and cannot close it through this
 * interface.
 *
 * This is still the same pooled JavaScript object. No wrapper is created.
 */
export interface ParserPhysicalRecordContent<TRecordState>
    extends PhysicalRecordData<TRecordState>,
        PhysicalRecordReader {

    readonly startByte:
        number;

    endByte:
        number;

    readonly lastValidByte:
        number;

    readonly fileFinished:
        boolean;

    readonly source:
        string;

    readonly recordNumber:
        number;
}


/*
 * File byte-buffer pool.
 */
export type FileBufferPool =
    RefCountedPool<Uint8Array>;


/*
 * Internal mutable physical-record capabilities.
 *
 * These types are intentionally not exported independently. They describe the
 * implementation view used by cursor/lifetime code while the public parser and
 * completed-record views expose narrower capabilities of the same object.
 */
interface MutablePhysicalRecordRange {
    startByte:
        number;

    endByte:
        number;

    lastValidByte:
        number;
}


interface MutablePhysicalRecordFileState {
    fileFinished:
        boolean;
}


interface MutablePhysicalRecordContext {
    source:
        string;

    recordNumber:
        number;
}


/*
 * Internal pooled physical-record state.
 *
 * buffers is mutable internally so readMore() can append buffers, the cursor
 * can transfer the carried final buffer into a new record, and close() can
 * clear references without replacing the array object.
 *
 * Pool references are permanent dependencies of the pooled object.
 */
export interface PooledPhysicalRecordState<TRecordState> {
    buffers:
        Uint8Array[];

    readonly recordState:
        TRecordState;

    readonly byteBufferPool:
        FileBufferPool;

    readonly physicalContentPool:
        PhysicalContentPool<TRecordState>;
}


/*
 * Internal cursor/lifetime view.
 *
 * This is the same JavaScript object with the complete mutable capabilities
 * required by cursor and lifetime code.
 */
export type PooledPhysicalRecordContent<TRecordState> =
    PooledPhysicalRecordState<TRecordState>
    & MutablePhysicalRecordRange
    & MutablePhysicalRecordFileState
    & MutablePhysicalRecordContext
    & PhysicalRecordReader
    & PhysicalRecordLifetime;


/*
 * Physical-record object pool.
 */
export type PhysicalContentPool<TRecordState> =
    RefCountedPool<
        PooledPhysicalRecordContent<TRecordState>
    >;


/*
 * Physical byte-buffer fill operation.
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
 * readMore() consumes the returned count internally and advances
 * lastValidByte by that amount. If the count is less than buffer.length,
 * readMore() also sets fileFinished.
 *
 * The Promise is part of the abstraction intentionally: parser code may await
 * additional physical input while retaining ordinary local scanning state.
 * The performance cost of that asynchronous machinery is a measurement issue,
 * not an assumption encoded by this contract.
 */
export type FillFileBuffer<TFile> = (
    file:
    TFile,
    buffer:
    Uint8Array
) => Promise<number>;


/*
 * Parser result.
 *
 * Recoverable source-data failures are returned as Errors. Operational failures
 * and programming errors may throw.
 */
export type ParserResult<T> =
    | T
    | Errors;


/*
 * Record cursor result.
 *
 * result is the representation or recoverable Errors produced by the parser.
 *
 * physicalRecord is the completed physical record from which that result was
 * produced.
 *
 * This is the same physical-record object used by the parser. No physical
 * record wrapper is allocated and no bytes are copied.
 *
 * The client owns the lifetime of physicalRecord and calls close() when it no
 * longer requires the bytes or anything borrowing from them.
 */
export interface RecordCursorResult<
    TRepresentation,
    TRecordState
> {
    readonly result:
        ParserResult<TRepresentation>;

    readonly physicalRecord:
        PhysicalRecordContent<TRecordState>;
}


/*
 * Record cursor.
 *
 * The cursor supplies pooled physical-record objects but does not understand
 * physical record syntax.
 *
 * The cursor establishes startByte for each record. The parser scans available
 * bytes, calls readMore() when required, and establishes endByte.
 *
 * Between records the cursor may retain the final physical byte buffer of the
 * previous record so already-read bytes can become the beginning of the next
 * record without copying them.
 *
 * The cursor does not close yielded physical records. Their lifetime belongs to
 * the consumer.
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
 * Projection definition.
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
 * Canonicalisation happens once during configuration. The canonical path remains
 * an ergonomic string path. Before runtime access, the parser compiles that path
 * into its own TProjectionPath for the opened source.
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
 * path is optional. When omitted, canonicalisation uses the field name as one
 * path component.
 */
export interface ProjectionFieldAuthoring<
    TType extends ProjectionFieldType =
        ProjectionFieldType
> {
    readonly type:
        TType;

    readonly path?:
        readonly string[];
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
    readonly type:
        TType;

    readonly path:
        readonly string[];
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
    TField["type"] extends
        | "integer"
        | "float"
        ? number
        : TField["type"] extends
            | "character"
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
 * The parser-specific representation is responsible for retrieving values.
 * The projection retains this narrower physical capability to keep borrowed
 * bytes alive and to provide physical provenance/debug context when lazy access
 * fails.
 *
 * It deliberately does not expose parser-owned recordState, readMore(),
 * lifetime operations, mutable cursor state or pool internals.
 *
 * The runtime object is still the same PhysicalRecordContent object. This
 * interface is only a type-level capability boundary.
 */
export interface ProjectionPhysicalRecord
    extends HasByteBuffers,
        PhysicalRecordRange,
        PhysicalRecordContext {
}


/*
 * Format-specific physical-byte diagnostic rendering.
 *
 * Rendering requires only physical byte buffers and an explicit logical byte
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


/*
 * Runtime factory for one reusable application-facing projection.
 *
 * TProjection
 *     The application interface exposed to callers, for example Customer.
 *
 * TRepresentation
 *     The parser-specific representation consumed by projection accessors.
 *
 * A projection object is created once and may then be rebound to successive
 * records.
 *
 * create()
 *     creates one complete unbound projection object;
 *
 * bind()
 *     associates that existing projection with the current parser
 *     representation and physical record;
 *
 * clear()
 *     removes those lease-specific references before the projection is retained
 *     for reuse.
 *
 * create() may allocate the projection object and its accessor functions.
 * bind() and clear() must not allocate another projection object or change its
 * runtime shape.
 *
 * A projection must not be bound again until clear() has been called.
 * Accessing a projection after its owning result has been closed is invalid;
 * the pooled object may subsequently be rebound to another record.
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
 * Projection support.
 *
 * ProjectionSupport exposes the parser-specific operations required by the
 * parser-independent projection layer.
 *
 * Canonical projection definitions use readonly string[] paths because that is
 * the portable authoring form. Those paths are not required to be the runtime
 * representation used by a parser.
 *
 * compileProjectionPath() converts one canonical string path into the parser's
 * TProjectionPath for this opened source. This happens outside the record hot
 * path.
 *
 * Examples:
 *
 *     JSONL
 *         readonly string[] -> readonly string[]
 *         Property traversal can retain the canonical path unchanged.
 *
 *     CSV
 *         ["AGE"] -> 3
 *         Header lookup happens once; row access uses the numeric column index.
 *
 *     COBOL
 *         ["CUSTOMER", "PERSON", "AGE"] -> parser-specific compiled layout
 *         The eventual runtime path may contain offsets, usage, scale or other
 *         information needed to interpret the physical bytes efficiently.
 *
 * representation is the successfully parsed representation for the current
 * physical record.
 *
 * details is the opened-source information prepared once for the physical
 * source and shared by parsing and projection.
 *
 * ProjectionSupport is deliberately part of Parser rather than an independently
 * configurable strategy. Each parser owns both compilation of projection paths
 * and execution of those compiled paths against its representation.
 */
export interface ProjectionSupport<
    TRepresentation,
    TParserDetails,
    TProjectionPath
> {
    compileProjectionPath(
        details:
        TParserDetails,
        path:
        readonly string[]
    ): TProjectionPath;

    integer(
        representation:
        TRepresentation,
        details:
        TParserDetails,
        path:
        TProjectionPath
    ): number;

    float(
        representation:
        TRepresentation,
        details:
        TParserDetails,
        path:
        TProjectionPath
    ): number;

    character(
        representation:
        TRepresentation,
        details:
        TParserDetails,
        path:
        TProjectionPath
    ): string;

    string(
        representation:
        TRepresentation,
        details:
        TParserDetails,
        path:
        TProjectionPath
    ): string;
}


/*
 * Parser.
 *
 * A parser has five associated types.
 *
 * TRepresentation
 *     The successfully parsed representation exposed for one data record.
 *
 *     A representation may be materialised, as JSON currently is, or may be a
 *     borrowed byte-backed view, as CSV and COBOL are intended to be.
 *
 * TParserConfig
 *     Static source-specific configuration supplied for this parser.
 *
 * TParserDetails
 *     Opened-source details derived once and then reused across records.
 *
 *     These may simply be TParserConfig, but may instead contain information
 *     derived from a bootstrap physical record. For example, CSV may combine
 *     configured logical columns with information obtained from a header.
 *
 *     The same details object is supplied to parse() and ProjectionSupport.
 *     It therefore holds source-scoped interpretation state which should not be
 *     copied into each pooled recordState.
 *
 * TRecordState
 *     Parser-specific state associated with one pooled physical record.
 *
 *     Examples include reusable CSV field start/end offsets and field flags.
 *
 *     The state belongs to the parser. Generic cursor/lifetime machinery does
 *     not interpret or reset it.
 *
 * TProjectionPath
 *     Parser-specific compiled representation of one canonical string path.
 *
 *     Compilation happens once for the opened source through
 *     compileProjectionPath(). Runtime accessors use the compiled value directly.
 *     CSV can therefore use a numeric column index while JSONL can retain its
 *     string path unchanged.
 *
 * Physical input model
 * --------------------
 *
 * The cursor establishes record.startByte.
 *
 * prepare() and parse() remain inside one ordinary invocation while determining
 * how much physical input belongs to their record. If more bytes are required
 * they call:
 *
 *     await record.readMore()
 *
 * and continue directly from their existing local scanning state.
 *
 * readMore() advances lastValidByte and may establish fileFinished. The parser
 * reads both values but does not set them directly.
 *
 * The parser establishes record.endByte.
 *
 * Before returning either a successful value or recoverable Errors for a
 * complete physical record, endByte must be the exclusive end of that record.
 * This is required so the cursor can advance even when interpretation fails.
 *
 * endByte may be less than lastValidByte when already-read bytes belong to
 * later records.
 *
 * Representation model
 * --------------------
 *
 * The source bytes remain authoritative. A returned representation may be a
 * materialised value or a borrowed view over those bytes and recordState.
 *
 * A borrowed representation remains valid only while the corresponding
 * PhysicalRecordContent remains open.
 *
 * This is particularly important for COBOL, where the same physical bytes may
 * support several valid logical interpretations and the correct interpretation
 * may not be chosen until projection/application context is available.
 *
 * Projection model
 * ----------------
 *
 * The parser supplies ProjectionSupport for its representation, prepared source
 * details and compiled projection-path type. Generic projection setup converts
 * canonical string paths once with compileProjectionPath(). Lazy access then
 * supplies the current representation, source details and compiled path directly.
 *
 * Diagnostic rendering
 * --------------------
 *
 * The parser also supplies PhysicalRecordDebugRenderer because it knows how its
 * physical bytes should be represented to a developer. Generic cursor and
 * projection code treats source contents as opaque bytes.
 */
export type Parser<
    TRepresentation,
    TParserConfig,
    TParserDetails,
    TRecordState,
    TProjectionPath
> =
    ProjectionSupport<TRepresentation,TParserDetails,TProjectionPath>
    & PhysicalRecordDebugRenderer
    & {

    /**
     * Prepare this parser for one physical source.
     *
     * prepare() is optional because many formats need no bootstrap record.
     *
     * When present, the bootstrap physical record is supplied here. The
     * parser may inspect available bytes and call readMore() as often as
     * necessary.
     *
     * Typical work includes:
     *
     *     - interpreting a header;
     *     - validating source-specific structure;
     *     - mapping physical fields to logical fields;
     *     - compiling parser configuration into hot-path runtime details.
     *
     * Before returning either prepared details or recoverable Errors for the
     * completed bootstrap record, firstRecord.endByte must describe its
     * exclusive physical end.
     *
     * The returned TParserDetails are retained and supplied to parse() and
     * ProjectionSupport for subsequent data records.
     */
    readonly prepare?: (
        firstRecord:
        ParserPhysicalRecordContent<TRecordState>,
        config:
        TParserConfig
    ) => Promise<
        ParserResult<TParserDetails>
    >;


    /**
     * Parse one physical data record.
     *
     * parse() owns physical recognition as well as interpretation of the
     * record.
     *
     * It may inspect bytes from record.startByte up to record.lastValidByte
     * and call record.readMore() whenever additional input is required.
     *
     * Parser-local scanning state remains ordinary local state across those
     * awaits.
     *
     * Parser-specific structural facts which must survive with the completed
     * physical record belong in record.recordState.
     *
     * Before returning either a representation or recoverable Errors for the
     * completed record, record.endByte must describe its exclusive physical
     * end.
     *
     * The returned representation may be materialised or may borrow from the
     * physical record. A borrowed representation remains valid only while
     * the corresponding PhysicalRecordContent remains open.
     */
    readonly parse: (
        record:
        ParserPhysicalRecordContent<TRecordState>,
        details:
        TParserDetails
    ) => Promise<
        ParserResult<TRepresentation>
    >;
};


/*
 * Parser associated-type extraction.
 *
 * These helpers keep higher-level generic code from having to repeat all five
 * Parser type parameters merely to recover one associated type.
 */
export type ParserRepresentation<TParser> =
    TParser extends Parser<
            infer Representation,
            infer _Config,
            infer _Details,
            infer _RecordState,
            infer _ProjectionPath
        >
        ? Representation
        : never;


export type ParserConfig<TParser> =
    TParser extends Parser<
            infer _Representation,
            infer Config,
            infer _Details,
            infer _RecordState,
            infer _ProjectionPath
        >
        ? Config
        : never;


export type ParserDetails<TParser> =
    TParser extends Parser<
            infer _Representation,
            infer _Config,
            infer Details,
            infer _RecordState,
            infer _ProjectionPath
        >
        ? Details
        : never;


export type ParserRecordState<TParser> =
    TParser extends Parser<
            infer _Representation,
            infer _Config,
            infer _Details,
            infer RecordState,
            infer _ProjectionPath
        >
        ? RecordState
        : never;


export type ParserProjectionPath<TParser> =
    TParser extends Parser<
            infer _Representation,
            infer _Config,
            infer _Details,
            infer _RecordState,
            infer ProjectionPath
        >
        ? ProjectionPath
        : never;
