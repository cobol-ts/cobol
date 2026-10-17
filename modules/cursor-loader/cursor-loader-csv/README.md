# @cobol-ts/cursor-loader-csv

Byte-backed CSV parsing and lazy CSV projection support for the `@cobol-ts` cursor stack.

The CSV parser owns both CSV record recognition and structural field scanning. There is no lower generic line-framing pass.

That is essential because CR/LF inside a quoted field is data rather than a record boundary.

## Position in the stack

```text
@cobol-ts/cursor-file
    ↓
@cobol-ts/cursor-record
    ↓
parser physical record starting at startByte
    ↓
csvParser.prepare() / csvParser.parse()
    ├── walkCsvRecord()
    ├── calls readMore() as required
    ├── recognizes the CSV row boundary
    ├── establishes endByte
    └── records field byte ranges
    ↓
CsvRepresentation
    = PhysicalRecordData<CsvRecordState>
    ↓
compiled numeric projection paths
    ↓
lazy field decoding
```

## Parser configuration

The current CSV parser configuration contains only physical CSV syntax bytes:

```ts
interface CsvParserConfig {
    readonly separator?: number;
    readonly quote?: number;
}
```

Values are byte numbers, for example:

```ts
const config: CsvParserConfig = {
    separator: ",".charCodeAt(0),
    quote: "\"".charCodeAt(0)
};
```

The defaults are comma and double quote.

Separator and quote must be distinct byte values in the range 0..255.

Logical projected columns are defined by the application projection, not by `CsvParserConfig`.

## Header preparation

CSV uses parser preparation.

The first CSV record is treated as the header. `prepare()` performs the same CSV grammatical scan used for data rows and may call `readMore()` if the header spans physical buffers.

Preparation produces:

```ts
interface CsvParserDetails {
    readonly columns: ReadonlyMap<string,number>;
    readonly columnCount: number;
    readonly separator: number;
    readonly quote: number;
}
```

`columns` maps the decoded header names to physical column indexes.

The bootstrap header record is not projected as application data. `openRecordCursor()` retains only its `{source,recordNumber}` context after closing it.

That context is later available while projection paths are compiled.

## Projection-path compilation

CSV canonical projection paths must contain exactly one logical header name:

```ts
["age"]
```

During source setup:

```ts
compileProjectionPath(
    details,
    preparationContext,
    ["age"]
)
```

looks up the prepared header once and returns the numeric column index.

Runtime access therefore does not perform a map lookup by column name.

Missing or malformed projected paths are setup/configuration failures and throw before data-row processing. Diagnostics include:

- header source;
- header record number;
- requested column/path;
- available columns.

For example:

```text
customers.csv: record 1: CSV column "postcode" does not exist. Variable columns: "id", "name", "age".
```

## Data-row representation

CSV does not construct a `CsvRow` object containing materialised values.

Its representation is the physical record data itself:

```ts
type CsvRepresentation =
    PhysicalRecordData<CsvRecordState>;
```

with reusable structural state:

```ts
interface CsvRecordState {
    starts: Int32Array;
    ends: Int32Array;
    fieldCount: number;
}
```

The parser scans each row and records field start/end byte offsets. The structural arrays remain attached to the pooled physical-record holder and are reused.

## Parser-controlled record recognition

`walkCsvRecord()` starts at `record.startByte` and recognizes LF, CRLF or EOF as the end of the current CSV row **only when outside a quoted field**.

It also handles:

- separators;
- quoted fields;
- doubled quotes;
- CR/LF inside quoted fields;
- records spanning arbitrary physical buffer boundaries;
- carried records starting partway through an already-read buffer;
- final records without a line terminator.

When more bytes are required, it calls `record.readMore()` and continues in the same invocation.

This fuses boundary recognition and structural parsing into one scan.

## Lazy value materialisation

The parser must scan the complete CSV row to validate grammar and identify field boundaries.

It does **not** decode every field to a JavaScript string.

A runtime projection accessor already has a compiled numeric column index, so it reads the corresponding start/end byte range and decodes only that field when requested.

Quoted string materialisation collapses doubled quote characters as part of decoding.

Unused fields therefore avoid string allocation and value parsing.

## Row width errors

After a data row is scanned, `csvParser.parse()` compares its physical field count with the prepared header count.

A mismatch is returned as recoverable `Errors`:

```text
CSV record has 9 columns; header has 8
```

`cursor-file` then applies the selected row-error policy and can continue with following records.

## CSV syntax errors

Structural syntax failures discovered by the walker throw an exception with physical provenance and logical byte position.

Examples include:

- quote inside an unquoted field;
- unexpected data after a closing quote;
- malformed CRLF after a closing quote;
- an unterminated quoted field at EOF.

A representative diagnostic is:

```text
customers.csv: record 3: CSV column 4: unexpected byte after closing quote at logical byte 80
```

Because quoted newlines are not treated as boundaries, an error may legitimately be reported later than the first physical newline encountered inside the malformed quoted field.

## Runtime projection errors

Typed accessors validate the requested value lazily.

Examples:

```text
CSV value is empty; expected an integer
CSV value "twelve" is not an integer
CSV value "AB" is not a character
```

The CSV support returns only the parser-specific reason. The generic projection layer adds:

- source;
- current data-record number;
- logical projection path;
- the rendered physical CSV record.

## Lifetime

`CsvRepresentation` borrows both the physical byte buffers and the `CsvRecordState` attached to that physical record.

A successful application projection is therefore valid only until its `FileCursorResult` is closed.

`cursor-file` keeps the physical record alive for that lease and clears the projection before releasing it.

## Performance intent

CSV is the first parser in this stack which exercises the late-materialisation design directly:

```text
scan row once
    ↓
retain field byte ranges in reusable arrays
    ↓
compile logical column names once per opened source
    ↓
decode only fields the application asks for
```

This reduces per-row materialisation without duplicating a generic line-framing scan.
