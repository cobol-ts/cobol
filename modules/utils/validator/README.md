# @cobol-ts/validate

## Purpose

Composable runtime validation for values and object shapes. Unlike TypeScript's compile-time types, these validators check supplied data and return results that callers can compose with other validation steps. The implementation uses the [errors](../errors/README.md) package's result model.

## API

`Validator<T, Source>` and `ValidationOptions<Source>` define the validation contract. The package includes `mustBeString`, `mustBeNumber`, `mustBeBoolean`, optional variants, `mustBeValue`, `mustBeArrayOf`, `mustBeObjectWithFields` and `mustBeNameAnd`. Higher-order composition includes `combineValidators`, `composeOr` and `composeTypedOr`. The map/flatMap helpers in `src/validator.map.flatmap.ts` provide eager and lazy forms for dependent validation sequences.

## Design guidance

Use explicit validators for untrusted configurations and format metadata before handing them to the parser or layout compiler. Combinators that collect multiple errors should be distinguished from operations that stop on the first dependent failure. The exported functions are defined in [`src/validator.ts`](src/validator.ts) and [`src/validator.map.flatmap.ts`](src/validator.map.flatmap.ts), with tests describing concrete return values and error messages.
