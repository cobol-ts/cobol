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

## Physical records

Physical record readers expose:

```ts
interface PhysicalRecordContent {
    readonly buffers:
        readonly Uint8Array[];

    readonly firstBufferOffset:
        number;

    readonly length:
        number;
}
```

The representation is deliberately zero-copy.

The buffers are owned by the corresponding record cursor.

A physical record remains valid only until the cursor advances or closes.

## Record readers

A physical record reader has the form:

```ts
type RecordReader<
    TDetails extends PhysicalFileDetails
> = (
    details: TDetails
) => RecordCursor;
```

Physical reader dispatch is represented by `RecordReaderMap`.

This allows `@cobol-ts/cursor-loader` to depend on an injected physical reader rather than a hard-coded implementation.

## Record boundary detectors

`RecordBoundaryDetector` describes how a physical record boundary is located across a sequence of retained byte buffers.

Its important offsets are:

```text
recordStart
    first byte of the current record

searchStart
    first byte not already examined while searching
    for the boundary of the current record
```

This allows searching detectors to avoid rescanning old bytes when a physical record spans multiple buffers.

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