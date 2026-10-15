# @cobol-ts/cursor-file

Application-facing file cursor orchestration for the byte-backed `@cobol-ts` pipeline.

This package now owns the normal end-to-end source-opening path. Given a file definition, a physical source object and infrastructure, it:

- selects the parser from the parser registry;
- derives parser configuration from the file definition;
- creates pooled physical-record resources;
- runs optional parser preparation;
- compiles projection paths against the prepared source;
- creates a reusable projection factory;
- iterates parsed records;
- applies the selected row-error policy;
- manages successful result/projection lifetime.

## Position in the pipeline

```text
CursorFileDefinition + file + FileCursorInfrastructure
    ↓
parser registry lookup
    ↓
createDefaultPhysicalRecordConfig()
    ↓
openRecordCursor()
    ├── optional parser.prepare()
    └── RecordCursor
    ↓
createProjection(
    parser,
    opened details,
    preparation context,
    canonical projection
)
    ↓
data rows
    ↓
pooled FileCursorResult
    ├── reusable bound projection
    └── close()
    ↓
application code
```

## File definitions

A file definition contains only source-level information required by generic cursor orchestration:

```ts
interface CursorFileDefinition<
    TProjection,
    TFileType extends string
> {
    readonly filename: string;
    readonly fileType: TFileType;
    readonly projection:
        CanonicalProjection<
            ProjectionDefinition<TProjection>
        >;
}
```

Parser-specific configuration can be added by a more specific application/file-definition type and extracted by the registry entry's `parserConfig(definition)` function.

For example, the integration tests add CSV separator/quote configuration to their CSV file definitions without making generic `CursorFileDefinition` understand CSV.

## Infrastructure

The generic infrastructure is:

```ts
interface FileCursorInfrastructure<
    TFile,
    TFileType extends string
> {
    readonly parsers: ParserRegistry<TFileType>;
    readonly bufferSize: number;
    readonly fillFileBuffer: FillFileBuffer<TFile>;
}
```

The physical `TFile` abstraction is application-defined. The cursor requires only the ability to fill a supplied pooled `Uint8Array` from the current source position.

## Parser registry

Each file type resolves to a registration containing:

```ts
parser
parserConfig(definition)
createRecordState()
```

The registration is where a file-definition shape is connected to the parser's configuration and per-record state.

After runtime file-type lookup, generic cursor orchestration deliberately erases the concrete parser-family generics at that narrow registry boundary.

## Source setup

Before any data row is yielded, `cursor-file`:

1. looks up the parser;
2. obtains parser configuration;
3. creates byte-buffer and physical-record pools;
4. calls `openRecordCursor()`;
5. receives opened-source details and optional preparation context;
6. calls `createProjection()` and compiles every projection path once.

Configuration, parser preparation and projection-path compilation failures therefore happen before the normal data-row loop and **throw** for every cursor policy.

This is intentional: setup failures are not recoverable row data errors.

## The normal application model

Application code consumes only the values required by its calculation and closes each successful result when finished:

```ts
for await (const row of cursor) {
    if (Array.isArray(row)) {
        // Recoverable row Errors represented as string[].
        continue;
    }

    try {
        use(
            row.result.id(),
            row.result.name()
        );
    } finally {
        row.close();
    }
}
```

Projection methods are lazy accessors.

## Cursor variants

### `createFileCursor`

Returns successful rows as:

```ts
FileCursorResult<TProjection>
```

and recoverable **data-row** parser errors as:

```ts
string[]
```

Only the `errors` array is exposed in this lowest-overhead policy.

Setup failures throw.

### `createErrorsOrFileCursor`

Returns each data row as:

```ts
ErrorsOr<FileCursorResult<TProjection>>
```

Recoverable row errors retain the full `Errors` object, including fields such as `reference`.

Setup failures still throw.

### `createThrowingFileCursor`

Returns successful rows normally and converts recoverable row `Errors` into `ErrorsException`.

Setup failures also throw.

### `createIgnoringFileCursor`

Skips recoverable row errors and continues.

An optional callback receives the full `Errors` object for ignored rows.

Setup failures are never swallowed or passed to `onError`.

## `FileCursorResult`

A successful result has the small public shape:

```ts
interface FileCursorResult<TResult> {
    readonly result: TResult;
    close(): void;
}
```

`result` is the reusable lazy application projection.

`close()` ends its borrowed physical-record lifetime.

## Result and projection pooling

Each pooled `FileCursorResult` owns one reusable projection object for its entire lifetime.

The wrapper object's shape is permanent. Its `physicalRecord` slot is internally either:

```text
undefined
    while inactive

PhysicalRecordLifetime
    while an active lease owns a record
```

On a successful row:

1. the permanent projection is bound to the current parser representation and physical record;
2. the physical record is stored in the result wrapper;
3. the wrapper is returned to the application.

On `close()`:

1. the projection binding is cleared;
2. the wrapper's physical-record slot is reset to `undefined`;
3. the physical record is closed;
4. the unchanged wrapper returns to its pool.

No new projection object or accessor functions are required for normal row-to-row reuse.

## Why `close()` is explicit

A lazy projection may still depend on the current physical source bytes.

For CSV, the current representation stores field byte ranges in `recordState`, and an accessor decodes the requested range only when called.

The physical record therefore has to remain live until application code has finished using the projection.

Once `close()` has been called, both the result wrapper and projection reference are invalid for application use. The same pooled objects may later represent another row.

## Several live results

Several successful results may remain live simultaneously.

The pools grow to support the maximum simultaneous demand for:

- result wrappers;
- projection objects;
- physical-record holders;
- physical buffers.

Memory is therefore tied to live work rather than total input size, assuming callers eventually close results.

## Error lifetime

If `Parser.parse()` returns recoverable row `Errors`, no successful projection lease is created. `cursor-file` closes that physical record immediately and applies the selected error policy.

If successful parser output cannot be bound into a result, the physical record is also closed before the exception propagates.

Lazy projection accessor errors happen later while a successful result is open. They propagate as exceptions enriched by the projection layer with the currently bound source, record number, logical path and parser-specific physical rendering.

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

const customerFile = {
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
        customerFile,
        file,
        infrastructure
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
    } finally {
        value.close();
    }
}
```

## Performance intent

The steady-state success path reuses:

```text
FileCursorResult wrapper
projection object
projection accessor functions
physical-record holder
physical byte buffers
parser record state
```

File-scoped setup performs parser preparation and projection-path compilation once before the row hot path.

For JSON, `JSON.parse()` has already eagerly materialised the source record. For CSV, the same application API sits over a genuinely byte-backed representation and materialises only requested field values.
