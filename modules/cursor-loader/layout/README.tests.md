# COBOL Layout — Tests and Confidence

This document explains **what `@cobol-ts/layout` tests, which claims those tests support, and where our evidence is still incomplete**. It complements [README.md](README.md), which describes the compiler and API.

The purpose is to establish confidence that **legal COBOL copybooks produce correct physical storage extents and field locations**. Byte-value decoding and the application projection pipeline are separate concerns. A correct total record length is necessary but **not sufficient**: fields can still be misplaced inside a record whose total length happens to match.

Test totals are intentionally omitted. They change as the corpus evolves; the test runner is the source of truth for execution status.

## Evidence hierarchy

| Evidence | What it establishes | Limit |
| --- | --- | --- |
| Published record length / LRECL | Entire record has the expected physical extent | Does not prove interior offsets |
| Published sample bytes and literal field slices | Selected field ranges agree with bytes from the originating source | Not a complete IBM compiler storage map |
| Fixed expected field coordinates derived from published copybooks | Specific offsets and sizes agree with separately reviewed declarations | Humans can misunderstand the same language rule |
| IBM-rule-derived worked examples | Known effects of `REDEFINES`, `SYNCHRONIZED`, etc., at specified positions | Adapted examples are not original production copybooks |
| Geometric invariants | Left/right offsets, parent extents and overlays are internally coherent | Two incorrect calculations can agree with each other |

**Do not promote a source-derived coordinate to an IBM-compiler-verified offset unless an independent IBM listing or equivalent evidence exists.** Where an oracle is calculated manually, retain the declaration and reasoning alongside the expected literal numbers.

## Test inventory

The following files all live under `src/`. Each tests the production parser, compiler, evaluator or locator; no special geometry implementation is substituted to make an external fixture pass.

| File | What it checks | Oracle type |
| --- | --- | --- |
| `cobol.layout.spec.ts` | Elementary/group layout and sequential physical placement | Hand-calculated geometry |
| `cobol.alignment.spec.ts`, `cobol.padding.spec.ts` | Alignment boundaries, padding generation and ownership | Storage-rule-derived coordinates |
| `cobol.layout.ibm.redefines.spec.ts` | IBM-oriented overlay restrictions and behaviour | IBM-rule-derived cases |
| `cobol.layout.odo.spec.ts`, `cobol.layout.odo.nested.spec.ts` | Fixed/variable tables, nested ODO, controllers and bounds | Literal sizes and physical positions |
| `cobol.layout.right.symbolic.spec.ts` | Right offsets and unequal symbolic overlay gaps | Algebraic suffix expectations |
| `cobol.layout.location.spec.ts` | Selected declarations and indexed occurrence locations | Literal bit offsets and lengths |
| `cobol.layout.composable.spec.ts`, `symbolic.layout.composition.spec.ts` | Independent declaration/repetition/placement strategies and tree composition | Architectural invariants |
| `cobol.layout.integration.campaign.spec.ts` | Deliberate combinations of ODO, overlays, alignment and indexed positions | Independent constructed expectations |
| `cobol.picture.spec.ts` | PICTURE grammar, repetitions, categories and configured currency symbols | Token/category expectations |
| `cobol.primitive.size.spec.ts` | DISPLAY, binary, packed, edited, national, DBCS, UTF-8 and sign storage | IBM-oriented known widths |
| `cobol.layout.ibm-options.spec.ts` | Actual copybook-to-layout path with configured currency and `BYTE-LENGTH`; dynamic storage rejection | Literal bit offsets and contract checks |
| `cobol.layout.published.spec.ts` | Published IBM examples and AWS `REC-OUTFILE` | Declared sizes and hand-derived field coordinates |
| `cobol.layout.aws.emprec.spec.ts` | AWS employee record, address occurrences, overlays, right offsets and published hex slices | Published LRECL/hex plus literal field coordinates |
| `cobol.layout.carddemo.spec.ts` | Original AWS CardDemo copybooks versus documented record lengths | Externally documented LRECL |
| `cobol.layout.carddemo.coordinates.spec.ts` | Named fields, trailing filler and tree consistency in CardDemo sources | Source-derived literal coordinates; additional invariants |
| `cobol.layout.reference-geometry.spec.ts` | Unequal overlays, IBM alignment boundaries, variable tables before overlays, nested ODO coordinates | Adapted IBM rules and constructed literal positions |

The symbolic expression package `@cobol-ts/size` additionally tests canonicalisation, count binding, occurrence-prefix evaluation, `max`, `align` and symbolic `difference`. Those tests guard the algebra used by this package but do not replace physical-coordinate tests.

## Public copybook corpus and provenance

### Published IBM and AWS worked examples

`fixtures/` contains published-example copybooks consumed by `cobol.layout.published.spec.ts`, including:

- `ibm-redefinition-example.cpy`: overlapping declaration origins, internal fields and storage following an overlay.
- `ibm-zos-error-messages.cpy`: consecutive message fields with expected repeated spacing.
- `aws-rec-outfile.cpy`: numeric-edited DISPLAY, binary, packed decimal, fixed `OCCURS` and `REDEFINES`, with literal field coordinates.

These examples are **transcriptions/adaptations of published declarations**, not unmodified upstream compiler input. Their origins are recorded in `fixtures/SOURCES.md`. Their coordinates are independently calculated from the declarations rather than obtained from this compiler's output.

### AWS employee record

`fixtures/public/aws-emprec01.cpy` and `fixtures/public/aws-emprec01.first-record.hex` support `cobol.layout.aws.emprec.spec.ts`.

The AWS source documents a fixed **FB/150** employee record and publishes EBCDIC record bytes. The tests check group and elementary offsets, indexed addresses, `REDEFINES` origins, right offsets and field slices against literal hex bytes, **without decoding values**. The copybook fixture is transcribed from AWS's published listing; the test must not be described as an unmodified upstream `.cpy` download.

Source: [AWS — Unlock Mainframe Data Files on AWS](https://github.com/aws-samples/unlock-mainframe-data-files-on-aws#input-copybook).

### AWS CardDemo

`fixtures/carddemo/` contains original public `.cpy` files used by `cobol.layout.carddemo.spec.ts` and `cobol.layout.carddemo.coordinates.spec.ts`. The upstream project separately documents their fixed record lengths.

The coordinate suite includes literal field offsets derived from declarations in:

- `CSUSR01Y.cpy` — user fields and final filler;
- `CVACT03Y.cpy` — card/customer/account cross-reference and trailing filler;
- `CVTRA05Y.cpy` — transaction fields, including the signed amount, timestamps and final filler.

For the other selected CardDemo sources, the suite checks the published LRECL and structural consistency but **does not claim independently reviewed field-offset oracles**. `fixtures/CARDDemo-offset-oracles.md` documents the separately reviewed coordinates and their provenance.

Source: [AWS CardDemo copybooks](https://github.com/aws-samples/aws-mainframe-modernization-carddemo/tree/main/app/cpy) and the [project's sample-data record lengths](https://github.com/aws-samples/aws-mainframe-modernization-carddemo#4-upload-sample-data).

Keep the downloaded original sources and `fixtures/carddemo/SOURCE.json` with their recorded upstream revision. The fetch script is intended for initial fixture acquisition or an explicit corpus update—not for ordinary test execution. Review upstream license and attribution requirements when checking fixtures into Git.

### Constructed cross-feature tests

`cobol.layout.reference-geometry.spec.ts` and `cobol.layout.integration.campaign.spec.ts` deliberately combine difficult constructs to stress the symbolic architecture:

- longer and shorter `REDEFINES` alternatives sharing an origin, including right-hand gaps;
- `SYNCHRONIZED` binary fields requiring padding before or within nested groups;
- variable tables followed by further storage or overlays, evaluated at zero, intermediate and maximum counts;
- indexed nested ODO, with occurrence-prefix locations checked separately from total extent;
- left and right offsets, aligned ends and complete containing-group coverage.

These are **constructed tests**, not externally certified COBOL compiler listings. They matter because public examples with independently published coordinates for such combinations are unusually difficult to find.

## Geometry acceptance rules

Where applicable, tests should assert more than the enclosing record size:

- The absolute start and physical length of a **named field** match fixed expected coordinates (expressed in bytes in fixture documentation, compared in bits in the API).
- Every occurrence index lands at its own correct start; nested variable-sized bodies are not assumed to have a constant stride.
- `REDEFINES` alternatives share their proper origin, while subsequent sequential storage starts after the **maximum** alternative extent.
- Alignment padding occupies the correct physical range and belongs to the correct containing group.
- Parent-relative left and right offsets describe a complete child occurrence body, with explicit overlay allowance; they do **not** silently substitute a whole-table extent for a repeated child's body.
- Record-specific ODO resolver values do not leak into shared compiled geometry.
- No byte decoding is required to establish these claims. Published hex fixtures, where present, are used to verify **slices at known positions**, not to test type conversion.

Internal identities, such as *left offset + selected size + right offset = containing occurrence extent*, are valuable guards but must not be mistaken for independent layout evidence. Unequal overlays require their alternative-specific gaps to be included in that identity.

## Running the tests

From the existing `layout/` package:

```sh
npm test -- --runInBand
```

Focused runs:

```sh
npm test -- --runInBand cobol.layout.published.spec.ts
npm test -- --runInBand cobol.layout.aws.emprec.spec.ts
npm test -- --runInBand cobol.layout.carddemo.spec.ts
npm test -- --runInBand cobol.layout.carddemo.coordinates.spec.ts
npm test -- --runInBand cobol.layout.reference-geometry.spec.ts
npm test -- --runInBand cobol.layout.integration.campaign.spec.ts
npm test -- --runInBand cobol.primitive.size.spec.ts
npm test -- --runInBand cobol.picture.spec.ts
```

If the CardDemo fixtures are missing, populate them explicitly from `layout/`:

```sh
node scripts/fetch-carddemo-copybooks.mjs
```

An `ENOENT` from `fixtures/carddemo/` means the test data is absent; it is **not** a failed layout assertion. Once populated, keep fixtures pinned and run ordinary tests offline. Run the project's normal TypeScript checking in addition to Jest.

## Maintaining trust in the tests

- Treat public copybooks as source artifacts. Do not edit them to make the parser accept them; keep necessary transformations separately documented.
- Keep external oracles as **literal expectations**. Never derive the expected offset or record length from `compileCobolLayout`, `locateCobolEntry` or the same evaluator being tested.
- Record the upstream URL, revision, record format, relevant compiler options and provenance of each expected value.
- If a legal upstream declaration fails, preserve the failing integration case while fixing the parser, primitive sizer or layout. Do not bypass it with a test-specific primitive sizer.
- Test useful **combinations**, not just individual language features: errors can cancel when only the final record length is checked.
- When a source is adapted from IBM documentation, label it **adapted**. When a field position is hand-derived, label it **source-derived**. Reserve **compiler-verified** for an actual independent compiler-produced oracle.
- Do not use a passing suite to claim exhaustive IBM compiler conformance or independent certification of every physical offset.

## Remaining confidence gaps

Our strongest evidence still lies in fixed-layout public records and hand-checked fields. In particular, externally produced IBM storage maps would materially improve confidence for `SYNCHRONIZED` within repeated bodies, nested ODO, variable storage preceding aligned fields, and overlays whose alternatives have distinct symbolic extents. Tests for those interactions already exist internally; what remains missing is **independent compiler-produced coordinate evidence**.

Until client copybooks arrive, continue enriching the public corpus with verifiable record layouts. The objective is high confidence in **physical geometry** before investing in byte decoding—not a larger test count for its own sake.
