# Callback benchmark operation counters

## Running

`yarn benchmark:callback --scenario array --sample --metrics`

The optional `--metrics` flag works with `baseline`, `array`, and `redefines`, and with `--limit` and `--warmup`. The benchmark uses the **same** reader and checksum verification as before; the flag adds a single `MemoryMetrics` instance to the source-scoped options and prints its counters after the benchmark result. Warm-up is verified first, then the counters are reset before the measured pass. Rows are never logged. Without `--metrics` the original output and scan path are retained.

## Interpreting counters

Counters are centrally named in `@cobol-ts/metrics`, using stable literal strings. Representative families: `file.scan.*`, `record.*`, `projection.*`, `array.*`, `cobol.field_range.*`, `cobol.odo.*` and `cobol.decoder.*`. Names ending in `.create`/`.allocate` refer to explicit allocation branches, `*.bind` to a performed binding, and `*.reuse`/`*.already_bound` to distinct cache outcomes. `*.clear_visit` and `*.clean_*_visit` count items actually traversed; they do **not** simply count outer cleanup calls. A decoder `*.compile` is expected during reader setup, whereas `*.invoke` is expected during record access.

Use 100, 1,000, 10,000 and 100,000-record runs to compare scaling. For a two-element fixed OCCURS array accessed once per record, the expected steady-state counters are two selections and two element binds per record, with two retained child views overall. Actual counts vary with the scenario and the caller's access pattern. Values are named counts, not allocated-byte measurements and not profiling evidence of an individual CPU bottleneck.

## Validation notes

This instrumentation changes no record decoders, layouts, array selectors, pool ownership or checksum rules. It adds calls at existing operation boundaries. Counts may themselves reduce throughput; **do not** compare the instrumented records-per-second figure to an uninstrumented baseline. Validation includes the three benchmark scenarios, propagation assertions, projection reuse and ODO cleanup counting. The existing Jest suite should be run in the fully installed monorepo after applying the changes.
