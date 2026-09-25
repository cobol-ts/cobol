# @cobol-ts/cursor-loader-test

Integration tests and shared fixtures for the `@cobol-ts` cursor-loader packages.

This package exists to exercise complete package boundaries rather than isolated parser or physical-reader units.

## End-to-end tests

The CSV integration tests exercise the real path:

```text
fixture file
    ↓
real filesystem
    ↓
file byte cursor
    ↓
pooled byte buffers
    ↓
line record reader
    ↓
newline boundary detector
    ↓
PhysicalRecordContent
    ↓
file cursor
    ↓
CSV preparation
    ↓
CSV parser
    ↓
application projection
```

This ensures that parser tests do not accidentally succeed because a test-specific line reader has already normalised or copied the input.

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

It includes both:

- a full `Customer` projection;
- a `MinimalCustomer` projection which deliberately accesses only a subset of CSV fields.

The minimal projection is useful for exercising lazy CSV field materialisation.

## Fixed-width integration tests

Fixed-width tests create real temporary files so that record size and physical contents can be controlled exactly.

These tests exercise:

```text
temporary file
    ↓
real filesystem
    ↓
pooled byte cursor
    ↓
fixed-width record reader
    ↓
fixed-width boundary detector
    ↓
file cursor
    ↓
parser
    ↓
projection
```

Cases include records whose logical boundaries deliberately do not align with physical read-buffer boundaries.

## Why this package exists

Unit tests in the individual modules verify local invariants.

This package verifies that those modules agree with one another.

In particular it is intended to catch errors in contracts such as:

- physical buffer lifetime;
- record offsets;
- line/header numbering;
- parser preparation;
- projection timing;
- recoverable error propagation;
- configuration typing;
- physical-reader dispatch.

