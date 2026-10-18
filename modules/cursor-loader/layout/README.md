# COBOL Layout Compilation

Compile a COBOL copybook AST into **symbolic, bit-addressed physical storage geometry** for a byte-backed record reader. The layout can be shared across records; the values of `OCCURS DEPENDING ON` (ODO) controllers are supplied only when an expression or selected field location is evaluated.

The implementation targets a **tested subset of IBM Enterprise COBOL for z/OS 6.4 storage conventions**, with injectable sizing, padding and overlay-alignment policies. It is a *layout compiler*, not a COBOL source compiler, eager deserializer or primitive decoder.

For the detailed design, decisions, examples and open issues, see [COBOL Layout Compilation](https://docs.google.com/document/d/1dALb84lfj2HpKNBerqIXkXV4qYUxv7m3MXW3CSXRHRA/edit?usp=drivesdk).

## What it provides

- Fixed elementary and group storage sizes, including nested groups and inherited `USAGE`/`SYNCHRONIZED` context.
- Fixed `OCCURS`, with one compiled occurrence body rather than expanded copies.
- Simple and nested ODO, including ODO inside ODO with **fixed-location IBM-compatible controllers**, and zero active occurrences where declared.
- Symbolic `SYNCHRONIZED` padding, including ownership across nested group boundaries and repeated-group trailing padding.
- `REDEFINES` runs, shared starting positions, maximum overlay extent, unequal alternatives and symbolic right-hand gaps.
- Parent-relative **left and right offsets** for every compiled physical entry, with all arithmetic in bits.
- An indexed `locateCobolEntry` operation that evaluates selected occurrence prefixes and returns a concrete bit offset and selected extent using a caller-provided count resolver.
- `ErrorsOr` diagnostics for invalid copybook storage, invalid ODO controllers, out-of-bounds counts and unsupported placement.

The compiler preserves the AST's physical hierarchy, ignores storage-free declarations when counting bytes, and does not interpret unrequested primitive values.

## Key files and dependencies

| File or package | Role |
| --- | --- |
| `cobol.layout.ts` | `compileCobolLayout`, public compiled entry types, composable strategies and geometry folds |
| `cobol.layout.location.ts` | `locateCobolEntry`, indexed physical field selection |
| `cobol.primitive.size.ts` | Primitive `PIC`/`USAGE` storage-size policy |
| `cobol.padding.ts` | Alignment boundary, before-placement and after-occurrence padding policy |
| `cobol.overlay.alignment.ts` | Policy for alignment requirements within overlaid storage |
| `@cobol-ts/copybook` | Parsed `CopybookAst` and declaration types |
| `@cobol-ts/size` | Canonical symbolic expressions, count resolution and evaluation |
| `@cobol-ts/trees` | Generic `transformTree`, `foldTreeLeft`, `foldTreeRight` |
| `@cobol-ts/partial_functions` | `PartialFunction` and `chainOfResponsibility` |
| `@cobol-ts/errors` | `ErrorsOr` and associated combinators |

These are source-module names, not a proposed new package layout. Keep any existing repository barrel exports consistent; if you expose the locator publicly, export `cobol.layout.location.ts` from the appropriate entrypoint.

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

`CobolLayoutOptions` can override `primitiveSizer`, `padding`, `overlayAlignment` and `canonicalise`. Defaults use the existing primitive-size resolver, IBM-oriented padding/overlay policies and `canonicaliseStorageSize`.

The public compiled tree has three node kinds: `elementary`, `group`, and generated `padding`. Each has `size`, `leftOffset` and `rightOffset` of type `StorageSizeExpression` (bits). Group children describe **one occurrence** even when the group's public `size` covers multiple occurrences. Offsets are **relative to the immediate containing group**; record-root offsets are zero.

### Example: locate a field inside nested ODO

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

With `OUTER-COUNT = 2` and `INNER-COUNT = 3`, the record is 136 bits. If `compiledRoots` is the successfully compiled layout and `resolveCount` provides controller values for the record:

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

Occurrence indices are **zero-based** and follow each repeated declaration name. For a selected occurrence, the locator adds the extents of preceding occurrences individually: an enclosing repeated body's size may vary with nested counts, so `index * selectedBodySize` is not generally correct. The `resolveCount` callback is supplied by the caller; this module does **not** read or decode ODO counters from a byte buffer.

## How compilation works

The implementation follows one direct transformation and two directional folds:

1. **Compose strategies.** The compiler indexes source context and constructs declaration, repetition and placement dispatch chains from independently testable `PartialFunction` factories. Each factory captures only its required services; an unmatched strategy throws because it indicates missing implementation, while copybook errors use `ErrorsOr`.
2. **Transform the AST.** `transformTree` constructs actual mutable pending nodes and symbolic padding *requirements*. It does not return deferred plans, fabricate physical origins or expand occurrences.
3. **Fold from the left.** `foldTreeLeft` applies pending alignment requirements to the current symbolic left-origin position, places sequential and overlaid runs, sets `leftOffset` and completes group sizes on group exit. Padding nodes are inserted only where the gap is nonzero.
4. **Fold from the right.** `foldTreeRight` independently computes `rightOffset` from suffixes and overlay extents, using symbolic differences for unequal alternatives. Compilation-only intent fields are removed before returning the public tree.

The symbolic algebra (`@cobol-ts/size`) supports constants, `sum`, `max`, `occurs`, `depending-on`, `align` and `difference`. It evaluates variable expressions only when given record-dependent counts and, where necessary, enclosing occurrence indices. Runtime bounds are checked using the declared ODO minimum and maximum stored on dependent expressions.

### Why symbolic padding?

A pending padding node means **“align the following storage to this boundary”**, not **“insert N bits now.”** Its eventual size may depend on earlier ODO extents. The left fold can express that gap using the symbolic left-origin position without needing a concrete record, an extra realization phase or a synthetic origin variable.

## IBM-oriented validation

The implemented controller resolver searches enclosing declaration scopes and enforces a conservative, tested IBM 6.4-oriented subset. ODO controlling items must be suitable fixed-location integer elementary fields outside their controlled table; table-element controllers, ambiguous names and controllers following earlier variable-length storage are rejected. The current explicit `REDEFINES` placement strategy also rejects either participant **directly declaring ODO**.

This is **not** full Enterprise COBOL semantic validation. In particular, the broader IBM rule forbidding any `OCCURS` on the redefined target, including fixed `OCCURS`, still requires complete enforcement. Full qualified-name resolution, implicit record-level redefinitions and option-dependent storage rules are outside the demonstrated subset. The implementation does not silently fall back to permissive historical-copybook interpretation.

## Tests and confidence

The TDD suite covers fixed geometry, nested and repeated synchronization, generated-padding ownership, `REDEFINES` chains and unequal extents, symbolic offsets, simple and nested ODO, bounds and IBM controller legality, independent strategy composition, concrete bit locations and multi-feature interactions. Two initially failing IBM legality tests were fixed in the overlay strategy without adding a compiler phase.

The latest reported rebuilt local-harness run was **151 passing tests**, including the 19-case integration campaign and the two previously failing `REDEFINES`/ODO tests. The test suite has also been reported passing after integration in the user's repository. These results do **not** establish certification against IBM-generated reference bytes, every COBOL construct or performance characteristics.

Run the repository's normal TypeScript type-check and test commands after modifying the compiler, the size algebra, its evaluator, or the locator. Do not rely solely on the geometry evaluator agreeing with the compiler: where possible, assert independently calculated physical bit positions and known record bytes.

## Current limitations and next work

- **Real record integration:** wire a byte-backed controller resolver and primitive decoder into `compileProjectionPath` and the existing flyweight projection framework. An indexed locator returning bit coordinates is not itself a byte decoder.
- **Anchor selection:** `rightOffset` is compiled, but general record-end/framing-aware location planning and dependency scheduling are not implemented by the current left-origin locator.
- **IBM conformance:** complete legality checks, and verify active versus reserved-capacity, `SYNCHRONIZED` and ODO conventions against representative IBM-generated records and compiler options.
- **Overlay interpretation:** `max` over symbolic alternative extents must not force decoding invalid counts from inactive alternatives in a production reader. Chosen physical allocation/interpretation rules need explicit evidence.
- **Projection path contract:** the locator accepts `(string | number)[]`, while existing generic application projection paths use `string[]`; indexed path binding is an integration decision.
- **Performance:** a selected occurrence may require evaluating many preceding variable-sized occurrences. Add record-lease-scoped prefix or boundary caching only if measurements justify it; never put mutable per-record data into shared compiled metadata.

**Design rule:** new COBOL constructs should normally be implemented as focused validation or composable strategies plus tests, not another tree representation, deferred-plan layer or compiler pass.
