# @cobol-ts/time

## Purpose

A minimal abstraction over the current wall-clock timestamp plus an asynchronous delay helper. `TimeService` is a zero-argument function returning milliseconds, allowing code that needs the current time to accept a substitutable function rather than hard-code `Date.now()` calls.

## API

`dateTimeService` returns `new Date().getTime()`; `useTime()` provides a `TimeService` instance. `delay(ms)` returns a Promise resolved after the specified timeout.

```ts
import {dateTimeService, delay} from '@cobol-ts/time';
const startedAt = dateTimeService();
await delay(10);
const elapsedMs = dateTimeService() - startedAt;
```

Wall-clock time is not a monotonic performance timer. For benchmarking, use the measurement facilities in [cursor-loader-benchmark](../../cursor-loader/cursor-loader-benchmark/README.md). Implementation: [`src/time.service.ts`](src/time.service.ts).
