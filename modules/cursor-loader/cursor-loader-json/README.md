# @cobol-ts/cursor-loader-json

JSON Lines parser and JSON projection support for the byte-backed cursor architecture.

JSONL is deliberately the first/reference parser for the current cursor infrastructure.

It exercises:

- pooled physical source buffers;
- pooled physical records;
- parser-controlled record recognition;
- `readMore()`;
- records crossing physical buffer boundaries;
- parser results and recoverable errors;
- cursor lifetime;
- reusable projections;
- physical diagnostic rendering.

It is **not** intended to demonstrate the ultimate performance potential of the architecture.

`JSON.parse()` necessarily materialises the complete JSON representation of each record.

## Position in the pipeline

```text
pooled PhysicalRecordContent
    ↓
@cobol-ts/cursor-loader-json
    ├── finds the JSONL record boundary
    ├── calls readMore() when necessary
    ├── establishes endByte
    ├── decodes the record as UTF-8
    └── JSON.parse()
    ↓
JavaScript JSON representation
    ↓
JSON ProjectionSupport
    ↓
lazy application projection
```

## Public API

The package exports the stateless parser singleton:

```ts
jsonParser
```

The JSON parser currently requires no meaningful:

- parser configuration;
- preparation details;
- per-record parser state.

Conceptually its parser types are:

```ts
Parser<
    unknown,
    undefined,
    undefined,
    undefined
>
```

## JSONL record recognition

The parser owns JSONL line recognition.

The record cursor provides:

```ts
record.startByte
```

The JSON parser starts scanning from there.

It looks for LF:

```text
0x0a
```

If no line terminator is currently available and EOF has not yet been established, the parser requests more source data:

```ts
await record.readMore();
```

It then continues scanning inside the same parser invocation.

When it finds LF, it establishes:

```ts
record.endByte =
    scanByte + 1;
```

so `endByte` remains exclusive.

The LF is included in the physical JSON record. JSON permits trailing whitespace, so the resulting text can be passed directly to `JSON.parse()`.

At EOF, a final JSON record without a newline can use:

```ts
record.endByte =
    record.lastValidByte;
```

## Records spanning physical buffers

A JSON record may:

- begin partway through one physical buffer;
- span several buffers;
- end partway through its final buffer;
- share that final buffer with the next JSON record.

The parser operates on logical byte offsets across:

```ts
record.buffers
```

It does not assume one source record corresponds to one `Uint8Array`.

The authoritative limit of source data is:

```ts
record.lastValidByte
```

not the capacity of the final physical buffer.

## Decoding and parsing

After recognizing the physical boundary, the parser decodes exactly:

```text
[startByte, endByte)
```

as UTF-8 and calls:

```ts
JSON.parse(text)
```

This intentionally creates:

- a JavaScript string;
- the complete JSON value/object graph.

That behaviour is acceptable because JSONL currently exists primarily to validate the architecture around the parser.

It is not the format expected to show the strongest late-materialisation benefit.

## Projection support

`jsonParser` also implements the generic typed projection operations.

A tokenised path such as:

```ts
[
    "address",
    "postcode"
]
```

is interpreted as successive property accesses through the JSON representation.

Array positions are represented as path segments too:

```ts
[
    "customers",
    "0",
    "age"
]
```

Current typed reads include:

```text
integer
float
character
string
```

For example, an integer projection requires a JavaScript number satisfying `Number.isInteger()`.

The projection package does not itself understand JSON object traversal.

That logic remains parser-specific.

## Parse errors

Malformed JSON is represented as a recoverable parser error.

Before attempting `JSON.parse()`, the parser has already recognized the complete physical JSONL record and established `record.endByte`.

If `JSON.parse()` fails, the parser returns an `Errors` value whose diagnostic message includes useful context such as:

- source name;
- physical record number;
- the parse error;
- the physical JSON record text.

The diagnostic information is formatted into the returned error rather than exposed as a separate structured JSON-error object.

The physical record remains part of the cursor result until the consuming layer applies its normal error/lifetime policy.

## Typical wiring

```ts
const physical =
    createDefaultPhysicalRecordConfig<
        undefined,
        MyFile
    >({
        source:
            "customers.jsonl",

        file,

        bufferSize:
            64 * 1024,

        fillFileBuffer,

        createRecordState:
            () => undefined
    });

const records =
    createRecordCursor(
        jsonParser,
        undefined,
        physical
    );

const projection =
    createProjection(
        jsonParser,
        customerProjection
    );

const cursor =
    createFileCursor(
        records,
        projection
    );
```

Application code then uses the same cursor/projection model intended for future CSV and COBOL parsers.

## Why JSONL first?

JSONL is intentionally a poor showcase for the final optimisation thesis.

A conventional JSON parser wants to do:

```text
source bytes
    ↓
UTF-8 string
    ↓
complete JavaScript object graph
```

That means it necessarily pays for representation of fields the application may never access.

Its value here is architectural.

It allows the surrounding machinery to be developed and exercised before the more important parsers are implemented:

```text
buffer pooling
record pooling
record recognition
readMore()
cross-buffer handling
cursor ownership
projection binding
error handling
lifetime management
```

Once those mechanisms work, CSV and COBOL can concentrate on parser-specific interpretation.

For those formats the intended path is much closer to:

```text
source bytes
    ↓
small reusable structural description
    ↓
only requested values interpreted
    ↓
application processing
```

That is where the larger throughput experiment becomes interesting.
