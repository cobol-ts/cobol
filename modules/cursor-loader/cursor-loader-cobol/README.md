# @cobol-ts/cursor-loader-cobol

The COBOL-specific integration point for the byte-backed cursor/projection framework.
It lives alongside `cursor-loader-csv` and `cursor-loader-json` and consumes the existing
compiled storage layout rather than recalculating COBOL geometry.

## Currently implemented (initial module)

- `createCobolNameIndex(roots): ErrorsOr<CobolNameIndex>` recursively builds a nested
  name index from the compiled layout. Map keys preserve source spelling;
  `findCobolName` performs case-insensitive lookup. It retains references to original
  compiled nodes, omits padding and FILLER subtrees, and returns aggregated errors
  for ambiguous duplicate names in a scope.
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

## Customer test fixtures (TDD progression)

`src/customer.fixtures.ts` contains five self-contained `CustomerFixture`s. Each
has a **copybook string**, two **explicit EBCDIC-037 byte sequences** (plus raw
COMP bytes in the aligned case), the **parsed AST**, and the **compiled layout**:

```ts
const ast = valueOrThrow(parseCopybook(copybook));
const layout = valueOrThrow(compileCobolLayout(ast, `${label}.cpy`));
return {label, copybook, ast, layout, records};
```

The data bytes and expected end-exclusive field slices are handwritten hex
oracles, **not** produced from `layout` or a production COBOL encoder. The
fixture test checks that their lengths and named field positions agree with the
real compiler/locator and that `createCobolNameIndex` returns references to the
same compiled nodes.

| Fixture | Two record lengths | Intent |
| --- | --- | --- |
| `customerSimple` | 15, 15 | Flat DISPLAY fields: first projection milestone |
| `customerNested` | 21, 21 | Nested group and FILLER |
| `customerAligned` | 9, 9 | A generated alignment byte before COMP |
| `customerFixedOccurs` | 17, 17 | Fixed OCCURS and REDEFINES inside each element |
| `customerOdoRedefines` | 14, 23 | Zero/three occurrences, plus REDEFINES within an ODO body |

The ODO samples are **logical record payloads of active length**, not a complete
VB file: there are no RDWs or other framing bytes. They are reserved for later
variable-record work. The initial fixed-length parser can start with
`customerSimple` and proceed one feature at a time. `itemCount` is provided as
fixture metadata for evaluating ODO geometry until byte-backed controller
resolution is implemented.

Tests live in `src/customer.fixtures.spec.ts`. Test data should remain
independent of the code under test; never populate expected offsets using the
compiled layout or expected hex by decoding and re-encoding the records.

## Application-facing customer projection contracts

`src/customer.projections.ts` declares one TypeScript accessor interface for each
customer schema (`SimpleCustomer`, `NestedCustomer`, `AlignedCustomer`,
`FixedOccursCustomer`, and `OdoCustomer`) and a matching **typed**
`defineProjection<T>()` mapping. Each `CustomerFixture` exposes its canonical
`projection` alongside the copybook, parsed AST, compiled layout, and two
literal records. For example:

```ts
export interface SimpleCustomer {
    id(): number;
    name(): string;
    status(): string;
}

export const customerSimpleProjection = defineProjection<SimpleCustomer>({
    id: {type: "integer", path: ["CUSTOMER", "CUSTOMER-ID"]},
    name: {type: "string", path: ["CUSTOMER", "CUSTOMER-NAME"]},
    status: {type: "character", path: ["CUSTOMER", "STATUS"]}
});
```

The types reflect the **debug projection phase**: `number` is an encoded pair
of byte offsets, and `string` is `from/to/hex-bytes`. No COBOL values are
being decoded yet. The contracts are method-based because the real projection
framework produces **borrowed lazy accessors**, not materialised objects.

`src/customer.projections.spec.ts` verifies that every projected path resolves
through `createCobolNameIndex`, including case-insensitive lookup. For flat,
nested, aligned and fixed-OCCURS records, a small *test-only* static locator
adds compiled, parent-relative offsets and checks both fixture records against
independent byte slices **without consulting an ODO controller**. The ODO test
allows fixed-prefix fields but confirms that a field after the variable table
needs record-specific count evaluation. This does not yet implement production
`compileProjectionPath` or the runtime COBOL parser.

For now the fixed-OCCURS projection selects only `CUSTOMER-ID` and `STATUS`.
The compiled name index already retains `TELEPHONES`, `PHONE-RAW`, and
`PHONE-PARTS`, but choosing an individual occurrence needs an explicit
indexed-path convention and will be developed separately.
