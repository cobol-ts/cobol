# @cobol-ts/base64

## Purpose

The `toBase64` and `fromBase64` helpers convert **UTF-8 strings** to and from Base64 text. They do not implement COBOL code-page conversion, encode arbitrary record ranges, or replace the byte-oriented `@cobol-ts/codec` package.

## Interface

```ts
import {toBase64, fromBase64} from '@cobol-ts/base64';
const encoded = toBase64('Hello £');
const decoded = fromBase64(encoded); // 'Hello £'
```

The encoder uses `TextEncoder` and `btoa`; the decoder uses `atob` and `TextDecoder`. Both rely on those host globals, and invalid Base64 input is not converted into a domain-specific error. For binary COBOL records, retain `Uint8Array` or `Buffer` and use the appropriate byte codec instead.

Implementation: [`src/base64.ts`](src/base64.ts). Export surface: [`index.ts`](index.ts).
