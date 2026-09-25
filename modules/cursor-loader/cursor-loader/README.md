# @cobol-ts/cursor-loader

Parser, validation, and projection orchestration for the `@cobol-ts` cursor stack.

This package consumes physical records supplied by a `RecordReader` and turns them into application values.

It does not perform physical file I/O or physical record framing.

## Position in the cursor stack

```text
@cobol-ts/cursor-file
    ↓
physical byte buffers
    ↓
@cobol-ts/cursor-record
    ↓
PhysicalRecordContent
    ↓
@cobol-ts/cursor-loader
    ↓
parser representation
    ↓
application value
```

Parser implementations such as CSV and JSON are separate packages.

## Responsibilities

`@cobol-ts/cursor-loader` orchestrates:

```text
RecordReader
    ↓
PhysicalRecordContent
    ↓
Parser.prepare() if required
    ↓
Parser.parse()
    ↓
checkRepresentation() if configured
    ↓
project()
    ↓
application value
```

It also adds filename and physical line/record information to recoverable errors.

## File cursor

The main API is:

```ts
createFileCursor(
    details,
    options
)
```

The physical record reader is selected from the configured `RecordReaderMap`.

The loader itself does not contain a hard-coded switch over physical file types.

## Reader configuration

A typical reader map is assembled from `@cobol-ts/cursor-record`:

```ts
import {
    createFileCursor
} from "@cobol-ts/cursor-loader";

import {
    createFixedRecordReader,
    createLineRecordReader
} from "@cobol-ts/cursor-record";


const recordReaders = {
    line:
        createLineRecordReader(),

    fixed:
        createFixedRecordReader(),

    "length-prefixed":
        lengthPrefixedReader
};
```

The loader depends on the `RecordReader` contract rather than a particular physical implementation.

## Parser registry

Parsers are supplied through `CursorOptions`.

For example:

```ts
const parsers = {
    csv:
        csvParser,

    json:
        jsonParser
};
```

A file configuration selects one parser by name.

## Parser preparation

A parser may provide:

```ts
prepare()
```

Preparation consumes the first physical record and produces parser-specific prepared details used by subsequent records.

CSV headers are the principal example.

The preparation record is not subsequently projected as application data.

If preparation fails, the cursor stops because later records cannot safely be interpreted.

## Parsing

Every subsequent physical record is passed to:

```ts
parser.parse(
    record,
    parserDetails
)
```

The parser returns either:

- a parser-specific representation;
- recoverable `Errors`.

A parser failure affects only that physical record unless it occurred during preparation.

## Representation validation

A file configuration may provide:

```ts
checkRepresentation
```

This performs application-specific validation after parsing but before projection.

Validation errors are yielded as recoverable errors and processing continues with the next physical record.

## Projection

Projection turns the parser representation into an application value:

```ts
project(
    representation
)
```

Projection happens while the physical record is still current.

This is important because both `PhysicalRecordContent` and parser representations may refer directly to pooled or reusable storage.

The ordering is therefore:

```text
physical record current
    ↓
parse
    ↓
validate
    ↓
project
    ↓
yield application value
    ↓
advance physical cursor
```

Application values which survive beyond the current record must be detached from ephemeral parser state.

## Error handling

Recoverable input problems are yielded as `Errors`.

Examples include:

- malformed physical records;
- parser syntax errors;
- representation validation failures.

The loader adds source context.

For line files:

```text
customers.csv: line 3: ...
```

For fixed-width and other record-oriented files:

```text
accounts.dat: record 3: ...
```

Operational failures and programming errors throw.

## Package boundaries

Physical byte I/O belongs to:

```text
@cobol-ts/cursor-file
```

Physical record framing belongs to:

```text
@cobol-ts/cursor-record
```

Logical parsing belongs to parser packages such as:

```text
@cobol-ts/cursor-loader-csv
@cobol-ts/cursor-loader-json
```

`@cobol-ts/cursor-loader` connects those layers and orchestrates the lifecycle of each record.