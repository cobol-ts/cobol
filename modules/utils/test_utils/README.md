# @cobol-ts/test_utils

## Purpose

Capture console messages while exercising a synchronous or asynchronous callback in tests. The API returns both the callback's result and the collected messages, avoiding repeated hand-written `console` stubs in individual test suites.

## Exports

`captureConsoleError` and `captureConsoleErrorAsync` return objects with `result` and `errors`. `captureConsoleLog` and `captureConsoleLogAsync` return `result` and `logs`. Each entry of the collected arrays contains the arguments passed to the corresponding console method.

## Example

```ts
import {captureConsoleLog} from '@cobol-ts/test_utils';
const {result, logs} = captureConsoleLog(() => {
  console.log('processed', 3);
  return 3;
});
// result === 3; logs[0] contains ['processed', 3]
```

Console interception is process-global during the callback. Avoid overlapping captures in parallel tests and check the implementation's restoration semantics before using it in error-path assertions. Source: [`src/capture.error.log.ts`](src/capture.error.log.ts).
