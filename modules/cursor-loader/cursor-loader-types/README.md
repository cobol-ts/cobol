# `@cobol-ts/cursor-loader-types` — README.md

# @cobol-ts/cursor-loader-types

Shared types for the `@cobol-ts` cursor-loading system.

This package defines the contracts between:

- physical file readers;
- physical record framing;
- parsers;
- application projections;
- cursor configuration;
- loaded entity datasets.

It contains types and constants only. File I/O and parsing implementations live in the other cursor-loader packages.

## Architecture

The loader is deliberately split into layers:

```text
physical file
    ↓
byte buffers
    ↓
physical records
    ↓
parser representation
    ↓
validation
    ↓
application projection
```

The types in this package describe the boundaries between those layers.

## Physical files

Supported physical file descriptions are:

```ts
interface LineFile {
    readonly type: "line";
    readonly filename: string;
}

interface FixedFile {
    readonly type: "fixed";
    readonly filename: string;
    readonly recordSize: number;
}

interface LengthPrefixedFile {
    readonly type: "length-prefixed";
    readonly filename: string;
    readonly prefixSize: number;
    readonly recordLength:
        (prefix: Uint8Array) => number;
}
```

`PhysicalFileDetails` is the discriminated union of these types.

## Physical records

A physical reader yields `PhysicalRecordContent`:

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

A record may span several physical buffers.

The record is zero-copy: the buffers remain owned by the `RecordCursor`.

Consequently:

> `PhysicalRecordContent` remains valid only until its cursor is advanced or closed.

Anything which needs to retain record data beyond that point must copy or otherwise detach it.

## Record readers

A physical reader is selected according to the physical file type:

```ts
type RecordReader<
    TDetails extends PhysicalFileDetails
> = (
    details: TDetails
) => RecordCursor;
```

`RecordReaderMap` provides dispatch by the `type` discriminator:

```ts
{
    line: ...,
    fixed: ...,
    "length-prefixed": ...
}
```

Physical readers yield either:

- a complete `PhysicalRecordContent`; or
- `ValidationErrors` describing malformed physical input.

Operational failures such as file-system errors throw instead.

## Record boundary detectors

`RecordBoundaryDetector` separates framing policy from file reading.

A detector receives the currently retained byte buffers and determines where the next physical record begins.

The interface distinguishes:

- `recordStart`: where the current record begins;
- `searchStart`: where boundary searching should resume.

This permits long records to span many physical buffers without repeatedly rescanning bytes already examined.

The detector also converts a known next-record boundary into the inclusive end of the current record's data.

This allows framing bytes such as LF or CRLF to be excluded from the parser-visible record.

## Parsers

A parser converts one physical record into a parser-specific representation:

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

It is useful for formats such as CSV where the first physical record is a header which determines how subsequent records are interpreted.

The preparation record is not subsequently parsed as application data.

## File configuration

`FileDetails` combines:

- physical file description;
- parser selection;
- parser configuration;
- optional representation validation;
- application projection;
- entity identity;
- cardinality.

Application configuration is normally checked using `satisfies`:

```ts
const config = {
    customer: {
        type:
            "line",

        filename:
            "customers.csv",

        parser:
            "csv",

        parserConfig:
            customerCsvDetails,

        project:
            row => ({
                id:
                    row.integer(0),

                name:
                    row.string(1)
            }),

        entityId:
            customer =>
                customer.id,

        cardinality:
            "many"
    }
} satisfies CursorLoaderConfig<
    typeof parsers,
    number
>;
```

This preserves useful literal types while allowing TypeScript to verify that the parser, configuration, projection and result types agree.

## Validation

Recoverable data-validation failures use:

```ts
type ValidationErrors =
    readonly string[];
```

The shared empty value is:

```ts
NO_VALIDATION_ERRORS
```

The general division is:

- physical reader: framing errors;
- parser: syntax and format errors;
- representation check: semantic validation;
- operational/programming errors: throw.

## Cardinality

Supported source cardinalities are:

```ts
"one"
"optional"
"many"
```

The dataset types use these declarations to derive the resulting application-facing shape.
