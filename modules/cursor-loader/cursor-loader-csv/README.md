# @cobol-ts/cursor-loader-csv

Low-allocation CSV parser for `@cobol-ts/cursor-loader`.

The parser consumes one already-framed `PhysicalRecordContent` at a time. Physical line detection is the responsibility of `@cobol-ts/cursor-loader`.

## Usage

Register the parser:

```ts
import {
    csvParser
} from "@cobol-ts/cursor-loader-csv";

const parsers = {
    csv:
        csvParser
};
```

Then configure the expected logical columns:

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

The first physical record is treated as the header:

```text
id,name,balance
```

`prepare()`:

- parses the physical header;
- validates the configured column names;
- maps logical configured columns to their physical positions;
- reports missing required columns;
- records the actual physical width of the file;
- prepares reusable state for subsequent data rows.

The header record is consumed by preparation and is not emitted as application data.

## CSV row

Parsing produces a `CsvRow`.

Values are accessed by configured logical column index:

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

Supported configured column types include:

```text
string
integer
float
character
```

## Lazy materialisation

The parser scans the complete physical row because it must:

- validate CSV syntax;
- find field boundaries;
- validate physical column count.

It does not need to decode every field into a JavaScript string.

For example, a projection which only reads:

```ts
row.integer(0)
row.character(6)
```

does not need to materialise unrelated string columns.

This is central to the low-allocation design.

## Quoting

Quoting is configured explicitly:

```ts
quote:
    "\""
```

Quoted fields may contain the configured separator.

Escaped quotes are handled according to the parser configuration.

The parser also supports configurable separators, for example:

```ts
separator:
    "|"
```

## Physical records

CSV does not perform file I/O and does not locate line endings.

Its input is:

```ts
PhysicalRecordContent
```

supplied by a physical record reader.

A CSV record may therefore itself span several byte buffers without the parser needing to copy the complete record first.

## Record lifetime

`CsvRow` is a parser representation over cursor-owned data and parser-owned reusable state.

Projection must complete before the underlying physical cursor advances.

`createFileCursor()` guarantees this ordering.

Application objects returned by a projection should therefore contain detached application values, not references to ephemeral parser state.

## Errors

CSV syntax and schema failures are returned as `Errors`, rather than thrown as operational failures.

Diagnostics include information such as:

- missing configured header columns;
- the actual header encountered;
- invalid quoting;
- unterminated quoted fields;
- too many physical fields;
- invalid typed values.

`createFileCursor()` subsequently adds filename and line/record context.

## Example

```ts
const config = {
    type:
        "line",

    filename:
        "customers.csv",

    parser:
        "csv",

    parserConfig:
        customerCsvDetails,

    project: (
        row: CsvRow
    ) => ({
        id:
            row.integer(
                0
            ),

        name:
            row.string(
                1
            )
    }),

    entityId:
        customer =>
            customer.id,

    cardinality:
        "many"
};
```
