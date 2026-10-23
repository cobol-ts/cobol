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
Do not use this abstraction for sparse indexed caches such as projected-array
child slots, which have different active-length semantics.
