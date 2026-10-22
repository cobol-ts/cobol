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
    JsonRecordState,
    readonly string[]
>
```

JSON currently has:

- no parser configuration;
- no preparation record;
- no opened-source details;
- per-record `JsonRecordState` stores reusable nested projected-array views;
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

## Projection support and arrays

JSONL reuses the generic `defineProjection<T>()` and `createProjection()` machinery. Application interfaces can expose ordinary scalar accessors or runtime-indexed scalar accessors:

```ts
interface Customer {
    name(): string;
    phone(index: number): string;
    sku(order: number, item: number): string;
    secondPhone(): string;
}

const customerProjection = defineProjection<Customer>({
    name: {type: "string", path: ["name"]},
    phone: {type: "string", path: ["phones"]},
    sku: {type: "string", path: ["orders", "items", "sku"]},
    secondPhone: {type: "string", path: ["phones", 1]}
});
```

For a row with arrays, `customer.phone(1)` selects the second phone and `customer.sku(1, 0)` selects the first item in the second order. The application returns **a scalar from the selected array element**; these interfaces do not materialise an array-valued projection.

### How indexes are assigned

Unlike COBOL, JSONL has no copybook or source schema. Therefore the path compiler cannot identify arrays during setup. It retains already-tokenised string paths by reference, and converts numeric literal selectors into strings once. At runtime it follows the path through the current parsed JSON value:

- When traversal encounters an array and the next component is **an explicit numeric selector** (`0`, `1`, `"0"`, `"1"`, etc.), that component selects the array element. No accessor argument is consumed.
- Otherwise, the array consumes the next numeric argument supplied to the accessor, in **outer-to-inner traversal order**. This also supports arrays of arrays and terminal arrays of scalar values.
- Literal selectors and runtime arguments can be mixed: `path: ["orders", 1, "items", "sku"]` uses `sku(itemIndex)`, while `path: ["orders", "items", 1, "sku"]` uses `sku(orderIndex)`.
- `path: ["phones", "length"]` without an index retains normal JSON array-length access. With a runtime index, it can instead read a `length` property on the selected element.

The accessors validate that runtime indices are non-negative safe integers within the current array bounds, and that none are missing or unused. Invalid selectors and wrong JSON value types produce parser-specific errors; the generic projection layer adds the current source and record context.

Since JSONL discovers arrays from **actual record contents**, a projection assumes that the relevant array/object structure is consistent between records. If a record has a different shape, the accessor reports an error rather than relying on schema metadata that does not exist.

### Scalar decoding

The existing projected scalar kinds are `integer`, `float`, `character`, and `string`. An integer requires a JavaScript number satisfying `Number.isInteger()`, and a character requires a string of length one. JSON decoding remains eager through `JSON.parse()`; indexed projection does not change that.

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

## Nested projected arrays

`@cobol-ts/cursor-projection` now supports readonly object and array members.
JSONL selects actual parsed objects and arrays, while the generic factory compiles
their relative member paths just once. Application code uses:

```ts
interface Item { sku(): string }
interface Order { readonly items: ProjectedArray<Item> }
interface Customer { readonly orders: ProjectedArray<Order> }

customer.orders[0].items[1].sku();
```

Register `createJsonRecordState` as the JSON parser's `createRecordState`.
A physical holder retains lazily created child views up to its high-water usage.
The current parsed array's `length` determines the visible elements, so cached
slots beyond that length are not exposed. Nested views are borrowed for the
containing `FileCursorResult` lease; close the result to release the lease.

The older scalar runtime-indexed accessors remain compatible but are not the
first-class array projection API.

### Collection selection boundary

The parser's `array()` capability returns a `ProjectedArraySource<JsonValue>`
with `length()` and `element(index)`. Both operations delegate to the original
`JSON.parse()` array. The generic projection factory uses the same indexed
source abstraction for COBOL fixed OCCURS, where there is no native array to
return. JSONL's application-facing `ProjectedArray<T>` behaviour is unchanged.
