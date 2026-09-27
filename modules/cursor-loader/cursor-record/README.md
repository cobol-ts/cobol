# @cobol-ts/cursor-record

Physical record framing for the `@cobol-ts` cursor stack.

This package converts pooled byte buffers from `@cobol-ts/cursor-file` into complete physical records.

The current runtime readers support:

```text
line-oriented files
fixed-width files
```

The shared type system also defines length-prefixed files so that length-prefixed framing can be added without changing the loader contract.

## Position in the cursor stack

```text
physical file
    ↓
@cobol-ts/cursor-file
    ↓
pooled byte buffers
    ↓
@cobol-ts/cursor-record
    ↓
PhysicalRecordContent
    ↓
@cobol-ts/cursor-loader
```

## Responsibilities

`@cobol-ts/cursor-record` is responsible for:

- obtaining physical byte buffers;
- retaining buffers while a record spans them;
- detecting physical record boundaries;
- separating physical framing from parser-visible record data;
- yielding zero-copy `PhysicalRecordContent`;
- releasing fully consumed buffers back to the pool;
- reporting recoverable malformed physical framing.

It does not parse CSV, JSON, COBOL, or application data.

## Public API

The current public API includes:

```ts
createLineRecordReader()

createFixedRecordReader()

newlineRecordBoundaryDetector

createFixedWidthRecordBoundaryDetector()
```

## Physical records

A physical record is represented as:

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

The buffers are treated as one logical contiguous byte sequence.

`startOffset` identifies the first parser-visible record byte across that logical sequence.

It is not restricted to `buffers[0]`.

For example:

```text
buffers[0]:
    [framing]

buffers[1]:
    [framing][record data...]

buffers[2]:
    [...record data]
```

can legitimately yield:

```ts
{
    buffers,
    startOffset:
        4,
    length:
        20
}
```

The framing bytes remain present in the retained buffers but are outside the parser-visible record range.

This allows framing such as future length prefixes to be excluded without slicing or copying the physical buffers.

## Zero-copy representation

A record may span one or many physical buffers.

No record-sized byte array is created merely to frame the record.

Instead:

```text
buffers
+
startOffset
+
length
```

identify the parser-visible byte range.

Parsers may consume that range directly.

## Record lifetime

`PhysicalRecordContent` is owned by the `RecordCursor`.

A yielded physical record remains valid only until the record cursor advances or closes.

In other words:

```text
yield PhysicalRecordContent
    ↓
consumer parses / validates / projects
    ↓
consumer advances RecordCursor
    ↓
fully consumed buffers may return to the pool
```

Anything which needs to retain bytes after the cursor advances must copy or otherwise detach them.

## Reader dependencies

Both production readers accept optional physical-I/O dependencies:

```ts
interface RecordReaderOptions {
    readonly bufferPool?:
        FileBufferPool;

    readonly createFileByteCursor?:
        FileByteCursorFactory;
}
```

Production code can simply use the defaults:

```ts
const reader =
    createLineRecordReader();
```

Tests or specialised applications can inject dependencies:

```ts
const reader =
    createLineRecordReader(
        undefined,
        {
            bufferPool,
            createFileByteCursor
        }
    );
```

This keeps physical framing tests independent of the filesystem when appropriate.

## Line record reader

Create the default line reader with:

```ts
const reader =
    createLineRecordReader();
```

The default boundary detector recognises:

```text
LF

CR LF
```

Physical line terminators are excluded from the parser-visible record.

For example:

```text
physical bytes:

abc\r\n

parser-visible record:

abc
```

An unterminated final line is considered a valid final physical record.

An LF immediately following a CR excludes both bytes from the record.

## Fixed-width record reader

Create a fixed-width reader with:

```ts
const reader =
    createFixedRecordReader();
```

The record width comes from:

```ts
FixedFile.recordSize
```

Fixed-width records contain no framing bytes, so:

```text
frameStart
    ==
recordStart
```

If EOF is reached with bytes remaining which cannot form a complete record, the reader yields a recoverable physical validation error.

## Physical buffers and logical records are independent

Physical read-buffer boundaries have no relationship to record boundaries.

A line may fit entirely within one buffer:

```text
buffer:

one\ntwo\nthree\n
```

or span many:

```text
buffer 1:
    abcdefgh

buffer 2:
    ijklmnop

buffer 3:
    qrst\n
```

Fixed-width records behave the same way.

For example:

```text
physical buffers, size 4:

abcd
efgh
ijkl
mno
```

may represent:

```text
logical fixed-width records, size 5:

abcde
fghij
klmno
```

No record boundary consistently coincides with a physical read-buffer boundary.

## Record framing model

The generic framing code distinguishes four important offsets.

### `frameStart`

The first byte of the current physical frame.

This includes prefix framing where such framing exists.

### `recordStart`

The first parser-visible byte of the current record.

For current line and fixed-width readers:

```text
recordStart == frameStart
```

A length-prefixed reader can instead have:

```text
recordStart > frameStart
```

### `nextRecordStart`

The first byte of the next physical frame.

Everything before this position belongs to the completed frame and can be discarded once the consumer advances.

### `searchStart`

The first logical byte which a searching detector has not already examined.

This prevents terminator-based detectors from rescanning old data every time another physical buffer arrives.

## Boundary detector contract

Physical framing policy is represented by:

```ts
interface RecordBoundaryDetector {
    nextRecordStart(
        buffers: readonly Uint8Array[],
        frameStart: number,
        searchStart: number
    ): number;

    recordStart(
        frameStart: number
    ): number;

    recordEnd(
        buffers: readonly Uint8Array[],
        nextRecordStart: number
    ): number;
}
```

All offsets are logical offsets across the supplied buffers as though those buffers had been concatenated.

For example:

```text
buffers[0] = "abc\r"
buffers[1] = "\nXYZ"
```

is treated logically as:

```text
"abc\r\nXYZ"
```

The line detector therefore finds exactly the same boundary regardless of the physical buffer split.

## Incremental searching

A line detector searches for a terminator.

Suppose four-byte buffers arrive:

```text
buffer 1:
    abcd

buffer 2:
    efgh

buffer 3:
    ij\nX
```

The detector can search:

```text
first call:
    search from 0
    no boundary

second call:
    search from 4
    no boundary

third call:
    search from 8
    boundary found
```

Previously examined bytes do not need to be rescanned.

Fixed-width framing calculates its boundary directly and therefore ignores `searchStart`.

## Buffer release

Buffers are retained while the current record or a future record can still refer to them.

After a record has been consumed, the reader releases only complete buffers lying wholly before `nextRecordStart`.

It does not need to slice, copy, or aggressively rebase a partially consumed buffer.

This keeps the hot path simple and preserves zero-copy parser access.

## Error handling

Recoverable physical-format problems are yielded as validation errors.

Examples include:

- incomplete fixed-width record at EOF.

Invalid detector behaviour and operational failures throw.

Examples include a detector returning a boundary:

```text
before frameStart
beyond currently buffered bytes
with an invalid recordStart
with an invalid recordEnd
```

This keeps malformed input separate from programming errors and filesystem failures.

## Design goals

The physical record layer is designed for:

- zero-copy records;
- pooled storage;
- records larger than physical read buffers;
- arbitrary record/buffer boundary alignment;
- framing bytes excluded without copying;
- incremental boundary scanning;
- explicit buffer lifetime;
- dependency injection for testing;
- minimal allocation on the hot path.