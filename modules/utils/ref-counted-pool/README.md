# @cobol-ts/ref-counted-pool

A small reference-counted object pool for JavaScript and TypeScript.

Objects can be shared by multiple owners and are returned to the pool only when every owner has released its reference.

Checked-out objects are not retained by the pool, so normal garbage collection still applies if an object becomes unreachable without being released.

## Why

A normal object pool assumes that one caller acquires an object and later returns it.

That is not sufficient when the same object may be used by several things at once.

For example, a byte buffer might be:

- owned initially by a file cursor;
- referenced by one physical record;
- referenced by another physical record;
- no longer needed by the cursor;
- still required by both records.

The buffer must not return to the pool until the cursor and both records have finished with it.

A reference count gives us that ownership model.

```text
acquire()
    count = 1

reuse()
    count = 2

reuse()
    count = 3

release()
    count = 2

release()
    count = 1

release()
    count = 0
    ↓
returned to pool
```

## Installation

```bash
npm install @cobol-ts/ref-counted-pool
```

## API

```ts
export interface RefCountedPool<
    T extends object
> {
    acquire():
        T;

    reuse(
        value: T
    ): void;

    release(
        value: T
    ): void;
}


export function createRefCountedPool<
    T extends object
>(
    create:
    () => T
): RefCountedPool<T>;
```

## Basic use

```ts
import {
    createRefCountedPool
} from "@cobol-ts/ref-counted-pool";


interface Buffer {
    bytes:
        Uint8Array;
}


const pool =
    createRefCountedPool(
        (): Buffer => ({
            bytes:
                new Uint8Array(
                    64 * 1024
                )
        })
    );


const buffer =
    pool.acquire();

/*
 * count = 1
 *
 * The acquiring caller owns the first reference.
 */

pool.reuse(
    buffer
);

/*
 * count = 2
 *
 * Another owner now uses the same buffer.
 */

pool.reuse(
    buffer
);

/*
 * count = 3
 */

pool.release(
    buffer
);

/*
 * count = 2
 */

pool.release(
    buffer
);

/*
 * count = 1
 */

pool.release(
    buffer
);

/*
 * count = 0
 *
 * The buffer is now available for acquire() again.
 */
```

## Ownership rules

### `acquire()`

Returns an object with a reference count of one.

The caller owns that reference.

```ts
const value =
    pool.acquire();
```

### `reuse(value)`

Records another owner of the same object.

```ts
pool.reuse(
    value
);
```

This increments the reference count.

Call `reuse()` once for every additional owner which must keep the object alive independently.

### `release(value)`

Releases one ownership reference.

```ts
pool.release(
    value
);
```

When the final reference is released, the object is returned to the pool and may immediately be handed out by another call to `acquire()`.

After releasing the final reference, the previous owner must no longer use the object.

## Example: shared byte buffers

Suppose one byte buffer contains data belonging to two physical records.

```text
                 cursor
                   │
                   ▼
              byte buffer
               ▲       ▲
               │       │
          record A   record B
```

The cursor acquires the buffer:

```ts
const buffer =
    pool.acquire();
```

Record A starts using it:

```ts
pool.reuse(
    buffer
);
```

Record B also starts using it:

```ts
pool.reuse(
    buffer
);
```

The reference count is now three.

When the cursor advances:

```ts
pool.release(
    buffer
);
```

the buffer is still alive because the two records retain references.

When Record A closes:

```ts
pool.release(
    buffer
);
```

one reference remains.

Only when Record B closes:

```ts
pool.release(
    buffer
);
```

does the reference count reach zero and the buffer return to the pool.

## Object state

The pool does not reset objects.

If an object is released and later acquired again, its application data is unchanged.

```ts
const value =
    pool.acquire();

value.name =
    "previous";

pool.release(
    value
);


const reused =
    pool.acquire();

console.log(
    reused.name
);

/*
 * "previous"
 */
```

If a particular object type needs to be reinitialised before use, the caller is responsible for doing that after acquisition.

```ts
const value =
    pool.acquire();

initialise(
    value
);
```

The pool is concerned only with ownership and reuse.

## Garbage collection

The pool keeps references only to objects which have been completely released and are available for reuse.

It deliberately does not maintain a `Map`, `Set`, or other collection of checked-out objects.

Reference-counting metadata is stored directly on the managed object.

Therefore this:

```ts
let value =
    pool.acquire();

/*
 * value has never been released.
 */

value =
    undefined;
```

does not cause the pool to keep the object alive.

If there are no other JavaScript references to it, the object remains eligible for normal garbage collection.

Its reference count may still say `1`, but that number does not itself keep the object reachable.

The object simply never returns to the pool for reuse.

By contrast, an object which is correctly released to a reference count of zero is intentionally retained by the pool for later reuse.

## Internal metadata

Reference-counting state is stored directly on each managed object using private `Symbol` properties.

Conceptually, an object contains:

```text
application fields

+ private reference count
+ private owning-pool identity
```

The symbols are not exported.

This means callers do not need to reserve names such as:

```text
$$ref_count
$$pool
```

and ordinary application properties cannot accidentally collide with the pool metadata.

Symbol metadata is also excluded from normal operations such as:

```ts
Object.keys(
    value
);

JSON.stringify(
    value
);
```

## Pool ownership

Every managed object belongs to the particular pool which created it.

An object from one pool cannot be passed to another pool's `reuse()` or `release()` methods.

```ts
const firstPool =
    createRefCountedPool(
        () => ({})
    );

const secondPool =
    createRefCountedPool(
        () => ({})
    );


const value =
    firstPool.acquire();


secondPool.release(
    value
);

/*
 * Throws.
 */
```

This is treated as a programming error.

## Error handling

Ownership errors fail immediately.

Examples include:

### Releasing an unmanaged object

```ts
pool.release(
    {}
);
```

Throws an error such as:

```text
RefCountedPool.release(): object is not managed by a ref-counted pool
```

### Using an object from another pool

```text
RefCountedPool.release(): object belongs to a different ref-counted pool
```

### Double release

```text
RefCountedPool.release(): object has already been fully released; this is probably a double release
```

### Reusing an already released object

```text
RefCountedPool.reuse(): object has already been fully released
```

### Invalid factory output

Factories must return extensible objects.

Returning a primitive, frozen object, sealed object, or object already managed by another reference-counted pool causes `acquire()` to throw.

These are programming errors rather than recoverable runtime conditions.

## Factory

Objects are created only when no released object is currently available.

```ts
let created =
    0;


const pool =
    createRefCountedPool(
        () => ({
            id:
                ++created
        })
    );


const first =
    pool.acquire();

/*
 * created === 1
 */

pool.release(
    first
);


const second =
    pool.acquire();

/*
 * second === first
 * created === 1
 */
```

## Performance characteristics

The implementation is deliberately small.

Checked-out objects require:

- no external reference-count map;
- no allocation for reference-count metadata after initial creation;
- no wrapper object per reference;
- a numeric increment for `reuse()`;
- a numeric decrement for `release()`.

Objects sitting in the pool are held in a simple available-object collection.

Reference-count and ownership metadata remain attached to the object for its lifetime.

## Deliberate limitations

Reference counting depends on callers following the ownership protocol.

In particular:

- every additional independent owner must call `reuse()`;
- every owned reference must eventually call `release()` if reuse is desired;
- an object must not be used after its final release.

The pool detects many common ownership mistakes, including double release and use with the wrong pool.

It cannot distinguish an old stale JavaScript reference from a current reference after the same object has been released and acquired again. That is intrinsic to an API where ownership operations are performed directly on the reused object.

Higher-level abstractions should therefore make their own `close()` operations idempotent where appropriate.

## Summary

The complete lifecycle is:

```text
create if necessary
        ↓
acquire
        ↓
count = 1
        ↓
reuse as required
        ↓
count increases
        ↓
owners release independently
        ↓
count decreases
        ↓
count = 0
        ↓
available for reuse
```

The pool provides reference-counted reuse without requiring a global ownership registry and without preventing normal garbage collection of abandoned checked-out objects.