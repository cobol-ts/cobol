# @cobol-ts/cursor-file

Application-facing cursor adapters for the byte-backed `@cobol-ts` pipeline.

Despite the historical package name, this package is **not** the physical file-reading layer in the current architecture.

It consumes parsed `RecordCursor` results, binds successful parser representations to reusable lazy projections, and exposes those projections through a small application-facing cursor API.

## Position in the pipeline

```text
RecordCursor
    ↓
RecordCursorResult
    ├── parser representation or Errors
    └── open physical record
    ↓
@cobol-ts/cursor-file
    ↓
pooled FileCursorResult
    ├── reusable bound projection
    └── close()
    ↓
application code
```

This package is the point where physical-record lifetime becomes part of the user-facing result lifetime.

## The normal application model

Application code gets a cursor, uses the fields required for its calculation, and closes the result when finished.

For example:

```ts
for await (const row of cursor) {
    if (Array.isArray(row)) {
        // Recoverable parser errors.
        continue;
    }

    try {
        console.log(
            row.result.id(),
            row.result.name()
        );
    }
    finally {
        row.close();
    }
}
```

The projection presents an ordinary application-facing interface:

```ts
interface Customer {
    id(): number;
    name(): string;
    balance(): number;
}
```

Those methods are lazy accessors.

For formats such as CSV and COBOL they can eventually result in only the requested fields being interpreted.

## Cursor variants

The package provides several error-handling styles.

### `createFileCursor`

Returns either a successful:

```ts
FileCursorResult<TProjection>
```

or recoverable:

```ts
Errors
```

result according to the underlying types.

This avoids introducing an additional success-wrapper abstraction around every normal projected row.

### `createErrorsOrFileCursor`

Exposes a uniform `ErrorsOr<FileCursorResult<TProjection>>` result shape.

This can be convenient to callers that prefer an explicit success/error wrapper.

### `createThrowingFileCursor`

Returns successful projected records and converts recoverable parser errors into `ErrorsException`.

### `createIgnoringFileCursor`

Skips recoverable parser errors and continues processing.

An optional callback may be used to observe ignored errors.

## `FileCursorResult`

A successful row has a deliberately small public shape.

Conceptually:

```ts
interface FileCursorResult<TResult> {
    readonly result:
        TResult;

    close():
        void;
}
```

`result` is the application-facing lazy projection.

`close()` ends the borrowed record lifetime.

## Why `close()` is explicit

The projection may still depend on the physical source record.

For a future CSV implementation:

```ts
customer.balance()
```

might ultimately read the required byte range from a borrowed CSV representation backed by that physical record.

The physical source therefore has to remain alive for as long as the application is allowed to invoke projection accessors.

`close()` performs the ownership release.

Conceptually:

```text
application finishes row
    ↓
clear projection binding
    ↓
release physical record
    ↓
return reusable result wrapper to pool
```

## Result and projection reuse

`FileCursorResult` wrappers are pooled.

Each reusable result can own a reusable projection object created by the associated `ProjectionFactory`.

On a successful parsed row the existing projection is bound to:

- the current parser representation;
- the current physical record.

When the result closes, that binding is cleared.

The result wrapper and projection object can then be reused for another source record.

Normal row-to-row processing therefore does not require construction of a new projection object and a new set of accessor functions.

## Borrowed result lifetime

Both the `FileCursorResult` and its projection are borrowed.

Once:

```ts
row.close();
```

has been called, neither should be used again.

Because these objects are pooled, a retained stale reference may later refer to an object which has been rebound to another source record.

The framework does not attempt to make such stale references safe.

The application contract is explicit:

```text
before close
    valid

after close
    invalid
```

This avoids adding ownership/generation checking to every hot-path accessor.

## Several live results

The architecture permits more than one result to remain live.

If application code retains several open rows, the pools can grow to provide independent result wrappers, projections, physical records and buffer ownership for those simultaneously live rows.

Memory usage is therefore primarily related to:

```text
maximum simultaneously live results
```

rather than:

```text
number of records processed
```

Bounded memory depends on callers eventually closing results they no longer need.

## Error lifetime

When the parser returns recoverable `Errors`, there is no successful projected application result which needs to retain that physical record.

The cursor adapter therefore applies the selected error policy and releases the physical-record lifetime appropriately.

Likewise, if projection binding fails, the physical record must not be left owned by an application result which was never successfully created.

## Example

```ts
interface Customer {
    id(): number;
    name(): string;
}

const customerProjection =
    defineProjection<Customer>({
        id: {
            type: "integer"
        },

        name: {
            type: "string"
        }
    });

const factory =
    createProjection(
        jsonParser,
        customerProjection
    );

const cursor =
    createFileCursor(
        recordCursor,
        factory
    );

for await (const value of cursor) {
    if (Array.isArray(value)) {
        console.error(value);
        continue;
    }

    try {
        consume(
            value.result.id(),
            value.result.name()
        );
    }
    finally {
        value.close();
    }
}
```

## Performance intent

This layer exists to provide a simple application API without requiring an eagerly materialised application object for every row.

The intended steady-state success path reuses:

```text
FileCursorResult wrapper
projection object
projection accessor functions
physical-record holder
physical byte buffers
parser record state
```

The projection then asks the parser only for values actually requested by the calculation.

For JSONL, the JSON object has already been eagerly created, so the benefit is principally API and lifetime validation.

For CSV and COBOL, the same interface is intended to sit over genuinely byte-backed late materialisation.

The broader performance hypothesis is that reducing the amount of memory created, populated and moved through the CPU will increase throughput once parser/application computation becomes comparatively cheap.

That hypothesis is deliberately subject to benchmarking.