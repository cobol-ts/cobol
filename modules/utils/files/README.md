# `@cobol-ts/files`

Small Node.js filesystem utilities. This package is **not** the `@cobol-ts/errors` monad, a COBOL parser, or the streaming byte-backed cursor; its previous README was an accidental copy of the errors package documentation.

## Exported API

```ts
import {findDirectoryUp} from '@cobol-ts/files';

const fixtures = await findDirectoryUp('fixtures');
```

`findDirectoryUp(dirName: string): Promise<string>` searches for a **directory with exactly that name** among the children of the current working directory, then its parent, then successive ancestors. It returns the first matching absolute path. It calls `fs.stat()` and checks `isDirectory()`, so an ordinary file of the same name is not a match.

When the filesystem root is reached without a match, it rejects with `Directory "<name>" not found`. The implementation currently ignores errors from the individual `stat()` attempts, not only `ENOENT`, so permissions and other filesystem errors can present as "not found". It uses `process.cwd()` and Node's `node:fs/promises` and `node:path`; it is not browser-compatible.

This utility does **not** search recursively through arbitrary descendants, accept an absolute search root, create directories or load files. It is unrelated to the cursor's `fillFileBuffer` abstraction.

## Source

- `src/files.ts`: `findDirectoryUp()` implementation.
- `index.ts`: package entrypoint, re-exporting the utility.
