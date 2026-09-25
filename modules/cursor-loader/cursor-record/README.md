# @cobol-ts/cursor-record

Physical record framing for the `@cobol-ts` cursor stack.

This package converts pooled byte buffers from `@cobol-ts/cursor-file` into complete physical records.

It supports line-oriented and fixed-width physical files.

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

- retaining physical byte buffers while a record spans them;
- detecting physical record boundaries;
- yielding zero-copy `PhysicalRecordContent`;
- excluding physical framing bytes such as LF and CRLF;
- releasing fully consumed buffers back to the pool;
- reporting malformed physical framing.

It does not parse CSV, JSON, COBOL, or application data.

## Public API

The main public API is:

```ts
createLineRecordReader()

createFixedRecordReader()

newlineRecordBoundaryDetector

createFixedWidthRecordBoundaryDetector()
```

## Physical records

A record is represented as:

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

A record may span one or many physical buffers.

The representation is zero-copy.

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

Physical line terminators are excluded from the yielded record.

For example:

```text
physical bytes:

abc\r\n

record data:

abc
```

An unterminated final line is considered a valid final physical record.

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

Fixed-width records contain no framing bytes.

If EOF is reached with bytes remaining which cannot form a complete record, the reader reports a physical validation error.

## Physical buffers and logical records are independent

A physical record may fit entirely within one buffer:

```text
buffer:

one\ntwo\nthree\n
```

or span many buffers:

```text
buffer 1:
    abcdefgh

buffer 2:
    ijklmnop

buffer 3:
    qrst\n
```

Similarly, fixed-width record boundaries do not need to align with physical read boundaries.

For example:

```text
physical buffers, size 4:

abcd
efgh
ijkl
mno

logical records, size 5:

abcde
fghij
klmno
```

## Record boundary detectors

Physical framing policy is represented by `RecordBoundaryDetector`.

Its two important offsets are:

```text
recordStart
    first logical byte of the current record

searchStart
    first logical byte which has not already been examined
    while searching for the current record boundary
```

The distinction matters for records which span many physical buffers.

For example:

```text
read buffer 1
search from 0
no boundary

read buffer 2
search from 4
no boundary

read buffer 3
search from 8
boundary found
```

Previously examined bytes do not need to be rescanned.

A fixed-width detector does not search and therefore ignores `searchStart`.

## Boundary detector contract

Offsets are logical offsets across the supplied buffers as though they had been concatenated.

For example:

```text
buffers[0] = "abc\r"
buffers[1] = "\nXYZ"
```

is treated logically as:

```text
"abc\r\nXYZ"
```

The line detector therefore returns the same record boundary regardless of the physical buffer split.

## Error handling

Recoverable physical-format problems are yielded as validation errors.

Examples include:

- incomplete fixed-width record at EOF.

Programming or operational failures throw.

This keeps malformed input separate from failures such as file-system errors or invalid detector behaviour.

## Design goals

The physical record layer is designed for:

- zero-copy records;
- pooled storage;
- records larger than physical read buffers;
- arbitrary record/buffer boundary alignment;
- incremental boundary scanning;
- explicit lifetime rules;
- minimal allocation on the hot path.