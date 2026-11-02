# cobol-ts

**Byte-backed, reusable projections over structured records in TypeScript.** The monorepo includes COBOL copybook parsing and layout compilation, record/file cursor infrastructure, lazy scalar decoding, and format adapters for COBOL, CSV and JSONL. It also contains the utility packages used by these components.

The central design decision is to keep the physical bytes authoritative. A projected field behaves like a typed accessor, but the framework does **not** decode an entire record into a new JavaScript object graph each time a record is read. Compiled geometry, projection objects, and record/buffer capacity can be reused, while decoding happens only when the consumer requests a scalar.

## How the pipeline fits together

```text
COBOL copybook text ──> copybook AST ──> layout compilation
                                             │
                                             ▼
                                compiled storage geometry
                                             │
File bytes ──> cursor-file ──> cursor-record ──> parser representation
                                             │
                                             ▼
                                 reusable typed projection
                                             │
                scalar accessor ─────────────┴──> byte-range decoder
                                             │
                                             ▼
                                  application processing
                                             │
                                             ▼
                              clear binding / return lease
```

The **definition/compilation** phase interprets a copybook and compiles paths and storage geometry. The **record** phase acquires the bytes and binds reusable views to the current physical record. These phases are deliberately separate: a new record does not normally require recompiling the copybook or recreating the projection schema. A format parser determines the relevant logical records and how the projection reads them; `cursor-file` and `cursor-record` provide shared lifecycle and buffer infrastructure.

### Ownership and borrowed views

The owning file/record cursor controls physical-record lifetime. A consumer may use a projection while the owning lease is active, and must close/release it as required by the chosen API. A retained projected child is a **borrowed view**, not a self-contained snapshot: it cannot be used to read previous record contents after close. Reuse and pooling are part of the contract, not an optional optimisation. Consult [cursor-file](modules/cursor-loader/cursor-file/README.md), [cursor-record](modules/cursor-loader/cursor-record/README.md) and [projection](modules/cursor-loader/projection/README.md) together before changing lifetime logic.

### Projected arrays: two execution models

For eligible small fixed-position COBOL OCCURS groups containing scalar-only child projections, the current implementation exposes a **real JavaScript array of retained child views**. Those child views share a single record binding and retain immutable occurrence geometry. Array indexing is native, but scalar data is still read from the borrowed bytes on demand. The current eligibility limit is eight elements; fixed occurrence count alone is insufficient if storage positioning remains symbolic.

Other arrays, including ODO-dependent structures, large fixed groups and unsupported nested shapes, use lazily selected children through a Proxy. The Proxy caches child views as they are accessed, and separates active length from retained high-water capacity. Neither representation is a decoded array of COBOL values. See [projection](modules/cursor-loader/projection/README.md), [arrays](modules/utils/arrays/README.md) and [cursor-loader-cobol](modules/cursor-loader/cursor-loader-cobol/README.md).

## Module map

The module directory is split into a record-processing pipeline and reusable utilities. Each module has its own README with API and behaviour details.

### Record-processing and formats

| Module | Responsibility |
|---|---|
| [copybook](modules/cursor-loader/copybook/README.md) | Parse and validate COBOL copybooks into a declaration AST |
| [layout](modules/cursor-loader/layout/README.md) | Compile storage geometry, symbolic sizes, alignment and overlays |
| [size](modules/cursor-loader/size/README.md) | Represent and evaluate size expressions |
| [cursor-loader-types](modules/cursor-loader/cursor-loader-types/README.md) | Shared parser, representation and physical-position contracts |
| [cursor-record](modules/cursor-loader/cursor-record/README.md) | Pooled physical records, state and lifetime management |
| [cursor-file](modules/cursor-loader/cursor-file/README.md) | File cursors, parser registration and consumer-facing results |
| [projection](modules/cursor-loader/projection/README.md) | Compile application-facing projections and maintain borrowed bindings |
| [cursor-loader-cobol](modules/cursor-loader/cursor-loader-cobol/README.md) | COBOL parser, file framing, fixed/symbolic positions and readers |
| [cursor-loader-csv](modules/cursor-loader/cursor-loader-csv/README.md) | CSV parser and projected column access |
| [cursor-loader-json](modules/cursor-loader/cursor-loader-json/README.md) | JSONL parser and nested projected values |
| [cursor-loader-test](modules/cursor-loader/cursor-loader-test/README.md) | Cross-format integration fixtures and tests |
| [cursor-loader-benchmark](modules/cursor-loader/cursor-loader-benchmark/README.md) | Deterministic JRecord-comparison fixtures and throughput benchmarks |

### General-purpose utilities

| Module | Responsibility | Module | Responsibility |
|---|---|---|---|
| [arrays](modules/utils/arrays/README.md) | Array and Proxy abstractions | [async](modules/utils/async/README.md) | Async result states |
| [base64](modules/utils/base64/README.md) | UTF-8/Base64 conversion | [codec](modules/utils/codec/README.md) | COBOL primitive decoders and fragmented bytes |
| [debug](modules/utils/debug/README.md) | Named debug logging | [errors](modules/utils/errors/README.md) | Error-or-value computation |
| [files](modules/utils/files/README.md) | File helpers | [metrics](modules/utils/metrics/README.md) | Optional counter instrumentation |
| [partial_functions](modules/utils/partial_functions/README.md) | Ordered predicate-based dispatch | [records](modules/utils/records/README.md) | Plain-object helpers |
| [ref-counted-pool](modules/utils/ref-counted-pool/README.md) | Reference-counted object reuse | [safe](modules/utils/safe/README.md) | Optional-input normalisation |
| [strings](modules/utils/strings/README.md) | String and path naming helpers | [template](modules/utils/template/README.md) | Configurable text substitutions |
| [test_utils](modules/utils/test_utils/README.md) | Capture console diagnostics | [time](modules/utils/time/README.md) | Clock/delay helpers |
| [trees](modules/utils/trees/README.md) | Tree transforms and folds | [validator](modules/utils/validator/README.md) | Composable runtime validation |

## Using the system

The Node COBOL adapter exports `readCobolFile` and `scanCobolFile` from [`cursor-loader-cobol/node`](modules/cursor-loader/cursor-loader-cobol/README.md). The first provides an asynchronous consumption model; the latter takes a synchronous visitor callback and awaits file refills outside that hot callback. Both operate through compiled projections and validate borrowed lifetimes. Read the [COBOL quick start](modules/cursor-loader/cursor-loader-cobol/README.md) for a working typed-projection example, and the [cursor-file guide](modules/cursor-loader/cursor-file/README.md) for the explicit result/close contract.

The callback's projected row must not be retained beyond its call. The asynchronous API's result must be closed according to its documented lifecycle. If an application needs independent data after a lease, it must explicitly extract/copy the required values while the lease is live; the framework does not silently snapshot the record.

## Development and tests

Modules follow the same TypeScript package conventions: `index.ts`, `src/*.ts`, adjacent Jest tests, `package.details.json` and `tsconfig.json`. In an installed workspace, run `yarn test` from an individual package to check that package. The [integration package](modules/cursor-loader/cursor-loader-test/README.md) exercises cross-module combinations. Use the repo's existing workspace tooling to install/link its local `@cobol-ts/*` dependencies; this documentation patch does not introduce a build system or require special compilation ordering.

The benchmark package has both asynchronous and callback runners and deterministic checksums. From its directory, run:

```bash
yarn benchmark:callback --scenario array --sample --metrics
yarn benchmark:callback --scenario array --data C:/git/cobol-jrecord-benchmark/data/benchmark.dat --limit 5000000 --warmup 500000 --runs 5
```

The `--metrics` flag is for diagnosis, not baseline throughput comparison. Counters measure operations, not allocations in V8. Runs should compare matching scenarios/data and validated checksums. See [benchmark documentation](modules/cursor-loader/cursor-loader-benchmark/README.md).

## COBOL scope and limitations

The copybook and layout packages document the supported COBOL syntax and symbolic geometry in depth. COBOL parsing/storage-layout compilation is distinct from **physical file framing**; a supported OCCURS DEPENDING ON declaration does not automatically imply every possible variable-length file format is supported. Read the [COBOL capability matrix](modules/cursor-loader/cursor-loader-cobol/README.md), [layout model](modules/cursor-loader/layout/README.md) and [copybook syntax](modules/cursor-loader/copybook/README.md) before relying on an edge case.

## Contributing to the architecture

A change to physical-record state or projected-array binding can affect several packages at once. Preserve compile-once paths, no-copy decoding, ownership boundaries, independent simultaneous leases and the distinction between active array length and retained view capacity. Exercise both normal and exceptional cleanup and run the relevant integration tests before accepting performance improvements based on a benchmark alone.
