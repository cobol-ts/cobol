# @cobol-ts/cursor-record

Pooled physical-record storage, parser preparation and record-cursor lifetime management for the `@cobol-ts` cursor stack.

This package does **not** decide where JSONL, CSV, COBOL or other records end. The parser owns physical-record recognition.

Its responsibilities are to:

- provide pooled physical-record holders;
- provide pooled source byte buffers;
- let parsers request more bytes while scanning;
- keep bytes alive for the borrowed lifetime of a record;
- preserve parser-defined record state with that record;
- carry already-read bytes into the next record without copying;
- orchestrate optional parser preparation through `openRecordCursor()`;
- return reusable storage to pools when ownership ends.

## Position in the pipeline

```text
physical source
    ↓
FillFileBuffer
    ↓
@cobol-ts/cursor-record
    ├── pooled Uint8Array buffers
    ├── pooled physical-record holders
    └── parser-defined recordState
    ↓
optional Parser.prepare()
    ↓
Parser.parse(record,details)
    ├── starts at startByte
    ├── scans available bytes
    ├── calls await record.readMore() when required
    └── sets endByte
    ↓
RecordCursorResult
```

The record cursor is deliberately format-blind.

## Public API

The principal exports are:

```ts
createDefaultPhysicalRecordConfig(...)
createPhysicalRecord(...)
createRecordCursor(...)
openRecordCursor(...)
```

`createRecordCursor()` is the low-level entry point when parser details are already known.

`openRecordCursor()` is the normal parser-opening entry point when optional `prepare()` must be handled.

## Two reusable pools

`createDefaultPhysicalRecordConfig()` establishes:

```text
byteBufferPool
    reusable fixed-capacity Uint8Array objects

physicalContentPool
    reusable physical-record objects
```

A physical-record holder permanently retains reusable structures such as:

- its `buffers` array;
- parser-defined `recordState`;
- pool references;
- `readMore()`;
- `close()`.

Lease-specific scalar values are rebound when the holder is acquired:

```text
startByte
endByte
lastValidByte
fileFinished
source
recordNumber
```

The object graph therefore does not need to be reconstructed for every logical record.

## Parser-specific record state

Pool creation receives:

```ts
createRecordState:
    () => TRecordState
```

That factory runs only when a new pooled physical-record holder must be created, not once per source row.

JSON uses:

```ts
() => undefined
```

The current CSV parser uses a state object containing reusable `Int32Array` field-boundary arrays and a field count. Those arrays remain attached to the pooled holder and are reused when it is leased again.

Generic record machinery does not interpret parser state.

## Record positions

The ownership rule is:

```text
cursor       → startByte
readMore()   → lastValidByte / fileFinished
parser       → endByte
```

`startByte` and `endByte` are logical offsets across all buffers belonging to the record. `endByte` is exclusive.

`lastValidByte` is the exclusive end of source bytes actually read. It is authoritative over the capacity of the final `Uint8Array`.

## `readMore()`

When a parser needs more bytes it calls:

```ts
await record.readMore();
```

One call:

1. acquires a pooled byte buffer;
2. passes that exact `Uint8Array` to `fillFileBuffer`;
3. appends that exact buffer to `record.buffers`;
4. advances `lastValidByte` by the bytes actually read;
5. sets `fileFinished` when EOF is discovered.

There is no record-sized copy, no replacement subarray and no explicit parser continuation object.

## Parser-controlled framing

The cursor establishes `startByte`, invokes the parser, and trusts the parser to establish `endByte`.

Conceptually:

```text
establish startByte
    ↓
invoke parser
    ↓
parser scans / readMore()
    ↓
parser establishes endByte
    ↓
yield parser result + physical record
```

CSV is an important example. A CR or LF inside a quoted field is data, not a record boundary, so the same CSV grammatical scan performs both row recognition and field-boundary collection.

## Parser preparation

`openRecordCursor()` handles parsers with an optional bootstrap record.

For a prepared parser it:

1. acquires the first pooled physical record;
2. calls `parser.prepare(record,config)`;
3. lets preparation call `readMore()` as needed;
4. captures only `{source,recordNumber}` as `preparationContext`;
5. establishes carry state for bytes already read beyond the bootstrap record;
6. closes the bootstrap physical record;
7. returns the prepared details and a data-record cursor using the same cursor state.

This means a CSV header and the first data row can share a physical source buffer without copying or rereading bytes.

Preparation `Errors` are setup failures and are thrown as `ErrorsException`.

A parser without `prepare()` uses its configuration as its opened details. This is currently implemented through the parser's type contract and is the path used by JSON.

## Carrying bytes between records

A physical read commonly contains bytes belonging to more than one logical record.

The final buffer of record A may therefore also contain the beginning of record B.

The cursor retains a reference to that exact buffer and starts the next record within it. Already-read source bytes do not need to be copied into record-sized storage.

The carry state retained across records is intentionally small: the carried buffer reference, next start/valid offsets, EOF state and record number.

## Record lifetime

The cursor yields:

```ts
interface RecordCursorResult<
    TRepresentation,
    TRecordState
> {
    readonly result:
        ParserResult<TRepresentation>;

    readonly physicalRecord:
        PhysicalRecordContent<TRecordState>;
}
```

Ownership of the yielded physical record transfers to the consumer. The record cursor does not automatically close a yielded record.

Higher layers such as `@cobol-ts/cursor-file` normally manage this lifetime on behalf of application code.

## Closing a record

Closing a physical record:

1. releases its byte-buffer references;
2. clears the reusable `buffers` array in place;
3. returns the physical-record holder to its pool.

Parser-defined `recordState` remains attached to the holder and can be overwritten on the next lease.

## Reference-counted buffers

The same physical `Uint8Array` may temporarily be required by both a completed record and the cursor as carried storage for the following record.

Buffers are therefore reference-counted and become reusable only after every owner releases its reference.

This permits overlapping record lifetimes without copying source bytes.

## Several live records

The architecture permits several records to remain live at once.

Pools grow to support the maximum simultaneous live demand rather than the total number of records processed.

Bounded memory therefore assumes callers eventually close completed results.

## Low-level example

When details are already known:

```ts
const physical =
    createDefaultPhysicalRecordConfig({
        source: "customers.jsonl",
        file,
        bufferSize: 64 * 1024,
        fillFileBuffer,
        createRecordState: () => undefined
    });

const cursor =
    createRecordCursor(
        jsonParser,
        undefined,
        physical
    );

for await (const row of cursor) {
    try {
        // row.result is the parser result.
    } finally {
        row.physicalRecord.close();
    }
}
```

For normal parser opening with optional preparation, use `openRecordCursor()` instead.

## Allocation and memory model

Approximate live storage is:

```text
live physical buffers
+
live physical-record holders
+
parser state attached to those holders
+
small cursor carry state
```

The architecture deliberately lets parser code remain an ordinary sequential algorithm across `await record.readMore()`.

Performance work should therefore focus on measured allocation, memory traffic and parser cost rather than assuming a particular Promise optimisation strategy.
