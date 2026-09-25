# @cobol-ts/cursor-loader

Physical file reading and record-oriented cursor loading for `@cobol-ts`.

This package supplies the runtime pipeline which turns files into parser input.

It deliberately knows very little about CSV, JSON, COBOL or other logical formats. Those concerns belong to parser packages.

## Data flow

The production path is:

```text
file
    ↓
createFileByteCursor()
    ↓
pooled Uint8Array buffers
    ↓
RecordBoundaryDetector
    ↓
RecordCursor
    ↓
PhysicalRecordContent
    ↓
createFileCursor()
    ↓
configured parser
    ↓
validation
    ↓
application projection
```

## File byte cursor

`createFileByteCursor()` reads a file into pooled byte buffers.

```ts
const cursor =
    createFileByteCursor(
        filename,
        pool
    );
```

The byte cursor:

- uses real Node file I/O;
- fills each non-final buffer before yielding it;
- handles short `FileHandle.read()` results;
- yields the final partial buffer as a shorter `Uint8Array` view;
- transfers ownership of yielded buffers to its consumer;
- closes the file when complete or closed early.

It has no knowledge of records or file formats.

## Buffer pool

Create a reusable pool with:

```ts
const pool =
    createFileBufferPool();
```

or specify a buffer size:

```ts
const pool =
    createFileBufferPool(
        4096
    );
```

The pool grows to the maximum number of buffers required concurrently and then reuses them.

This matters when a physical record spans several reads: all buffers containing the current record must remain alive until that record has been consumed.

## Physical record readers

### Line files

```ts
const reader =
    createLineRecordReader();
```

The default line reader recognises:

- LF;
- CRLF.

The terminator is excluded from `PhysicalRecordContent`.

An unterminated final line is accepted as a valid final record.

### Fixed-width files

```ts
const reader =
    createFixedRecordReader();
```

The record size comes from `FixedFile.recordSize`.

Fixed-width records have no framing bytes.

If EOF leaves bytes which do not form a complete record, the reader yields a physical validation error.

## Boundary detectors

The package supplies:

```ts
newlineRecordBoundaryDetector
```

and:

```ts
createFixedWidthRecordBoundaryDetector(
    recordSize
)
```

Boundary detectors operate on logical offsets across one or more retained physical byte buffers.

For searching formats, `searchStart` allows scanning to resume where the previous attempt stopped, so a long physical record is not repeatedly rescanned as additional file buffers arrive.

## Zero-copy record lifetime

`PhysicalRecordContent` references buffers owned by the physical cursor.

This is intentional.

```text
yield record
    ↓
consumer parses/checks/projects
    ↓
consumer advances cursor
    ↓
fully consumed buffers may return to pool
```

The record must therefore be consumed before the physical cursor advances.

`createFileCursor()` preserves this invariant: parsing, representation validation and projection all complete while the physical record remains current.

## File cursor

`createFileCursor()` combines a configured physical reader and parser.

```ts
const cursor =
    createFileCursor(
        details,
        options
    );
```

For every physical record it:

1. applies parser preparation if required;
2. parses the physical record;
3. performs optional representation validation;
4. projects the parser representation into the application value;
5. yields either the projected value or an `Errors` value.

Parser preparation consumes the first physical record. CSV headers are the principal example.

## Error handling

Recoverable input problems flow through the cursor as errors.

Examples include:

- incomplete fixed-width record;
- malformed CSV;
- failed representation validation.

`createFileCursor()` adds physical source context:

```text
customers.csv: line 3: ...
```

for line files, or:

```text
accounts.dat: record 3: ...
```

for other physical file types.

Operational and programming errors throw rather than being converted into data errors.

## Reader map

Physical dispatch is injected through `CursorOptions`:

```ts
const recordReaders = {
    line:
        createLineRecordReader(),

    fixed:
        createFixedRecordReader(),

    "length-prefixed":
        lengthPrefixedReader
};
```

The loader does not contain a hard-coded physical-file switch.

This makes physical readers independently replaceable and testable.

## Example

```ts
const options = {
    parsers,

    recordReaders: {
        line:
            createLineRecordReader(),

        fixed:
            createFixedRecordReader(),

        "length-prefixed":
            lengthPrefixedReader
    },

    compareEntityId: (
        left,
        right
    ) =>
        left - right
};

for await (
    const result
    of createFileCursor(
        customerDetails,
        options
    )
) {
    // result is either the projected application value
    // or Errors describing recoverable input failure.
}
```

## Design goals

The physical path is designed for:

- bounded allocation;
- buffer reuse;
- zero-copy parser access where practical;
- records larger than a physical read buffer;
- record boundaries unrelated to physical read boundaries;
- explicit ownership and lifetime rules;
- useful diagnostics at the layer which has the relevant context.

