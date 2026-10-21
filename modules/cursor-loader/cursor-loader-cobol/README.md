# @cobol-ts/cursor-loader-cobol

The COBOL-specific integration point for the byte-backed cursor/projection framework.
It lives alongside `cursor-loader-csv` and `cursor-loader-json` and consumes the existing
compiled storage layout rather than recalculating COBOL geometry.

## Currently implemented (initial module)

- `createCobolNameIndex(roots)` builds a case-insensitive nested name index from the
  already-compiled layout. It uses `foldTreeLeft`, retains references to the original
  compiled nodes, skips generated padding and unnamed FILLER, and reports ambiguity
  when two declarations have the same name within one scope.
- `cobolDebugRangeFromBits(offsetBits, sizeBits)` converts evaluated, byte-aligned
  bit ranges into record-relative, exclusive-end byte ranges.
- `cobolDebugRangeNumber({from, to})` returns a diagnostic `number` with unsigned
  16-bit start and end fields: `from * 65536 + to`.
- `cobolDebugRangeString(record, {from, to})` returns
  `from/to/hex-bytes` using the actual leased physical buffers. It honours
  nonzero record starts, cross-buffer ranges and completed-record bounds.

These utilities are **debugging scaffolding, not COBOL primitive decoders**.
A working COBOL `Parser`/`ProjectionSupport`, fixed-record framing, OCCURS
index compilation and live ODO count resolution are **not yet implemented**.
The distinction is intentional: the first end-to-end goal is to prove exact
byte selection before implementing storage-specific decoding.

## Proposed next milestone

1. Compile a fixed-length compiled-layout root into source-scoped details.
2. Compile selected application paths to a descriptor of resolved field geometry
   and optionally fixed-occurrence indexes. Reject ambiguous names and unsupported
   symbolic layouts with clear setup diagnostics.
3. Implement fixed-record `Parser.parse()` over existing buffer pools.
4. Bind a debug-only `ProjectionSupport` whose string and numeric methods use
   the range utilities above. Compare output against independent field-coordinate
   oracles and published raw byte fixtures.

The index does **not** expand OCCURS or choose REDEFINES views. The layout
compiler remains authoritative for physical offsets; `TParserDetails` should
own the compiled index, while record-specific evaluation state belongs in
`TRecordState`.

## Project integration

The package is included under `cursor-loader/cursor-loader-cobol/` with
`package.json`, `package.details.json`, `index.ts`, `tsconfig.json`,
`jest.config.json` and `babel.config.json`, matching sibling packages.

Run `npm test -- --runInBand` using the normal monorepo workspace environment.
