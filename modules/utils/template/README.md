# @cobol-ts/template

## Purpose

This module expands variables in text using a configurable delimiter syntax and an object dictionary. It supports alternative variable definitions and value-transforming functions, rather than compiling or executing arbitrary TypeScript templates.

## Public API

`dereference(context, dictionary, text, options)` expands references. Import `dollarsBracesVarDefn`, `mustachesVariableDefn`, `colonPrefixedVarDefn`, `fulltextVariableDefn` or `doubleXmlVariableDefn` from this package to choose a reference syntax. The `variableDefn` option is important: without one, the implementation returns the input text unchanged. `replaceVar` and `processVariable` expose lower-level replacement handling, and `stringFunctions` offers functions for transforming extracted values.

## Example

```ts
import {dereference, dollarsBracesVarDefn} from '@cobol-ts/template';
const result = dereference('example', {customer: {name: 'Ada'}},
  'Hello ${customer.name}', {variableDefn: dollarsBracesVarDefn});
```

## Behaviour and responsibilities

The options include undefined-value handling, error-throwing behaviour and custom template functions. The lookup routines in [`src/dot.language.ts`](src/dot.language.ts) traverse dictionary paths, while [`src/variables.ts`](src/variables.ts) handles substitution and error context. Function syntax and supported built-ins live in [`src/stringFunctions.ts`](src/stringFunctions.ts). This is string substitution, not an escaping or security boundary: apply context-appropriate escaping before inserting output into HTML, shell commands or SQL.
