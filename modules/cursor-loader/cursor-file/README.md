# @cobol-ts/cursor-file

Low-level pooled byte cursor for reading files.

This package contains no record-framing or parser logic. It reads a file as a sequence of `Uint8Array` buffers and transfers ownership of each yielded buffer to its consumer.

## Byte cursor

```ts
const cursor =
    createFileByteCursor(
        filename,
        pool
    );
```

The cursor:

- opens the file using Node file APIs;
- fills pooled byte buffers;
- handles short reads correctly;
- yields complete buffers for full reads;
- yields a shorter view for the final partial read;
- closes the file when iteration completes or is terminated early.

It does not know about:

- lines;
- LF or CRLF;
- fixed-width records;
- CSV;
- JSON;
- COBOL.

## Buffer ownership

Yielding transfers ownership of a buffer to the consumer.

This is important because a higher-level record reader may need to retain several buffers at once while assembling a logical record which crosses physical read boundaries.

The byte cursor therefore does **not** automatically reclaim a buffer after the consumer requests another one.

The consumer must return buffers to the same pool when they are no longer required.

## Buffer pool

```ts
const pool =
    createFileBufferPool();
```

The pool allocates fixed-size physical file buffers and reuses released backing storage.

The default buffer size is:

```ts
FILE_BUFFER_SIZE
```

The pool grows to the maximum number of buffers concurrently required and then reuses those buffers.

## Example

```ts
const pool =
    createFileBufferPool();

const cursor =
    createFileByteCursor(
        "input.dat",
        pool
    );

for await (
    const buffer
    of cursor
) {
    try {
        // Consume or retain the buffer.
    } finally {
        pool.release(
            buffer
        );
    }
}
```

A record-oriented consumer may deliberately postpone `release()` until all records referring to the buffer have been consumed.

## Scope

This package represents the lowest physical I/O layer:

```text
file
    ↓
Uint8Array
    ↓
consumer
```

Record framing belongs at a higher layer.

