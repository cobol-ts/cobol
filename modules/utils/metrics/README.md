# @cobol-ts/metrics

A deliberately minimal operation-counter interface: `IPutMetrics.put(name)`. Pass one instance down from the file-reader options. The default `NULL_METRICS` does nothing and does not allocate or log in the hot path. `MemoryMetrics` increments named counts in a Map; use `get`, `snapshot`, and `reset` outside hot paths. Names are static constants in `METRIC`.

Counters report **actual operations**, not elapsed time. The `*.visit` counters count loop iterations (and can therefore expose non-linear cleanup). A counter value is not itself evidence of heap allocation: allocation counters are placed only on explicit construction branches. Reset after warm-up to isolate the measured run. Metrics distort throughput and should be disabled when comparing timing.
