# @cobol-ts/cursor-loader-json

JSON Lines parsing and JSON projection support for the byte-backed cursor architecture.

JSONL is the simple/reference parser for the framework. It exercises parser-controlled record recognition, `readMore()`, cross-buffer records, recoverable parser errors, lazy projection errors and borrowed lifetimes.

It is not the strongest demonstration of late materialisation because `JSON.parse()` necessarily creates the complete JavaScript JSON value for each record.

## Public API

The package exports `jsonParser` together with JSON value/parser types.

Its parser type is conceptually:

```ts
Parser<
    JsonValue,
    undefined,
    undefined,
    undefined,
    readonly string[]
>
```

JSON currently has:

- no parser configuration;
- no preparation record;
- no opened-source details;
- no per-record parser state;
- no separate compiled path representation beyond the canonical string path.

## Position in the pipeline

```text
pooled parser physical record
    ↓
jsonParser.parse()
    ├── finds LF itself
    ├── calls readMore() when necessary
    ├── establishes endByte
    ├── decodes [startByte,endByte) as UTF-8
    └── JSON.parse()
    ↓
JsonValue
    ↓
JSON ProjectionSupport
    ↓
application projection
```

## JSONL record recognition

The parser starts at `record.startByte` and scans for LF (`0x0a`).

If all currently valid bytes have been scanned and EOF is not known, it calls:

```ts
await record.readMore();
```

and continues from its existing local scanning state.

When LF is found:

```ts
record.endByte = scanByte + 1;
```

The LF remains in the physical JSON record. JSON accepts it as trailing whitespace.

CRLF also works naturally because the CR remains JSON whitespace immediately before the LF.

The final record may terminate at EOF without LF, in which case `endByte` becomes `lastValidByte`.

## Records spanning physical buffers

A JSON record may begin partway through a buffer, span many buffers and end in a buffer which also contains later records.

The parser works in logical byte offsets across `record.buffers` and treats `record.lastValidByte`, not final-buffer capacity, as the authoritative end of source data.

## Decoding and parsing

After physical recognition, the parser decodes exactly:

```text
[startByte,endByte)
```

as UTF-8 and calls `JSON.parse()`.

The successful representation may be any valid JSON value:

```text
object
array
string
number
boolean
null
```

## Recoverable parse errors

Malformed JSON is returned as recoverable `Errors` after the parser has established the record boundary.

The diagnostic includes:

- source name;
- one-based physical record number;
- the `JSON.parse()` reason;
- the physical JSON record text.

For example:

```text
customers.jsonl: record 3: JSON parse error ...
{...bad json...}
```

`cursor-file` subsequently applies the selected row-error policy and closes the failed physical record.

## Projection support

JSON projection compilation is deliberately trivial:

```ts
compileProjectionPath(
    undefined,
    undefined,
    path
)
```

returns the same tokenised string path.

Runtime projection operations traverse object/array properties through that path.

Examples:

```ts
["address","postcode"]
["customers","0","age"]
```

The current scalar operations are:

```text
integer
float
character
string
```

An integer requires a JavaScript number satisfying `Number.isInteger()`. A character requires a string of length one.

## JSON projection diagnostics

JSON-specific runtime failures report the precise reason but deliberately do not duplicate generic provenance.

Examples include:

```text
JSON value is string "forty two"; expected an integer.
```

```text
JSON property "postcode" does not exist in object at address. Variable properties: "line1", "line2".
```

```text
JSON path cannot continue at customer: value is null; cannot resolve property "name".
```

The generic projection layer then adds the **current data record**:

```text
source: record N: projection logical.path: JSON-specific reason
physical JSON record
```

This separation keeps parser-specific reasoning in the JSON package while provenance and physical rendering remain generic.

## Normal wiring through `cursor-file`

The normal application path is to register `jsonParser` and let `@cobol-ts/cursor-file` create physical resources, open the record cursor and compile the projection:

```ts
const definition = {
    filename: "customers.jsonl",
    fileType: "json" as const,
    projection: customerProjection
};

const infrastructure = {
    parsers: {
        json: {
            parser: jsonParser,
            parserConfig: () => undefined,
            createRecordState: () => undefined
        }
    },
    bufferSize: 64 * 1024,
    fillFileBuffer
};

const cursor =
    createFileCursor(
        definition,
        file,
        infrastructure
    );
```

Lower-level code may still use `createDefaultPhysicalRecordConfig()` and `createRecordCursor()` directly when opened-source details are already known.

## Why JSON remains useful

JSON eagerly pays for a UTF-8 string and complete JavaScript value graph, so it cannot realise the full memory-traffic optimisation thesis.

Its value is as a simple parser which exercises the surrounding architecture:

```text
buffer pooling
record pooling
parser-controlled recognition
readMore()
cross-buffer handling
record ownership
projection binding and reuse
rich diagnostics
row-error policies
borrowed lifetime
```

CSV then demonstrates the more important byte-backed path where field structure is retained and only projected values are decoded.
