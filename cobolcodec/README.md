# `@cobol-ts/cobolcodec`

Typed codecs for reading and writing selected primitive fields in COBOL-oriented byte buffers. This is distinct from the layout compiler (which computes **physical field size and location**) and from `cursor-loader-cobol` (whose current scalar projection methods still return diagnostic byte coordinates, not codec-decoded field values).

## Exported codecs

The package entrypoint re-exports:

- `ebcdic037Codec` — text encoded using EBCDIC code page 037;
- `asciiCodec` — ASCII text;
- `binaryIntegerCodec` — binary integer values represented as `bigint`;
- `packedDecimalCodec` — packed-decimal values using the project's decimal type;
- `ieee754Codec` — IEEE 754 floating point;
- `defaultFileCodecRegistry`, `codecFor()`, `validateFieldsAgainstRegistry()` — registry and compatibility checks.

`FileFieldCodec` defines the value-validation, byte-validation, read and write operations. Behaviour such as sign, scale, byte order and field length depends on the accompanying field metadata, not just the encoding's name. See the codec-specific tests for supported and rejected cases.

## Registry

```ts
import {
    defaultFileCodecRegistry,
    codecFor,
    validateFieldsAgainstRegistry
} from '@cobol-ts/cobolcodec';

const problems = validateFieldsAgainstRegistry(fields, defaultFileCodecRegistry);
if (problems.length) throw new Error(problems.join('; '));

const codec = codecFor(fields[0], defaultFileCodecRegistry);
```

The default registry contains `ascii`, `ebcdic:037`, `binary-integer`, `packed-decimal` and `ieee754`. The type-level `FileCodecForEncoding` union also describes other possible encodings; **do not assume they are registered** without supplying an extended registry. `codecFor()` throws if the field's encoding has no matching registry entry. `validateFieldsAgainstRegistry()` reports missing registrations without reading field bytes.

## Current integration boundary

These codecs are implemented and unit tested as a separate package. The byte-backed COBOL projection parser does **not** currently call them for its scalar methods: `string` and `character` return debug `from/to/hex`, while `integer` and `float` return numeric debug range identifiers. Production-value decoding remains an integration milestone; this README makes no claim that every COBOL PICTURE, USAGE or dialect is supported.

Source: `src/primitive.codec.ts`, `src/ebcdic.037.codec.ts`, `src/cobol.codec.ts`, `src/cobol.codec.registry.ts`; tests are in corresponding `*.spec.ts` files.
