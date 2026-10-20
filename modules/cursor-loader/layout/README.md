# COBOL Layout Compilation

Compile a parsed COBOL copybook into **symbolic, bit-addressed physical storage geometry** for a byte-backed record reader. Compiled layouts can be reused across records; `OCCURS DEPENDING ON` (ODO) counts are supplied when a storage expression or selected field location is evaluated.

The implementation is IBM Enterprise COBOL for z/OS-oriented, with explicit options and injectable policies for storage conventions that depend on the originating compiler or source program. It is a **layout compiler**, not a COBOL source compiler, eager deserializer or byte-value decoder. The practical goal is to lay out **legal copybooks from working applications** correctly, rather than to provide exhaustive rejection diagnostics for invalid copybooks.

For detailed architectural reasoning, see [COBOL Layout Compilation](https://docs.google.com/document/d/1dALb84lfj2HpKNBerqIXkXV4qYUxv7m3MXW3CSXRHRA/edit?usp=drivesdk). For evidence, test files, original-source fixtures and how to run them, see **[README.tests.md](README.tests.md)**.

## What it provides

- Elementary and group physical extents, inherited `USAGE`/`SYNCHRONIZED` context and storage-free declarations that contribute no bytes.
- A dedicated PICTURE parser and classifier, with repetitions retained symbolically rather than expanded into individual characters.
- IBM-oriented primitive-size strategies for DISPLAY, binary, packed decimal, floating, national, DBCS and UTF-8 storage, including edited pictures and relevant sign conventions.
- Configured currency picture signs, `NSYMBOL` behaviour, and exact fixed `PIC U BYTE-LENGTH` sizing. Runtime-managed `DYNAMIC LENGTH` is recognised but cannot be represented as fixed inline file-record storage.
- Fixed `OCCURS` and nested ODO with one compiled occurrence body; zero active occurrences where declared and compatible fixed-location controllers.
- Symbolic `SYNCHRONIZED` padding, including nesting, alignment gaps and repeated-occurrence trailing padding.
- `REDEFINES` runs with shared starts and maximum overlay extent, including unequal alternatives and symbolic right-hand gaps.
- Parent-relative **left and right offsets**, expressed in bits, for compiled elementary, group and generated-padding nodes.
- `locateCobolEntry` for selected physical fields and indexed occurrences, using a caller-provided ODO count resolver.
- `ErrorsOr` diagnostics where a storage convention or location cannot be determined safely.

Compilation **does not decode or choose an interpretation of `REDEFINES` data**. Source bytes and application business decisions remain outside the layout compiler.

## Key modules and dependencies

| File or package | Responsibility |
| --- | --- |
| `src/cobol.picture.ts` | PICTURE token parsing, category classification, currency-picture conventions |
| `src/cobol.primitive.size.ts` | `CobolPrimitiveSizer`, IBM configuration and storage-size strategies |
| `src/cobol.layout.ts` | `compileCobolLayout`, compiled geometry, transformations and directional folds |
| `src/cobol.layout.location.ts` | `locateCobolEntry` and indexed physical selection |
| `src/cobol.padding.ts` | Alignment/padding policy and occurrence-tail padding |
| `src/cobol.overlay.alignment.ts` | Overlay alignment policy |
| `@cobol-ts/copybook` | Parsed `CopybookAst`, entries and relevant storage clauses |
| `@cobol-ts/size` | Canonical symbolic expressions, count binding and evaluation |
| `@cobol-ts/trees` | `transformTree`, `foldTreeLeft`, `foldTreeRight` |
| `@cobol-ts/partial_functions` | Strategy composition via `PartialFunction` and `chainOfResponsibility` |
| `@cobol-ts/errors` | `ErrorsOr` and error combinators |

The source AST is retained by reference in compiled nodes and is treated as **immutable after compilation**. Do not mutate storage declarations while their compiled layout is in use.

## Public API

```ts
compileCobolLayout(
  ast: CopybookAst,
  copybook: string,
  options?: CobolLayoutOptions
): ErrorsOr<readonly CompiledCobolEntry[]>;

locateCobolEntry(
  roots: readonly CompiledCobolEntry[],
  path: readonly (string | number)[],
  resolve: ResolvePath
): ErrorsOr<{
  node: CompiledCobolEntry;
  offsetBits: number;
  sizeBits: number;
}>;
```

`CobolLayoutOptions` supports `primitiveSizer`, `primitiveSizing`, `padding`, `overlayAlignment` and `canonicalise`. `primitiveSizing` configures the IBM-oriented default sizer; `primitiveSizer` allows a completely supplied sizing policy. The other options control placement and symbolic expression canonicalisation.

For example, currency definitions from the calling program's `SPECIAL-NAMES` clauses or its build configuration can be passed explicitly:

```ts
const roots = compileCobolLayout(ast, 'INVOICE.cpy', {
  primitiveSizing: {
    defaultCurrency: {symbol: '$', value: '$'},
    currencySigns: [{symbol: 'f', value: 'CHF'}],
    nSymbol: 'national'
  }
});
```

These options describe the source compiler's conventions; the layout compiler does not infer them from a bare copybook. `PIC U BYTE-LENGTH n` has exactly `n` bytes of inline storage. `DYNAMIC LENGTH`, where recognised, is runtime-managed rather than an inline allocation and is not supported in file-record layouts.

Each compiled node has `size`, `leftOffset` and `rightOffset` as `StorageSizeExpression` values **in bits**. A record root has zero parent-relative offsets. For children of a repeated group, offsets and the right-hand suffix are relative to **one occurrence body**, not the entire repeated table; the repeated group's own public `size` covers its active or fixed occurrences.

### Example: indexed lookup inside nested ODO

```cobol
01 RECORD.
   05 OUTER-COUNT PIC 9.
   05 INNER-COUNT PIC 9.
   05 OUTER OCCURS 0 TO 3 TIMES
      DEPENDING ON OUTER-COUNT.
      10 INNER OCCURS 0 TO 4 TIMES
         DEPENDING ON INNER-COUNT.
         15 CODE PIC X(2).
      10 TRAILER PIC X.
   05 FINAL PIC X.
```

For `OUTER-COUNT = 2` and `INNER-COUNT = 3`, the physical record length is 136 bits. With a resolver that supplies those counts:

```ts
import {valueOrThrow} from '@cobol-ts/errors';
import {locateCobolEntry} from './cobol.layout.location';

const location = valueOrThrow(locateCobolEntry(
  compiledRoots,
  ['RECORD', 'OUTER', 1, 'INNER', 1, 'CODE'],
  resolveCount
));

// location.offsetBits === 88
// location.sizeBits === 16
```

Occurrence indices are zero-based and follow the repeated declaration name. The locator sums the physical extents of **preceding occurrences individually**: a nested ODO can make those extents depend on occurrence-specific counts. The supplied resolver returns controller values; this package does not retrieve them from record bytes.

## Compilation architecture

The compiler performs a structural transformation and directional geometry folds; it does not materialise a record object graph.

1. **Context and strategies:** index source declarations and inherited storage clauses, resolve supported ODO controllers, and assemble declaration, repetition and placement strategies from composable partial functions.
2. **Structural transformation:** `transformTree` produces mutable compilation-only nodes and padding requirements. Fixed and dependent tables retain one occurrence body.
3. **Left fold:** `foldTreeLeft` places sequential and overlapping runs, evaluates alignment requirements against symbolic left positions, and completes group extents.
4. **Right fold:** `foldTreeRight` derives independent suffix offsets and gaps for unequal overlay alternatives. Compilation-only metadata is omitted from the returned tree.

`@cobol-ts/size` supplies the underlying algebra: numbers, sums, maxima, fixed occurrences, dependent occurrences, alignment and differences. A symbolic padding requirement can therefore be retained until its position is known without an additional layout phase or fabricated absolute origin.

## Scope and boundaries

The implementation enforces selected IBM-oriented storage restrictions where necessary to avoid ambiguous or impossible locations, but **rejecting invalid declarations is not our main acceptance objective**. Supporting real, legal copybooks and correctly locating their physical fields takes priority.

The following remain distinct from compiling geometry:

- **Byte-backed controller retrieval:** count values currently come from a callback, not from reading the selected physical record.
- **Byte decoding and projection integration:** stable layout metadata has not yet been wired end-to-end into the application's borrowed projection lifecycle.
- **Right-anchor selection:** right offsets are available, but the locator does not automatically choose record-end anchors or schedule dependent controller reads.
- **Business-level overlays:** deciding which `REDEFINES` interpretation applies, and avoiding reads from inactive interpretations, remains a caller responsibility.
- **Broader compiler compatibility:** a green corpus is evidence for the tested declarations and options, not exhaustive IBM conformance. File framing, dialect choices and compiler-option-sensitive layout must be checked against their original source environment.
- **Performance:** avoid speculative caches; any prefix/boundary cache should be record-lease-scoped and justified by profiling.

## Tests

The suite combines internal geometry regression cases with published COBOL copybooks, independently documented record lengths, fixed field-offset oracles, source-byte position checks, and cross-feature stress cases for ODO, alignment and overlays. See **[README.tests.md](README.tests.md)** for the test map, provenance, execution commands and evidence limitations.

Run from the `layout/` package:

```sh
npm test -- --runInBand
```

The design criterion is **physical correctness**, not just agreement between our compiler and its own evaluator. Expected field positions must be kept independent of production layout output.

**Maintenance rule:** prefer a focused strategy or storage-policy change, motivated by a failing legal-copybook or geometry test, over a new compiler phase or parallel layout representation.
