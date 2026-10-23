# @cobol-ts/cursor-loader-test

Cross-package integration tests and shared application projections for the current `@cobol-ts` cursor-loader stack.

This package verifies that the separately tested packages agree on their shared contracts when used through the normal `@cobol-ts/cursor-file` orchestration path.

## Fixed-record COBOL consumer API

The AWS FB/150 integration suite exercises the public Node.js entry point:

```ts
import {readCobolFile} from '@cobol-ts/cursor-loader-cobol/node';

for await (const record of readCobolFile({copybook, filename, projection, bufferSize: 3})) {
    try { console.log(record.result.id()); }
    finally { record.close(); }
}
```

The reader compiles the original copybook and projection, opens the real binary
file and streams borrowed views. No parser registry, record-state factory or
file-handle callback appears in the test. The AWS EBCDIC bytes and CSV oracle
are external published fixtures, not output from our encoder. The 3-byte read
case forces fields across multiple physical buffers without assembling them.

## Current integration path

The JSONL, CSV and COBOL integration suites use the same architecture:

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

The JSONL/CSV fixture helpers load data into an in-memory `bytes + offset` source for deterministic physical-buffer tests. The AWS COBOL tests instead use `readCobolFile` and actual Node filesystem I/O.

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

## COBOL integration coverage (AWS EMPREC01, FB/150)

`src/cursor.loader.cobol.aws.int.test.ts` uses fixtures in
`fixtures/aws-employee/`: a complete five-record 750-byte binary source,
the original EMPREC01 copybook and the upstream expected CSV values. The binary
is transcribed from the published upstream hex dump, **not** encoded using our
library, and its first record was independently checked against the already
established layout fixture. See the fixture README for attribution and SHA-256.

- Real copybook parsing and storage compilation feed `createCobolDecodedFixedDetails`.
- The public COBOL parser, record state and projection API are exercised via
  `createFileCursor`, not by calling a decoder on standalone bytes.
- Every published employee field is compared across **all five records**:
  `REDEFINES` ID interpretations, three `OCCURS` address lines, CP037 text,
  signed DISPLAY, COMP, COMP-3, implied decimals and negative values. The
  published CSV preserves padding and leading zeroes so these are checked too.
- Five deliberately different physical read sizes (3, 7, 149, 150 and 4096)
  must produce identical values. This includes fragmentation **within** numeric
  fields, array bodies and records. The codec never assembles field bytes.
- One test reads from a real filesystem handle with 11-byte reads, and one
  retains two simultaneously live records and verifies closing one does not
  corrupt the other; subsequent records are also verified after pool reuse.

No network requests are made by these tests. The golden output comes from AWS,
not from running an in-project encoder or writer. The independent AWS example
is still a published sample; it does not constitute testing against a client's
original production files. An additional CardDemo binary/oracle corpus may be
added when both its original bytes and independent expected values can be
verified and bundled without guessing.

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

COBOL also has an end-to-end FB/150 integration suite here using an independently published AWS data/copybook/CSV oracle. Detailed nested ODO geometry, local codec unit tests, pooling and indexed-error tests remain in `cursor-loader-cobol`, `codec` and `layout`; this external FB suite does not establish full compiler/dialect support or variable-record framing. Run the package Jest suites, TypeScript checks and the complete repository suite separately before release. Do not publish a fixed test count in this README; the suite evolves.
