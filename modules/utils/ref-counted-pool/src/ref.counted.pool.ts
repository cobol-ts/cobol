/*
 * Reference-counted object pool.
 *
 * Objects acquired from this pool carry their own reference-counting
 * metadata.
 *
 * The pool itself retains only objects whose reference count has reached
 * zero and which are therefore available for reuse.
 *
 * Checked-out objects are deliberately NOT retained by the pool.
 *
 * This means that if application code loses all references to a checked-out
 * object without releasing it, normal JavaScript garbage collection can
 * still collect that object.
 *
 * The consequence of failing to release an object is therefore lost reuse,
 * not a memory leak caused by the pool retaining the object forever.
 */


/*
 * Internal metadata is stored directly on each managed object.
 *
 * Symbols are used instead of reserved string properties such as
 * "$$ref_count".
 *
 * Each Symbol() call creates a unique property key, so application objects
 * cannot accidentally collide with these fields.
 *
 * The symbols are deliberately not exported.
 */
const refCountSymbol =
    Symbol(
        "@cobol-ts/ref-counted-pool.refCount"
    );

const ownerSymbol =
    Symbol(
        "@cobol-ts/ref-counted-pool.owner"
    );


/*
 * Internal view of a pooled object.
 *
 * Consumers see only T.
 *
 * The pool implementation knows that T also carries these two private
 * properties.
 */
type Managed<
    T extends object
> =
    T
    & {
    [refCountSymbol]:
        number;

    [ownerSymbol]:
        symbol;
};


type PoolOperation =
    | "acquire"
    | "reuse"
    | "release";


/**
 * A pool of reference-counted objects.
 *
 * acquire()
 * ----------
 *
 * Obtain an object.
 *
 * The returned object starts with a reference count of one. The caller owns
 * that reference.
 *
 *
 * reuse(value)
 * ------------
 *
 * Record that another owner will use the same object.
 *
 * This increments the reference count.
 *
 *
 * release(value)
 * --------------
 *
 * Record that one owner has finished using the object.
 *
 * This decrements the reference count.
 *
 * When the reference count reaches zero, the object becomes available for
 * later acquisition from this pool.
 *
 *
 * Example
 * -------
 *
 *     const value =
 *         pool.acquire();
 *
 *     // count = 1
 *
 *     pool.reuse(
 *         value
 *     );
 *
 *     // count = 2
 *
 *     pool.reuse(
 *         value
 *     );
 *
 *     // count = 3
 *
 *     pool.release(
 *         value
 *     );
 *
 *     // count = 2
 *
 *     pool.release(
 *         value
 *     );
 *
 *     // count = 1
 *
 *     pool.release(
 *         value
 *     );
 *
 *     // count = 0
 *     // value is now available from the pool again
 *
 *
 * Once the final release() has occurred, the caller no longer owns the
 * object and must not use it.
 *
 * It may immediately be returned by another acquire().
 */
export interface RefCountedPool<
    T extends object
> {

    acquire():
        T;


    reuse(
        value:
        T
    ): void;


    release(
        value:
        T
    ): void;
}


/**
 * Create a reference-counted object pool.
 *
 *
 * create
 * ------
 *
 * Called when acquire() is requested and there is no released object already
 * available in the pool.
 *
 * The returned value must be an extensible object because the pool attaches
 * its private reference-count and ownership metadata directly to it.
 *
 *
 * Object state
 * ------------
 *
 * This pool deliberately knows nothing about the application state stored
 * inside T.
 *
 * An object returned by acquire() may contain state from its previous use.
 * If a particular T needs to be initialised before use, that is the
 * responsibility of the code using that T.
 *
 * This keeps the pool concerned only with ownership and reuse.
 *
 *
 * Garbage collection
 * ------------------
 *
 * Only objects whose reference count has reached zero are retained by the
 * pool for later reuse.
 *
 * Checked-out objects are not stored in any Map, Set, array or other
 * pool-owned structure.
 *
 * Their reference count and pool identity are stored directly on the object.
 *
 * Consequently, if a checked-out object becomes unreachable without being
 * released, it remains eligible for ordinary JavaScript garbage collection.
 *
 * It simply never returns to this pool for reuse.
 */
export function createRefCountedPool<
    T extends object
>(
    create:
    () => T
): RefCountedPool<
    T
> {

    /*
     * Unique identity for this particular pool instance.
     *
     * Managed objects carry this identity so that reuse() and release() can
     * detect objects belonging to another pool.
     *
     * This is deliberately just an identity token. Managed objects do not
     * contain a reference back to the pool itself.
     */
    const poolIdentity =
        Symbol(
            "ref-counted-pool-instance"
        );


    /*
     * The only objects retained by the pool.
     *
     * Every object in this array:
     *
     *     - belongs to this pool;
     *     - has reference count zero.
     *
     * No checked-out object is stored here.
     */
    const available:
        T[] =
        [];


    const pool:
        RefCountedPool<T> = {

        acquire():
            T {

            const availableValue =
                available.pop();


            if (
                availableValue
                !== undefined
            ) {
                /*
                 * This object came from our own available list, but still
                 * validate its metadata.
                 *
                 * Under correct use these checks cannot fail. If they do,
                 * something has corrupted the ownership protocol and we want
                 * to fail immediately.
                 */
                const managed =
                    managedByThisPool(
                        availableValue,
                        poolIdentity,
                        "acquire"
                    );


                if (
                    managed[
                        refCountSymbol
                        ] !== 0
                ) {
                    throw new Error(
                        "RefCountedPool.acquire(): "
                        + "pooled object has reference count "
                        + `${managed[refCountSymbol]}; `
                        + "expected 0; internal pool state is corrupt"
                    );
                }


                /*
                 * The acquiring caller becomes the first owner.
                 */
                managed[
                    refCountSymbol
                    ] =
                    1;


                return availableValue;
            }


            /*
             * Nothing reusable is available.
             *
             * Ask the supplied factory for a new object.
             */
            const value =
                create();


            validateFactoryValue(
                value
            );


            /*
             * Attach all pool metadata when the object is first created.
             *
             * These properties remain on the object for its entire lifetime.
             * Subsequent pool cycles only modify the reference count.
             */
            Object.defineProperties(
                value,
                {
                    [refCountSymbol]: {
                        value:
                            1,

                        writable:
                            true,

                        enumerable:
                            false,

                        configurable:
                            false
                    },

                    [ownerSymbol]: {
                        value:
                        poolIdentity,

                        writable:
                            false,

                        enumerable:
                            false,

                        configurable:
                            false
                    }
                }
            );


            return value;
        },


        reuse(
            value:
            T
        ): void {

            const managed =
                managedByThisPool(
                    value,
                    poolIdentity,
                    "reuse"
                );


            /*
             * A zero reference count means the object has already been
             * completely released and is currently available for acquisition
             * by somebody else.
             *
             * It cannot be resurrected through reuse().
             */
            if (
                managed[
                    refCountSymbol
                    ] === 0
            ) {
                throw new Error(
                    "RefCountedPool.reuse(): "
                    + "object has already been fully released"
                );
            }


            /*
             * JavaScript numbers cease to represent every integer exactly
             * beyond MAX_SAFE_INTEGER.
             *
             * Reaching this value is not realistic in legitimate use, but
             * silently allowing the counter to become imprecise would break
             * the ownership guarantee.
             */
            if (
                managed[
                    refCountSymbol
                    ] ===
                Number.MAX_SAFE_INTEGER
            ) {
                throw new Error(
                    "RefCountedPool.reuse(): "
                    + "reference count cannot exceed "
                    + `${Number.MAX_SAFE_INTEGER}`
                );
            }


            managed[
                refCountSymbol
                ]++;
        },


        release(
            value:
            T
        ): void {

            const managed =
                managedByThisPool(
                    value,
                    poolIdentity,
                    "release"
                );


            /*
             * This is most commonly a double release.
             *
             * It must be a hard failure.
             *
             * Silently accepting it could make the same mutable object
             * available for acquisition more than once.
             */
            if (
                managed[
                    refCountSymbol
                    ] === 0
            ) {
                throw new Error(
                    "RefCountedPool.release(): "
                    + "object has already been fully released; "
                    + "this is probably a double release"
                );
            }


            managed[
                refCountSymbol
                ]--;


            /*
             * At least one owner remains.
             *
             * The pool does nothing and, importantly, retains no additional
             * reference to the object.
             */
            if (
                managed[
                    refCountSymbol
                    ] !== 0
            ) {
                return;
            }


            /*
             * The final owner has released the object.
             *
             * The pool deliberately performs no reset or cleanup here.
             *
             * Application state belongs to T and is outside the concerns of
             * this pool.
             */
            available.push(
                value
            );
        }
    };


    return pool;
}


/**
 * Validate a value returned by the user's create() callback.
 *
 * Failures here are programming/configuration errors and therefore throw
 * immediately.
 */
function validateFactoryValue<
    T extends object
>(
    value:
    T
): void {

    /*
     * T extends object protects normal TypeScript callers, but runtime values
     * can still arrive through JavaScript, `any`, an incorrect cast or an
     * incorrectly implemented factory.
     *
     * Produce our own useful error rather than an incidental native
     * TypeError.
     */
    if (
        !isObjectLike(
            value
        )
    ) {
        throw new Error(
            "RefCountedPool.acquire(): "
            + "factory did not return an object"
        );
    }


    const hasRefCount =
        Object.prototype
            .hasOwnProperty
            .call(
                value,
                refCountSymbol
            );

    const hasOwner =
        Object.prototype
            .hasOwnProperty
            .call(
                value,
                ownerSymbol
            );


    /*
     * Seeing both of our private symbols on a newly created value means the
     * factory has returned something which has already participated in this
     * reference-counting implementation.
     */
    if (
        hasRefCount
        && hasOwner
    ) {
        throw new Error(
            "RefCountedPool.acquire(): "
            + "factory returned an object which is already managed "
            + "by a ref-counted pool"
        );
    }


    /*
     * Only one metadata property existing cannot happen through legitimate
     * use of this package.
     */
    if (
        hasRefCount
        || hasOwner
    ) {
        throw new Error(
            "RefCountedPool.acquire(): "
            + "factory returned an object with incomplete "
            + "ref-counted pool metadata"
        );
    }


    /*
     * Our metadata is stored directly on the object, so sealed, frozen or
     * otherwise non-extensible values cannot be managed.
     */
    if (
        !Object.isExtensible(
            value
        )
    ) {
        throw new Error(
            "RefCountedPool.acquire(): "
            + "factory returned a non-extensible object; "
            + "reference-counted pool metadata cannot be attached"
        );
    }
}


/**
 * Return the internal managed view of an object after validating its
 * ownership metadata.
 *
 * This centralises the runtime checks used by reuse() and release(), and also
 * protects the internal available-object path in acquire().
 */
function managedByThisPool<
    T extends object
>(
    value:
    T,

    poolIdentity:
    symbol,

    operation:
    PoolOperation
): Managed<T> {

    /*
     * The TypeScript type normally prevents this, but this package is also a
     * JavaScript runtime boundary.
     */
    if (
        !isObjectLike(
            value
        )
    ) {
        throw new Error(
            `RefCountedPool.${operation}(): `
            + "value must be an object"
        );
    }


    const hasRefCount =
        Object.prototype
            .hasOwnProperty
            .call(
                value,
                refCountSymbol
            );

    const hasOwner =
        Object.prototype
            .hasOwnProperty
            .call(
                value,
                ownerSymbol
            );


    /*
     * Neither property exists.
     *
     * This is an ordinary object which has never been acquired from one of
     * these pools.
     */
    if (
        !hasRefCount
        && !hasOwner
    ) {
        throw new Error(
            `RefCountedPool.${operation}(): `
            + "object is not managed by a ref-counted pool"
        );
    }


    /*
     * One property without the other cannot be produced through legitimate
     * use of this module.
     */
    if (
        !hasRefCount
        || !hasOwner
    ) {
        throw new Error(
            `RefCountedPool.${operation}(): `
            + "object has incomplete ref-counted pool metadata; "
            + "internal object state is corrupt"
        );
    }


    const managed =
        value as
            Managed<T>;


    /*
     * The object is reference-counted, but belongs to another instance of
     * RefCountedPool.
     */
    if (
        managed[
            ownerSymbol
            ] !== poolIdentity
    ) {
        throw new Error(
            `RefCountedPool.${operation}(): `
            + "object belongs to a different ref-counted pool"
        );
    }


    const refCount =
        managed[
            refCountSymbol
            ];


    /*
     * The package only ever writes non-negative safe integers to this field.
     *
     * Any other value indicates deliberate interference with the private
     * Symbol metadata or an implementation bug.
     */
    if (
        !Number.isSafeInteger(
            refCount
        )
        || refCount < 0
    ) {
        throw new Error(
            `RefCountedPool.${operation}(): `
            + "invalid reference count "
            + `${String(refCount)}; `
            + "internal pool state is corrupt"
        );
    }


    return managed;
}


/**
 * Runtime form of `T extends object`.
 *
 * Functions are included because JavaScript functions can own properties and
 * can therefore carry our Symbol metadata.
 */
function isObjectLike(
    value:
    unknown
): value is object {

    return value !== null
        && (
            typeof value
            === "object"
            || typeof value
            === "function"
        );
}