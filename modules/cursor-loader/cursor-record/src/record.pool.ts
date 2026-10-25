import {createRefCountedPool, RefCountedPool} from "@cobol-ts/ref_counted_pool";

/**
 * A reusable pool whose allocator is supplied at acquisition time. This lets
 * callers inject the pool instance without exposing record construction.
 * The allocator runs only if no released entry is available.
 */
export type RecordObjectPool<T> = Readonly<{
    acquire(create: () => T): T;
    release(value: T): void;
}>;

/** Single-owner pool, intended for synchronous borrowed-record callbacks. */
const simpleRefCountSymbol = Symbol('refCount');
const simpleOwnerSymbol = Symbol('owner');

export function createSimpleRecordPool<T>(): RecordObjectPool<T> {
    const available: T[] = [];

    let factory: (() => T) | undefined;
    const poolIdentity = Symbol('simple-pool-instance');

    return {
        acquire(create) {
            factory ??= create;

            const reused = available.pop();
            if (reused !== undefined) {
                return reused;
            }

            const value = factory();

            if (typeof value === 'object' && value !== null) {
                Object.defineProperties(value, {
                    [simpleRefCountSymbol]: {
                        value: 1,
                        writable: true,
                        enumerable: false,
                        configurable: false
                    },
                    [simpleOwnerSymbol]: {
                        value: poolIdentity,
                        writable: false,
                        enumerable: false,
                        configurable: false
                    }
                });
            }

            return value;
        },

        release(value) {
            available.push(value);
        }
    };
}

/**
 * Adapter for the existing reference-counted implementation. The allocator is
 * captured on first acquisition, so one pool instance belongs to one scan.
 */
export function createReferenceCountedRecordPool<T>(): RecordObjectPool<T> {
    let pool: RefCountedPool<object> | undefined;

    return {
        acquire(create) {
            if (!pool) {
                pool = createRefCountedPool(
                    create as () => object
                );
            }
            return pool.acquire() as T;
        },
        release(value) {
            if (!pool) {
                throw new Error('Record pool has not been initialised');
            }
            pool.release(value as object);
        }
    };
}
