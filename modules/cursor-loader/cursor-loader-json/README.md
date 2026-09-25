# @cobol-ts/cursor-loader-json

JSON record parsing for the `@cobol-ts` cursor stack.

The JSON parser consumes one already-framed physical record and converts it into a JavaScript value using `JSON.parse()`.

It is suitable for record-oriented JSON formats such as JSON Lines when combined with the line record reader from `@cobol-ts/cursor-record`.

## Position in the cursor stack

```text
@cobol-ts/cursor-file
    ↓
@cobol-ts/cursor-record
    ↓
PhysicalRecordContent
    ↓
@cobol-ts/cursor-loader-json
    ↓
JavaScript representation
    ↓
projection
```

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

## Physical record handling

The parser receives `PhysicalRecordContent`.

A physical record may:

- begin part way through its first buffer;
- span several physical buffers;
- end part way through its final buffer.

The parser decodes exactly the bytes belonging to the current physical record.

## UTF-8 decoding

A record contained within one physical buffer can be decoded directly from the relevant byte range.

A record spanning multiple physical buffers is decoded incrementally.

This matters because a UTF-8 character may itself cross a physical buffer boundary.

## Parsing

After decoding, JSON syntax is delegated to:

```ts
JSON.parse()
```

The generic type parameter describes the parser representation at compile time.

It is not runtime schema validation.

Runtime semantic validation belongs in the loader's representation-validation stage.

## Physical framing

This package does not:

- open files;
- find line endings;
- construct fixed-width records.

Physical framing belongs to `@cobol-ts/cursor-record`.

## Errors

JSON syntax or decoding failures are converted into recoverable `Errors`.

`@cobol-ts/cursor-loader` adds filename and physical line/record context before surfacing them to the application.