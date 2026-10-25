# COBOL cursor benchmark

`@cobol-ts/cursor-loader-benchmark` is a **TypeScript package** following the
same package conventions as the other `@cobol-ts` modules:
`index.ts`, `src/*.ts`, colocated `*.spec.ts`, `package.details.json`,
`tsconfig.json`, `jest.config.json` and the usual linked package dependencies.

It benchmarks **the real** `@cobol-ts/cursor-loader-cobol/node` `readCobolFile()`
reader with a compiled six-field projection. It does **not** parse the file by
manually reading Buffer offsets.

## Fixture

The bundled COBOL copybook describes one 200-byte fixed-length record. The
ASCII DISPLAY fixture has exactly ten distinct records, repeated in order.
Both this benchmark and JRecord decode six fields per record, add `AMOUNT-A`
and `AMOUNT-B`, and evaluate two rules:

- `STATUS-CODE == A && REGION-CODE == N`
- `CATEGORY-CODE == P && APPROVED-FLAG == Y`

The checksum validation asserts all six totals. The bundled
`data/sample-100k.dat` contains the *same bytes* as the JRecord sample.

## Workspace setup

Keep this package as a sibling of `cursor-loader-cobol`, `cursor-file`,
`layout`, and the other packages. Let the existing workspace tooling process
`package.details.json` and link the `@cobol-ts` dependencies. In particular,
this module needs the workspace's `@cobol-ts/codec` package, just as
`cursor-loader-cobol` does. The uploaded archive does not include that module,
so the full reader run must be validated in your complete workspace.

No Python, standalone JavaScript scripts, bespoke build steps, or alternate
project structure are involved. Commands run the TypeScript sources with
`ts-node`, without first compiling this package or its Node adapters.
The benchmark scripts use `ts-node --prefer-ts-exts` so the existing
Node-specific TypeScript entry points are preferred over JavaScript shims
that expect prebuilt `dist` files. Other workspace imports retain their
normal package resolution.

## Commands

From this package's directory:

```bash
yarn test
yarn generate
yarn benchmark:sample
yarn benchmark
```

All commands run the TypeScript entry points directly. No `tsc` or
`build:node` command is required for this benchmark. Use the normal Yarn
workspace installation, as for any other package. `yarn generate` writes 100 million records (20,000,000,000 bytes)
under `data/benchmark.dat`. Generation refuses to overwrite an existing file
unless `--force` is supplied. The sample is bundled so you can run a smaller
benchmark without generating the large file.

You can reuse the 20 GB JRecord file directly, with **no copying**:

```bash
yarn benchmark --data C:/git/cobol-jrecord-benchmark/data/benchmark.dat
```

Other options:

```bash
yarn generate --records 1000000 --output data/million.dat
npm run verify -- data/benchmark.dat 100000000
npm run benchmark -- --data data/million.dat --limit 1000000
npm run benchmark -- --warmup 100000 --buffer-size 65536
npm run benchmark -- --decode-options '{"encoding":"ascii"}'
```

The decoder option is merely an **example**; use the actual fields supported
by your workspace's `CobolDecodeOptions` type. Its implementation was not in
the provided archive, so ASCII decoding cannot be independently confirmed here.
Incorrect decoding fails the benchmark's totals rather than producing a
misleading throughput figure.

## Measurement

The runner scans 100,000 records as warm-up, closes the source, then reopens
and scans the whole file starting at record zero. Only the second pass is
timed, including opening the source. Results report elapsed time, total
records, records/second, MiB/second and validated arithmetic totals.

Expected JRecord totals for 100 million records:

| Counter | Value |
|---|---:|
| `records` | 100,000,000 |
| `totalSum` | 18,610,500,000,000 |
| `activeNorthCount` | 20,000,000 |
| `activeNorthSum` | 4,015,900,000,000 |
| `approvedPremiumCount` | 30,000,000 |
| `approvedPremiumSum` | 5,509,700,000,000 |

Baseline: JRecord measured 41.560165 seconds (2,406,150 records/s,
458.94 MiB/s) on the same fixture. Compare execution conditions and repeat
runs to account for OS cache and disk load.

The Jest specs verify the data generator, checksum calculations, exact
sample bytes, projection shape, lease closing on normal and exceptional
paths, and independent opening of the two passes. These tests do **not**
claim to replace an end-to-end run using `@cobol-ts/codec`.

## Synchronous callback experiment

The existing `readCobolFile()` async iterator and its benchmark remain intact.
The new `scanCobolFile(options, onRecord)` path processes records through a
**synchronous callback**, with the only asynchronous operations inside the
scan being actual file-buffer refills and setup/cleanup. The caller `await`s
one Promise for the complete scan; the callback must not be `async` and cannot
retain the borrowed row beyond its invocation.

Run the same 100,000-record warm-up and full 20 GB measured pass using:

```bash
yarn benchmark:callback --data C:/git/cobol-jrecord-benchmark/data/benchmark.dat
```

For the bundled 100,000-record fixture:

```bash
yarn benchmark:callback:sample
```

Compare against `yarn benchmark --data ...` using identical data and totals.
The benchmark uses ASCII DISPLAY decoding by default, matching JRecord's file.

## Benchmark scenarios

The default `baseline` benchmark is unchanged. The additional `array` and
`redefines` scenarios use the **same 200-byte file**, ten patterns, checksum
expectations, two predicates, and warm-up/measured-pass procedure. They use
`copybooks/benchmark-complex.cbl`, where the adjacent nine-digit amounts are
both two OCCURS elements and two REDEFINES overlay fields.

```bash
yarn benchmark:callback --scenario baseline --data C:/git/cobol-jrecord-benchmark/data/benchmark.dat
yarn benchmark:callback --scenario array --data C:/git/cobol-jrecord-benchmark/data/benchmark.dat
yarn benchmark:callback --scenario redefines --data C:/git/cobol-jrecord-benchmark/data/benchmark.dat
```

`array` reads both numbers via `amounts[0].value()` and `amounts[1].value()`;
`redefines` reads the two overlay getters. The original six-field projection
is preserved for the baseline. This measures **fixed OCCURS**, not ODO; ODO
should be a distinct future scenario with independently generated data.

For comparing to Java, use the same `--scenario` on JRecord once its Java
benchmark has been updated. The Java benchmark has *not* been changed by this
TypeScript patch.
