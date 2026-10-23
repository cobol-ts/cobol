# @cobol-ts/cursor-loader-types

Shared contracts for the byte-backed cursor pipeline.

This package defines the ownership, lifetime, parser, projection and parser-registry interfaces used by the cursor implementation. It contains almost no processing logic of its own.

The framework has two primary goals:

- avoid premature materialisation;
- reduce allocation, copying, traversal and garbage-collection pressure while processing large files.

Source bytes remain authoritative for as long as possible. Parsers may return either materialised values or borrowed representations over those bytes, and projections materialise only the values an application actually requests.

## Current architecture

```text
physical source
    ↓
FillFileBuffer
    ↓
pooled Uint8Array buffers
    ↓
pooled PhysicalRecordContent<TRecordState>
    ↓
Parser.prepare()          optional bootstrap record
    ↓
opened-source details + optional PhysicalRecordContext
    ↓
Parser.parse()
    ├── starts at record.startByte
    ├── scans the physical record
    ├── calls await record.readMore() when required
    ├── populates record.recordState where useful
    └── establishes record.endByte
    ↓
RecordCursorResult<TRepresentation,TRecordState>
    ↓
ProjectionFactory
    ↓
reusable lazy application projection
    ↓
FileCursorResult
```

There is deliberately no mandatory record-boundary layer between physical byte input and the parser. The parser owns recognition of the record format it understands.

That matters for formats such as CSV, where record recognition and structural parsing are the same grammatical scan.

## Physical records

A completed physical record conceptually contains:

```ts
PhysicalRecordContent<TRecordState> = {
    buffers: readonly Uint8Array[];
    recordState: TRecordState;

    startByte: number;
    endByte: number;
    lastValidByte: number;
    fileFinished: boolean;

    source: string;
    recordNumber: number;

    close(): void;
};
```

The implementation exposes narrower capability interfaces to different layers. The parser, projection layer and lifetime code therefore see different TypeScript views of the same pooled JavaScript object.

## Logical byte positions

The buffers belonging to a record are treated as one contiguous logical byte sequence.

Three positions are particularly important.

### `startByte`

Inclusive logical beginning of the current physical record.

The record cursor establishes `startByte` before invoking the parser.

### `endByte`

Exclusive logical end of the completed current physical record.

The parser establishes `endByte` after recognizing the record.

### `lastValidByte`

Exclusive logical end of source bytes which have actually been read and are currently available.

`Uint8Array.length` is buffer capacity. `lastValidByte` is valid source content.

The distinction matters for the final pooled buffer, which may be only partly filled.

`endByte` may also be less than `lastValidByte` when a physical read already contains bytes belonging to later records.

## Ownership of physical positions

The ownership rule is:

```text
cursor       establishes startByte
readMore()   advances lastValidByte and discovers fileFinished
parser       establishes endByte
```

The generic cursor does not know whether a record is JSONL, quoted CSV, fixed-width COBOL, RDW-prefixed data or another format.

That knowledge belongs to the parser.

## Reading more data

If the currently available bytes are insufficient, the parser may call:

```ts
await record.readMore();
```

`readMore()`:

- acquires one pooled `Uint8Array`;
- fills that exact buffer;
- appends that exact object to `record.buffers`;
- advances `lastValidByte` by the number of source bytes actually read;
- sets `fileFinished` when EOF is discovered.

It does not change `startByte` or `endByte`.

The parser remains inside the same `prepare()` or `parse()` invocation across the `await`, so ordinary local variables remain its scanning state. There is no `need-more-data` result or explicit continuation object.

A parser must establish `endByte` before returning a completed physical record, including a complete record which produces recoverable `Errors`.

## Parser-owned record state

`recordState` is defined by the parser but has the lifetime of the pooled physical-record object.

The current CSV parser uses:

```ts
interface CsvRecordState {
    starts: Int32Array;
    ends: Int32Array;
    fieldCount: number;
}
```

The arrays are retained on the pooled physical-record holder and reused when that holder is leased again. Generic cursor machinery deliberately does not interpret their contents. A parser registration can supply `cleanRecordState`, called by the physical-record pool on final release to invalidate lease-specific state while retaining capacity.

The invariant is:

> While a physical record is live, its source bytes and the parser-specific structural information describing those bytes remain live together.

## Parser contract

A parser has five associated types:

```ts
Parser<
    TRepresentation,
    TParserConfig,
    TParserDetails,
    TRecordState,
    TProjectionPath
>
```

### `TRepresentation`

The successfully parsed representation exposed for one data record.

This may be eagerly materialised, as JSON currently is, or borrowed and byte-backed, as CSV currently is.

### `TParserConfig`

Static source-specific configuration supplied when the source is opened.

### `TParserDetails`

Opened-source details established once and reused across data records.

For CSV this includes the header-derived column map, column count, separator and quote byte.

### `TRecordState`

Parser-specific state attached to one pooled physical-record holder.

### `TProjectionPath`

The parser-specific compiled runtime form of a canonical projection path.

For example:

```text
JSON    readonly string[] → readonly string[]
CSV     ["age"]           → numeric column index
COBOL   string path       → compiled layout information
```

## `prepare()` and `parse()`

`prepare()` is optional.

A parser with a bootstrap record, such as header-based CSV, may expose:

```ts
prepare(
    firstRecord,
    config
): Promise<ParserResult<TParserDetails>>
```

`@cobol-ts/cursor-record` provides `openRecordCursor()` to orchestrate this preparation. It consumes the bootstrap record through the same cursor state later used for data records, so bytes read beyond the header can be carried forward without copying or rereading.

After preparation, only the returned `TParserDetails` and a thin optional `PhysicalRecordContext` are retained. The bootstrap physical record itself is closed.

The low-level `createRecordCursor()` entry point remains available when parser details are already known.

Normal data processing uses:

```ts
parse(
    record,
    details
): Promise<ParserResult<TRepresentation>>
```

The parser owns both physical record recognition and interpretation.

## Parser results and errors

A parser returns either its representation or recoverable `Errors`:

```ts
type ParserResult<T> =
    T | Errors;
```

Recoverable bad source data is represented as `Errors` where the parser chooses that policy. Operational failures, setup failures and exceptional syntax/configuration failures may throw.

A recoverable parser error still corresponds to a completed physical record, so the parser must establish `endByte` before returning it.

Preparation `Errors` are setup failures at the `openRecordCursor()` boundary and are converted to `ErrorsException` rather than entering the row-error policy.

## Projection support

Every parser also supplies:

```ts
ProjectionSupport<
    TRepresentation,
    TParserDetails,
    TProjectionPath
>
```

Projection setup first compiles each canonical string path once:

```ts
compileProjectionPath(
    details,
    context,
    path
): TProjectionPath
```

`context` is the thin `PhysicalRecordContext` of the preparation record when one exists. It is available only for setup diagnostics and may be `undefined` for parsers such as JSON which require no preparation record.

Runtime typed access uses the already-compiled path:

```ts
integer(representation,details,path): number
float(representation,details,path): number
character(representation,details,path): string
string(representation,details,path): string
```

The generic projection layer does not decode parser-specific bytes itself.

Its route is:

```text
application accessor
    ↓
generic projection
    ↓
parser ProjectionSupport
    ↓
parser representation + opened-source details + compiled path
    ↓
parser-specific interpretation
```

## Reusable projections

`ProjectionFactory<TProjection,TRepresentation>` exposes:

```ts
create(): TProjection;

bind(
    projection,
    representation,
    physicalRecord
): void;

clear(
    projection
): void;
```

`create()` constructs one reusable projection object. `bind()` and `clear()` change only its lease-specific bindings.

Projection accessor functions are created once per projection factory and shared by the reusable projection objects produced by that factory.

The projection object contains no copied source values.

## Projection lifetime

A bound projection is borrowed.

It is valid only for the lifetime of the `FileCursorResult` which owns the underlying physical record. Once that result is closed, the projection reference must not be used again.

The same pooled projection object may later be rebound to a different source record. The framework intentionally does not add generation checks to every accessor call.

## Projection-visible physical record

The projection layer receives a narrow physical capability:

```ts
interface ProjectionPhysicalRecord {
    readonly buffers: readonly Uint8Array[];
    readonly startByte: number;
    readonly endByte: number;
    readonly lastValidByte: number;
    readonly source: string;
    readonly recordNumber: number;
    readonly recordState?: unknown;
}
```

It does not receive `readMore()`, lifetime operations or pool internals. Its optional `recordState` is deliberately typed as `unknown`: the generic interface does not interpret parser state, but a parser-specific adapter or the generic projection cache may narrow this opaque capability for reuse.

The runtime object may still be the same physical-record object. The narrower interface is a type-level capability boundary rather than another wrapper allocation.

## Diagnostic rendering

Each parser supplies a `PhysicalRecordDebugRenderer`:

```ts
toDebugString(
    record,
    startByte,
    endByte
): string;
```

This allows generic projection errors to add physical provenance and source rendering without assuming UTF-8, EBCDIC, binary or any other representation.

Runtime projection failures are enriched with:

- source;
- one-based record number;
- compiled projection declaration path and (when available) the full indexed application access path;
- parser-specific reason, including the offending controller when relevant;
- parser-specific rendering of the current physical record.

The application index chain is assembled on the error path, not per successful scalar read.

Setup-time path-compilation failures instead use the optional preparation context supplied to `compileProjectionPath()`.

## Parser registry

`ParserRegistry<TFileType>` maps runtime file-type names to parser registrations containing:

```ts
parser
parserConfig(definition)
createRecordState()
cleanRecordState?(state)
```

Each registration defines how a file definition supplies parser configuration and how pooled per-record state is created.

The current registry implementation deliberately erases parser-family generics at the runtime lookup boundary through `AnyParser`. Strong parser association is recovered inside the registered entry before common cursor orchestration begins.

## Performance model

The intended steady state reuses:

```text
physical buffers
physical-record holders
parser record state
projection wrappers
projection accessor functions
```

Memory usage should therefore be related primarily to simultaneously live work rather than the total number of records processed.

The central optimisation principle is:

> Do not allocate, populate, copy or traverse a representation for a value the calculation never needs.

JSONL cannot demonstrate the full benefit because `JSON.parse()` eagerly creates the complete JavaScript value. CSV already exploits the byte-backed model by recording field byte ranges and decoding only projected fields.

## Recursive projection members

`ProjectionDefinition<T>` supports scalar methods, readonly nested object
properties (`type: "object"`) and readonly `ProjectedArray<Element>` properties
(`type: "array"`). Nested definitions use paths relative to the containing
selection; they compile once via parser-specific `compileProjectionPath()`.
The structural capabilities `ProjectionSupport.object` and `.array` are optional
so existing flat CSV and scalar COBOL adapters are unaffected.

`ProjectionRecordState` defines `projectionViews`, retained on each pooled
physical-record holder. `ProjectionPhysicalRecord.recordState` is exposed only as
`unknown` to preserve the format-specific type boundary.

## Rebindable parser selections

`ProjectionSupport.object(parent, details, path, reusable?)` and `.array(parent, details, path, reusable?)` may receive an existing selection or array provider retained by the generic projection framework. `ProjectedArraySource.element(index, reusable?)` similarly accepts a previously used element selection. Implementations may ignore the optional reuse parameter, but COBOL updates existing selection objects and occurrence-index arrays rather than making per-lease replacements. Borrowed selections are independent while live, and must be cleared before their physical holder is recycled.

`ParserRegistryEntry.cleanRecordState` is optional for formats with no lease-specific cached geometry, but **required** for correct pooled COBOL ODO positioning when using `createCobolRecordState`.
