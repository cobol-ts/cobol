# @cobol-ts/cursor-record

Physical record framing for the `@cobol-ts` cursor stack.

This package converts pooled byte buffers from `@cobol-ts/cursor-file` into complete physical records.

The current runtime readers support:

```text
line-oriented files
fixed-width files
length-prefixed files
```

Length-prefixed records support variable-length physical record formats such as COBOL files using a Record Descriptor Word (RDW).

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

createLengthPrefixedRecordReader()

newlineRecordBoundaryDetector

createFixedWidthRecordBoundaryDetector()

createLengthPrefixedRecordBoundaryDetector()
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

This allows framing such as length prefixes to be excluded without slicing or copying the physical buffers.

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

For length-prefixed records, the small prefix may be copied into reusable scratch storage so that its length can be decoded.

The record payload itself remains zero-copy.

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

Production record readers accept optional physical-I/O dependencies:

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

## Length-prefixed record reader

Create a length-prefixed reader with:

```ts
const reader =
    createLengthPrefixedRecordReader();
```

The prefix configuration comes from:

```ts
LengthPrefixedFile.prefixSize

LengthPrefixedFile.recordLength
```

The physical layout is:

```text
[prefix][record data][next prefix]
 ^       ^            ^
 |       |            nextRecordStart
 |       recordStart
 frameStart
```

The prefix is physical framing.

It is not part of the parser-visible record.

The reader creates a `createLengthPrefixedRecordBoundaryDetector()` from the file configuration and uses the same generic physical-record machinery as line and fixed-width readers.

If EOF occurs before a complete prefix or the complete declared payload has arrived, the reader yields a recoverable incomplete physical-record error.

## Length-prefixed boundary detection

The detector is created with:

```ts
const detector =
    createLengthPrefixedRecordBoundaryDetector(
        prefixSize,
        recordLength
    );
```

For a four-byte prefix and a six-byte payload:

```text
[p p p p][a b c d e f][next prefix]
 ^        ^            ^
 |        |            nextRecordStart
 |        recordStart
 frameStart
```

the offsets are:

```text
recordStart
    =
frameStart + 4

nextRecordStart
    =
frameStart + 4 + 6

recordEnd
    =
nextRecordStart - 1
```

### Prefix size

`prefixSize` is the number of physical framing bytes which precede each record.

It must be a positive integer.

### Record length function

The supplied function has the form:

```ts
recordLength: (
    prefix: Uint8Array
) => number
```

It receives exactly `prefixSize` bytes.

It returns the number of parser-visible record bytes following the prefix.

The returned length therefore excludes the prefix itself.

For example, a conventional four-byte COBOL RDW stores the total physical frame length, including the four-byte RDW.

A corresponding decoder can be:

```ts
const recordLength = (
    prefix:
        Uint8Array
): number =>
    (
        (
            prefix[
                0
            ]
            << 8
        )
        | prefix[
            1
        ]
    )
    - 4;
```

If the RDW begins:

```text
00 0E 00 00
```

then the physical frame contains fourteen bytes:

```text
4 byte RDW
+
10 byte record
```

and:

```ts
recordLength(
    prefix
)
```

returns:

```text
10
```

The parser therefore sees only the ten record-data bytes.

### Prefixes may span physical buffers

The prefix is not required to fit in one physical read buffer.

For example:

```text
buffer 0:
    [first half of prefix]

buffer 1:
    [rest of prefix][record data...]

buffer 2:
    [...record data][next prefix...]
```

is valid.

The detector treats the buffers as one logical byte sequence and reconstructs only the small prefix required to determine the record length.

The payload itself remains zero-copy.

### Incomplete length-prefixed records

If the complete prefix has not yet arrived, the detector reports that no complete record boundary is currently available.

If the prefix is complete but the declared payload has not yet arrived, it likewise waits for further physical buffers.

If EOF occurs before the frame is complete, the reader reports an incomplete physical record.

The decoded record length must be a non-negative integer.

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

Length-prefixed records are equally independent of physical buffer boundaries.

A prefix may begin in one buffer and end in another, and the record payload may span any number of following buffers.

No logical record boundary is required to coincide with a physical read-buffer boundary.

## Record framing model

The generic framing code distinguishes four important offsets.

### `frameStart`

The first byte of the current physical frame.

This includes prefix framing where such framing exists.

For a length-prefixed record:

```text
frameStart
    ↓
[prefix][record data]
```

### `recordStart`

The first parser-visible byte of the current record.

For line and fixed-width readers:

```text
recordStart == frameStart
```

For a length-prefixed reader:

```text
recordStart
    =
frameStart + prefixSize
```

so:

```text
frameStart
    ↓
[prefix][record data]
         ↑
         recordStart
```

### `nextRecordStart`

The first byte of the next physical frame.

Everything before this position belongs to the completed frame and can be discarded once the consumer advances.

For a length-prefixed record:

```text
[prefix][record data][next prefix]
                       ↑
                       nextRecordStart
```

### `searchStart`

The first logical byte which a searching detector has not already examined.

This prevents terminator-based detectors from rescanning old data every time another physical buffer arrives.

Line framing uses this because finding a newline requires searching.

Fixed-width and length-prefixed framing calculate their boundaries from known lengths and therefore do not need to scan record data for a terminator.

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

The same rule allows a length prefix to cross physical buffer boundaries.

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

Length-prefixed framing reads its prefix and calculates its boundary from the decoded payload length, so it also does not scan through record data searching for an end marker.

## Buffer release

Buffers are retained while the current record or a future record can still refer to them.

After a record has been consumed, the reader releases only complete buffers lying wholly before `nextRecordStart`.

It does not need to slice, copy, or aggressively rebase a partially consumed buffer.

This keeps the hot path simple and preserves zero-copy parser access.

This is particularly useful for length-prefixed records because the framing prefix may occupy one buffer while the parser-visible record begins in a later one.

## Error handling

Recoverable physical-format problems are yielded as validation errors.

Examples include:

- incomplete fixed-width record at EOF;
- incomplete length-prefixed record at EOF.

Invalid detector behaviour and invalid framing configuration throw.

Examples include:

```text
invalid prefix size
negative decoded record length
non-integer decoded record length
boundary before frameStart
boundary beyond currently buffered bytes
invalid recordStart
invalid recordEnd
```

Operational failures also throw.

This keeps malformed input separate from programming errors and filesystem failures.

## Design goals

The physical record layer is designed for:

- zero-copy record payloads;
- pooled storage;
- records larger than physical read buffers;
- arbitrary record/buffer boundary alignment;
- framing bytes excluded without copying record payloads;
- prefixes which may span physical buffers;
- incremental boundary scanning where required;
- explicit buffer lifetime;
- dependency injection for testing;
- minimal allocation on the hot path.