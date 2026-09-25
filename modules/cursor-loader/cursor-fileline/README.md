# `@cobol-ts/cursor-fileline` — README.md

# @cobol-ts/cursor-fileline

Reusable byte-buffer pool for file-line processing.

The package provides a fixed-size pool of `Uint8Array` instances intended for cursors which retain physical file buffers while locating line boundaries.

## Usage

```ts
const pool =
    createFileLineBufferPool();

const buffer =
    pool.acquire();

try {
    // Fill/use the buffer.
} finally {
    pool.release(
        buffer
    );
}
```

## Pool behaviour

The pool:

- returns an existing released buffer when possible;
- allocates a new buffer when the pool is empty;
- retains released buffers for future reuse;
- has no configured maximum size.

It therefore grows to the high-water number of buffers required concurrently.

## Why several buffers may be live

A physical read buffer and a physical line are independent concepts.

One buffer may contain several lines:

```text
buffer:
    one\ntwo\nthree\n
```

while one long line may span several buffers:

```text
buffer 1:
    abcdefgh

buffer 2:
    ijklmnop

buffer 3:
    qrst\n
```

A record cursor must retain all buffers still referenced by its current physical record.

Only buffers which can no longer contribute to the current or any future record should be returned to the pool.

## Buffer size

The fixed buffer size is exported as:

```ts
FILE_LINE_BUFFER_SIZE
```

Buffers returned to the pool are checked to ensure they have the expected size.

## Scope

This package is concerned only with buffer reuse.

It does not:

- perform file I/O;
- locate LF or CRLF;
- create physical records;
- parse CSV or JSON;
- project application values.