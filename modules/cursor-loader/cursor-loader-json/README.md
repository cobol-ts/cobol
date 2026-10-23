# `@cobol-ts/cursor-loader-json`

JSON Lines (JSONL) parsing and projection support for the pooled cursor framework. This is the **reference implementation of recursive projected objects and arrays**: the parser has native JavaScript objects to select, while the shared projection framework controls the application interface, view identity, lifetimes and reuse.

JSONL is **not** byte-backed late materialisation of its values. `JSON.parse()` constructs the full per-record JSON representation. The value of this adapter is its clean format boundary and the way it exercises generic projections and cursor lifetimes.

## The public parser and state

```ts
import {
    jsonParser,
    createJsonRecordState
} from "@cobol-ts/cursor-loader-json";

// The JsonParser type is:
// Parser<JsonValue, undefined, undefined, JsonRecordState, readonly string[]>
```

There is no parser configuration, bootstrap header or prepared source detail. `JsonRecordState` is **no longer `undefined`**: it is a `ProjectionRecordState`, created as `{projectionViews: new Map()}` once for each pooled physical-record holder. Register it wherever the JSONL parser is installed:

```ts
json: {
    parser: jsonParser,
    parserConfig: () => undefined,
    createRecordState: createJsonRecordState
}
```

That factory is necessary for first-class root projected arrays. The physical-record implementation itself is unchanged.

## How JSONL records are read

```text
File → pooled Uint8Array buffers → physical record cursor
                                 → jsonParser.parse()
                                    ├─ scan until LF (or final EOF)
                                    ├─ readMore() across buffers
                                    ├─ establish endByte
                                    ├─ UTF-8 decode current record
                                    └─ JSON.parse()
                                 → parsed JsonValue
                                 → bound application projection
```

The JSONL parser recognises its **own** record boundaries; there is no generic line parser. It scans from `startByte` to LF (`0x0A`) using `lastValidByte` as the limit of real input, calling `readMore()` as necessary. LF remains in the completed physical range; CRLF works because the CR is JSON whitespace. A last line may end directly at EOF. Records may begin partway through a pooled buffer or span several buffers.

On JSON syntax failure, parsing returns recoverable row `Errors` including source, record number and JSON text; `cursor-file` applies the configured row-error policy. A successful record is any JSON value (`object`, `array`, scalar or `null`).

## First-class projected arrays and nested objects

```ts
import type {ProjectedArray} from "@cobol-ts/arrays";
import {defineProjection} from "@cobol-ts/cursor-projection";

interface Item { sku(): string; quantity(): number }
interface Order { orderId(): number; readonly items: ProjectedArray<Item> }
interface Address { town(): string }
interface Customer {
    name(): string;
    readonly address: Address;
    readonly orders: ProjectedArray<Order>;
}

const definition = defineProjection<Customer>({
    name: {type: "string"},
    address: {type: "object", fields: {
        town: {type: "string"}
    }},
    orders: {type: "array", element: {
        orderId: {type: "integer"},
        items: {type: "array", element: {
            sku: {type: "string"},
            quantity: {type: "integer"}
        }}
    }}
});

// While a customer record lease is live:
customer.orders.length;
customer.orders[0].items[1].sku();
customer.orders.map(order => order.orderId());
customer.address.town();
```

Members default to paths named after their properties; explicit `path: ["externalName"]` may select a different key. Nested member paths are **relative to the currently selected JSON object**. The factory compiles every path once and creates nested projected child objects only as indexes are actually read.

For `array()`, JSONL returns a `ProjectedArraySource<JsonValue>` whose `length()` and `element(i)` delegate to the actual parsed JSON array. The generic `@cobol-ts/arrays` view exposes readonly `length`, bracket indexing and native-style array operations. Standard operations such as `map()` materialise their returned result, not a second backing array of JSON record data.

## Record-scoped reuse: length is not capacity

Root array runtimes are retained under `physicalRecord.recordState.projectionViews` and keyed by the compiled member object; each nested projected object retains its own child arrays. An array keeps **active logical length** from the *current* JSON value separately from reusable projection slots allocated during earlier accesses.

For records with 2, then 5, then 1 orders:

```text
Record A: logical length = 2; retained element projections up to accessed indexes
Record B: logical length = 5; slots may grow as new indexes are read
Record C: logical length = 1; previously allocated higher slots remain but are hidden
```

For a nested array, **each selected order has its own item array** with its own active count and retained slots. Two concurrently open `FileCursorResult` leases keep independent projected views. Closing a lease clears their current JSON bindings, but reusable child projection objects remain in pooled record state. Do not use child objects after close; they may later be rebound to another row.

The array cache has debugging site labels such as `root.orders`. Labels help inspection, but identity of the compiled member—not its string name—is the cache key.

## Scalar projections (including legacy indexed scalar access)

Scalar accessors remain supported:

```ts
interface CustomerScalar {
    name(): string;
    phone(index: number): string;
    secondPhone(): string;
}
const scalar = defineProjection<CustomerScalar>({
    name: {type: "string", path: ["name"]},
    phone: {type: "string", path: ["phones"]},
    secondPhone: {type: "string", path: ["phones", 1]}
});
```

String-only JSON paths are retained unchanged when compiled; literal numeric path components are converted to strings at setup. With the older indexed-scalar style, JSONL discovers arrays from the actual parsed record and consumes numeric accessor arguments as it encounters arrays without an explicit selector. It supports nested and mixed literal/runtime selection. This is **a scalar convenience**, distinct from `readonly phones: ProjectedArray<Phone>`.

`integer` accepts a JavaScript integer, `float` a number, `character` a one-character string and `string` any string; coercion from strings to numbers is not performed. Missing properties, wrong shapes, missing/extra indexes and bad types cause lazy projection errors with physical provenance.

## Error semantics and limits

- **Physical JSON syntax error:** returned as recoverable parser `Errors`; the file cursor's row policy applies.
- **Projection shape or type mismatch:** thrown when the member is accessed and enriched with the live record's source and context.
- **No JSON schema:** static compilation does not prove a property is always an object/array or that element shapes agree across rows. Validation happens when selected.
- **No lazy JSON parsing:** the complete JSON text becomes a JavaScript value graph once per record, unlike byte-backed CSV/COBOL.

## Tests

- `src/cursor.loader.json.parser.spec.ts`: physical JSONL framing, multi-buffer data and parse errors.
- `src/json.projection.support.spec.ts`: scalar types, path traversal, literal and runtime indexes, errors.
- `src/json.projected.array.spec.ts`: existing indexed scalar accessors and cursor integration.
- `src/json.projected.array.spec.ts`: first-class arrays, nested objects, iteration, high-water reuse and simultaneous live rows through a real file cursor.

The cross-package `@cobol-ts/cursor-loader-test` fixture registers `createJsonRecordState`. Run Jest and a TypeScript build as separate verification steps where the monorepo scripts require it.

## Rebinding and indexed diagnostics

Generic projected object and array views are retained and rebound rather than rematerialised as domain objects. A projected array uses sparse retained element slots plus an `ArrayWithSize` prefix of the child references bound during the current lease, so `clear()` does not scan its historical highest array index. Parser-native JSON values **are still newly allocated** by `JSON.parse()` for each record. Deep lazy failures can report a fully indexed application path assembled only on the error path; never retain a projected child beyond `FileCursorResult.close()`.
