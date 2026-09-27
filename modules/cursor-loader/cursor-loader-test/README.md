# @cobol-ts/cursor-loader-test

Cross-package integration tests and shared fixtures for the `@cobol-ts` cursor-loader packages.

This package verifies that independently tested modules agree on their shared contracts.

## Integration strategy

The package contains integration tests at two levels.

### Focused loader/parser integration

Some CSV tests deliberately supply a simple test record reader.

Their path is:

```text
fixture file
    ↓
Node file/line reader used by the test
    ↓
PhysicalRecordContent
    ↓
@cobol-ts/cursor-loader
    ↓
CSV preparation
    ↓
CSV parsing
    ↓
projection
    ↓
application values
```

These tests focus on:

- parser preparation;
- CSV syntax;
- header mapping;
- projection;
- recoverable parser errors;
- continuation after malformed data;
- application-level values.

They intentionally do not retest the production physical byte and line-framing layers.

### Full cursor-stack integration

At least one integration test exercises the complete production path:

```text
fixture file
    ↓
real filesystem
    ↓
@cobol-ts/cursor-file
    ↓
pooled byte buffers
    ↓
@cobol-ts/cursor-record
    ↓
line record reader
    ↓
newline boundary detector
    ↓
PhysicalRecordContent
    ↓
@cobol-ts/cursor-loader
    ↓
CSV preparation
    ↓
CSV parser
    ↓
projection
    ↓
application values
```

This verifies the contracts between:

```text
physical byte I/O
record framing
record offsets
buffer lifetime
parser access
projection timing
```

rather than testing those layers only in isolation.

## CSV fixtures

The package contains fixtures covering:

- ordinary comma-separated data;
- quoted fields containing commas;
- empty fields;
- escaped quotes;
- pipe-separated data;
- malformed unterminated quoted fields;
- rows with additional physical columns;
- malformed headers.

Shared customer configuration is exported from:

```text
src/cursor.loader.fixture.ts
```

It includes:

- a full `Customer` projection;
- a `MinimalCustomer` projection which deliberately accesses only a subset of CSV fields.

The minimal projection exercises the low-allocation CSV design.

The CSV parser must scan the complete physical record to validate syntax and locate field boundaries, but unused string fields do not need to be decoded or materialised.

## Fixed-width integration tests

Fixed-width tests create real temporary files so that record size and physical contents can be controlled exactly.

These tests exercise:

```text
temporary file
    ↓
real filesystem
    ↓
@cobol-ts/cursor-file
    ↓
pooled byte buffers
    ↓
@cobol-ts/cursor-record
    ↓
fixed-width record reader
    ↓
fixed-width boundary detector
    ↓
@cobol-ts/cursor-loader
    ↓
parser
    ↓
projection
```

Cases deliberately include record boundaries which do not align with physical read-buffer boundaries.

Examples include:

```text
record size 5
buffer size 4
```

and records which span several or even one-byte physical buffers.

The tests also cover incomplete final fixed-width records.

## Why this package exists

Unit tests in the individual packages verify local invariants.

This package verifies that those packages agree with one another.

In particular it is intended to catch errors in contracts such as:

- physical buffer lifetime;
- logical record offsets;
- framing exclusion;
- line/header numbering;
- parser preparation;
- projection timing;
- recoverable error propagation;
- configuration typing;
- physical-reader dispatch.

## Type checking

Jest is used for runtime behaviour.

TypeScript is checked separately before the Jest suite runs:

```text
tsc --noEmit
    ↓
Jest
```

This is intentional.

A runtime test runner must not be relied upon to detect stale TypeScript contracts such as a removed property name.

The package test command should therefore run both type checking and Jest.