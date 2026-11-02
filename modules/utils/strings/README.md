# @cobol-ts/string_utils

## Purpose

Utilities for names, identifiers, path-like strings, and short display text. This is an ordinary string manipulation package rather than a COBOL byte decoder or character-set converter.

## Functions

`camelCaseToWords`, `camelCase` and `capitalizeFirstLetter` convert naming styles. `ellipsesInMiddle` truncates display text. `nameWithOptions` and `parseAttributeValue` interpret structured name/value fragments. `firstSegment`, `lastSegment` and `allButLastSegment` operate on delimited path-like strings; their optional marker parameters influence splitting. `toGitStoragePath` and `safeId` derive storage-safe names according to the code's specific rules.

## Contract considerations

These helpers normalise strings according to application conventions. They do not guarantee filesystem-safe or collision-free identifiers on every host. Inspect [`src/strings.utilities.ts`](src/strings.utilities.ts) when choosing separators, escaping rules or `SafeIdOptions`; the exact transformations matter when strings become stable keys. All public exports are available through [`index.ts`](index.ts).
