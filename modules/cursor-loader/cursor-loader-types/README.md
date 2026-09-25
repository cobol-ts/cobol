# @cobol-ts/cursor-loader-test

Cross-package integration tests and shared fixtures for the `@cobol-ts` cursor stack.

The package exists to test the real composition of the cursor modules rather than replacing physical layers with test-specific substitutes.

## Cursor stack under test

```text
physical file
    ↓
@cobol-ts/cursor-file
    ↓
pooled byte buffers
    ↓
@cobol-ts/cursor-record
    ↓
PhysicalRecordContent
    ↓
@cobol-ts/cursor-loader
    ↓
parser
    ↓
projection
    ↓
application values
```

## CSV integration

CSV tests exercise the complete production path:

```text
real fixture file
    ↓
real filesystem
    ↓
@cobol-ts/cursor-file
    ↓
@cobol-ts/cursor-record
    ↓
@cobol-ts/cursor-loader
    ↓
@cobol-ts/cursor-loader-csv
    ↓
application projection
```

The tests do not construct `PhysicalRecordContent` manually.

This verifies that byte I/O, physical framing, parser preparation, parsing and projection agree with one another.

## Fixed-width integration

Fixed-width integration tests create real temporary files.

This makes it possible to control both logical record size and physical file-buffer size.

Tests deliberately use awkward alignments, for example:

```text
physical buffers, size 4:

abcd
efgh
ijkl
mno

logical records, size 5:

abcde
fghij
klmno
```

This verifies that record boundaries are independent of physical read boundaries.

## What integration tests are intended to catch

Important cross-package contracts include:

- file-buffer ownership;
- physical record lifetime;
- record offsets;
- boundary detection across physical buffers;
- parser preparation;
- CSV header handling;
- physical line numbering;
- recoverable error propagation;
- projection-before-advance ordering;
- configuration compatibility between packages.