# @cobol-ts/metrics

A deliberately minimal operation-counter interface: `IPutMetrics.put(name)`. Pass one instance down from the file-reader options. The default `NULL_METRICS` does nothing and does not allocate or log in the hot path. `MemoryMetrics` increments named counts in a Map; use `get`, `snapshot`, and `reset` outside hot paths. Names are static constants in `METRIC`.

Counters report **actual operations**, not elapsed time. The `*.visit` counters count loop iterations (and can therefore expose non-linear cleanup). A counter value is not itself evidence of heap allocation: allocation counters are placed only on explicit construction branches. Reset after warm-up to isolate the measured run. Metrics distort throughput and should be disabled when comparing timing.

## Interpretation with shared-binding arrays

Counter names reflect the chosen execution path. For an eligible native fixed array, `array.proxy.index`, `array.element.select`, and `array.child.bind` may correctly remain zero while the application reads every occurrence. The common root projection is still bound, and scalar decoder invocations continue to count actual requested reads. For a lazy Proxy array, the corresponding selection and child-cache counters remain meaningful. Compare metrics only for equivalent execution strategies and do not equate counter reductions with speedups.
