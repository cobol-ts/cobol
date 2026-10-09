# @cobol-ts/cursor-record

Pooled physical-record storage and record-cursor lifetime management for the `@cobol-ts` cursor stack.

This package does **not** decide where JSONL, CSV, COBOL or other records end.

The parser owns physical-record recognition.

The job of this package is to:

- provide a pooled physical-record holder;
- provide pooled source byte buffers;
- let the parser request more source bytes while scanning;
- keep the source bytes alive for the complete borrowed lifetime of the record;
- preserve parser-defined record state with the record;
- carry unread bytes into the next record without copying them;
- and return all reusable storage to pools when the record is closed.

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
Parser.parse(record, details)
    ├── starts at startByte
    ├── scans available bytes
    ├── calls await record.readMore() when required
    └── sets endByte
    ↓
RecordCursorResult
```

The record cursor is deliberately format-blind.

## Public API

The principal exports include:

```ts
createDefaultPhysicalRecordConfig(...)
createPhysicalRecord(...)
createRecordCursor(...)
```

together with the corresponding configuration and cursor types.

## Two reusable pools

`createDefaultPhysicalRecordConfig()` establishes two important pools for the opened source/configuration.

```text
byteBufferPool
    reusable fixed-capacity Uint8Array objects

physicalContentPool
    reusable physical-record objects
```

A physical-record holder retains reusable structures such as:

- its `buffers` array;
- its parser-defined `recordState`;
- its pool references;
- its `readMore()` implementation;
- its `close()` implementation.

Lease-specific values are rebound when the holder is acquired.

These include:

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

Pool creation receives a factory such as:

```ts
createRecordState:
    () => TRecordState
```

That factory is used when a new pooled physical-record holder has to be created.

It is not intended to run for every source record.

For JSONL:

```ts
createRecordState:
    () => undefined
```

For a future CSV parser it might create something like:

```ts
createRecordState:
    () => ({
        starts:
            new Int32Array(requiredColumns),

        ends:
            new Int32Array(requiredColumns),

        flags:
            new Uint8Array(requiredColumns)
    })
```

The arrays then remain attached to that physical-record holder and are overwritten when the holder is reused.

The generic record layer does not interpret them.

## Record positions

The record cursor establishes:

```ts
record.startByte
```

before calling the parser.

The parser discovers the physical boundary and establishes:

```ts
record.endByte
```

`endByte` is exclusive.

`record.lastValidByte` describes how many source bytes are currently available across the physical buffers.

The ownership rule is therefore:

```text
cursor       → startByte
readMore()   → lastValidByte / fileFinished
parser       → endByte
```

## `readMore()`

When the parser cannot yet determine the current physical record's boundary, it may call:

```ts
await record.readMore();
```

A call to `readMore()`:

1. acquires a pooled byte buffer;
2. passes that exact `Uint8Array` to `fillFileBuffer`;
3. appends that exact buffer object to `record.buffers`;
4. advances `record.lastValidByte` by the actual number of source bytes read;
5. sets `record.fileFinished` when EOF is discovered.

There is deliberately:

```text
no record-sized byte copy
no slice used as physical storage
no replacement subarray stored in place of the pooled buffer
```

The final physical buffer may contain unused capacity.

Its `length` is therefore not the end of valid source content.

`lastValidByte` is authoritative.

## Parser-controlled framing

`createRecordCursor()` does not understand record syntax.

Conceptually it does:

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

This permits framing and structural interpretation to be fused where appropriate.

CSV is the important example.

A newline inside a quoted CSV field is not a record boundary. A correct CSV scanner already has to understand quoting in order to decide where the row ends.

Making a generic framing layer scan first and a CSV parser scan again would duplicate work and state.

Other formats can use much simpler recognition.

## Carrying bytes between records

A physical source read commonly contains bytes belonging to more than one logical record.

For example:

```text
physical buffer

┌──────────────────────────────────────────────┐
│ record A │        record B        │ record C │
└──────────────────────────────────────────────┘
           ^
           record A endByte
```

The final physical buffer of record A may therefore also contain the beginning of record B.

The cursor retains the required reference to that exact buffer.

The next physical record can start in that same `Uint8Array`.

Unread source bytes do not need to be copied into a new record-sized buffer.

The per-record carry state retained across a yield is intentionally small: principally the carried buffer reference, offsets/flags required to locate the next start position, and the record number.

The generator of course also retains its normal cursor configuration, parser and prepared details.

## Record lifetime

The record cursor yields:

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

The physical record becomes the consumer's borrowed resource.

The record cursor does not automatically close a successfully yielded record.

The consuming layer must eventually call:

```ts
physicalRecord.close();
```

Higher layers such as `@cobol-ts/cursor-file` normally manage this lifetime on behalf of application code.

## Closing a record

Closing a physical record:

1. releases the byte-buffer references owned by that record;
2. clears the reusable `buffers` array in place;
3. returns the physical-record holder to its pool.

The parser-defined `recordState` remains attached to that holder.

Its contents can be overwritten on the next lease.

## Reference-counted buffers

The same physical `Uint8Array` may temporarily be required by both:

- the completed current record;
- and the cursor as the starting storage for the following record.

Buffers are therefore reference-counted.

A pooled byte buffer becomes reusable only after every owner has released its reference.

This allows one record to remain valid while the cursor retains overlapping physical storage for the next record, without copying source bytes.

## Several live records

The architecture does not require exactly one physical record to exist at a time.

If application processing keeps several results alive, the physical-record and buffer pools can grow to support them.

Memory is therefore intended to be proportional to:

```text
maximum simultaneously live records
```

rather than:

```text
total records processed
```

This is an important distinction.

Bounded memory assumes the application eventually closes completed results.

## Example

```ts
const config =
    createDefaultPhysicalRecordConfig<
        undefined,
        MyFile
    >({
        source:
            "customers.jsonl",

        file,

        bufferSize:
            64 * 1024,

        fillFileBuffer:
            async (
                file,
                target
            ) => {
                return bytesRead;
            },

        createRecordState:
            () => undefined
    });

const cursor =
    createRecordCursor(
        jsonParser,
        undefined,
        config
    );

for await (const row of cursor) {
    try {
        // row.result is the parser result.
    }
    finally {
        row.physicalRecord.close();
    }
}
```

## Allocation and memory model

The package is designed around storage required by currently live work, not by total input size.

Approximately:

```text
live memory
    ≈
    live physical buffers
    +
    live physical-record holders
    +
    parser record state in those holders
    +
    small cursor state
```

A billion processed records should not imply a billion record objects or a billion sets of structural arrays.

The architecture deliberately allows the parser to remain an ordinary sequential algorithm across:

```ts
await record.readMore();
```

rather than forcing it into an explicit continuation/state-machine API.

Whether the resulting asynchronous machinery is significant in practice is a benchmarking question.

The primary optimisation target is the amount of memory allocated, touched and copied while processing each record.

