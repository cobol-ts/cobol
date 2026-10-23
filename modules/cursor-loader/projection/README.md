# `@cobol-ts/cursor-projection`

Compile-once, lazy, reusable **typed projections** over parser-owned representations. A projection gives application code a familiar interface without requiring a fresh tree of decoded values for each record.

## Why this package exists

The architecture deliberately separates three responsibilities:

1. **Physical input and lifetime** (`cursor-record`, `cursor-file`): borrow bytes, delimit records, manage leases and pools.
2. **Format-specific interpretation** (CSV, JSONL, COBOL): compile logical paths and read or select values in the representation.
3. **Application projection** (this package): declare desired members, compile them once, expose scalar methods, nested objects and projected arrays.

For byte-backed formats this is more than an optimisation. A COBOL copybook and the bytes do not always identify one unambiguous *business* object. `REDEFINES` may require business context—possibly outside the record—to select an interpretation. This package does not attempt to make that decision.

## Application-facing model

```ts
import type {ProjectedArray} from "@cobol-ts/arrays";
import {defineProjection, createProjection} from "@cobol-ts/cursor-projection";

interface Item {
    sku(): string;
    quantity(): number;
}
interface Order {
    id(): number;
    readonly items: ProjectedArray<Item>;
}
interface Address {
    town(): string;
}
interface Customer {
    name(): string;
    readonly address: Address;
    readonly orders: ProjectedArray<Order>;
}

const customerDefinition = defineProjection<Customer>({
    name: {type: "string"},
    address: {type: "object", fields: {
        town: {type: "string"}
    }},
    orders: {type: "array", element: {
        id: {type: "integer"},
        items: {type: "array", element: {
            sku: {type: "string"},
            quantity: {type: "integer"}
        }}
    }}
});

// Given a live, bound Customer projection:
customer.orders[0].items[1].sku();
customer.orders.map(order => order.id());
customer.address.town();
```

Scalar members are functions returning `string` or `number`. Nested objects and arrays are **readonly properties**. Supported scalar types are `integer`, `float`, `character` and `string`. Arrays may contain further projected objects and arrays, including multiple sibling arrays within one parent.

`defineProjection<T>()` type-checks the definition against the application's interface and canonicalises missing paths, so `name: {type:"string"}` becomes a member with the logical path `["name"]`. Child paths are **relative to the containing projection**. A path can contain `string` names and `number` literal selectors; whether those selectors are valid depends on the parser.

## Compile once, then bind many records

```ts
const factory = createProjection(
    parser,               // format's ProjectionSupport and debug renderer
    preparedDetails,      // one opened source
    preparationContext,   // often undefined
    customerDefinition
);

const customer = factory.create(); // one reusable, initially unbound view
factory.bind(customer, representation, physicalRecord);
// Use customer while its owning record lease is live.
factory.clear(customer);           // remove borrowed bindings
```

Compilation recursively visits all scalar, object and array members. Each logical path goes through the parser's `compileProjectionPath(details, context, path, parent?)` **once at factory creation**, including relative child paths. The compiled schema keeps numeric COBOL field geometry, numeric CSV column indexes or JSON property-path tokens. It is independent of the current row.

The factory installs reusable scalar accessor functions and getters on view objects. Calling a scalar accessor passes the selected representation, source details and compiled path to the parser. A projected array getter asks the parser for an **indexed source**: `length()` and `element(index)`. It never requires a materialised array of underlying record values.

## Array selection and reusable child views

The array interface and proxy live in `@cobol-ts/arrays`; record-aware projection construction lives here. At runtime:

```text
customer.orders
  └─ source: length(), element(index)
       ├─ [0] → cached Order projection, bound to selected representation
       │         └─ items → its own cached ProjectedArray<Item>
       └─ [1] → independent cached Order projection
```

A projected array has **two different quantities**:

- **Active length**: how many elements the current representation exposes (native JSON array length or a COBOL OCCURS count).
- **Retained element slots**: projection objects created on earlier accesses and kept for reuse. Slots are allocated lazily; accessing index 9 need not construct indexes 0–8.

The active length determines bounds and iteration. Retained slots outside that length are inaccessible but are not discarded. The same rule applies independently to each nested array. This high-water reuse avoids repeatedly rebuilding the projection hierarchy.

**Where state lives:** root array runtimes are stored in `record.recordState.projectionViews`, keyed by the **compiled array-member object**. Different members (`orders`, `addresses`, etc.) therefore cannot collide. Nested arrays are retained by their respective child projection instances. No new physical-record class or independent child-object pool is required. The physical-record pool is source/file-scoped; its generic record state persists while holders are reused.

A name such as `root.orders` accompanies array runtimes for debugging; the name is not their cache key. The normal cursor integration binds one root projection to its leased physical-record holder.

## Borrowed lifetime and pooling

`FileCursorResult` owns a live physical record and a reusable root projection. Closing the result clears projection bindings, including accessed children, before releasing the physical record and its byte-buffer leases. **Keep neither root nor child views beyond that close.** Pooled JavaScript objects may later refer to different rows; a retained reference is not a permanently safe snapshot.

Two simultaneously live file results have distinct physical record holders and retain independent projected children. Selecting `orders[0]` more than once during a lease returns the same projected child object. **Repeated nested-object and array property getters reuse an already bound selection without calling the parser again.** This relies on the borrowed representation remaining structurally stable for the lease; clearing the parent invalidates child bindings before reuse. Reuse on a subsequent lease avoids recompilation and, for previously accessed indexes, avoids recreating child objects.

## Format-specific behaviour

| Parser | Scalar access | Object and array selection |
| --- | --- | --- |
| JSONL | Traversal of already parsed JSON | Native object selection and `ProjectedArraySource` over a JSON array |
| COBOL, fixed layout | Numeric field coordinates over original bytes | Selected group plus occurrence displacement; no copied COBOL array |
| CSV | Compiled column number and lazy byte-range decoding | Intentionally flat: no nested object/array capability |

Legacy runtime-indexed **scalar** methods also remain supported where the parser implements them; they are not equivalent to first-class projected arrays.

## Errors and diagnostics

Parse-time `Errors` and lazy projection exceptions are different. A malformed physical record may be handled by a cursor row-error policy. Once a representation exists, a failed projected member access throws with the current `source`, one-based `recordNumber`, member path and the parser's physical-record rendering. Source-dependent path failures, such as a missing CSV column, occur earlier at factory construction.

Diagnostics from deeply nested accessors currently identify the compiled member's *relative* field path rather than always reporting a fully qualified `orders[1].items[2]` chain. Do not depend on full nested occurrence paths in error strings yet.

## Tests and boundaries

Relevant tests are in `src/projection.definition.spec.ts`, `src/create.projection.spec.ts`, `src/nested.projection.type-tests.ts` and `src/indexed.projection.type-tests.ts`; parser packages also exercise this factory through real file cursors. Run the package's normal Jest script and TypeScript compilation separately.

The generic factory intentionally does not parse COBOL, infer business semantics, copy record payloads or resolve ODO controllers. The COBOL adapter now supports nested ODO through parser-owned record-scoped position caches; those details do not affect the generic projection contract.
