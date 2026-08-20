# Error-Or Monad Utility

A lightweight TypeScript utility that provides an **ErrorsOr<T>** data type and helper functions for managing operations that can succeed with a value or fail with one or more errors.

Whether you’re familiar with functional “monad” patterns or new to them, this library offers:

* **Encapsulation** of successful values and error lists in a single type
* **Type-safe** unwrapping via `valueOrThrow` and `errorsOrThrow`
* **Defaulting** with `valueOrDefault` to avoid boilerplate checks
* **Mapping** and **flatMapping** (both sync and async) over values while preserving errors
* **Recovery** with fallback logic through `recover`
* **Partitioning** a record of named results into collected values and errors

---

## Installation

```bash
npm install @cobol-ts/errors-monad
# or
yarn add @cobol-ts/errors-monad
```

---

## Principle Types

These core types model either a successful result or a collection of errors:

```ts
/**
 * Represents either a successful value of type T or a set of errors.
 * @template T - The type of the successful value.
 */
export type ErrorsOr<T> = Errors | Value<T>;

/**
 * Wraps a successful value.
 * @template T - The type of the wrapped value.
 */
export type Value<T> = { value: T };

/**
 * Represents one or more error messages, with optional debugging metadata.
 */
export type Errors = {
  /** The list of error messages. */
  errors: string[];
  /** Optional reference identifier for debugging. */
  reference?: string;
  /** Optional extra context or metadata. */
  extras?: any;
};
```

---

## Working with `mapErrorsOr` & `flatMapErrorsOr`

These helpers let you compose operations on the successful value while automatically propagating errors:

```ts
import {
  createValue,
  createErrors,
  mapErrorsOr,
  flatMapErrorsOr
} from '@cobol-ts/errors-monad';

// A synchronous 'square root' that errors on negative input
const safeSqrt = (n: number) =>
  n < 0
    ? createErrors([`Cannot sqrt negative number: ${n}`])
    : createValue(Math.sqrt(n));

// 1) Start with a positive
const start = createValue(16);

// 2) Apply sqrt
const afterSqrt = flatMapErrorsOr(start, safeSqrt);
// -> { value: 4 }

// 3) Then add 3
const final = mapErrorsOr(afterSqrt, (x) => x + 3);
// -> { value: 7 }

// If any step errored, the errors would bubble through unchanged
```

---

## Creating Errors

```ts
import { makeErrorFromException } from '@cobol-ts/errors-monad';

const err = makeErrorFromException('parseJson', new Error('invalid'));
// -> { errors: ['parseJson error invalid'] }
```

---

## Extracting Values & Errors

* `valueOrThrow(e: ErrorsOr<T>): T` — returns the value or throws an `ErrorsException`
* `errorsOrThrow(e: ErrorsOr<T>): string[]` — returns the errors array or throws if a value is present
* `valueOrDefault(e: ErrorsOr<T>, defaultVal: T): T` — returns the value or a default on errors/nullish

---

## Mapping Helpers

* `mapErrorsOr(e, fn)` — applies `fn` to the value, preserves errors
* `flatMapErrorsOr(e, fn)` — applies `fn` that returns `ErrorsOr<U>`, flattens
* `mapErrorsOrK(e, asyncFn)` — async version of `mapErrorsOr`
* `flatMapErrorsOrK(e, asyncFn)` — async version of `flatMapErrorsOr`

---

## Recovery & Partitioning

* `recover(e, fallbackFn)` — returns the value or a fallback based on errors
* `partitionNameAndErrorsOr(records)` — splits a `Record<string, ErrorsOr<T>>` into `{ values, errors }`

---

## Further Reading

See the JSDoc comments in [error.monad.ts](./src/error.monad.ts) for detailed API documentation.
