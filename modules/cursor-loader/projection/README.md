# @cobol-ts/cursor-projection

Declarative, lazy and reusable application projections for the byte-backed cursor framework.

A projection describes the application-facing fields required from a parser representation.

At runtime it exposes those fields through a natural application interface without requiring a newly materialised application object for every source record.

## Why projections exist

The architecture deliberately separates:

```text
physical source
    ↓
parser representation
    ↓
projection
    ↓
application interface
```

The parser understands its source format.

The application should not need to.

For example:

```ts
interface Customer {
    id(): number;
    name(): string;
    postcode(): string;
    balance(): number;
}
```

The same application interface can potentially be backed by:

```text
JSON
CSV
COBOL
```

without the application knowing how those values are physically represented.

## Defining a projection

Use `defineProjection()`.

For example:

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

Current scalar projection types include:

```text
integer
float
character
string
```

The declared application interface and field definitions are checked together by TypeScript.

## Paths

Each projection field has an already-tokenised logical path.

For example:

```ts
path: [
    "address",
    "postcode"
]
```

If a path is omitted, `defineProjection()` canonicalises it from the field name.

Conceptually:

```ts
id: {
    type: "integer"
}
```

becomes:

```ts
id: {
    type: "integer",
    path: ["id"]
}
```

This is configuration-time work.

The runtime accessor does not need to repeatedly split or parse a path string.

## Paths are parser-specific

The projection package does not assign physical meaning to a path.

The parser does.

For example:

```text
JSON
    ["address", "postcode"]
    → object/property traversal

CSV
    ["POSTCODE"]
    → logical CSV column

COBOL
    ["CUSTOMER", "ADDRESS", "POSTCODE"]
    → compiled field/layout lookup
```

This keeps physical representation knowledge inside the parser.

## Creating the runtime projection

`createProjection()` combines a parser's `ProjectionSupport` with the canonical projection definition.

For example:

```ts
const customerFactory =
    createProjection(
        jsonParser,
        customerProjection
    );
```

The resulting `ProjectionFactory` provides operations conceptually equivalent to:

```ts
create()
bind(...)
clear(...)
```

## Stable reusable projection objects

`create()` constructs a complete projection object.

Its accessor functions are created at that point.

The runtime object also contains internal slots used to bind it to the current parser representation and physical record.

The object shape is therefore established before repeated row processing begins.

The accessor closures capture immutable information such as:

- the parser projection implementation;
- the canonical field definition.

They do not capture a particular current record.

## Binding

When a parsed record is exposed to application code, the projection is rebound to:

```text
current parser representation
+
current physical record
```

`bind()` changes references in the existing projection object.

When the row is finished:

```ts
clear(...)
```

removes the current bindings so the projection can later be reused.

A new projection object is not required for each source row.

## Lazy access

Projection properties are methods rather than copied field values.

For example:

```ts
customer.balance()
```

causes the projection accessor to invoke the parser's typed operation:

```ts
parser.float(
    representation,
    field.path
)
```

The important path is therefore:

```text
application accessor
    ↓
generic projection
    ↓
parser ProjectionSupport
    ↓
parser-specific representation
    ↓
source bytes / parser state as appropriate
```

The generic projection layer does not decode CSV or COBOL bytes itself.

A future byte-backed CSV or COBOL representation can use the physical record and its structural state internally to satisfy that accessor.

## Late materialisation

Late materialisation is a core part of the representation model, particularly for COBOL.

A physical COBOL record does not necessarily have one obvious object representation. The same bytes may participate in:

- `REDEFINES`;
- overlapping structures;
- discriminated record layouts;
- `OCCURS DEPENDING ON`;
- different interpretations selected by record content;
- different interpretations required by different calculations.

For example, a region of bytes may represent either person data or company data:

```text
same physical bytes
        ↓
   ┌────┴────┐
   ↓         ↓
PERSON     COMPANY
view       view
```

Eager materialisation would require the ingestion layer to make an early decision:

```text
source bytes
    ↓
choose interpretation
    ↓
construct object
    ↓
application processing
```

That decision may be premature. The application may be the layer that has enough context to know which interpretation is appropriate.

The byte-backed model therefore keeps the physical record authoritative and allows interpretation to happen later:

```text
source bytes
    ↓
borrowed parser representation
    ↓
application requests a particular view/value
    ↓
interpret those bytes in that context
```

A projection is therefore not merely a convenient way to select fields. It is one of the mechanisms by which the application chooses the logical view it requires without forcing ingestion to manufacture one universal representation of the record.

This also produces an important performance benefit.

If a record contains 100 fields and a calculation accesses only four, the desired behaviour is:

```text
recognize the record
    ↓
retain the reusable structure needed to locate values
    ↓
interpret four requested values
```

rather than:

```text
interpret 100 values
    ↓
construct a complete object graph
    ↓
read four
    ↓
discard the rest
```

For CSV this primarily avoids unnecessary decoding and materialisation.

For COBOL it does both: it avoids unnecessary work **and preserves the ability to choose the correct interpretation of the physical bytes at the point where that choice can actually be made**.

## Borrowed lifetime

A projection is borrowed.

Its validity is tied to the `FileCursorResult` which owns the corresponding physical record.

After that result is closed:

> The projection reference is invalid and must never be used again.

Immediately after clearing, an attempted access may produce:

```text
Projection is not bound to a record
```

but callers must not rely on that as a permanent stale-reference check.

The projection object is pooled.

After reuse, the same JavaScript object may have been rebound to a later physical record. A stale reference could therefore observe that later record.

This behaviour is intentional to the borrowed-value model.

The framework does not perform a generation check on every accessor call merely to make invalid retained references safe.

Doing so would add work to the hot path.

The rule is simply:

```text
result open
    → projection valid

result closed
    → projection invalid
```

## Why retain the physical record?

The parser-specific representation is used to retrieve values.

The physical-record reference retained by the projection serves other purposes:

- keeping the underlying physical source alive for borrowed representations;
- retaining provenance such as source and record number;
- allowing parser-specific physical diagnostic rendering when projection access fails.

The projection does not bypass the parser and interpret physical record state directly.

## Projection errors

Parser errors and projection errors are different.

A parser error means the physical source record itself could not be represented successfully.

A projection error means a parser representation exists, but a requested logical field cannot be returned according to the declared projection.

For example:

```text
requested:
    integer age

actual JSON value:
    "forty two"
```

The accessor throws.

The projection layer can then enrich that error with context including:

- source;
- physical record number;
- logical projection path;
- parser-specific physical rendering.

Diagnostic strings are generated on the error path rather than as part of normal successful processing.

## Performance intent

The steady-state projection model reuses:

```text
projection wrapper
accessor functions
canonical field definitions
tokenised paths
```

Row-to-row work is primarily rebinding existing references and performing whichever accessor calls the application actually makes.

For JSONL, the underlying JSON representation has already been eagerly created by `JSON.parse()`.

For CSV and COBOL, the projection is intended to enable genuine late materialisation from byte-backed representations.

