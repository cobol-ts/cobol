# @cobol-ts/debug

## Purpose

This module supplies a named debug logger controlled by a shared map of enabled names. Its purpose is conditional diagnostics at call sites, not structured metrics or error propagation. The separate [metrics module](../metrics/README.md) counts predefined operations without formatting debug messages.

## Public abstractions

`DebugState` is a `NameAnd<boolean>` map from `@cobol-ts/records`. `makeDebugLog(debugState, name)` constructs a `DebugLog` function for that name. `DebugLog` also exposes additional functions; consult [`src/debug.ts`](src/debug.ts) for their signatures and severity behaviour. `createMockDebugLog()` is a test-friendly implementation provided by [`src/debug.mock.ts`](src/debug.mock.ts).

Loggers capture their name, and check the debug state when the logger is created; changing the map later does not retroactively enable an already-created logger. Use a single state map when diagnostics across components need coordinated control. Do not rely on debug output for production correctness, counters or deterministic benchmark measurement.

## Related modules

The shared record-map type is in [records](../records/README.md), while [test_utils](../test_utils/README.md) can capture console output in tests.
