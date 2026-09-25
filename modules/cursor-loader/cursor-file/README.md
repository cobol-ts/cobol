# @cobol-ts/cursor-file

Efficient pooled byte I/O for the `@cobol-ts` cursor stack.

This package is the lowest physical I/O layer. It reads files into reusable `Uint8Array` buffers.

It knows nothing about records, lines, CSV, JSON, fixed-width layouts, parsers, or application values.

## Position in the cursor stack

```text
physical file
    ↓
@cobol-ts/cursor-file
    ↓
pooled Uint8Array buffers
    ↓
@cobol-ts/cursor-record
    ↓
physical records
```

## Responsibilities

`@cobol-ts/cursor-file` is responsible for:

- opening physical files;
- reading file bytes;
- pooling physical read buffers;
- handling short operating-system reads;
- transferring ownership of yielded buffers to the consumer;
- closing files correctly when iteration completes or is stopped early.

It is deliberately not responsible for finding physical record boundaries.

## Public API

The main API is:

```ts
FILE_BUFFER_SIZE

FileByteCursor

createFileBufferPool()

createFileByteCursor()
```

## Buffer pool

Create a reusable pool with:

```ts
const pool =
    createFileBufferPool();
```

or specify a physical read-buffer size:

```ts
const pool =
    createFileBufferPool(
        4096
    );
```

The pool grows to the maximum number of buffers required concurrently and then reuses those buffers.

Buffers are not cleared when returned to the pool. A buffer is overwritten by the next file read before its contents are exposed again.

## File byte cursor

Create a file cursor with:

```ts
const cursor =
    createFileByteCursor(
        filename,
        pool
    );
```

The cursor fills each non-final buffer before yielding it.

This remains true even if the underlying operating-system read returns fewer bytes than requested.

At EOF:

- an empty buffer is returned immediately to the pool;
- a final partial buffer is yielded as a zero-copy view over the pooled allocation.

## Buffer ownership

A yielded buffer is owned by the consumer.

Advancing the byte cursor does not invalidate buffers which have already been yielded.

The consumer must eventually return each yielded buffer to the same pool:

```ts
pool.release(
    buffer
);
```

This ownership model is important because a physical record may span several physical file buffers.

For example:

```text
buffer 1:
    abcdefgh

buffer 2:
    ijklmnop

buffer 3:
    qrst\n
```

A record reader must be able to retain all three buffers until the physical record has been consumed.

## Example

```ts
import {
    createFileBufferPool,
    createFileByteCursor
} from "@cobol-ts/cursor-file";


const pool =
    createFileBufferPool();


for await (
    const buffer
    of createFileByteCursor(
    "input.dat",
    pool
)
    ) {
    try {
        // Consume or retain the buffer.
    }
    finally {
        pool.release(
            buffer
        );
    }
}
```

Higher-level record readers normally retain buffers beyond a single loop iteration and return them only when no current or future physical record can refer to them.

## Design goals

The byte layer is designed for:

- low allocation;
- predictable memory usage;
- buffer reuse;
- records larger than a physical read buffer;
- zero-copy composition with higher layers;
- explicit ownership.