# `@cobol-ts/size`

Symbolic COBOL **storage extent expressions in bits**. Layout compilation builds and canonicalises these expressions once; a record-aware caller evaluates them later using ODO controller values and enclosing occurrence indices. This package does **not** read bytes, locate fields within physical buffers, choose REDEFINES interpretations, or own cursor lifetimes.

## Expression types

`StorageSizeExpression` includes:

| Kind | Meaning |
| --- | --- |
| `number` | Constant non-negative bit count |
| `sum` | Sum of adjacent extents |
| `max` | Allocated size of overlay alternatives |
| `occurs` | Repeat body a fixed number of times |
| `depending-on` | Sum body extents across an ODO count supplied by a resolver |
| `align` | Padding to the next requested bit boundary |
| `difference` | Non-negative distance between two extents |

`canonicaliseStorageSize(expression)` folds constants and simplifies compatible algebra **without** consulting a physical record. It does not make an inherently variable-length occurrence constant.

`evaluateStorageSize(expression, resolve, enclosingIndices?)` evaluates an expression for a particular record/count environment. `resolve` is a `ResolvePath`: a callback receiving a concrete logical controller path and returning its value. The evaluator validates the counts and extent arithmetic; the caller determines how to obtain controller values.

## Controller paths and occurrence context

An expression `DependsOnPath` may contain field-name strings and numeric **relative enclosing-occurrence depths**. Numeric elements in the symbolic path are *not* literal application array indices. When evaluating an occurrence body, the evaluator binds its currently selected occurrence and any enclosing indices to produce a concrete controller lookup path. `resolveDependingOnCount(path, resolve, enclosingIndices?)` exposes that binding/validation step.

For example, `locateCobolEntry()` or the COBOL projection adapter can supply the enclosing indices when evaluating nested ODO extents. The expression engine permits record-dependent body widths, but the current `cursor-loader-cobol` **byte controller locator** only supports controllers at fixed physical locations. Do not infer full occurrence-local-controller support from the algebra alone.

## Example

```ts
import {canonicaliseStorageSize, evaluateStorageSize} from '@cobol-ts/size';

const expression = canonicaliseStorageSize({
    kind:'sum',
    terms:[8,{kind:'occurs',count:3,expression:16}]
});

const bits = evaluateStorageSize(expression, () => {
    throw new Error('No controller expected for this constant expression');
});
// bits === 56
```

## Source and tests

- `src/size.expression.grammer.ts`: expression types and path conventions (filename spelling is intentional for the current source).
- `src/storage.size.expression.canonicalise.ts`: normalisation rules.
- `src/storage.size.expression.evaluate.ts`: record-aware evaluation and count binding.
- `*.spec.ts`: canonicalisation, nested indices, bounds, arithmetic, alignment and invalid expressions.

The evaluator currently makes temporary working arrays/functions on some symbolic evaluations. It is not guaranteed allocation-free; higher layers cache occurrence positions so repeated navigation need not re-evaluate already discovered extents. Run Jest and TypeScript checks in the workspace.
