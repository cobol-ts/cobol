import {
    createRefCountedPool
} from "./ref.counted.pool";


interface TestValue {
    id:
        number;

    value:
        string;
}


describe(
    "RefCountedPool",
    () => {

        test(
            "creates an object when the pool is empty",
            () => {

                const create =
                    jest.fn(
                        (): TestValue => ({
                            id:
                                1,

                            value:
                                "created"
                        })
                    );


                const pool =
                    createRefCountedPool(
                        create
                    );


                const value =
                    pool.acquire();


                expect(
                    value
                ).toEqual(
                    {
                        id:
                            1,

                        value:
                            "created"
                    }
                );


                expect(
                    create
                ).toHaveBeenCalledTimes(
                    1
                );
            }
        );


        test(
            "reuses a fully released object",
            () => {

                let nextId =
                    1;


                const create =
                    jest.fn(
                        (): TestValue => ({
                            id:
                                nextId++,

                            value:
                                ""
                        })
                    );


                const pool =
                    createRefCountedPool(
                        create
                    );


                const first =
                    pool.acquire();


                pool.release(
                    first
                );


                const second =
                    pool.acquire();


                expect(
                    second
                ).toBe(
                    first
                );


                expect(
                    create
                ).toHaveBeenCalledTimes(
                    1
                );
            }
        );


        test(
            "does not reset application state when an object is reused",
            () => {

                const pool =
                    createRefCountedPool(
                        (): TestValue => ({
                            id:
                                1,

                            value:
                                ""
                        })
                    );


                const first =
                    pool.acquire();


                first.value =
                    "previous value";


                pool.release(
                    first
                );


                const second =
                    pool.acquire();


                expect(
                    second.value
                ).toBe(
                    "previous value"
                );
            }
        );


        test(
            "reuse adds another reference",
            () => {

                let nextId =
                    1;


                const create =
                    jest.fn(
                        (): TestValue => ({
                            id:
                                nextId++,

                            value:
                                ""
                        })
                    );


                const pool =
                    createRefCountedPool(
                        create
                    );


                const first =
                    pool.acquire();


                pool.reuse(
                    first
                );


                /*
                 * One reference is released, but another still exists.
                 *
                 * The object must therefore not yet be available from the
                 * pool.
                 */
                pool.release(
                    first
                );


                const second =
                    pool.acquire();


                expect(
                    second
                ).not.toBe(
                    first
                );


                expect(
                    create
                ).toHaveBeenCalledTimes(
                    2
                );


                /*
                 * Release the remaining reference to first.
                 */
                pool.release(
                    first
                );


                /*
                 * first is now available for reuse.
                 *
                 * second is still checked out, so first is the only object
                 * available in the pool.
                 */
                const third =
                    pool.acquire();


                expect(
                    third
                ).toBe(
                    first
                );
            }
        );


        test(
            "supports several references to the same object",
            () => {

                const pool =
                    createRefCountedPool(
                        (): TestValue => ({
                            id:
                                1,

                            value:
                                ""
                        })
                    );


                const value =
                    pool.acquire();


                pool.reuse(
                    value
                );

                pool.reuse(
                    value
                );

                pool.reuse(
                    value
                );


                /*
                 * count = 4
                 */
                pool.release(
                    value
                );

                pool.release(
                    value
                );

                pool.release(
                    value
                );


                /*
                 * One owner remains, so acquiring must create another object.
                 */
                const other =
                    pool.acquire();


                expect(
                    other
                ).not.toBe(
                    value
                );


                /*
                 * Release the fourth and final reference.
                 */
                pool.release(
                    value
                );


                /*
                 * value can now be acquired again.
                 */
                const reused =
                    pool.acquire();


                expect(
                    reused
                ).toBe(
                    value
                );
            }
        );


        test(
            "can reuse an object through several complete lifecycles",
            () => {

                const create =
                    jest.fn(
                        (): TestValue => ({
                            id:
                                1,

                            value:
                                ""
                        })
                    );


                const pool =
                    createRefCountedPool(
                        create
                    );


                const first =
                    pool.acquire();

                pool.release(
                    first
                );


                const second =
                    pool.acquire();

                pool.release(
                    second
                );


                const third =
                    pool.acquire();

                pool.release(
                    third
                );


                expect(
                    second
                ).toBe(
                    first
                );

                expect(
                    third
                ).toBe(
                    first
                );

                expect(
                    create
                ).toHaveBeenCalledTimes(
                    1
                );
            }
        );


        test(
            "release rejects an object which is not managed by a ref-counted pool",
            () => {

                const pool =
                    createRefCountedPool(
                        (): TestValue => ({
                            id:
                                1,

                            value:
                                ""
                        })
                    );


                const unmanaged:
                    TestValue = {
                    id:
                        99,

                    value:
                        ""
                };


                expect(
                    () =>
                        pool.release(
                            unmanaged
                        )
                ).toThrow(
                    "RefCountedPool.release(): "
                    + "object is not managed by a ref-counted pool"
                );
            }
        );


        test(
            "reuse rejects an object which is not managed by a ref-counted pool",
            () => {

                const pool =
                    createRefCountedPool(
                        (): TestValue => ({
                            id:
                                1,

                            value:
                                ""
                        })
                    );


                const unmanaged:
                    TestValue = {
                    id:
                        99,

                    value:
                        ""
                };


                expect(
                    () =>
                        pool.reuse(
                            unmanaged
                        )
                ).toThrow(
                    "RefCountedPool.reuse(): "
                    + "object is not managed by a ref-counted pool"
                );
            }
        );


        test(
            "release rejects an object belonging to another pool",
            () => {

                const firstPool =
                    createRefCountedPool(
                        (): TestValue => ({
                            id:
                                1,

                            value:
                                ""
                        })
                    );


                const secondPool =
                    createRefCountedPool(
                        (): TestValue => ({
                            id:
                                2,

                            value:
                                ""
                        })
                    );


                const value =
                    firstPool.acquire();


                expect(
                    () =>
                        secondPool.release(
                            value
                        )
                ).toThrow(
                    "RefCountedPool.release(): "
                    + "object belongs to a different ref-counted pool"
                );
            }
        );


        test(
            "reuse rejects an object belonging to another pool",
            () => {

                const firstPool =
                    createRefCountedPool(
                        (): TestValue => ({
                            id:
                                1,

                            value:
                                ""
                        })
                    );


                const secondPool =
                    createRefCountedPool(
                        (): TestValue => ({
                            id:
                                2,

                            value:
                                ""
                        })
                    );


                const value =
                    firstPool.acquire();


                expect(
                    () =>
                        secondPool.reuse(
                            value
                        )
                ).toThrow(
                    "RefCountedPool.reuse(): "
                    + "object belongs to a different ref-counted pool"
                );
            }
        );


        test(
            "release rejects a double release",
            () => {

                const pool =
                    createRefCountedPool(
                        (): TestValue => ({
                            id:
                                1,

                            value:
                                ""
                        })
                    );


                const value =
                    pool.acquire();


                pool.release(
                    value
                );


                expect(
                    () =>
                        pool.release(
                            value
                        )
                ).toThrow(
                    "RefCountedPool.release(): "
                    + "object has already been fully released; "
                    + "this is probably a double release"
                );
            }
        );


        test(
            "reuse rejects an object which has already been fully released",
            () => {

                const pool =
                    createRefCountedPool(
                        (): TestValue => ({
                            id:
                                1,

                            value:
                                ""
                        })
                    );


                const value =
                    pool.acquire();


                pool.release(
                    value
                );


                expect(
                    () =>
                        pool.reuse(
                            value
                        )
                ).toThrow(
                    "RefCountedPool.reuse(): "
                    + "object has already been fully released"
                );
            }
        );


        test(
            "rejects a non-extensible object returned by the factory",
            () => {

                const value =
                    Object.preventExtensions(
                        {
                            id:
                                1,

                            value:
                                ""
                        }
                    );


                const pool =
                    createRefCountedPool(
                        () =>
                            value
                    );


                expect(
                    () =>
                        pool.acquire()
                ).toThrow(
                    "RefCountedPool.acquire(): "
                    + "factory returned a non-extensible object; "
                    + "reference-counted pool metadata cannot be attached"
                );
            }
        );


        test(
            "rejects an object already managed by another ref-counted pool",
            () => {

                const firstPool =
                    createRefCountedPool(
                        (): TestValue => ({
                            id:
                                1,

                            value:
                                ""
                        })
                    );


                const managedValue =
                    firstPool.acquire();


                /*
                 * This is deliberately a broken factory.
                 *
                 * A factory must create a new unmanaged object. Returning
                 * something already managed by another pool must fail.
                 */
                const secondPool =
                    createRefCountedPool(
                        () =>
                            managedValue
                    );


                expect(
                    () =>
                        secondPool.acquire()
                ).toThrow(
                    "RefCountedPool.acquire(): "
                    + "factory returned an object which is already managed "
                    + "by a ref-counted pool"
                );
            }
        );


        test(
            "rejects a factory which does not return an object at runtime",
            () => {

                /*
                 * Deliberately bypass the TypeScript contract to verify the
                 * runtime protection for JavaScript, `any`, and bad casts.
                 */
                const create =
                    (() =>
                        42) as unknown as
                        () => TestValue;


                const pool =
                    createRefCountedPool(
                        create
                    );


                expect(
                    () =>
                        pool.acquire()
                ).toThrow(
                    "RefCountedPool.acquire(): "
                    + "factory did not return an object"
                );
            }
        );


        test(
            "does not expose reference-counting metadata through Object.keys",
            () => {

                const pool =
                    createRefCountedPool(
                        (): TestValue => ({
                            id:
                                1,

                            value:
                                ""
                        })
                    );


                const value =
                    pool.acquire();


                expect(
                    Object.keys(
                        value
                    )
                ).toEqual(
                    [
                        "id",
                        "value"
                    ]
                );
            }
        );


        test(
            "does not expose reference-counting metadata through JSON serialization",
            () => {

                const pool =
                    createRefCountedPool(
                        (): TestValue => ({
                            id:
                                1,

                            value:
                                "hello"
                        })
                    );


                const value =
                    pool.acquire();


                expect(
                    JSON.stringify(
                        value
                    )
                ).toBe(
                    "{\"id\":1,\"value\":\"hello\"}"
                );
            }
        );
    }
);