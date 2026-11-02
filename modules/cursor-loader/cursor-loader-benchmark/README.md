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

## Opt-in operation counts

Add `--metrics` to the existing callback CLI, for example `yarn benchmark:callback --scenario array --sample --metrics`. The benchmark opens a reader for warm-up, resets the shared `MemoryMetrics` after verification, reopens the file for the measured pass, and prints the measured counters alphabetically after the existing checksum and throughput results. No counters or new output appear without the flag. Counts are diagnostic, not suitable for throughput comparisons while instrumentation is enabled; see [README.metrics.md](README.metrics.md).

### Shared-binding fixed arrays (default)

Small (up to eight elements) fixed-position COBOL OCCURS arrays with scalar-only
child projections use native, frozen JavaScript arrays of reusable byte-backed
views by default. One record binding is shared by every child; there is **no
copy of the COBOL bytes** and scalar decoding remains on demand. Views are
invalid after their record lease closes. This selection is internal and
requires no CLI flag.

Symbolic/ODO arrays, larger fixed arrays, and arrays containing nested objects
or arrays continue through the existing lazy Proxy-backed implementation. This
bounded policy deliberately avoids eagerly constructing large or nested view
graphs. The fixed geometry is chosen from the compiled COBOL path, not just a
source-level `OCCURS n` declaration. For diagnostics, `--metrics` shows no
`array.proxy.index` or `array.child.bind` events for the eligible fixed path.

## ODO count benchmark (fixed-capacity frame)

The `odo` scenario measures `OCCURS DEPENDING ON` selection separately from
fixed OCCURS. It uses the real COBOL copybook compiler, byte-backed projection
and callback/async readers; no benchmark-specific byte offsets are used in the
measured reader. Its own copybook is `copybooks/benchmark-odo.cbl`.

The physical frame is **always 200 bytes**. The first byte is an ASCII DISPLAY
count from 0 to 8, followed by four status/region/category/approval characters,
then eight nine-digit *capacity* slots and 123 padding bytes. Only the first
`ITEM-COUNT` slots are active according to ODO semantics. Padding and inactive
slots are not accessed by the benchmark. This first scenario does **not** test
physical variable-record framing or offsets of fields after the variable array.
Those are separate future scenarios.

The deterministic nine-record cycle covers every count from 0 to 8. It repeats
for any requested file size; expected sums are calculated from the generation
formula in `benchmark.odo.fixture.ts` independently of the compiled COBOL
layout. The workload reads the active length and at most the first two item
values per record, along with four scalar flags. This is a **variable-work**
benchmark: records with zero active items perform fewer scalar decodes than
records with two or more items. Compare records/sec together with counters
for decoder invocations and element selections.

Generate the bundled 100,000-record sample, or a larger reproducible file:

```bash
yarn generate:odo:sample
yarn generate --scenario odo --records 5000000 --chunk-records 45000 --output data/odo-5m.dat
yarn generate --scenario odo --records 100000000 --chunk-records 45000 --output data/odo.dat
```

The generator refuses to overwrite an existing file unless `--force` is
specified. A compressed patch may also ship `data/odo-sample-100k.dat` so the
sample need not be regenerated. The default ODO generator chunk size must be
set to a multiple of nine; the examples above use 45,000 records per chunk.

Run the existing benchmark paths with the ODO scenario:

```bash
yarn benchmark:callback --scenario odo --sample --metrics
yarn benchmark:callback --scenario odo --data data/odo-5m.dat --limit 5000000 --warmup 500000 --runs 5
yarn benchmark --scenario odo --sample
```

The `--scenario odo --sample` command selects the ODO sample, independent of
the argument order. `--scenario odo` without `--data` selects `data/odo.dat`.
Warm-up and each measured pass verify ODO-specific counters. Instrumentation
is for diagnosis, not throughput comparison; run five-pass performance tests
without `--metrics`. This scenario does not use the previous fixed-array
JRecord checksum oracle.
