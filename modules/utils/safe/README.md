# @cobol-ts/safe

## Purpose

Two small normalisation helpers for optional array and object inputs. `safeArray(value)` wraps a non-array value in an array, leaves an array as an array and returns an empty array for `undefined`. `safeObject(value)` returns the supplied object or an empty object when undefined.

## Example

```ts
import {safeArray, safeObject} from '@cobol-ts/safe';
const names = safeArray('A'); // ['A']
const none = safeArray<string>(undefined); // []
const options = safeObject<{enabled: boolean}>(undefined); // {}
```

These are shape normalisers, not runtime validators. In particular, `safeObject` does not inspect the supplied object, and neither helper performs a deep copy. They are best used at the boundary of optional configuration rather than as substitutes for [validator](../validator/README.md). Source: [`src/safe.ts`](src/safe.ts).
