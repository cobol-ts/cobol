# @cobol-ts/cursor-loader-csv

Low-allocation CSV parsing for the `@cobol-ts` cursor stack.

The CSV parser consumes one already-framed `PhysicalRecordContent` at a time.

Physical file I/O and line detection are handled by lower layers.

## Position in the cursor stack

```text
@cobol-ts/cursor-file
    ↓
@cobol-ts/cursor-record
    ↓
PhysicalRecordContent
    ↓
@cobol-ts/cursor-loader-csv
    ↓
CsvRow
    ↓
projection
```

`@cobol-ts/cursor-loader` orchestrates parser preparation, parsing, validation and projection.

## Parser registration

```ts
import {
    csvParser
} from "@cobol-ts/cursor-loader-csv";


const parsers = {
    csv:
        csvParser
};
```

## CSV configuration

```ts
const customerCsvDetails = {
    separator:
        ",",

    quote:
        "\"",

    columns: [
        {
            name:
                "id",

            type:
                "integer"
        },
        {
            name:
                "name",

            type:
                "string"
        },
        {
            name:
                "balance",

            type:
                "float"
        }
    ]
} satisfies CsvParserDetails;
```

## Header preparation

CSV uses parser preparation.

The first physical record is treated as the CSV header.

Preparation:

- parses the header;
- records the actual physical column names;
- validates configured required columns;
- maps logical configured columns to physical positions;
- prepares reusable state for later records.

The header is not projected as application data.

## CsvRow

Data records produce a `CsvRow`.

Configured logical columns are accessed by index:

```ts
const customer = {
    id:
        row.integer(
            0
        ),

    name:
        row.string(
            1
        ),

    balance:
        row.float(
            2
        )
};
```

## Lazy value materialisation

The parser scans the complete CSV record because it must validate syntax and identify field boundaries.

It does not need to decode every field into a JavaScript string.

Unused string fields therefore need not be materialised.

## Physical records

The CSV parser does not locate physical line endings.

It receives one complete physical record from `@cobol-ts/cursor-record`.

A CSV record may span multiple physical byte buffers without requiring the complete record to be copied first.

## Lifetime

`CsvRow` may refer to cursor-owned physical buffers and parser-owned reusable state.

It should therefore be considered ephemeral.

Projection must complete before the underlying physical record cursor advances.

`@cobol-ts/cursor-loader` guarantees this ordering.

## Errors

CSV syntax and schema problems are returned as recoverable `Errors`.

`@cobol-ts/cursor-loader` subsequently adds filename and physical line information.