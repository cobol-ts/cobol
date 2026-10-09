# @cobol-ts/cursor-loader-types

SShared contracts for the byte-backed cursor pipeline.

This package defines the ownership, lifetime, parser and projection interfaces used by the cursor implementation. It contains almost no processing logic of its own.

The framework has two primary goals.

The first is to **avoid premature materialisation**. Source bytes remain authoritative for as long as possible, allowing parsers and projections to interpret the same physical record in the form appropriate to the calculation being performed. The ingestion layer does not need to construct one complete domain representation before processing can begin.

The second is **performance**. By keeping data byte-backed and materialising values only when they are actually requested, the framework aims to minimise the amount of memory allocated, populated, copied, traversed and eventually collected while processing very large files.

The working performance hypothesis is that, once application processing becomes sufficiently cheap, memory traffic becomes a dominant constraint on throughput. Reducing unnecessary representation and memory movement should therefore increase throughput as well as reduce garbage-collection work.

These goals reinforce each other: preserving the physical representation avoids committing too early to one interpretation, while also making it possible to avoid creating values the calculation never uses.
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
Parser.parse()
    ├── starts at record.startByte
    ├── scans the physical record
    ├── calls await record.readMore() when required
    ├── populates record.recordState where useful
    └── establishes record.endByte
    ↓
RecordCursorResult<TRepresentation, TRecordState>
    ↓
ProjectionFactory
    ↓
reusable lazy application projection
    ↓
FileCursorResult
```

There is deliberately no mandatory record-boundary layer between the byte cursor and the parser.

The parser owns recognition of the physical records it understands.

A simple parser may use a `RecordBoundaryDetector` internally if that is useful, but the generic cursor architecture does not require one.

This is important for formats such as CSV, where identifying the end of the record and understanding its structure require substantially the same grammatical scan.

## Physical records

A physical record is a pooled object containing:

- references to the physical source buffers required by this logical record;
- scalar positions describing the record;
- parser-specific state associated with those bytes;
- the ability to request more physical source data;
- explicit lifetime management.

Conceptually:

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

The actual implementation exposes narrower capability interfaces to different layers so that each layer sees only the operations it requires.

## Logical byte positions

The physical buffers belonging to a record are treated as one contiguous logical byte sequence.

```text
buffer 0             buffer 1             buffer 2
[.................]  [.................]  [.................]
0                                                    → logical byte offset
```

Three positions are particularly important.

### `startByte`

Inclusive beginning of the current physical record.

The record cursor establishes `startByte` before invoking the parser.

### `endByte`

Exclusive end of the current physical record.

The parser establishes `endByte` after recognizing the record.

### `lastValidByte`

Exclusive end of source bytes which have actually been read and are currently available to the parser.

`Uint8Array.length` describes buffer capacity.

`lastValidByte` describes valid source content.

That distinction matters for the final pooled physical buffer, which may be only partly filled.

`endByte` may also be less than `lastValidByte`.

A single physical read may contain:

```text
record A | record B | part of record C
```

The parser only claims the range belonging to the current record.

## Ownership of the positions

The ownership rule is:

```text
cursor       establishes startByte
readMore()   advances lastValidByte and discovers EOF
parser       establishes endByte
```

The generic cursor does not know whether a record is:

- a JSON line;
- a quoted CSV row;
- a fixed-length COBOL record;
- an RDW-prefixed variable record;
- or another format entirely.

That knowledge belongs to the parser.

## Reading more data

The cursor establishes `record.startByte` before invoking the parser.

The parser is responsible for finding the end of the physical record and setting:

```ts
record.endByte
```

to the exclusive byte position immediately after that record.

If the currently available bytes are insufficient to determine the record boundary, the parser may request more source data:

```ts
await record.readMore();
```

`readMore()`:

- acquires one pooled `Uint8Array`;
- fills that exact buffer;
- appends that exact object to `record.buffers`;
- advances `lastValidByte` by the number of source bytes read;
- sets `fileFinished` when EOF is discovered.

`readMore()` does not change either `startByte` or `endByte`.

It only extends the range of source bytes available to the parser.

The parser remains inside the same `prepare()` or `parse()` invocation across the `await`. Ordinary local variables therefore remain its scanning state.

There is no need to return a `need-more-data` result, create an explicit continuation object, or reconstruct the parser's state when another physical buffer becomes available.

A parser must establish `endByte` before returning a completed physical record, including a structurally complete record that produces a recoverable parsing error.

The implementation deliberately accepts the asynchronous machinery inherent in the parser/cursor API. Performance work should be guided by measurement rather than assumptions about exactly which Promise operations V8 allocates or optimises.

## Parser-owned record state

`recordState` is defined by the parser but has the lifetime of the pooled physical-record object.

For example, a future CSV parser may use:

```ts
interface CsvRecordState {
    starts: Int32Array;
    ends: Int32Array;
    flags: Uint8Array;
}
```

Those arrays can be created when the pooled physical-record holder is created and then overwritten for each lease.

They do not need to be allocated for every CSV row.

The generic cursor machinery deliberately does not interpret the contents of `recordState`.

The important invariant is:

> While a physical record is live, its source bytes and the record-specific structural information describing those bytes remain live together.

## Parser contract

A parser has four associated types:

```ts
Parser<
    TRepresentation,
    TParserConfig,
    TParserDetails,
    TRecordState
>
```

### `TRepresentation`

The parser-specific representation exposed for one record.

This may be:

- an eagerly materialised JavaScript object, as in the current JSON parser;
- a borrowed CSV row representation;
- a borrowed COBOL representation;
- or another parser-specific view.

### `TParserConfig`

Configuration supplied for the parser/source.

### `TParserDetails`

Information prepared once for the opened source and reused across records.

This should represent opened-source facts, not whichever record happened to be parsed most recently.

### `TRecordState`

Mutable structural state associated with one pooled physical record.

## `prepare()` and `parse()`

The parser contract supports a preparation stage for formats that require one:

```ts
prepare(...)
```

For example, a header-based CSV implementation may need to inspect the header before it can establish the final physical-to-logical column mapping or size its steady-state record structures.

Preparation orchestration is not performed by `createRecordCursor()` itself.

The record cursor receives the already-established parser details used for normal record processing.

The current JSONL path requires no meaningful preparation.

The hot-path parser operation is:

```ts
parse(
    record,
    details
): Promise<ParserResult<TRepresentation>>
```

The parser is responsible for recognizing its physical record and establishing `record.endByte`.

## Parser results and errors

A parser returns either its representation or recoverable `Errors`:

```ts
type ParserResult<T> =
    T | Errors;
```

Recoverable bad source data is represented as `Errors`.

Operational failures and programming errors may throw.

A recoverable parser error still corresponds to a physical record. The parser must therefore establish that record's `endByte` before returning the error so that the cursor can advance correctly.

## Projection support

A parser also implements:

```ts
ProjectionSupport<TRepresentation>
```

with typed operations such as:

```ts
integer(representation, path): number
float(representation, path): number
character(representation, path): string
string(representation, path): string
```

The generic projection layer does **not** interpret the physical record directly to obtain a value.

Its route is:

```text
projection accessor
    ↓
ProjectionSupport operation
    ↓
parser-specific representation
    ↓
parser-specific byte/state interpretation
```

A future CSV or COBOL representation can therefore remain a borrowed view over the underlying physical record and its structural state without exposing that machinery to the projection package.

The projection supplies an already-tokenised logical path such as:

```ts
[
    "customer",
    "age"
]
```

The parser decides what that path means.

For example:

```text
JSON
    object/property traversal

CSV
    logical column lookup

COBOL
    compiled layout lookup
```

## Reusable projections

`ProjectionFactory<TProjection, TRepresentation>` defines a reusable application-facing view.

Conceptually:

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

`create()` may allocate the projection object and its accessor functions.

`bind()` and `clear()` rebind that existing object to different records.

The projection object itself does not contain copied source values.

Its accessors delegate to the parser's `ProjectionSupport`.

## Projection lifetime

A bound projection is borrowed.

It is valid only for the lifetime of the `FileCursorResult` which owns the underlying physical record.

Once that result is closed, the projection reference must not be used again.

The projection object is pooled and may later be rebound to a completely different source record.

The framework deliberately does not add generation checks to every accessor call to make stale references safe. Doing so would add work to the hot path and undermine the borrowed-value model.

## Projection-visible physical record

The projection layer receives a narrow physical-record capability for lifetime and diagnostic purposes.

Conceptually:

```ts
interface ProjectionPhysicalRecord {
    readonly buffers:
        readonly Uint8Array[];

    readonly startByte:
        number;

    readonly endByte:
        number;

    readonly lastValidByte:
        number;

    readonly source:
        string;

    readonly recordNumber:
        number;
}
```

It does not receive:

- `readMore()`;
- pool management;
- cursor mutation;
- parser-owned record-state operations.

The runtime object may still be the same physical-record object. The narrower interface is a capability boundary, not another wrapper allocation.

## Diagnostic rendering

Each parser supplies a `PhysicalRecordDebugRenderer`.

Conceptually:

```ts
toDebugString(
    record,
    startByte,
    endByte
): string;
```

The parser knows whether its source representation is:

- UTF-8 text;
- EBCDIC;
- binary packed decimal;
- or something else.

Generic projection and cursor code should not need to know.

Diagnostic rendering is therefore format-specific and is expected primarily on error paths.

## Performance model

The architecture is aimed at reducing total memory consumption and memory traffic rather than merely reducing visible garbage-collection pauses.

The intended steady state reuses:

```text
physical buffers
physical-record holders
parser record state
projection wrappers
projection accessor functions
```

Memory usage should therefore be proportional primarily to:

```text
maximum simultaneously live records
+
physical buffers required by those records
+
bounded parser/projection state
```

rather than to the number of records processed.

This assumes callers respect the explicit lifetime and close completed results. If callers deliberately retain many live results, the pools correctly grow to support those simultaneously live records.

The central optimisation principle is:

> Do not allocate, populate, copy or traverse a representation for a value the calculation never needs.

JSONL cannot demonstrate the full benefit because `JSON.parse()` eagerly creates a JavaScript representation of the entire record.

Its purpose is primarily to validate the surrounding machinery.

CSV and COBOL are expected to exploit the byte-backed model much more aggressively.



# `cursor-file/README.md`

