# @cobol-ts/cursor-loader-types

Shared contracts and configuration types for the `@cobol-ts` cursor stack.

This package contains the interfaces shared by:

```text
@cobol-ts/cursor-file
@cobol-ts/cursor-record
@cobol-ts/cursor-loader
parser implementations
application configuration
```

It contains contracts rather than runtime file-reading or parsing implementations.

## Cursor architecture

```text
physical file
    ↓
pooled byte buffers
    ↓
physical records
    ↓
parser representation
    ↓
validation
    ↓
projection
    ↓
application values
```

The types in this package define the boundaries between those layers.

## Physical file types

The shared physical-file union currently contains:

```ts
type PhysicalFileDetails =
    | LineFile
    | FixedFile
    | LengthPrefixedFile;
```

### Line files

```ts
interface LineFile {
    readonly type:
        "line";

    readonly filename:
        string;
}
```

### Fixed-width files

```ts
interface FixedFile {
    readonly type:
        "fixed";

    readonly filename:
        string;

    readonly recordSize:
        number;
}
```

### Length-prefixed files

```ts
interface LengthPrefixedFile {
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
```

`recordLength()` returns the number of parser-visible payload bytes following the prefix.

The physical interpretation of a particular prefix format belongs in configuration rather than in the shared contract.

## Physical records

Physical record readers expose:

```ts
interface PhysicalRecordContent {
    readonly buffers:
        readonly Uint8Array[];

    readonly startOffset:
        number;

    readonly length:
        number;
}
```

The supplied buffers are treated as one logical contiguous byte sequence.

For example:

```text
buffers[0]:
    [prefix bytes]

buffers[1]:
    [prefix bytes][record data...]

buffers[2]:
    [...record data]
```

may describe a record with:

```ts
startOffset:
    4
```

`startOffset` is therefore a logical offset across all supplied buffers.

It is not necessarily an offset within `buffers[0]`.

`length` is the number of parser-visible record bytes beginning at `startOffset`.

The representation is deliberately zero-copy.

## Record lifetime

The buffers referenced by `PhysicalRecordContent` are owned by the corresponding `RecordCursor`.

A yielded physical record remains valid only until the cursor advances or closes.

Consumers must therefore complete:

```text
parse
    ↓
validation
    ↓
projection
```

before advancing the physical cursor.

Anything which needs to retain physical bytes after that point must copy or otherwise detach them.

## File byte cursors

Physical byte input is represented by:

```ts
type FileByteCursor =
    AsyncGenerator<
        Uint8Array,
        void,
        unknown
    >;
```

A byte-cursor factory has the form:

```ts
type FileByteCursorFactory = (
    filename: string,
    bufferPool: FileBufferPool
) => FileByteCursor;
```

The corresponding buffer pool contract is:

```ts
interface FileBufferPool {
    acquire(): Uint8Array;

    release(
        buffer: Uint8Array
    ): void;
}
```

These contracts allow the physical record layer to use the production file reader or an injected byte source in tests.

## Record readers

A physical record reader has the form:

```ts
type RecordReader<
    TDetails extends PhysicalFileDetails
> = (
    details: TDetails
) => RecordCursor;
```

A record cursor yields either:

```ts
PhysicalRecordContent
```

or recoverable physical validation errors.

Physical reader dispatch is represented by:

```ts
type RecordReaderMap = {
    [TDetails in PhysicalFileDetails as TDetails["type"]]:
    RecordReader<TDetails>;
};
```

This allows `@cobol-ts/cursor-loader` to dispatch by physical file type without depending on a hard-coded implementation.

## Record boundary detectors

`RecordBoundaryDetector` describes how physical framing maps onto parser-visible record data.

All offsets are logical offsets across the supplied buffers as though those buffers had been concatenated.

The important positions are:

```text
frameStart
    first byte of the current physical frame,
    including any prefix framing

searchStart
    first byte not already examined while searching
    for the end of the current frame

recordStart
    first parser-visible record-data byte

recordEnd
    inclusive final parser-visible record-data byte

nextRecordStart
    first byte of the following physical frame
```

For a fixed-width file:

```text
[record data][next record]
 ^           ^
 |           nextRecordStart
 frameStart
 recordStart
```

For a line file:

```text
[record data][CR][LF][next record]
 ^                     ^
 |                     nextRecordStart
 frameStart
 recordStart
```

For a length-prefixed file:

```text
[prefix][record data][next prefix]
 ^       ^            ^
 |       |            nextRecordStart
 |       recordStart
 frameStart
```

Searching detectors can use `searchStart` to avoid rescanning bytes already examined when a record spans multiple physical read buffers.

## Parsers

A parser converts one complete physical record into a parser-specific representation.

```ts
interface Parser<
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
```

`prepare()` is optional.

It is useful for formats where the first physical record determines how later records are interpreted.

CSV headers are the usual example.

## Validation

Recoverable physical or representation validation failures use:

```ts
type ValidationErrors =
    readonly string[];
```

The shared empty value is:

```ts
NO_VALIDATION_ERRORS
```

The general division of responsibility is:

```text
cursor-record
    physical framing validation

parser
    syntax / format validation

checkRepresentation
    semantic validation

cursor-loader
    source filename and line/record context
```

Recoverable data problems are returned or yielded as validation errors.

Operational failures and programming errors throw.

## Design intent

The contracts in this package preserve clear ownership between layers:

```text
cursor-file
    owns physical read buffers

cursor-record
    owns buffers while records refer to them

parser
    may expose ephemeral representations

cursor-loader
    completes projection before advancing the record cursor

application
    receives detached application values
```

The important invariant is that physical storage remains low-allocation and zero-copy while public application values do not depend on cursor-owned buffers.