# `@cobol-ts/layout`

Compile a COBOL copybook AST into a **physical storage layout**: bit sizes, positions within enclosing groups, and the relationship between ordinary fields, repeated groups, and overlapping `REDEFINES` views.

**Design principle:** describe where bytes actually live. The compiler should reduce fixed layouts to numeric sizes and offsets, retain symbolic expressions where a record value determines storage extent, and avoid inventing a second model of “logical” versus “physical” size.

The package builds metadata; it does **not** read or decode a record. Record-aware projection evaluates any remaining symbolic expressions against a particular buffer.

> **Implementation status.** The core compiler handles elementary and group storage, fixed and dependent occurrences, and overlapping `REDEFINES` extents. The alignment/padding calculation policy is implemented separately and tested, but insertion of generated padding entries into the layout compiler is the next integration task. Examples explicitly labelled *target representation* below describe that intended integration, not behaviour already available in the compiler.

## Responsibilities and package boundaries

| Package | Responsibility |
| --- | --- |
| `@cobol-ts/copybook` | Parse and validate copybooks; provide `CopybookAst`, `GroupEntry`, `ElementaryEntry`, and clauses |
| `@cobol-ts/layout` | Compute physical layout metadata, apply storage and alignment rules, position children and overlays |
| `@cobol-ts/size` | Represent, canonicalise, and evaluate symbolic bit sizes |
| `@cobol-ts/errors` | Return success or diagnostics through `ErrorsOr<T>` |
| Projection / byte-backed record layer | Resolve count fields, evaluate symbolic positions for a specific record, and read bytes |

The layout compiler owns traversal and placement. Storage-size and padding policies supply calculations; they do not insert compiled entries or move the control-loop cursor themselves.

## Compiling a layout

The core entry point is `compileCobolLayout`:

```typescript
import {parseCopybook} from "@cobol-ts/copybook";
import {valueOrThrow} from "@cobol-ts/errors";
import {compileCobolLayout} from "@cobol-ts/layout";

const ast = valueOrThrow(parseCopybook(`
01 CUSTOMER.
   05 CODE PIC X(2).
   05 ADDRESS.
      10 NUMBER PIC 9(3).
      10 STREET PIC X(10).
`));

const layout = valueOrThrow(compileCobolLayout(ast));
```

`compileCobolLayout` returns `ErrorsOr<readonly CompiledCobolEntry[]>`. The top-level array reflects the storage-bearing copybook entries. The compiler retains groups and elementary entries, rather than flattening every nested field into a single list.

The currently established core options include an injectable `primitiveSizer`; the agreed target options also include `padding` and `canonicalise` once padding placement is wired into the compiler:

```typescript
// Target integration, not yet the core compiler's implemented options.
export type CobolLayoutOptions = {
    readonly primitiveSizer: CobolPrimitiveSizer;
    readonly padding: CobolPaddingPolicy;
    readonly canonicalise: typeof canonicaliseStorageSize;
};
```

Default behaviour is intended to use the default primitive sizer, IBM padding policy, and the `@cobol-ts/size` canonicaliser. This arrangement allows dialect-specific arithmetic without rewriting the generic placement algorithm.

## Compiled layout model

Each storage-bearing compiled entry has three values measured **in bits**:

| Property | Meaning |
| --- | --- |
| `size` | Physical storage extent of the entry; potentially symbolic |
| `leftOffset` | Offset from the start of its enclosing group to the entry's start |
| `rightOffset` | Distance from the entry's end to the end of its enclosing group |

All three are `StorageSizeExpression`, not necessarily numbers. A simple file will generally canonicalise to numbers; a file containing ODO may retain symbolic expressions.

The current principal entry variants are:

```typescript
export type CompiledCobolEntry = CompiledCobolGroup | CompiledCobolElementary;

export type CompiledCobolPosition = {
    readonly leftOffset: StorageSizeExpression;
    readonly rightOffset: StorageSizeExpression;
};

export type CompiledCobolStorage = CompiledCobolPosition & {
    readonly size: StorageSizeExpression;
};

export type CompiledCobolGroup = CompiledCobolStorage & {
    readonly kind: "group";
    readonly name: CopybookEntryName;
    readonly children: readonly CompiledCobolEntry[];
};

export type CompiledCobolElementary = CompiledCobolStorage & {
    readonly kind: "elementary";
    readonly name: CopybookEntryName;
};
```

**Target representation for padding:** add `CompiledCobolPadding` to this union. A generated padding entry participates in the same `size`, `leftOffset`, and `rightOffset` calculations as a field. It has no COBOL source name or picture, because no declared field occupies those bytes. Do not represent the same bytes again as a separate “materialised size” on their neighbour.

### Parent-relative positioning

```cobol
01 CUSTOMER.
   05 CODE PIC X(2).
   05 ADDRESS.
      10 NUMBER PIC 9(3).
      10 STREET PIC X(10).
   05 STATUS PIC X.
```

Without special alignment, the record occupies **16 bytes = 128 bits**:

| Entry | `size` | `leftOffset` | `rightOffset` | Relative to |
| --- | ---: | ---: | ---: | --- |
| `CODE` | 16 | 0 | 112 | `CUSTOMER` |
| `ADDRESS` | 104 | 16 | 8 | `CUSTOMER` |
| `STATUS` | 8 | 120 | 0 | `CUSTOMER` |
| `NUMBER` | 24 | 0 | 80 | `ADDRESS` |
| `STREET` | 80 | 24 | 0 | `ADDRESS` |

The offsets of `NUMBER` and `STREET` are relative to **`ADDRESS`**, not directly to `CUSTOMER`. The projection combines the enclosing positions to determine an absolute buffer offset.

## Elementary storage

An elementary entry is sized by the injectable `CobolPrimitiveSizer`. Its input is a small effective description, rather than the entire AST entry:

```typescript
export type CobolPrimitiveDescription = {
    readonly picture?: string;
    readonly usage?: string;
    readonly sign?: SignClause;
};

export type CobolPrimitiveSizer = (
    description: CobolPrimitiveDescription,
    context: CobolPrimitiveSizeContext
) => ErrorsOr<StorageSizeExpression>;
```

The layout compiler is responsible for extracting the relevant clauses and applying inherited attributes consistently. The default implementation handles the currently supported IBM storage usages; it reports errors for unsupported or invalid declarations instead of guessing an extent.

## Groups, `REDEFINES`, and shared extents

A group occupies the physical extent of its children. Ordinary siblings advance the enclosing storage cursor. A `REDEFINES` entry **starts at the same offset as its target**, rather than advancing from the previous sibling.

```cobol
01 MESSAGE.
   05 PREFIX PIC X(2).
   05 RAW-DATA PIC X(8).
   05 STRUCTURED REDEFINES RAW-DATA.
      10 HEADER PIC X(2).
      10 BODY PIC X(6).
   05 TRAILER PIC X.
```

`RAW-DATA` and `STRUCTURED` each start after the two-byte prefix and share eight bytes. The following `TRAILER` begins after the **maximum** extent of the alternatives, not their sum. Here the record is 2 + 8 + 1 = **11 bytes**.

The size algebra represents an overlay extent using `max`. The **layout control loop** is responsible for the shared starting position and deciding which sibling advances storage. This distinction remains important when an alternative itself contains synchronized fields: internal placement still applies, but no new initial padding should be inserted before the redefining alternative merely to move its overlay start.

## Fixed `OCCURS`

```cobol
01 RECORD.
   05 PREFIX PIC X(2).
   05 ITEMS OCCURS 3 TIMES.
      10 CODE PIC X.
      10 AMOUNT PIC 9(3).
   05 TRAILER PIC X.
```

One `ITEMS` occurrence occupies four bytes; the three occurrences occupy twelve bytes. The compiler retains **one group describing the occurrence**, and its `size` describes the total repeated extent. It does not need to duplicate the children three times.

The `@cobol-ts/size` grammar provides:

```typescript
{kind: "occurs", count: 3, expression: 32}
```

The canonicaliser can reduce this to `96` bits because the occurrence extent is fixed. If the child contains a variable-sized nested table, the `occurs` node must remain: each occurrence can have different lengths, and its index is needed to resolve inner count paths.

### Trailing alignment padding for a fixed stride — target integration

When a repeated group contains synchronized storage, its first occurrence is laid out at the actual proposed position. The padding policy then calculates any **trailing padding** required to preserve the same internal alignment pattern for later occurrences.

```cobol
01 RECORD.
   05 ITEMS OCCURS 3 TIMES.
      10 CODE PIC X.
      10 AMOUNT PIC S9(4) COMP SYNC.
      10 FLAG PIC X.
```

Starting at byte zero, one occurrence has:

| Component | Byte offset within occurrence | Length |
| --- | ---: | ---: |
| `CODE` | 0 | 1 byte |
| Initial padding | 1 | 1 byte |
| `AMOUNT` | 2 | 2 bytes |
| `FLAG` | 4 | 1 byte |
| Trailing padding | 5 | 1 byte |

The occurrence stride is **6 bytes** and the total table is **18 bytes**. The target compiled group has one occurrence's child layout, including explicit generated padding blocks; its total `size` applies the repetition count to the padded stride.

The trailing-padding operation takes the **physical length of one occurrence**, including its internal padding but excluding the trailing padding it is about to add. It does not receive the absolute ending offset.

## `OCCURS DEPENDING ON` and symbolic storage

For an ordinary dependent table, the layout compiler can construct an expression without knowing the runtime count:

```cobol
01 RECORD.
   05 COUNT PIC 9.
   05 ITEMS OCCURS 0 TO 10 TIMES DEPENDING ON COUNT.
      10 CODE PIC X(3).
```

Conceptually, `ITEMS.size` is:

```typescript
{
    kind: "depending-on",
    path: ["RECORD", "COUNT"],
    expression: 24
}
```

The count is resolved by the projection for the current record. `@cobol-ts/size` supports nested fixed and dependent repetitions through relative occurrence-index bindings; details are documented in the **`@cobol-ts/size` README**.

### Alignment after an ODO table — target integration

```cobol
01 RECORD.
   05 COUNT PIC 9.
   05 ITEMS OCCURS 0 TO 10 TIMES DEPENDING ON COUNT.
      10 CODE PIC X(3).
   05 AMOUNT PIC S9(9) COMP SYNC.
```

If the chosen dialect computes alignment from the **actual runtime position**, the proposed position of `AMOUNT` is `8 + COUNT × 24` bits, and the padding size is:

```typescript
{
    kind: "align",
    size: {
        kind: "sum",
        terms: [
            8,
            {kind: "depending-on", path: ["RECORD", "COUNT"], expression: 24}
        ]
    },
    boundary: 32
}
```

Here `align` means **the additional number of bits needed** to reach a multiple of `boundary`; it does not mean the aligned absolute position. The projection evaluates the expression for the record's actual `COUNT`.

| `COUNT` | Proposed byte offset | Padding | `AMOUNT` byte offset |
| ---: | ---: | ---: | ---: |
| 0 | 1 | 3 bytes | 4 |
| 1 | 4 | 0 bytes | 4 |
| 2 | 7 | 1 byte | 8 |
| 3 | 10 | 2 bytes | 12 |

**Dialect caveat:** this demonstrates the expressive power of the size algebra, **not a verified claim about the placement rule used by every IBM Enterprise COBOL ODO layout**. A dialect could instead calculate some alignment from a declared maximum. That convention belongs in an injected padding strategy. The current strategy interface receives a symbolic proposed offset; a maximum-based implementation may also need maximum-extent information that the interface does not yet provide.

## Injectable padding policy

`cobol.padding.ts` separates numerical alignment decisions from placement:

```typescript
export type CobolPaddingPolicy = {
    readonly before: CobolInitialPaddingResolver;
    readonly occurrenceAlignment: CobolOccurrenceAlignmentResolver;
    readonly afterOccurrence: CobolOccurrencePaddingResolver;
};
```

| Method | Inputs | Result |
| --- | --- | --- |
| `before(entry, offsetBits, context)` | AST storage entry; proposed `StorageSizeExpression` offset | `ErrorsOr<StorageSizeExpression>`: padding before placement |
| `occurrenceAlignment(entry, context)` | AST storage entry | `ErrorsOr<number>`: strongest required boundary in bits |
| `afterOccurrence(entry, occurrenceSizeBits, context)` | AST storage entry; one occurrence's `StorageSizeExpression` extent | `ErrorsOr<StorageSizeExpression>`: trailing padding for its stride |

The IBM implementation uses `ibmCobolAlignment` to determine the boundaries of synchronized elementary storage. For repeated groups it inspects elementary descendants, including nested groups and `REDEFINES` alternatives, and computes the strongest requirement. Effective inherited `USAGE` and synchronization information is passed through `CobolPaddingContext`.

The policy **does not** insert compiled entries, recurse through placement, control repetitions, or change cursor positions. The compiler calls it at the appropriate points and creates padding entries from nonzero results.

The IBM helper returns numeric padding immediately for constant inputs, and constructs `{kind: "align", size, boundary}` for symbolic inputs. For a required boundary of **8 bits**, it returns zero directly: under this COBOL compiler's whole-byte storage invariant, no byte-alignment padding is needed. That simplification is COBOL-specific and does not belong as an unconditional rule in the generic size algebra.

## Canonicalisation and evaluation

Both ordinary storage and generated padding are `StorageSizeExpression` values. The intended layout options inject `canonicaliseStorageSize`, and the compiler canonicalises expressions **as it constructs the compiled layout**, rather than inventing a parallel representation of resolved sizes.

Examples:

```typescript
canonicaliseStorageSize({kind: "sum", terms: [8, 24]});
// 32

canonicaliseStorageSize({kind: "align", size: 24, boundary: 32});
// 8
```

Symbolic expressions remain symbolic where the compiler cannot safely reduce them. `evaluateStorageSize(expression, resolve)` is the record-aware counterpart: its resolver supplies count values at concrete indexed paths.

The canonicaliser simplifies expressions without consulting a record. It preserves repetition nodes when removing them would change the meaning of nested relative index bindings. It does not yet implement general divisibility proofs for arbitrary symbolic expressions.

The padding policy itself **does not call the injected canonicaliser**. Canonicalisation at the layout control loop boundary is part of the pending padding integration.

## Diagnostics

Compilation returns `ErrorsOr<T>`; consumers can use `valueOrThrow` when a thrown error is appropriate. The primitive sizer, padding resolver and copybook parsing/validation report invalid or unsupported declarations through the same error convention.

Padding diagnostics carry the copybook, source line and field path from `CobolPrimitiveSizeContext` / `CobolPaddingContext` where available. In particular, invalid synchronized binary declarations should result in diagnostics rather than fabricated padding.

## Current state and next steps

**Already implemented or tested independently:**

- Compilation of elementary and nested group extents, fixed/variable repetition expressions, and `REDEFINES` overlays.
- IBM elementary alignment boundaries and calculation of numeric initial padding.
- Strongest occurrence alignment across nested groups and overlay alternatives.
- Numeric trailing occurrence padding to preserve a fixed stride.
- Symbolic initial and trailing padding expressions using `@cobol-ts/size`'s `align` operation.
- Expression canonicalisation and record-aware evaluation, including nested ODO index bindings, in `@cobol-ts/size`.

**Not yet demonstrated end to end in `compileCobolLayout`:**

1. Inject `CobolPaddingPolicy` and the canonicaliser through layout options.
2. Add `CompiledCobolPadding` to the compiled-entry union and insert actual padding entries at the correct level.
3. Position fields and overlay alternatives against padding-inclusive physical extents.
4. Include trailing padding in the one-occurrence stride **before** applying fixed `OCCURS` or ODO.
5. Test generated sizes and left/right offsets across fixed layouts, nested groups and overlays.
6. Test symbolic offsets and padding against actual ODO count values through the projection.
7. Verify the IBM-specific ODO convention before treating the dynamic-alignment example as IBM physical-layout behaviour.

The distinction is intentional: **the calculation policy is tested; the generic control loop must still turn its answers into a correct byte-backed layout.**

## Tests

The unit-test strategy uses short copybook examples to explain each storage rule, followed by assertions against compiled metadata or policy results.

- `cobol.alignment.spec.ts` checks IBM alignment decisions and diagnostics.
- `cobol.padding.spec.ts` checks initial and trailing padding, nested groups, inherited attributes, overlays, unaligned repeated groups and symbolic expressions.
- Layout compiler integration tests should assert the resulting **padding entries, offsets, repeated extents and overlay starts**, not merely test padding numbers in isolation.
- The size package has separate canonicalisation/evaluation suites so algebraic correctness does not depend on COBOL AST traversal.

Some difficult nested ODO structures are mathematically representable but may not be legal in a particular COBOL dialect; copybook legality and actual physical-format compatibility need separate verification.
