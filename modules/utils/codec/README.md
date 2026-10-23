# `@cobol-ts/codec` — byte-backed COBOL primitive decoding

This replaces the old, unused generic JSON/string codec in `modules/utils/codec`.
The legacy **different** package `@cobol-ts/cobolcodec`, still used by the
older file readers/writers, is unchanged.

## Core invariant

`FragmentedByteCursor.bind(record, from, to)` consumes an **absolute**
exclusive-end range in the concatenation of `record.buffers`. `next()` reads
it directly, crossing arbitrarily many fragment boundaries. There is no
intermediate `Uint8Array`, `Buffer.concat`, `Array.from` of the record, or
allocation on `bind()` or `next()`. The cursor object belongs to the pooled
COBOL `recordState` and is rebound for each scalar read.

The `decode()` functions return only application values. The first version
of the **text** decoder builds the resulting JS string with incremental
concatenation of characters from the static CP037 lookup table (or ASCII).
This is deliberately uncomplicated, and does not trim trailing spaces. A
separate string may be produced for each accessor invocation; no decoded
string is cached on the row. Benchmark string construction before replacing
this baseline with chunked code units or a specialised decoder.

## Usage

```ts
import {FragmentedByteCursor,compileCobolFieldDecoder} from '@cobol-ts/codec';

const decoder = compileCobolFieldDecoder({picture:'S9(3)V99',clauses:[
    {kind:'usage',usage:'COMP-3'}
]}, 3); // during opened-source setup
const cursor = new FragmentedByteCursor(); // once per pooled physical record
cursor.bind(physicalRecord, absoluteStartByte, absoluteEndByte);
const value = decoder.decode(cursor); // e.g. -123.45
```

From the COBOL projection factory, choose decoded details:

```ts
const details = valueOrThrow(createCobolDecodedFixedDetails(layout));
// Or createCobolDecodedProjectionDetails(layout) when an ODO frame
// length is supplied independently.
const factory = createProjection(cobolParser, details, undefined, projection);
```

Projection-path compilation caches each selected elementary field's decoder
by stable compiled declaration identity. The runtime preserves existing lazy
geometry and array selection; only the final byte interpretation changes.
Original diagnostic fixtures retain `createCobolFixedDetails()` and
`createCobolProjectionDetails()` until migrated.

## Supported now

- IBM EBCDIC CP037 text and unsigned DISPLAY digits; ASCII as an explicit option.
- Single-character and fixed-width text, including embedded/trailing spaces.
- Unedited integer / implied-decimal DISPLAY, signed zone overpunch, optional
  leading/trailing separate sign.
- COMP-3 / PACKED-DECIMAL (signed/unsigned, validated digits/sign nibble).
- Mainframe big-endian COMP / COMP-4 / BINARY signed/unsigned integers.
- Exact integers through `Number.MAX_SAFE_INTEGER` only. Binary uses number
  arithmetic rather than creating a BigInt per scalar access; unsafe values
  **throw** rather than losing bits silently.
- Implied decimal positions are returned as JavaScript `number`, with its
  usual floating-point rounding. Exact scaled-decimal types remain future work.

Unsupported representations fail explicitly: edited pictures, PIC P scale,
NATIONAL/DBCS/UTF-8, IBM hexadecimal COMP-1/COMP-2 floating point, COMP-5,
non-CP037 EBCDIC dialects and decimal values beyond JS safe integer precision.
No claim of general Enterprise COBOL primitive-codec conformance is made.

## Validation and fair benchmarking

`src/cobol.decoder.spec.ts` covers fragmented fields, supported numeric
representations, invalid data, and cursor rebinding.
`cursor-loader-cobol/src/cobol.decoded.integration.spec.ts` exercises real
copybook compilation and the **actual** FB cursor with 3-byte physical reads,
plus nested OCCURS/REDEFINES, alignment and three-level ODO scalar decoding.
`cursor-loader-cobol/src/cobol.decoded.file.spec.ts` reads a genuine
filesystem-backed `.fb` file through Node file I/O.

For the one-million-record benchmark, compare exactly the same byte fixture,
projected fields and output consumption against JRecord. Separate disk-reading,
page-cache warm/cold, parsing-only and decoding workloads; record time,
bytes/sec, allocated bytes per record, GC events, CPU cycles and cache misses
where available. Do not assume JRecord materialises a whole object graph
without verifying its chosen API and usage pattern. Treat the L1-cache
hypothesis as an experiment, not a known outcome.
