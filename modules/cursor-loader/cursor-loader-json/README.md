# @cobol-ts/cursor-loader-json

JSON parser implementation for `@cobol-ts/cursor-loader`.

The package provides `JsonParser`, which converts one complete physical record into a JavaScript value using `JSON.parse()`.

It is suitable for record-oriented JSON formats where each physical record contains one complete JSON value, such as JSON Lines when used with the line record reader.

## Usage

```ts
import {
    JsonParser
} from "@cobol-ts/cursor-loader-json";

const parsers = {
    json:
        new JsonParser<MyRecord>()
};
```

A corresponding line-file configuration might use:

```ts
{
    type:
        "line",

    filename:
        "records.jsonl",

    parser:
        "json",

    ...
}
```

## Physical record handling

The parser receives:

```ts
PhysicalRecordContent
```

rather than a prebuilt JavaScript string.

A physical record may:

- start part way through its first byte buffer;
- span several byte buffers;
- end part way through its final buffer.

`JsonParser` decodes exactly the bytes belonging to the record as UTF-8.

For a record contained in one buffer it uses the relevant subarray directly.

For a multi-buffer record it uses streaming `TextDecoder` calls so that UTF-8 characters split across physical buffers are decoded correctly.

## Parsing

After decoding, the implementation delegates JSON syntax to:

```ts
JSON.parse()
```

and returns the resulting representation.

The generic parameter controls the parser's TypeScript representation type:

```ts
interface Customer {
    id: number;
    name: string;
}

const parser =
    new JsonParser<Customer>();
```

This is a compile-time representation declaration; `JSON.parse()` itself does not perform runtime schema validation.

Application-level validation may be supplied separately through the cursor-loader configuration.

## Errors

JSON parsing and UTF-8 decoding exceptions are converted into the shared `Errors` representation.

They are reported as JSON parse failures rather than terminating the record cursor as an operational file-system error.

Filename and physical line/record context are subsequently added by `createFileCursor()`.

## Responsibilities

This package is responsible for:

```text
PhysicalRecordContent
    ↓
UTF-8 decoding
    ↓
JSON.parse()
    ↓
parser representation
```

It is not responsible for:

- opening files;
- detecting line endings;
- fixed-width framing;
- application projection;
- runtime application-schema validation.
