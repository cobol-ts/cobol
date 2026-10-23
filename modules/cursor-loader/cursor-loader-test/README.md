# @cobol-ts/cursor-loader-test

Cross-package integration tests and shared application projections for the current `@cobol-ts` cursor-loader stack.

This package verifies that the separately tested packages agree on their shared contracts when used through the normal `@cobol-ts/cursor-file` orchestration path.

## Current integration path

Both JSONL and CSV integration suites use the same architecture:

```text
fixture bytes
    ↓
test file object with current offset
    ↓
FileCursorInfrastructure.fillFileBuffer
    ↓
@cobol-ts/cursor-file
    ↓
@cobol-ts/cursor-record
    ├── pooled byte buffers
    ├── pooled physical-record holders
    └── optional parser preparation
    ↓
format parser
    ├── recognizes its own physical records
    └── establishes endByte
    ↓
source-scoped projection compilation
    ↓
pooled FileCursorResult + reusable projection
    ↓
application values
```

The fixture helpers load test files from disk into a simple in-memory `bytes + offset` file abstraction. `fillFileBuffer` then feeds those bytes into the production pooled cursor machinery in deliberately small chunks.

The tests therefore exercise the production cursor-record, parser, projection and cursor-file contracts while keeping OS-specific streaming I/O outside the scope of this package.

There is no generic line reader or newline boundary detector in the current architecture.

## Shared application projections

`src/cursor.loader.fixture.ts` defines the shared application-facing projections used by both JSON and CSV integration tests.

The full `Customer` projection includes nested JSON paths such as address fields.

CSV uses its own canonical projection with flat header names for those same application accessors.

A `MinimalCustomer` projection deliberately accesses only a subset of fields, demonstrating that the same physical source can support different application views.

## JSONL integration coverage

The JSONL suite covers:

- complete customer records and nested projection paths;
- a second projection over the same source records;
- malformed JSON returned as recoverable row `Errors` with continuation;
- pooled projection rebinding;
- lazy projection errors reporting the **current** record after rebinding;
- `createErrorsOrFileCursor` row-error behaviour;
- `createThrowingFileCursor` row-error behaviour;
- `createIgnoringFileCursor` callbacks and continuation.

The lazy-error test verifies the fully composed diagnostic, including:

```text
filename
record number
logical projection path
JSON-specific type/value reason
physical JSON record
```

## CSV integration coverage

The CSV suite covers:

- ordinary comma-separated customers;
- quoted fields containing commas;
- doubled quotes;
- empty fields;
- quoted numeric values;
- a different projection over the same CSV records;
- source-specific separator configuration through the file definition/registry;
- physical row-width mismatch returned as recoverable row `Errors` and continuation;
- missing projected header columns as setup failures with header provenance and available columns;
- malformed quoted input proving that a newline inside a quoted field is not treated as a record boundary.

The tests use small physical buffer sizes specifically to force parser behaviour across pooled buffer boundaries.

## What belongs in package-level tests

The parser packages themselves own detailed unit coverage for grammar and conversion rules.

For example:

- JSON parser tests cover LF/CRLF recognition, EOF, carried records, multi-buffer JSON, UTF-8 boundaries and parse diagnostics;
- JSON projection tests cover path traversal and precise type/path reasons;
- CSV walker tests cover quoting, embedded newlines, malformed syntax, EOF and arbitrary physical-buffer boundaries;
- CSV projection tests cover compiled header indexes, field decoding and scalar conversion;
- `cursor-record` tests cover carry, pools, offsets and physical lifetimes;
- `cursor-file` tests cover result pooling and row-error policies.

This package focuses on the contracts between those modules rather than duplicating every local rule.

## Why this package exists

The integration suites are intended to catch cross-package mistakes such as:

- stale parser/projection signatures;
- incorrect source setup ordering;
- preparation-context loss;
- physical record numbering;
- carried-buffer mistakes;
- projection rebinding/lifetime errors;
- wrong row-error policy behaviour;
- setup failures accidentally being treated as recoverable rows;
- diagnostics referring to the wrong physical record.

## Type checking and Jest

Jest exercises runtime behaviour, but it is not sufficient to validate evolving TypeScript contracts.

CI/CD should compile the package separately with `tsc` as well as running Jest. This catches stale call signatures even when the test transpilation path would otherwise execute them as JavaScript.

The current package `test` script itself runs Jest only; TypeScript compilation is therefore a separate build/CI responsibility rather than something performed by that npm script.

## Current cross-package validation boundary

The end-to-end integration suites in this package primarily exercise JSONL and CSV. They are **not** evidence that COBOL nested ODO or primitive codecs work: COBOL-specific byte-coordinate, nested ODO, pooling and indexed-error tests live in `cursor-loader-cobol`, while layout and symbolic size tests live in their respective packages. Run those package suites, TypeScript checks and the full repository Jest suite separately before release. Do not publish a fixed test count in this README; the suite evolves.
