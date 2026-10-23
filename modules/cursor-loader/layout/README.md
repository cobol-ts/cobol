# COBOL Layout Compilation

`@cobol-ts/layout` turns a parsed COBOL copybook into a **reusable description of where bytes belong**. It determines the physical extent of declarations, the positions of fields within their containing groups, alignment gaps, repeated storage, and overlapping `REDEFINES` views. It does **not** decode a record into a COBOL object, select a business interpretation, or read an `OCCURS DEPENDING ON` (ODO) count from a byte buffer.

The difficult part is that a COBOL layout is not always a list of fields with fixed offsets. A declaration can start after a variable-length table; several declarations can occupy the same bytes; a nested synchronized field can insert padding into a parent group; and the size of one occurrence can depend on the indices of enclosing occurrences. The compiler therefore preserves **symbolic storage geometry**, rather than pretending all offsets are known at compilation time.

The implementation targets an **IBM Enterprise COBOL for z/OS-oriented subset** with configurable storage policies. Its goal is to locate fields from *legal, working copybooks* correctly, not to act as a complete COBOL compiler or an exhaustive source validator.

For the broader architectural decision, see [COBOL Layout Compilation](https://docs.google.com/document/d/1dALb84lfj2HpKNBerqIXkXV4qYUxv7m3MXW3CSXRHRA/edit?usp=drivesdk). For test cases, source provenance, and what each test actually proves, see [README.tests.md](README.tests.md).

## The mental model

A compiled layout is a tree with one node per storage declaration (plus explicit compiler-generated padding nodes). Every node has three expressions, all measured in **bits**:

| Expression | Meaning |
| --- | --- |
| `size` | Physical extent occupied by this declaration, including its declared repetitions. |
| `leftOffset` | Distance from the beginning of the containing group to this declaration's beginning. |
| `rightOffset` | Distance from the end of this declaration to the end of the containing group. |

For a record root, both offsets are zero. For a child of a **repeated group**, offsets refer to **one occurrence body** of that group; the repeated group's `size` describes the full table. The expressions can be numbers, or symbolic sums, maxima, repetitions, alignment gaps, and differences that are evaluated for a particular record.

For example:

```cobol
01 RECORD.
   05 HEADER  PIC X(3).
   05 DETAILS.
      10 CODE PIC X(2).
      10 FLAG PIC X.
   05 TAIL    PIC X.
```

Ignoring any separately configured alignment requirements, `HEADER` begins at byte 0, `DETAILS` at byte 3, `CODE` at byte 3, `FLAG` at byte 5, and `TAIL` at byte 6. `DETAILS` has `leftOffset = 24` bits within `RECORD`, while `FLAG` has `leftOffset = 16` bits within **DETAILS**. The latter is **not** an absolute offset: to locate it from the record origin, add the group offsets along its ancestry.

This distinction is intentional. The tree describes **relative geometry that can be reused**, not an eagerly expanded record instance.

## How the compiler works

The code follows this sequence:

```text
CopybookAst
    |
    v
Index declaration context and supported ODO controllers
    |
    v
transformTree: build mutable storage nodes and padding intents
    |
    v
foldTreeLeft: place nodes, close overlay runs, resolve padding,
              determine sizes and left offsets
    |
    v
foldTreeRight: determine suffix offsets independently
    |
    v
Readonly compiled tree: elementary / group / padding
    |
    +--> evaluateStorageSize(..., resolveCount) for a record
    +--> locateCobolEntry(..., path, resolveCount) for a field
```

### 1. Index the context; decide which strategy applies

A preliminary walk records each declaration's containing names and inherited `USAGE` and `SYNCHRONIZED` clauses. This is needed because an elementary field's width and alignment can depend on an enclosing group, rather than only on its own `PIC` clause. The original AST retains the information; the compiler does not flatten away the relationship.

The same setup resolves supported `DEPENDING ON` names to symbolic controller paths. Resolution searches the nearest enclosing declarative scope first, rejects ambiguous matches, and checks the controller's suitability under the implemented IBM-oriented rules. This is **not** a general DATA DIVISION qualified-name resolver.

The compiler then composes small partial-function strategies using `chainOfResponsibility`:

- **Declaration:** elementary storage, group storage, or ignored non-storage entry.
- **Repetition:** no `OCCURS`, fixed `OCCURS`, or dependent `OCCURS`.
- **Placement:** sequential sibling or a `REDEFINES` alternative in an active overlay run.

These are separate decisions. ODO is a repetition strategy, not another algorithm for walking the layout; `REDEFINES` is a placement strategy, not an alternative size calculator.

### 2. `transformTree`: construct storage nodes, not positions

`transformTree` works bottom-up, converting source entries to private mutable `PendingElementary`, `PendingGroup`, and `PendingPadding` nodes. Primitive sizing is delegated to `CobolPrimitiveSizer`. Groups retain a tree of children representing **one occurrence body**. A declaration with `OCCURS 100 TIMES` does not produce one hundred child subtrees.

At this stage the compiler can know that a synchronized field *may require padding*, without yet knowing how many bits of padding will be needed. It inserts a **padding intent**. This is a real intermediate node, not an invented absolute-position expression or a deferred second layout.

`RENAMES` and constants contribute no storage nodes. `FILLER` does contribute physical storage; it simply does not provide an ordinary named path for lookup.

### 3. `foldTreeLeft`: perform physical placement

The left fold walks each record root with a frame containing the current group, its symbolic origin, the current parent-relative position, and the currently open overlay run.

For an ordinary sequential declaration, the compiler closes the previous run, assigns the current position as `leftOffset`, and starts a new run. For `REDEFINES`, it **does not advance** the position: the new alternative shares the existing run's beginning.

When an overlay run closes, it advances the position by **the maximum alternative extent**, not by their sum. Thus storage after an overlay starts after the longest member even if the shorter view happens to be selected at runtime.

When the fold reaches a pending padding node, it asks the injected padding policy how many bits are needed at the **actual symbolic left position**. A constant position often gives a numeric answer. A position after ODO may instead give an `align(...)` expression, which is evaluated for each record. Zero-size padding disappears; nonzero or symbolic padding remains an explicit child of the group that physically owns it.

On exiting a group, the fold closes its last run, obtains the size of **one** occurrence body, and applies its repetition strategy. The resulting group `size` may remain symbolic. This is where group sizes, including nested variable sizes, become complete.

### 4. `foldTreeRight`: calculate independent suffix geometry

After sizes and left positions exist, the right fold visits children before their parents and works from the end of each group's sibling runs. It calculates the distance from a declaration's **end** to its containing group's **end**.

This calculation is deliberately independent of `group.size - leftOffset - size`. That subtraction is especially awkward when alternatives in the same `REDEFINES` run have unequal symbolic extents. Instead, each run contributes its maximum extent and each alternative receives its own gap within that run:

```text
rightOffset(alternative)
    = size of subsequent sibling runs
    + (maximum size of this overlay run - this alternative's size)
```

The expression form is `difference(max(...), alternativeSize)` when it cannot be reduced to a number. A shorter alternative therefore has a larger right offset, even though all alternatives begin at the same address.

The right fold also removes compilation-only occurrence and padding-intent metadata. The returned nodes expose readonly geometry and retain source declarations by reference; compilation used mutation internally, but no parallel immutable trees or expanded occurrence objects are created. **Treat the source AST as immutable while the compiled layout is in use.**

## A worked `REDEFINES` example

```cobol
01 RECORD.
   05 PREFIX PIC X(3).
   05 SHORT-VIEW PIC X(2).
   05 LONG-VIEW REDEFINES SHORT-VIEW PIC X(5).
   05 TRAILER PIC X.
```

The two views start at byte **3**. They overlap; they are **not** stored one after the other. The overlay occupies five bytes because the longest alternative is five bytes. `TRAILER` therefore starts at byte **8**, and the record occupies **9 bytes**.

| Node | Start byte | Size (bytes) | Right offset within RECORD (bytes) |
| --- | ---: | ---: | ---: |
| `PREFIX` | 0 | 3 | 6 |
| `SHORT-VIEW` | 3 | 2 | 4 |
| `LONG-VIEW` | 3 | 5 | 1 |
| `TRAILER` | 8 | 1 | 0 |

The right offset of `SHORT-VIEW` is four bytes: three unused bytes within the overlay's allocated extent, then one byte for `TRAILER`. The two source views are both represented; **the compiler does not select which is meaningful**.

If an overlay's sizes depend on a runtime count, the same rules apply symbolically: the allocated extent is `max(alternative sizes)` and the right-hand gap is a `difference`. This is also why evaluating an overlay's physical allocation may require more information than evaluating one chosen view. Never infer that an inactive `REDEFINES` branch is safe to decode merely because the layout can describe it.

## The corner cases that shape the design

### 1. `OCCURS` is a binder, not a copied subtree

Fixed `OCCURS` stores one compiled body. At runtime, the evaluator can calculate the repeated extent. For a constant-width body, this often canonicalises to a single number. But if the body contains symbolic dependent sizes, the evaluator **iterates over each occurrence with its own index binding**. In the general algebra, `N × size(the selected occurrence)` is not a valid replacement for the sum of each occurrence's size.

Even an explicit `OCCURS 1 TIMES` matters. It introduces occurrence index 0, which nested symbolic expressions may reference. It must not automatically become indistinguishable from a declaration with **no** `OCCURS` clause.

The compiled group children always describe one occurrence, not the whole repetition. Both their left and right offsets are relative to that occurrence body.

### 2. ODO changes both sizes and later field positions

```cobol
01 RECORD.
   05 COUNT PIC 9.
   05 ITEMS OCCURS 0 TO 4 TIMES DEPENDING ON COUNT.
      10 CODE PIC X(2).
   05 AFTER-TABLE PIC X.
```

Assuming one-byte DISPLAY characters, the table occupies `16 × COUNT` bits. `AFTER-TABLE` starts at `8 + 16 × COUNT` bits, not at a fixed offset. With `COUNT = 0`, it starts immediately after the controller; with `COUNT = 3`, it starts after three two-byte occurrences. A legal zero minimum means the table may occupy no bytes at all.

The ODO expression retains the controller path, one-occurrence expression, and declared minimum and maximum. Bounds are checked **when the expression is evaluated**. A callback supplies count values; the layout compiler does not read or decode the controller from a record.

The implemented IBM-oriented resolver deliberately requires a **fixed-location, suitable integer controller**, outside the controlled table and not an occurrence of another table. A controller following a variable table, a controller nested in a repeated element, an ambiguous controller name, or a controller inside its own table is rejected in the current supported subset. The expression algebra is broader than the currently accepted source declarations.

### 3. Nested ODO and indexed locations require prefix sums

```cobol
01 RECORD.
   05 OUTER-COUNT PIC 9.
   05 INNER-COUNT PIC 9.
   05 OUTER OCCURS 0 TO 3 TIMES DEPENDING ON OUTER-COUNT.
      10 INNER OCCURS 0 TO 4 TIMES DEPENDING ON INNER-COUNT.
         15 CODE PIC X(2).
      10 TRAILER PIC X.
   05 FINAL PIC X.
```

For `OUTER-COUNT = 2` and `INNER-COUNT = 3`, one `OUTER` occurrence is seven bytes (three two-byte codes and a one-byte trailer). The full record is **17 bytes (136 bits)**. The path `['RECORD', 'OUTER', 1, 'INNER', 1, 'CODE']` selects the second `CODE` in the second `OUTER`. It starts at byte **11 (bit 88)** and occupies two bytes.

The locator reaches that address by summing the sizes of preceding occurrences, not by choosing a convenient stride after the fact. If a repeated body has variable-sized nested components, those prefix sums must be evaluated with the correct enclosing indices. This is a correctness requirement, not merely a performance issue.

### 4. `SYNCHRONIZED` padding belongs to a particular group

A group is not automatically padded just because it contains a synchronized field. The owner of a gap depends on **where the gap lies physically**.

```cobol
01 RECORD.
   05 PREFIX PIC X(2).
   05 DETAILS.
      10 CODE PIC X.
      10 AMOUNT PIC S9(9) COMP SYNCHRONIZED.
```

Under the IBM-oriented policy, the four-byte `AMOUNT` needs a four-byte boundary. `PREFIX` uses bytes 0–1 and `CODE` uses byte 2. The gap at byte **3** is **inside `DETAILS`**, between `CODE` and `AMOUNT`; `AMOUNT` begins at byte 4.

Now remove `CODE` and make `PREFIX` three bytes. The same one-byte gap before `AMOUNT` belongs to **RECORD, before `DETAILS`**, because the first child of `DETAILS` must start aligned. The `alignedAtStart` guard prevents both levels from inserting the same padding. This ownership is important: an incorrect padding parent gives wrong child coordinates even when the final record length happens to be correct.

Alignment is calculated against the physical left origin. An ordinary group does not receive gratuitous trailing padding. A **repeated** group or elementary entry may need padding after each occurrence, so that the next occurrence obeys the configured alignment rule. Such padding can remain symbolic when the occurrence length is variable.

### 5. Overlay alignment is not free space

`REDEFINES` alternatives must start at the same location. A synchronized alternative cannot simply shift to the next boundary without ceasing to redefine the target. The overlay alignment policy decides whether a requested alignment is satisfied inside the existing overlay or must be rejected. The implementation does not silently insert a gap that changes the meaning of `REDEFINES`.

The IBM-oriented strategy rejects an ODO declaration directly on either explicit `REDEFINES` participant. Other IBM restrictions, such as the full rule concerning an `OCCURS` clause on the redefined target, are **not yet completely enforced**. Legal-copybook layout correctness is the primary goal; the package must not be treated as a complete legality checker.

### 6. Primitive sizing is not simply the number of `PIC` characters

`PICTURE` parsing and category classification precede physical sizing. DISPLAY numeric, edited fields, signs, `COMP`/binary, `COMP-3`/packed decimal, floating formats, NATIONAL, DBCS, and fixed-character UTF-8 have different storage rules. Repeated picture fragments are parsed structurally rather than expanded into a huge string.

Some source conventions are **not available from the copybook alone**: for example, currency picture symbols, `NSYMBOL` behaviour, and compiler-specific storage options. They must be supplied through `primitiveSizing` or an injected `primitiveSizer` rather than guessed. `PIC U BYTE-LENGTH n` reserves exactly `n` bytes; `DYNAMIC LENGTH` is recognised but cannot be assigned an invented fixed inline record extent.

### 7. Non-storage declarations, `FILLER`, and names

A constant or `RENAMES` declaration does not allocate new storage, so the structural transform returns no compiled storage node for it. `FILLER` **does** occupy bytes and affects every later offset, even though it has no normal named selector. It must never be skipped when calculating geometry.

The current locator resolves names **case-insensitively among siblings** and reports missing or ambiguous matches. It is not a general-purpose COBOL name-qualification engine. A name index for a later projection package can be built from the compiled tree, but it must not replace the physical semantics or confuse distinct declarations that share a name.

### 8. Record roots, bounds, and unknown conventions

Each top-level record root is compiled independently, with zero parent-relative offsets. Explicit `REDEFINES` between record roots is not currently supported by the ordinary overlay strategy; implicit record-description overlays in an FD are a separate problem.

A symbolic size is not permission to read arbitrary bytes. At access time, the caller still needs a trusted record boundary, validated ODO counts, and a valid path. A later byte-backed projection must also check that a selected bit range lies within the leased record and is compatible with the decoder's byte-alignment requirements. File framing and the byte source are deliberately outside this package.

## The symbolic size algebra

`@cobol-ts/size` defines the expressions the compiler constructs:

| Form | Why it exists |
| --- | --- |
| `number` | A known number of bits; the common result for fixed layouts. |
| `sum` | Ordinary sequential extents and suffixes. |
| `max` | The extent of an overlapping `REDEFINES` run. |
| `occurs` | A fixed number of occurrence bodies, with index binding preserved when needed. |
| `depending-on` | A count read through a symbolic controller path at evaluation time. |
| `align` | The number of bits required to reach an alignment boundary. |
| `difference` | A nonnegative gap, notably between an overlay's maximum extent and one alternative. |

`canonicaliseStorageSize` folds constants, flattens suitable sums/maxima, and removes redundant terms **without consulting a record**. It does not replace a genuinely variable body with an arbitrary fixed stride, discard an index binder needed by a nested expression, or choose a `REDEFINES` view.

`evaluateStorageSize(expression, resolveCount, enclosingIndices?)` then produces a concrete bit count for a particular record/count environment. Symbolic paths use strings for declaration names and, where present, numbers for **relative enclosing-occurrence depths**. The evaluator binds these depths to concrete indices while iterating. They are not the same thing as literal indexes in a user's location path.

A few important identities are:

```text
sequentialExtent = sum(siblingRunExtents)
overlayRunExtent  = max(alternativeExtents)
alignmentGap      = (boundary - position % boundary) % boundary
rightOverlayGap   = max(alternativeExtents) - selectedAlternativeExtent
```

The expressions retain their structure when some terms depend on a runtime count. Evaluation validates count types and ODO bounds; an impossible negative `difference` fails rather than producing a nonsensical offset.

## Using the API

The `copybook` argument to the compiler is a **source label for diagnostics**; the copybook has already been parsed into `CopybookAst` by the caller.

```ts
import {valueOrThrow} from '@cobol-ts/errors';
import {
    compileCobolLayout,
    locateCobolEntry
} from '@cobol-ts/layout';

const roots = valueOrThrow(compileCobolLayout(ast, 'customer.cpy'));

// For a fixed-only record, this callback should never be invoked.
const noCounts = () => {
    throw new Error('Unexpected ODO evaluation');
};

const field = valueOrThrow(locateCobolEntry(
    roots,
    ['RECORD', 'DETAILS', 'CODE'],
    noCounts
));

// field.node       -- the selected compiled entry
// field.offsetBits -- start relative to the selected record root
// field.sizeBits   -- selected physical extent
```

The locator accepts a path of declaration names and **zero-based numeric indices immediately after each repeated declaration name**. For example:

```ts
const selected = valueOrThrow(locateCobolEntry(
    roots,
    ['RECORD', 'OUTER', 1, 'INNER', 1, 'CODE'],
    resolveCount
));
```

`resolveCount` is a caller-supplied callback accepting a **concrete controller path** and returning the corresponding numeric value. The locator does not decode COBOL bytes. For fixed-only layouts, expressions usually canonicalise to numbers and no counts need resolving.

`CobolLayoutOptions` supports `primitiveSizer`, `primitiveSizing`, `padding`, `overlayAlignment`, and `canonicalise`. These override storage conventions or expression handling, not the responsibilities of the compiler's stages. For example:

```ts
const rootsWithSourceOptions = valueOrThrow(compileCobolLayout(
    ast,
    'invoice.cpy',
    {
        primitiveSizing: {
            defaultCurrency: {symbol: '$', value: '$'},
            currencySigns: [{symbol: 'f', value: 'CHF'}],
            nSymbol: 'national'
        }
    }
));
```

Choose these options from the originating program and compiler configuration. It is unsafe to treat the bare copybook as a complete specification of physical storage in all dialects.

### Failures and diagnostics

Expected source/layout failures return `ErrorsOr`, with contextual information including copybook, source line, and declaration path where available. The compiler can aggregate independent context, subtree, and root errors. It cannot always continue truthfully after a placement failure within the same record, because later positions depend on earlier positions. Unhandled strategy cases and broken internal invariants throw, as programming/configuration failures rather than recoverable copybook diagnostics.

## Where this stops and projection begins

The layout compiler provides **geometry and indexed location**, not a fully integrated byte-backed COBOL reader. In particular, it does not:

- obtain ODO controller values from physical record bytes;
- decode EBCDIC, packed-decimal, binary, or other primitive values;
- choose the active `REDEFINES` interpretation or safely decode inactive alternatives;
- choose a right-hand anchor or establish record framing (FB, VB/RDW, etc.);
- manage physical-record leases or application-facing projections.

The implemented consumer is **`@cobol-ts/cursor-loader-cobol`**. It creates a name index of the same compiled nodes and then compiles either constant-geometry paths (fixed OCCURS) or symbolic paths (ODO). The runtime retains variable-body occurrence boundary prefixes in the pooled physical-record state. The independent `locateCobolEntry()` algorithm remains a useful test oracle for coordinates, but it is not the hot-path locator used for already-compiled projections.

The adapter currently tests three levels of nested ODO and two independent sibling ODO arrays, using **fixed-position, supported count fields**. The geometry expressions can model enclosing occurrence indices and variable body lengths, but the adapter's physical-byte controller resolver explicitly rejects controllers at variable positions. Consequently, passing nested geometry tests does **not** establish support for a separately stored count inside every preceding outer occurrence. Layout compilation also does not decide FB/VB/RDW framing: the parser needs a trusted frame length before byte-backed access.

The adapter's scalar methods still return byte-range diagnostics instead of applying production primitive codecs, which remain separately implemented in `@cobol-ts/cobolcodec`.


## Source map

| Location | Main responsibility |
| --- | --- |
| `src/cobol.layout.ts` | Public geometry, context and controller resolution, strategies, structural transform and both folds. |
| `src/cobol.layout.location.ts` | Locate a concrete named/indexed entry by evaluating geometry. |
| `src/cobol.picture.ts` | PICTURE parsing and classification. |
| `src/cobol.primitive.size.ts` | IBM-oriented and injectable elementary storage-size rules. |
| `src/cobol.padding.ts` | Boundary and occurrence-tail padding policy. |
| `src/cobol.overlay.alignment.ts` | Alignment decisions for overlapping alternatives. |
| `@cobol-ts/copybook` | Source AST and storage clauses. |
| `@cobol-ts/size` | Symbolic expressions, canonicalisation, count binding and evaluation. |
| `@cobol-ts/trees` | `transformTree`, `foldTreeLeft`, `foldTreeRight`. |
| `@cobol-ts/partial_functions` | Small composable declaration/repetition/placement strategies. |
| `@cobol-ts/errors` | Recoverable `ErrorsOr` diagnostics. |
