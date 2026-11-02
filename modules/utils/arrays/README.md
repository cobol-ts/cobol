# @cobol-ts/arrays — ProjectedArray

`ProjectedArray<T>` extends `ReadonlyArray<T>`. An ordinary `Array<T>` satisfies it.
A lazy projected array preserves its native array interface without creating
its child objects until they are accessed. Its `length` comes from the current
logical record; its internal cached projections may retain more slots.

`createProjectedArray(source)` wraps an empty native array using a proxy.
Element lookup delegates to the supplied source, while `map`, `slice`,
`forEach`, iteration, `at` and the other readonly array methods are inherited
from `Array.prototype`. Operations such as `map` allocate their returned array
just as they would for an ordinary JavaScript array. No data-format-specific
logic or record ownership exists in this package. Mutation is rejected.

The projection package supplies the mutable source and retains reusable
child projections in pooled physical-record state. Borrowed elements are invalid
after their owning file-result lease closes.

## ArrayWithSize — reusable contiguous prefixes

`ArrayWithSize<T>` is a small, independent abstraction for buffers where the
valid data is exactly `values[0..size)`. Its backing array may retain entries
beyond `size` after reset. `createArrayWithSize()`, `appendArrayWithSize()` and
`resetArrayWithSize()` let a caller grow and reuse a prefix without allocating
another array on each lease:

```typescript
const boundaries = createArrayWithSize<number>();
appendArrayWithSize(boundaries, 100);
appendArrayWithSize(boundaries, 124);
resetArrayWithSize(boundaries); // size = 0, values' storage retained
appendArrayWithSize(boundaries, 200); // overwrites the first slot
```

Reset invalidates the prefix; it does not clear object references beyond it.
Do not use this abstraction *as the indexed lookup array* for sparse projected children. It **is** appropriate for the separate dense list of child references activated during the current lease. In the projection and ODO caches, sparse indexed storage remains independent of this `ArrayWithSize` cleanup prefix.

## Projected-array access metrics

`createProjectedArray(source, metrics?)` optionally counts direct Proxy `length` requests, numeric property selections and valid numeric selections. Its default `NullMetrics` performs no storage or I/O. A numeric index access calls the provider's length method to validate bounds; the projection package separately counts provider length-resolution work, selection, binding and cleanup. No new array elements are materialised by the counters.

## Native arrays versus the Proxy adapter

The `ProjectedArray` Proxy adapter is the **lazy** selection mechanism: numeric property access asks a source for its active length and selected element, and the projection layer manages reusable high-water child views. Small fixed-position COBOL arrays may instead use real JavaScript arrays of reusable projection children, selected by the COBOL projection runtime. That does not change the contract of `createProjectedArray` or make the Proxy unnecessary; symbolic/ODO and complex arrays still require it. The native-array strategy holds views, not scalar values, and the byte-backed borrowed lifetime is enforced by the owning projection/record binding rather than by JavaScript array indexing.
