# @cobol-ts/cursor-projection

Declarative, lazy and reusable application projections for the byte-backed cursor framework.

A projection describes the application-facing fields required from a parser representation. At runtime it exposes those fields through an ordinary application interface without constructing a new materialised application object for every source record.

## Why projections exist

The architecture separates:

```text
physical source
    ↓
parser representation
    ↓
projection
    ↓
application interface
```

The parser understands its source format. The application should not need to.

For example:

```ts
interface Customer {
    id(): number;
    name(): string;
    postcode(): string;
    balance(): number;
}
```

The same application interface can be backed by JSON, CSV or a future COBOL parser without the application knowing how those values are physically represented.

## Defining a projection

Use `defineProjection()`:

```ts
const customerProjection =
    defineProjection<Customer>({
        id: {
            type: "integer"
        },

        name: {
            type: "string"
        },

        postcode: {
            type: "string",
            path: [
                "address",
                "postcode"
            ]
        },

        balance: {
            type: "float"
        }
    });
```

Supported scalar kinds are:

```text
integer
float
character
string
```

The application interface is authoritative. TypeScript checks that every accessor is present and that the configured scalar kind is compatible with its return type.

## Canonical paths

Every projection field has an already-tokenised logical path.

If `path` is omitted:

```ts
id: {
    type: "integer"
}
```

`defineProjection()` canonicalises it once to:

```ts
id: {
    type: "integer",
    path: ["id"]
}
```

The canonical authoring path remains a `readonly string[]`.

## Paths are parser-specific at runtime

The projection package does not assign physical meaning to a path. The parser does.

Examples:

```text
JSON
    ["address", "postcode"]
    → same string path used for property traversal

CSV
    ["postcode"]
    → numeric column index compiled from the prepared header

COBOL
    ["CUSTOMER", "ADDRESS", "POSTCODE"]
    → parser-specific compiled layout information
```

## Creating the runtime projection

`createProjection()` is source-scoped. It combines:

- parser projection support;
- opened-source parser details;
- optional preparation-record context;
- the canonical projection definition.

Its current shape is:

```ts
const factory =
    createProjection(
        parser,
        details,
        preparationContext,
        projectionDefinition
    );
```

For JSON, both `details` and `preparationContext` are `undefined`.

For CSV, `details` contains the prepared header map and `preparationContext` identifies the header record for setup diagnostics.

## Path compilation happens once

When the factory is created, each canonical string path is compiled exactly once through:

```ts
parser.compileProjectionPath(
    details,
    preparationContext,
    field.path
)
```

The resulting parser-specific path is captured by the accessor.

CSV therefore performs header-name lookup during source setup rather than on every row access.

The preparation context is discarded after compilation; runtime accessors do not retain it.

## Accessor functions are shared

`createProjection()` also creates one immutable accessor function for each projected field.

Those accessor functions are shared by every reusable projection object produced by the resulting factory.

`factory.create()` constructs a projection object containing:

- two mutable internal binding slots;
- references to the already-created shared accessor functions.

It does not recreate the accessor closures.

## Binding

A reusable projection is bound to:

```text
current parser representation
+
current physical record
```

through:

```ts
factory.bind(
    projection,
    representation,
    physicalRecord
);
```

`clear()` removes both lease-specific references:

```ts
factory.clear(projection);
```

The object can then be reused for another source record.

## Lazy access

Projection fields are methods rather than copied values:

```ts
customer.balance()
```

The accessor invokes the parser using the opened-source details and compiled runtime path:

```ts
parser.float(
    representation,
    details,
    compiledPath
)
```

The generic projection layer does not decode CSV or COBOL bytes itself.

For the current CSV parser, a projection accessor ultimately decodes only the requested field range from the byte-backed record. The full CSV row is scanned structurally, but unrelated field strings are not materialised.

For JSON, `JSON.parse()` has already created the complete representation, so projection laziness is primarily about application API, reuse and error/lifetime semantics rather than avoiding JSON object creation.

## Late materialisation

Late materialisation is especially important for formats where the physical bytes are more authoritative than any one eager object representation.

For CSV, the current parser stores reusable field start/end byte offsets and interprets only requested values.

For a future COBOL parser, the same mechanism can also preserve multiple possible interpretations of the same bytes until application context selects the required view.

The intended path is:

```text
recognize physical record
    ↓
retain reusable structural information
    ↓
application requests a value
    ↓
interpret only that value
```

rather than eagerly constructing a complete application object graph.

## Borrowed lifetime

A projection is borrowed.

Its validity is tied to the `FileCursorResult` which owns the corresponding physical record.

After the result is closed, the projection reference is invalid and must not be used again.

Immediately after clearing, an attempted access reports:

```text
Projection is not bound to a record
```

but callers must not treat that as a permanent stale-reference guard. The same pooled JavaScript object may later be rebound to a different record.

The framework deliberately avoids a generation check on every accessor call.

## Why retain the physical record?

The parser representation is responsible for retrieving values. The projection retains a narrow physical-record capability for:

- keeping borrowed source bytes alive;
- source and record-number provenance;
- parser-specific physical debug rendering when lazy access fails.

The projection does not bypass the parser and interpret parser-specific `recordState` itself.

## Projection errors

Parser errors and projection errors are intentionally different.

A recoverable parser error means the physical record could not be represented successfully under the parser's row-error policy.

A projection error means a representation exists but a requested logical field cannot satisfy its declared projection.

Runtime projection errors are enriched by the generic layer using the **currently bound data record**:

```text
source: record N: projection logical.path: parser-specific reason
physical record rendering
```

For example, JSON can report:

```text
customers.jsonl: record 2: projection age: JSON value is string "forty two"; expected an integer.
{"id":1002,"age":"forty two"}
```

Source-dependent path compilation failures happen earlier, during `createProjection()`. Parsers such as CSV can use the optional preparation context to report errors such as a missing projected header column with the header's source and record number.

Diagnostic strings are created only on failure paths.

## Performance intent

The projection layer reuses:

```text
projection objects
shared accessor functions
opened-source details
compiled projection paths
canonical field definitions
```

Normal row-to-row work is primarily:

```text
bind references
invoke requested accessors
clear references
```

No projection-path compilation or accessor-function allocation is required per row.

## Recursive projections and borrowed arrays

Projection definitions can have `object` and `array` members in addition to
scalar accessors. Nested paths are relative to their enclosing projection.
The factory compiles these paths once and creates reusable views lazily.
For parsers with projected arrays (currently JSONL), configure a per-holder
`ProjectionRecordState` (a `projectionViews` map). Root array views and their
indexed child projections are retained in that state; each view maintains a
current active length separately from high-water cached element slots.

All views borrow the owning file-result lease. `clear()` recursively removes
representation and physical-record bindings, while preserving objects for reuse.
CSV scalar projections and existing COBOL scalar/fixed-OCCURS projections do
not require the new optional parser object/array capabilities.

### Indexed sources and relative nested paths

A parser's optional `array` capability provides `ProjectedArraySource<R>`:
`length()` is the active count and `element(index)` selects a representation.
This avoids requiring array materialisation by byte-backed formats. `bind()`
keys a projected array's current source to its owning record and parent
representation, preserving child identities for repeated getter access.

`compileProjectionPath()` also accepts an optional previously compiled parent
path. Flat formats may ignore it. COBOL uses it to compile relative child
field names to numeric physical coordinates once during source setup; no
name-index navigation occurs when an element is accessed.
