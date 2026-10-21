# Public-source COBOL layout acceptance corpus

These are **integration tests inside `@cobol-ts/layout`**, not a new npm package. No source code under `@cobol-ts/layout` is replaced. Keep the existing campaign and published-copybook tests.

## Acceptance evidence

### AWS Employee Record (`aws-emprec01.cpy`)

Source: https://github.com/aws-samples/unlock-mainframe-data-files-on-aws#input-copybook

- The checked-in copybook is a transcription of the complete published **EMPREC01** listing in the AWS README (not claimed to be a byte-for-byte download of the upstream `.cpy`).
- The same README specifies **FB/150** and publishes an EBCDIC hex dump, giving independent physical record evidence.
- `src/cobol.layout.aws.emprec.spec.ts` compiles this source using the *default* parser and compiler; asserts 150 bytes, 12 named or indexed field coordinates and the three dimensions of the address group, three `OCCURS` indexes, matching `REDEFINES` coordinates, right offsets, and six literal raw-byte signatures from the published hex dump. It does **not decode values**.
- `fixtures/public/aws-emprec01.first-record.hex` preserves just the first 150-byte record from the README's hex dump, for alignment checks.

### AWS CardDemo (eight original `.cpy` files)

Source: https://github.com/aws-samples/aws-mainframe-modernization-carddemo

External independent record lengths from the **Upload Sample Data** table in its project README:

| Copybook | FB LRECL (bytes) |
|---|---:|
| CSUSR01Y | 80 |
| CVACT01Y | 300 |
| CVACT02Y | 150 |
| CVCUS01Y | 500 |
| CVACT03Y | 50 |
| CVTRA06Y | 350 |
| CVTRA05Y | 350 |
| CVTRA02Y | 50 |

The test `src/cobol.layout.carddemo.spec.ts` runs the *original* files through `parseCopybook` and `compileCobolLayout`, then asserts those independently documented lengths. Run the fetch script first; it fetches without rewriting the source, pins the revision, and emits `fixtures/carddemo/SOURCE.json` recording the SHA:

```bash
node scripts/fetch-carddemo-copybooks.mjs
npm test -- --runInBand cobol.layout.carddemo.spec.ts
```

The script uses Node's built-in `fetch`; no extra npm module is required. An explicit 40-hex commit SHA may be passed to the fetch script to reproduce a particular upstream revision. **Do not commit the external files without checking the upstream Apache-2.0 licensing and attribution requirements.**

**Status:** The employee copybook was tested with the supplied production parser, layout compiler, locator and symbolic evaluator in an isolated harness (using substitutes only for missing generic utility packages): the **150-byte size, 12 named or indexed positions, grouped OCCURS geometry, six source-hex field signatures, and direct-child right offsets passed** (16 test cases in a Jest-like isolated harness). The eight original CardDemo copybooks could not be downloaded or compiled in this environment, so they are **unverified** and these tests are expected to expose new compatibility gaps. Do not mark them green without running the real tests against downloaded upstream files.

## Evidence tiers

1. **Independent compiler/record facts:** FB LRECL documented externally; source record hex at known offsets (strongest present evidence).
2. **Hand-derived physical coordinates:** fixed expectations interpreted from published declarations, especially nested OCCURS and REDEFINES. Useful but less independent than compiler listings.
3. **Self-consistency:** `left + size + right == enclosing extent`. A useful invariant, but **not** independent physical proof.

To reach a more authoritative IBM-specific threshold for complex `SYNCHRONIZED` and ODO, seek real IBM compiler listings showing storage maps or compile/run `LENGTH OF` and address differences under explicit `TRUNC`, `ARITH` and other compiler options. These tests do not yet provide such external oracle coverage.

## Directory placement

Extract this archive's contents into the existing `layout/` folder, preserving directories. Keep `layout/fixtures/` as a sibling of `layout/src/`.

```
layout/
  src/
    cobol.layout.aws.emprec.spec.ts
    cobol.layout.carddemo.spec.ts
  fixtures/
    public/aws-emprec01.cpy
    public/aws-emprec01.first-record.hex
    carddemo/        <-- filled by script
  scripts/
    fetch-carddemo-copybooks.mjs
  README-public-corpus.md
```

**Do not change expected offsets to match implementation output.** On a failure, compare with source-defined and externally documented storage rules, then fix the parser, sizer or geometry. Preserve a failing test when a legal declaration is unsupported.
