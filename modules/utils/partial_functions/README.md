# @cobol-ts/partial_functions

## Purpose

A small, explicit chain-of-responsibility abstraction. Each `PartialFunction<From, To>` consists of `isDefinedAt(input)` and `apply(input)`. `chainOfResponsibility(defaultFn, ...fns)` produces a total function that evaluates candidates in order and uses the first applicable function, falling back to `defaultFn`.

## Example

```ts
import {chainOfResponsibility} from '@cobol-ts/partial_functions';
const classify = chainOfResponsibility(
  (_: number) => 'other',
  {isDefinedAt: (n: number) => n < 0, apply: () => 'negative'},
  {isDefinedAt: (n: number) => n === 0, apply: () => 'zero'}
);
classify(-3); // 'negative'
```

Predicates and handlers are synchronous. The order is significant, and the first match stops evaluation; overlapping conditions should therefore be placed deliberately. No handlers are cached or inspected at construction beyond being captured in the returned closure. Implementation: [`src/partial.functions.ts`](src/partial.functions.ts).
