# Quick start — Node.js fixed-block files

```ts
import {readCobolFile} from '@cobol-ts/cursor-loader-cobol/node';

const cursor = readCobolFile({
    copybook: 'EMPREC01.cpy',
    filename: 'TEST.EMP.RECORD.FILE.dat',
    projection: employeeProjection,
    bufferSize: 64 * 1024 // optional; default is 64 KiB
});

for await (const row of cursor) {
    try { console.log(row.result.salary()); }
    finally { row.close(); }
}
```

This convenience API uses the existing `createThrowingFileCursor` and original
byte-backed projections. It compiles the copybook, geometry and requested scalar
decoders once per opened source. It deliberately does not materialise rows or
create per-field joined byte arrays. The Node file handle closes on EOF, error
or iteration cancellation; yielded `FileCursorResult` lifetimes are still
owned by the caller and require `close()`.

The standard COBOL registry can also be used directly through
`createCobolParserRegistry(details)` for other physical byte sources or
alternative cursor error policies.

# `@cobol-ts/cursor-loader-cobol`

Byte-backed COBOL projections over compiled copybook storage geometry. The original record buffers remain authoritative: the adapter selects physical byte ranges and borrowed, application-facing views rather than decoding an entire COBOL record into an object graph. `REDEFINES` alternatives are distinct views of the same storage; choosing their business meaning is the caller's responsibility.

## Support matrix (23 October 2026)

| Capability | Current status |
| --- | --- |
| Fixed-length/fixed-blocked record **framing** | Implemented with `createCobolFixedDetails()` and known `recordLengthBytes` |
| Fixed and nested `OCCURS`, independent sibling arrays | Implemented; constant-stride arithmetic |
| `REDEFINES`, including unequal alternatives inside nested arrays | Implemented and byte-coordinate tested |
| `OCCURS DEPENDING ON` (ODO), including two sibling inner arrays | Implemented for supported fixed-location controllers |
| Three levels of nested ODO projected arrays | Implemented and tested end to end |
| Variable-body occurrence start positions | Lazy, record-owned cached boundary prefixes |
| ODO controllers at variable physical positions / one count **per outer occurrence** | **Not supported** by the current controller locator |
| Variable-length physical **record framing** (VB/RDW or other conventions) | Not implemented; `parse()` requires opened-source `recordLengthBytes` |
| Production primitive decoding for projected scalar members | Implemented for the subset documented in `README.decoder.md`; diagnostic projection details remain available for layout tests |

**Do not confuse storage layout with record framing.** `compileCobolLayout()` and `createCobolProjectionDetails()` accept symbolic ODO layouts; the `cobolParser.parse()` implementation still requires `details.recordLengthBytes`. For an ODO layout, the caller must arrange a valid framed record length before calling this parser; **the current `parse()` method accepts one `details.recordLengthBytes` for the opened source, not a varying length supplied for each record**. The end-to-end nested geometry tests construct completed `ProjectionPhysicalRecord` fixtures and bind projections directly, rather than testing an automatic ODO record-framing algorithm. `createCobolFixedDetails()` intentionally fails when the record length is not statically known.

The layout compiler applies an IBM Enterprise COBOL–oriented subset, not all possible dialect conventions. In particular, its current ODO controller validation requires suitable fixed-location controllers outside repeated occurrences. The symbolic expression algebra and jagged boundary cache are more general than this presently accepted subset.

## Pipeline: compile once, select lazily

```text
COBOL copybook
  -> parseCopybook()                         AST
  -> compileCobolLayout()                    immutable symbolic layout in bits
  -> createCobolFixedDetails(layout)         static frame when available
     or createCobolProjectionDetails(layout) symbolic ODO geometry
  -> defineProjection<T>()                   application definition
  -> createProjection(cobolParser, details, context, definition)
                                             compiled paths + reusable views
  -> cobolParser.parse(record, details)      borrow framed record bytes
  -> projection getter / array index        select only requested occurrences
  -> scalar accessor                        locate original byte range
```

The `CobolProjectionPath` discriminated union has a numeric fixed path (`offsetBits`, `sizeBits`, static `runtimeDimensions`) and a symbolic path referencing compiled entries and their left/right offsets. All physical geometry, including ODO cache contents, is in **bits**. Path compilation happens once per source/projection; no field-name search is needed on ordinary scalar access.

### Fixed OCCURS example

```cobol
01 CUSTOMER.
   05 CUSTOMER-ID PIC 9(4).
   05 TELEPHONES OCCURS 2 TIMES.
      10 PHONE-RAW PIC X(6).
      10 PHONE-PARTS REDEFINES PHONE-RAW.
         15 PHONE-KIND PIC X.
         15 PHONE-NUMBER PIC X(5).
   05 STATUS PIC X.
```

This is 17 bytes: `4 + 2 * 6 + 1`. Selecting `telephones[1].raw()` reads bytes `[10,16)` and `telephones[1].parts.number()` reads `[11,16)`. The second telephone is reached by a numeric six-byte stride, without a boundary cache or a duplicated decoded telephone object.

```ts
import type {ProjectedArray} from '@cobol-ts/arrays';
import {defineProjection} from '@cobol-ts/cursor-projection';

type Phone = {raw(): string; readonly parts: {number(): string}};
type Customer = {readonly telephones: ProjectedArray<Phone>};

const definition = defineProjection<Customer>({
    telephones: {type:'array', path:['CUSTOMER','TELEPHONES'], element:{
        raw: {type:'string',path:['PHONE-RAW']},
        parts: {type:'object',path:['PHONE-PARTS'],fields:{
            number: {type:'string',path:['PHONE-NUMBER']}
        }}
    }}
});
```

Nested child paths are relative to their selected parent. Fixed arrays use numeric stride multiplication, including repeated groups containing `REDEFINES` whose extent is the maximum of overlay alternatives.

## Nested ODO example: the actual supported path

```cobol
01 ROW.
  05 O-COUNT PIC 9.
  05 M-COUNT PIC 9.
  05 I-COUNT PIC 9.
  05 OUTERS OCCURS 0 TO 3 TIMES DEPENDING ON O-COUNT.
    10 O-HEAD PIC X.
    10 MIDDLES OCCURS 0 TO 3 TIMES DEPENDING ON M-COUNT.
      15 M-HEAD PIC X.
      15 INNERS OCCURS 0 TO 3 TIMES DEPENDING ON I-COUNT.
        20 CODE PIC X(2).
      15 M-TAIL PIC X.
    10 O-TAIL PIC X.
  05 FINAL PIC X.
```

With all three counts equal to 2, the directly bound completed-record fixture has 32 active bytes. The tested call:

```ts
row.outers[1].middles[1].inners[1].code();
```

selects record-relative bytes `[27,29)` (`db dc` in the diagnostic test). Outer occurrences are `[3,17)` and `[17,31)`; middle occurrences within outer 1 are `[18,24)` and `[24,30)`; the final byte is `[31,32)`. The test asserts these **interior coordinates**, not only total record length. A second test reaches the field across two physical buffers.

`O-COUNT`, `M-COUNT` and `I-COUNT` are at **fixed positions** at the start of the record. Thus the counts are shared among all corresponding enclosing occurrences within that record. This is a meaningful limitation: a controller located separately inside each `OUTERS` occurrence, producing different inner counts per outer instance, is not currently supported. `resolveCobolCount()` explicitly rejects variably located controller fields.

### Lazy position caching

A variable-size OCCURS body needs positions of the preceding occurrences. The record-state cache retains only the contiguous prefix needed to locate the requested index:

```text
OUTERS / []                 starts = [3,17,31]        (bytes shown for clarity)
MIDDLES / [outer=1]         starts = [18,24,30]
INNERS / [outer=1,middle=1] constant two-byte stride: no starts array
```

The real cache stores **bit boundaries** in `ArrayWithSize<number>`. Each ODO declaration is keyed by the original compiled node; branches form a lazily populated jagged hierarchy indexed by enclosing occurrence indices. To locate occurrence `i`, the cache extends its boundaries from the last known index through `i+1`, summing body extents using `evaluateStorageSize()`; subsequent lookups reuse the prefix. Calculating physical boundaries **does not** create application-facing projected children for all preceding occurrences. Fixed-width bodies use direct multiplication, not prefix caching.

Two sibling inner ODO declarations receive separate caches even when nested under the same outer occurrence. A right-anchored trailing field can be located from a trusted active record end without traversing preceding ODOs, as demonstrated by the `FINAL` fixture. Fixed-capacity trailing storage requires separate framing/anchor validation.

## Pooling, cleanup and allocations

The physical record owns a `CobolRecordState`:

```ts
// In the parser registry for the opened file:
cobol: {
    parser: cobolParser,
    parserConfig: () => preparedDetails,
    createRecordState: createCobolRecordState,
    cleanRecordState: cleanCobolRecordState
}
```

**Register `cleanRecordState` for pooled COBOL sources.** On final release, the pool calls this hook after the application result has cleared its borrowed projections. It resets active ODO boundary prefixes, unbinds the count resolver and retains array capacity, jagged branches, projection slots and scratch objects. There is no generation counter.

The generic projection framework retains root array runtimes in `recordState.projectionViews` and nested array runtimes on their owning child views. Previously visited COBOL array providers (`CobolArraySelection`) and selected occurrence objects are **rebound in place**: provider methods are prototype functions, and enclosing-index arrays are updated rather than recreated for the same retained slots. Repeated getters during a record lease reuse bound selections. Different simultaneously live physical-record holders have independent state; caller references to projected objects become invalid when their owning `FileCursorResult` closes.

Two different sizes must not be confused: `ProjectedArray.length` is the current record's logical count; `ArrayWithSize.size` is the number of valid cached prefix entries. Sparse high-water element slots are retained, with an additional dense active-prefix list used to clear only children bound during the current lease. Nested ODO cache branches use the same active-prefix approach. Cleanup work is proportional to active referenced branches/children rather than a scan of historical sparse capacity; the bookkeeping trade-off has correctness tests, **not** a measured throughput benchmark.

**Allocation status.** Previously visited provider/child slots are reused across leases. First-ever visits still allocate retained capacity; extending an ODO boundary cache can allocate evaluator working state and an extent callback. The current debug scalar strings allocate intentionally. Do not describe this adapter as allocation-free without heap profiling. In particular, the size-expression evaluator and the enclosing-index binding on a cache miss remain optimisation candidates, not functional blockers.

## Scalar values and error provenance

The scalar projection functions currently return **debug locations, not decoded COBOL business values**:

- `string` and `character`: `from/to/hex`, with zero-based record-relative bytes and exclusive end;
- `integer` and `float`: numeric encoding of the debug byte range, **not** an integer or floating-point value read from the COBOL field.

The separate `@cobol-ts/cobolcodec` package contains production-oriented codec implementations, but these are **not integrated** into the current COBOL projection scalar path.

Projection failures report source filename, record number, offending COBOL field or controller and physical bytes. The generic projection framework builds a full indexed application access path **on error**, e.g. `outers[1].middles[1].inners[1].code`. The path can only include the indices known when the failure occurs; setup failures have no runtime occurrence path.

## Relevant tests and next steps

- `cobol.odo.projection.spec.ts`: single-level ODO selection.
- `cobol.multiple.nested.odo.spec.ts`: two sibling nested ODO arrays, zero counts and independence.
- `cobol.odo.three.level.spec.ts`: three-level projection, literal coordinates, pooled reuse and split buffers.
- `cobol.odo.positions.spec.ts`: boundary prefixes, nested branches and reuse/cleanup.
- `cobol.symbolic.allocation.spec.ts`: retained sources, selections and occurrence-index arrays.
- `cobol.occurrence.context.spec.ts`: enclosing indices and error provenance.
- `cobol.fixed.array.projection.spec.ts`, `cobol.multiple.nested.arrays.spec.ts`, `cobol.nested.redefines.projection.spec.ts`: fixed arrays, nested arrays and overlays.
- `customer.fixtures.spec.ts`, `customer.projections.spec.ts`, `cobol.layout.index.spec.ts`, `cobol.debug.range.spec.ts`: fixtures, compiled name index and range helpers.

Run the package's Jest suite and TypeScript checks in the real workspace; focused lightweight harness checks are not a substitute for the full suite. Remaining work includes occurrence-local ODO controllers, external variable-record framing, integrating scalar codecs, validation with real client files and heap/throughput benchmarks.

Companion walkthrough: *Byte-Backed COBOL Projections — Nested ODOs, Lazy Positions and Reusable Views* (Google Docs).
