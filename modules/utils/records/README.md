# @cobol-ts/records

## Purpose

Helpers for generic JavaScript record/object data, distinct from the **physical byte records** managed by [`@cobol-ts/cursor-record`](../../cursor-loader/cursor-record/README.md). This package includes property-path traversal, mapping, key/value types, object inversion and deep-combination utilities.

## Public API and responsibilities

- `NameAnd<T>` and `Env` describe string-keyed maps. `invertObject` reverses name/value associations, with input values permitted to be strings or arrays of strings.
- `mapRecord` maps entries of a record; see [`src/map.record.ts`](src/map.record.ts) for the callback contract and return type.
- `pathToValue` follows a dotted path through an existing object, while `getAllConfigPaths` enumerates nested configuration paths. They are general object utilities, not COBOL field-position compilers.
- `deepCombineObjects` and `deepCombineTwoObject` merge object structures. The latter accepts `DeepCombineOptions`; consult [`src/combine.ts`](src/combine.ts) before depending on array replacement or conflict behaviour.

## Usage and boundaries

Use these helpers when transforming configuration or ordinary object graphs. They neither acquire physical records nor establish borrowed projection lifetimes. The public entry points are re-exported from [`index.ts`](index.ts), which points to `combine`, `path`, `record.utils` and `map.record`.
