# @cobol-ts/async

## Purpose and model

This package models the state of an asynchronous value as a discriminated union of three object shapes: `DataAS<T>` containing `data`, `LoadingAS` containing `loading: true`, and `ErrorAS` containing an array of error strings. `AsyncState<T>` is their union. This is a state-description utility rather than a Promise scheduler or asynchronous file reader.

## Public API

`isDataAs`, `isLoadingAs` and `isErrorAs` narrow the union by inspecting the corresponding property. `dataOrThrow(state, message)` returns the data or throws if the state is loading or erroneous; `errorsOrThrowAs(state)` returns the errors or throws if data is available or still loading.

`isDataAs` tests whether `data !== undefined`; consequently a data state whose payload is explicitly `undefined` will not be recognised as data. Construct states with that constraint in mind.

## Example

```ts
import { AsyncState, isDataAs, dataOrThrow } from '@cobol-ts/async';
const state: AsyncState<number> = {data: 42};
if (isDataAs(state)) console.log(state.data);
const answer = dataOrThrow(state, 'Unable to obtain result');
```

## Boundaries and tests

The functions do not start, cancel or await work. They interpret a state already produced elsewhere. See [`src/async.ts`](src/async.ts) for the exact error messages and [`src`](src) for tests. Run `yarn test` in this package if its Jest script is configured.
