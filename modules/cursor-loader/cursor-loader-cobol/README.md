# @cobol-ts/cursor-loader-cobol

The COBOL-specific integration point for the byte-backed cursor/projection framework.
It lives alongside `cursor-loader-csv` and `cursor-loader-json` and consumes the existing
compiled storage layout rather than recalculating COBOL geometry.

## Implemented first projection stage

This package now contains a **fixed-length COBOL parser** and a byte-backed
**debug projection** that uses the shared `@cobol-ts/cursor-projection` factory.
Normal source preparation builds the name index once; creating the projection
factory calls `compileProjectionPath` once per projected accessor. Individual
records do not walk the name index or recompile COBOL paths.

The initial accessors deliberately do not decode COBOL values:

- `string()`/`character()` return `from/to/hex-bytes`, with record-relative
  byte offsets and an exclusive end.
- `integer()`/`float()` return a diagnostic number encoding the unsigned 16-bit
  start and end offsets. This is a **debug range**, not the numeric COBOL value.

### First-class projected arrays: fixed OCCURS

Fixed-size repeated **groups** can now be exposed as a `ProjectedArray<T>`
property, using the same application-facing array interface as JSONL. No COBOL
array or record is materialised. The physical record's original byte buffers
remain the only payload; each *accessed* child projection merely binds to the
same physical record plus a selected occurrence displacement (in bits).

```ts
import type {ProjectedArray} from "@cobol-ts/arrays";

interface Phone { raw(): string }
interface Customer {
    readonly telephones: ProjectedArray<Phone>;
}

const definition = defineProjection<Customer>({
    telephones: {
        type: "array",
        path: ["CUSTOMER", "TELEPHONES"],
        element: {raw: {type: "string", path: ["PHONE-RAW"]}}
    }
});

customer.telephones.length;    // compiled OCCURS count (2)
customer.telephones[1].raw(); // selected bytes in occurrence 1
```

The `path` of an element's field is **relative to its enclosing group** at
authoring time. The generic factory passes its enclosing compiled path to the
COBOL compiler, which resolves full names and fixed offsets once. At runtime,
selecting an occurrence adds only `index * strideBits` to the child view;
scalar readers then use the precompiled absolute field coordinates. The
original indexed-scalar accessor form (`phone(index)`) remains supported.
An explicit REDEFINES group within a selected occurrence may be projected as a
readonly nested object, selecting the same overlapping bytes.

`createCobolRecordState()` now supplies the reusable `projectionViews` map,
just like JSONL. It must be registered as `createRecordState` for the COBOL
parser. The existing physical-record implementation and pooling do not change.
The record state retains child projections in high-water slots, but exposes
only the current logical OCCURS length. Record close clears borrowed bindings;
retained child objects are reused on the next lease. As for all borrowed
projections, application references are invalid once the result is closed.

**Limits of this stage:** fixed OCCURS with one projected repeated-group level;
there is no ODO count resolution, no variable-length record framing and no
actual COBOL primitive decoding. Nested OCCURS *array projections* have not yet
been designed or tested. Debug `string()` and `integer()` still return the
existing byte-coordinate diagnostics rather than decoded values.

### Logical paths and occurrences

An application path is `readonly (string | number)[]`. String components name
COBOL declarations; numeric components denote **fixed occurrence selectors**
(zero-based), placed immediately after the corresponding `OCCURS` declaration.
An `OCCURS` declaration without a following numeric selector instead consumes
one accessor argument, in nesting/path order.

```ts
interface Customer {
    name(): string;
    phone(index: number): string;
    secondPhone(): string;
}

const definition = defineProjection<Customer>({
    name: {type: "string", path: ["CUSTOMER", "CUSTOMER-NAME"]},
    phone: {type: "string", path: ["CUSTOMER", "TELEPHONES", "PHONE-RAW"]},
    secondPhone: {type: "string", path: ["CUSTOMER", "TELEPHONES", 1, "PHONE-RAW"]}
});
```

`phone(1)` and `secondPhone()` select the same bytes, but `secondPhone`'s
index is completely resolved during setup. No `"[]"` placeholders are needed.
For nested OCCURS, `customer.item(outer, inner)` supplies indices in the order
of repeated declarations along the path; a literal numeric component consumes
its dimension at compilation, leaving only the other dimensions as arguments.

A compiled path contains numeric `offsetBits`, `sizeBits`, and only the remaining
runtime dimensions (`strideBits`, `count`). A field reference to the original
layout node is retained for provenance. Thus compilation is stronger than
converting field names into integer child ordinals: it derives **physical bit
coordinates and strides**. Runtime access is constant-time for fixed OCCURS.

### Geometry, ownership and boundaries

`createCobolNameIndex` uses the original compiled layout, skipping padding and
inaccessible FILLER subtrees, retaining both REDEFINES alternatives and
aggregating duplicate-name errors using `ErrorsOr`. It does not expand OCCURS.

The parser reads a fixed record with the existing pooled byte cursor and passes
it through the generic borrowed-projection lifecycle. The diagnostic string
encoder supports records beginning partway through a buffer and ranges crossing
multiple buffers. The projection must not be retained after its result is closed.

Not yet implemented: variable-length framing, source-byte ODO count resolution,
record-dependent symbolic field locations, general COBOL primitive decoding, or
variable nested array projection support. The fixed-record setup rejects layouts whose
record length cannot be determined without ODO values. The *declarations* are
still findable in the name index: declaration lookup is distinct from runtime
field location. `ProjectionSupport` was extended generically to forward numeric
accessor arguments; CSV continues using one precompiled column integer and
rejects numeric authoring paths. JSONL also supports first-class projected arrays through the shared generic factory.

## Project integration

The package is included under `cursor-loader/cursor-loader-cobol/` with
`package.json`, `package.details.json`, `index.ts`, `tsconfig.json`,
`jest.config.json` and `babel.config.json`, matching sibling packages.

Run `npm test -- --runInBand` using the normal monorepo workspace environment.

## Customer test fixtures (TDD progression)

`src/customer.fixtures.ts` contains five self-contained `CustomerFixture`s. Each
has a **copybook string**, two **explicit EBCDIC-037 byte sequences** (plus raw
COMP bytes in the aligned case), the **parsed AST**, and the **compiled layout**:

```ts
const ast = valueOrThrow(parseCopybook(copybook));
const layout = valueOrThrow(compileCobolLayout(ast, `${label}.cpy`));
return {label, copybook, ast, layout, records};
```

The data bytes and expected end-exclusive field slices are handwritten hex
oracles, **not** produced from `layout` or a production COBOL encoder. The
fixture test checks that their lengths and named field positions agree with the
real compiler/locator and that `createCobolNameIndex` returns references to the
same compiled nodes.

| Fixture | Two record lengths | Intent |
| --- | --- | --- |
| `customerSimple` | 15, 15 | Flat DISPLAY fields: first projection milestone |
| `customerNested` | 21, 21 | Nested group and FILLER |
| `customerAligned` | 9, 9 | A generated alignment byte before COMP |
| `customerFixedOccurs` | 17, 17 | Fixed OCCURS and REDEFINES inside each element |
| `customerOdoRedefines` | 14, 23 | Zero/three occurrences, plus REDEFINES within an ODO body |

The ODO samples are **logical record payloads of active length**, not a complete
VB file: there are no RDWs or other framing bytes. They are reserved for later
variable-record work. The initial fixed-length parser can start with
`customerSimple` and proceed one feature at a time. `itemCount` is provided as
fixture metadata for evaluating ODO geometry until byte-backed controller
resolution is implemented.

Tests live in `src/customer.fixtures.spec.ts`. Test data should remain
independent of the code under test; never populate expected offsets using the
compiled layout or expected hex by decoding and re-encoding the records.

## Application-facing customer projection contracts

`src/customer.projections.ts` declares one TypeScript accessor interface for each
customer schema (`SimpleCustomer`, `NestedCustomer`, `AlignedCustomer`,
`FixedOccursCustomer`, and `OdoCustomer`) and a matching **typed**
`defineProjection<T>()` mapping. Each `CustomerFixture` exposes its canonical
`projection` alongside the copybook, parsed AST, compiled layout, and two
literal records. For example:

```ts
export interface SimpleCustomer {
    id(): number;
    name(): string;
    status(): string;
}

export const customerSimpleProjection = defineProjection<SimpleCustomer>({
    id: {type: "integer", path: ["CUSTOMER", "CUSTOMER-ID"]},
    name: {type: "string", path: ["CUSTOMER", "CUSTOMER-NAME"]},
    status: {type: "character", path: ["CUSTOMER", "STATUS"]}
});
```

The types reflect the **debug projection phase**: `number` is an encoded pair
of byte offsets, and `string` is `from/to/hex-bytes`. No COBOL values are
being decoded yet. The contracts are method-based because the real projection
framework produces **borrowed lazy accessors**, not materialised objects.

`src/customer.projections.spec.ts` tests **name resolution**, not field coordinates.
A table of literal copybook paths covers every named declaration across the
five customer schemas, including nested groups, SYNCHRONIZED padding neighbours,
fixed OCCURS bodies, both REDEFINES interpretations and declarations after an
ODO table. Each resolved name is compared by **object identity** with the
original compiled entry selected independently by its copybook source line.
The same test file checks every current typed application projection path,
case-insensitive names, scope boundaries, inaccessible FILLER and absent paths.

This deliberately does **not** reimplement the projection-path compiler in the
tests. `CobolNameIndex` resolves a *declaration*, not a physical occurrence or
its record-specific address. The compiled-path layer interprets each numeric component as a fixed selector
and omitted selectors as runtime dimensions. Byte-oracle checks remain in `customer.fixtures.spec.ts` and the future
byte-backed projection tests.
