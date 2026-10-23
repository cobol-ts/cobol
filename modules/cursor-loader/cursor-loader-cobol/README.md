# `@cobol-ts/cursor-loader-cobol`

Fixed-record **byte-backed COBOL parsing and projections**. This adapter connects compiled copybook storage geometry to the generic `@cobol-ts/cursor-projection` framework. It deliberately keeps the original physical record bytes as the authoritative data instead of constructing a decoded COBOL object graph.

## Why byte-backed COBOL matters

A copybook and the bytes do **not** always determine a unique business object. `REDEFINES` alternatives may require application knowledge to select the correct meaning; that knowledge may depend on another field, another record, another file or an external system. It is unsafe to demand that a generic parser choose one definitive object representation without such context.

The compiler answers physical questions—where fields start, how large they are, what repeats or overlaps. The application selects appropriate projections and business meaning. A REDEFINES group is an **alternative view of the same bytes**, not another copy of them.

## Current scope

**Implemented:** fixed-length/fixed-blocked (FB) records with statically known record length; scalar field coordinate access; named groups; generated padding; fixed OCCURS; sibling OCCURS; nested fixed OCCURS; and REDEFINES inside repeated/nested groups, including unequal-sized overlay alternatives.

**Not yet implemented in this adapter:** variable physical record framing, record-dependent ODO counts/offsets, and production decoding of every COBOL primitive representation. The current scalar accessors are byte-range diagnostics; see below. The general layout compiler has wider symbolic capabilities than this fixed-record projection adapter.

## Setup: compile once for the opened source

```text
COBOL copybook
  → parseCopybook()
  → CopybookAst
  → compileCobolLayout()
  → CompiledCobolEntry[]
  → createCobolFixedDetails()
       ├─ name index, preserving original compiled-node references
       ├─ source-scoped compiled layout
       └─ recordLengthBytes
  → createProjection(cobolParser, details, context, definition)
       └─ numeric compiled member paths
```

`createCobolFixedDetails(layout)` requires exactly one top-level 01 record and evaluates its size statically. A variable ODO-dependent extent is rejected with an explicit fixed-record framing error. Structural name lookup is compiled from the layout, not repeated for every input record.

`CobolProjectionPath` retains selected compiled nodes and numeric geometry in **bits**: `offsetBits`, `sizeBits`, remaining `runtimeDimensions` (`count`, `strideBits`), source-scoped `fullPath`, and the count of enclosing dimensions already selected. Paths may include literal numeric occurrence selectors. A scalar method may alternatively receive remaining indexes at call time; the first-class array API below is preferred for projected repeated groups.

## Record reading: bytes remain the representation

The physical cursor acquires pooled `Uint8Array` buffers. The fixed COBOL parser advances to `record.startByte + details.recordLengthBytes`, calls `readMore()` until enough bytes are available, and sets `record.endByte`. A truncated final record produces recoverable parser `Errors`.

A logical record may span several physical buffers. The successful root `CobolRepresentation` is the **physical record itself**. No decoded group or occurrence is built when parsing completes.

## Simple fixed OCCURS: an array of projections

```cobol
01 CUSTOMER.
   05 CUSTOMER-ID PIC 9(4).
   05 TELEPHONES OCCURS 2 TIMES.
      10 PHONE-RAW PIC X(6).
      10 PHONE-PARTS REDEFINES PHONE-RAW.
         15 PHONE-KIND PIC X.
         15 PHONE-NUMBER PIC X(5).
   05 STATUS PIC X.
```

There are 17 bytes in the physical record: `4 + 2 × 6 + 1`. The two telephone occurrences are six bytes apart. The alternative PHONE-PARTS interpretation reuses the six bytes of PHONE-RAW.

```ts
import type {ProjectedArray} from "@cobol-ts/arrays";
import {defineProjection} from "@cobol-ts/cursor-projection";

interface PhoneParts {
    kind(): string;
    number(): string;
}
interface Phone {
    raw(): string;
    readonly parts: PhoneParts;
}
interface Customer {
    readonly telephones: ProjectedArray<Phone>;
}

const definition = defineProjection<Customer>({
    telephones: {type: "array", path: ["CUSTOMER", "TELEPHONES"], element: {
        raw: {type: "string", path: ["PHONE-RAW"]},
        parts: {type: "object", path: ["PHONE-PARTS"], fields: {
            kind: {type: "character", path: ["PHONE-KIND"]},
            number: {type: "string", path: ["PHONE-NUMBER"]}
        }}
    }}
});

// On a bound record:
customer.telephones.length;             // 2
customer.telephones[1].raw();           // selects record bytes [10,16)
customer.telephones[1].parts.number();  // selects [11,16)
```

`compileCobolMemberPath()` resolves each child path **relative to the enclosing group at setup time**, using the full declaration hierarchy. For fixed OCCURS it knows the static count and stride. At runtime `cobolParser.array()` supplies an indexed source whose element view carries only:

```ts
type SelectedOccurrence = {
    physical: ProjectionPhysicalRecord; // original physical record
    displacementBits: number;           // selected occurrence displacement
};
```

For this example, occurrence 1 adds `1 × 6 × 8 = 48` bits. The already-compiled raw field position is byte 4, so its selected byte range is `[4 + 6, 4 + 6 + 6) = [10,16)`. **No per-occurrence bytes or COBOL data object are materialised.** Group selections retain the view; scalar access combines its displacement with the compiled field coordinates.

## Multiple fixed OCCURS and nested arrays

Several sibling OCCURS groups are independent: `telephones` and `addresses` have distinct compiled member objects, counts, strides and reusable child slots. The physical-record state's `projectionViews` map uses **compiled member identity** as the key. A file-scoped physical-record pool already owns the relevant compiled source; there is no need for a separate file discriminator in every child slot.

Nested OCCURS composes exactly like nested projected objects and arrays:

```ts
interface Item { sku(): string }
interface Order { readonly items: ProjectedArray<Item> }
interface Customer { readonly orders: ProjectedArray<Order> }

customer.orders[1].items[2].sku();
```

The numeric location is the combination of **precompiled** base and field positions with the selected outer and inner occurrence displacements. For fixed extents, conceptually:

```text
fieldOffset = fieldBase + outerIndex × outerStride
                       + innerIndex × innerStride
```

Each accessed outer element retains its own inner array view and child projections. Its logical `items.length` is distinct from the number of inner child objects previously created. Clearing a record invalidates bindings but does not discard these reusable high-water slots. An array can expose a smaller active length without exposing retained elements beyond it.

## REDEFINES, including unequal-length overlays

Consider nested `ORDERS OCCURS 2`, each containing `ITEMS OCCURS 3`. Inside each item:

```cobol
15 RAW PIC X(2).
15 EXTENDED REDEFINES RAW.
   20 KIND PIC X.
   20 PAYLOAD PIC X(3).
```

The inner item's storage extent is **four bytes**, not two, because the longer overlay determines the physical extent. If each order ends with a one-byte TAIL, its stride is `3 × 4 + 1 = 13` bytes. Prefix and trailing fields must also stay correctly located.

`src/cobol.nested.redefines.projection.spec.ts` tests both alternative views, the four-byte inner stride, the thirteen-byte outer stride, fields following the arrays, independent live cursor leases and reuse. Expected byte offsets are specified independently of the production layout compiler. Neither the parser nor the projection framework chooses the semantically correct overlay: that is application logic.

## Pooled state and lifetime

```ts
import {cobolParser, createCobolRecordState, cleanCobolRecordState} from "@cobol-ts/cursor-loader-cobol";

// In the opened-file parser registry:
cobol: {
    parser: cobolParser,
    parserConfig: () => preparedFixedDetails,
    createRecordState: createCobolRecordState,
    cleanRecordState: cleanCobolRecordState
}
```

`CobolRecordState` extends `ProjectionRecordState` with `odoPositions`, a map keyed by compiled OCCURS nodes. Both maps live on **each pooled physical-record holder**. `projectionViews` retains reusable projected-array slots; `odoPositions` retains lazily grown, jagged arrays of physical bit boundaries.

**Register `cleanRecordState: cleanCobolRecordState`** when opening a source. The physical-record pool invokes it only on final release, after the projection was cleared; it resets every calculated boundary prefix's `size` to zero but preserves the allocated arrays and projected slots. Without that callback, reuse of a physical holder across different ODO counts could produce stale positions. Neither a generation counter nor a new generic projection-object pool is required.

`customer.orders[0]` can remain accessible alongside `customer.orders[1]` during the same record lease. Repeated selection of an already acquired index returns its child projection object. Closing the result clears all borrowed bindings; callers must not use root or child projections after close because pooled objects can be rebound to a later record.

## Current byte-range scalar accessors

The current byte-backed scalar operations report field locations rather than finished COBOL business values:

- `string` and `character`: `from/to/hex-bytes`, with record-relative zero-based byte offsets and exclusive end.
- `integer` and `float`: a compact number encoding the start/end debug range, **not** the decoded numeric field value.

These are deliberate implementation-stage diagnostics. The projection geometry, fixed array selection, lifetime and original-byte behaviour are exercised independently of full primitive-value codecs. Primitive decoding is a separate remaining integration task.

## Tests and fixtures

- `src/customer.fixtures.ts` / `.spec.ts`: hand-specified byte sequences, parsed AST, compiled layout and five customer shapes (flat, nested, aligned, fixed OCCURS/REDEFINES, and future ODO material).
- `src/customer.projections.spec.ts`: name index and compiled node identity.
- `src/cobol.projection.spec.ts`: static/runtime numeric paths, debug field ranges, REDEFINES and cursor integration.
- `src/cobol.fixed.array.projection.spec.ts`: first-class fixed array elements and borrowed values.
- `src/cobol.multiple.nested.arrays.spec.ts`: independent sibling arrays; nested fixed arrays; per-level high-water reuse; simultaneous records.
- `src/cobol.nested.redefines.projection.spec.ts`: nested arrays + unequal REDEFINES, offset and lifetime regression tests.
- `src/cobol.layout.index.spec.ts`, `src/cobol.debug.range.spec.ts`: isolated index and range helpers.

Tests use the **real** `parseCopybook → compileCobolLayout → createCobolFixedDetails → createProjection` path and independent byte/offset expectations, not a second test-only layout algorithm. Run the package Jest tests and the appropriate TypeScript build. The complete monorepo suite is a separate regression check.

## Next milestones

ODO count resolution and record-dependent geometry, variable-record framing, real client copybooks and actual primitive codecs. These should not change the `ProjectedArray<T>` application interface; fixed nested OCCURS has already shown that array composition works using the existing projection machinery.
