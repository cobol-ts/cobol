import {createRefCountedPool} from "./ref.counted.pool";

describe(
    "RefCountedPool stress",
    () => {

        test(
            "does not make a heavily referenced object available until its final release",
            () => {

                let nextId =
                    1;


                const create =
                    jest.fn(
                        () => ({
                            id:
                                nextId++
                        })
                    );


                const pool =
                    createRefCountedPool(
                        create
                    );


                const value =
                    pool.acquire();


                const additionalReferences =
                    1_000_000;


                /*
                 * value now has:
                 *
                 *     1 original acquire reference
                 *     + additionalReferences
                 */
                for (
                    let index = 0;
                    index < additionalReferences;
                    index++
                ) {
                    pool.reuse(
                        value
                    );
                }


                /*
                 * Release every additional reference.
                 *
                 * The original acquire reference remains.
                 */
                for (
                    let index = 0;
                    index < additionalReferences;
                    index++
                ) {
                    pool.release(
                        value
                    );
                }


                /*
                 * INVARIANT:
                 *
                 * value still has one live reference, so acquire() must not
                 * return it.
                 */
                const other =
                    pool.acquire();


                expect(
                    other
                ).not.toBe(
                    value
                );


                /*
                 * Now release the final reference to value.
                 *
                 * other remains checked out, so value is the only object
                 * which can now be available in the pool.
                 */
                pool.release(
                    value
                );


                const reused =
                    pool.acquire();


                expect(
                    reused
                ).toBe(
                    value
                );


                expect(
                    create
                ).toHaveBeenCalledTimes(
                    2
                );
            }
        );


        test(
            "reuses a large released population without duplicate live objects or further allocation",
            () => {

                let nextId =
                    1;


                const create =
                    jest.fn(
                        () => ({
                            id:
                                nextId++
                        })
                    );


                const pool =
                    createRefCountedPool(
                        create
                    );


                const objectCount =
                    10_000;


                const firstGeneration =
                    Array.from(
                        {
                            length:
                            objectCount
                        },
                        () =>
                            pool.acquire()
                    );


                const firstGenerationSet =
                    new Set(
                        firstGeneration
                    );


                /*
                 * INVARIANT:
                 *
                 * Every simultaneously checked-out acquisition is a distinct
                 * object.
                 */
                expect(
                    firstGenerationSet.size
                ).toBe(
                    objectCount
                );


                for (
                    const value
                    of firstGeneration
                    ) {
                    pool.release(
                        value
                    );
                }


                const secondGeneration =
                    Array.from(
                        {
                            length:
                            objectCount
                        },
                        () =>
                            pool.acquire()
                    );


                /*
                 * INVARIANT:
                 *
                 * We released exactly enough objects to satisfy the entire
                 * second generation. The factory must therefore not have been
                 * called again.
                 */
                expect(
                    create
                ).toHaveBeenCalledTimes(
                    objectCount
                );


                /*
                 * INVARIANT:
                 *
                 * No pooled object may have been handed out twice while
                 * simultaneously live.
                 */
                expect(
                    new Set(
                        secondGeneration
                    ).size
                ).toBe(
                    objectCount
                );


                /*
                 * INVARIANT:
                 *
                 * Every object in the second generation must be one of the
                 * objects released from the first generation.
                 */
                let unexpectedObject =
                    false;


                for (
                    const value
                    of secondGeneration
                    ) {
                    if (
                        !firstGenerationSet.has(
                            value
                        )
                    ) {
                        unexpectedObject =
                            true;

                        break;
                    }
                }


                expect(
                    unexpectedObject
                ).toBe(
                    false
                );
            }
        );


        test(
            "preserves ownership invariants through a large deterministic mixture of operations",
            () => {

                interface StressValue {
                    id:
                        number;
                }


                let nextId =
                    1;

                let createCount =
                    0;


                const pool =
                    createRefCountedPool(
                        (): StressValue => {

                            createCount++;


                            return {
                                id:
                                    nextId++
                            };
                        }
                    );


                /*
                 * This model exists only in the test.
                 *
                 * Production deliberately does not maintain an external
                 * reference-count table.
                 */
                const referenceCounts =
                    new Map<
                        StressValue,
                        number
                    >();


                /*
                 * Contains each currently live object exactly once,
                 * regardless of how many references that object has.
                 */
                const live:
                    StressValue[] =
                    [];


                const random =
                    createDeterministicRandom(
                        0x12ab34cd
                    );


                const operationCount =
                    250_000;


                let failure:
                    string
                    | undefined;


                for (
                    let operation = 0;
                    operation < operationCount;
                    operation++
                ) {

                    /*
                     * Bias the sequence towards keeping a useful but bounded
                     * live population.
                     *
                     * The important part is not statistical randomness. It is
                     * exercising a reproducible, irregular sequence of state
                     * transitions.
                     */
                    const choice =
                        random();


                    if (
                        live.length === 0
                        || (
                            live.length < 500
                            && choice < 0.30
                        )
                    ) {
                        /*
                         * Acquire.
                         */
                        const value =
                            pool.acquire();


                        const previousCount =
                            referenceCounts.get(
                                value
                            )
                            ?? 0;


                        /*
                         * INVARIANT:
                         *
                         * acquire() must never return an object which our
                         * model says still has a live reference.
                         */
                        if (
                            previousCount !== 0
                        ) {
                            failure =
                                "acquire returned an object with "
                                + `${previousCount} live reference(s) `
                                + `at operation ${operation}`;

                            break;
                        }


                        referenceCounts.set(
                            value,
                            1
                        );


                        live.push(
                            value
                        );


                        continue;
                    }


                    const liveIndex =
                        Math.floor(
                            random()
                            * live.length
                        );


                    const value =
                        live[
                            liveIndex
                            ];


                    const currentCount =
                        referenceCounts.get(
                            value
                        );


                    if (
                        currentCount === undefined
                        || currentCount <= 0
                    ) {
                        failure =
                            "test model selected a non-live object "
                            + `at operation ${operation}`;

                        break;
                    }


                    if (
                        choice < 0.65
                    ) {
                        /*
                         * Reuse.
                         */
                        pool.reuse(
                            value
                        );


                        referenceCounts.set(
                            value,
                            currentCount
                            + 1
                        );


                        continue;
                    }


                    /*
                     * Release.
                     */
                    pool.release(
                        value
                    );


                    const remaining =
                        currentCount
                        - 1;


                    referenceCounts.set(
                        value,
                        remaining
                    );


                    if (
                        remaining === 0
                    ) {
                        /*
                         * Remove the released object from live without
                         * allocating or shifting the rest of the array.
                         */
                        const last =
                            live.length
                            - 1;


                        live[
                            liveIndex
                            ] =
                            live[
                                last
                                ];


                        live.pop();
                    }
                }


                expect(
                    failure
                ).toBeUndefined();


                /*
                 * Final invariant check against the entire model.
                 */
                for (
                    const value
                    of live
                    ) {
                    const count =
                        referenceCounts.get(
                            value
                        );


                    if (
                        count === undefined
                        || count <= 0
                    ) {
                        failure =
                            `live object ${value.id} has invalid `
                            + `model reference count ${String(count)}`;

                        break;
                    }
                }


                expect(
                    failure
                ).toBeUndefined();


                /*
                 * Release every remaining modelled reference.
                 */
                for (
                    const value
                    of live
                    ) {
                    const count =
                        referenceCounts.get(
                            value
                        )!;


                    for (
                        let reference = 0;
                        reference < count;
                        reference++
                    ) {
                        pool.release(
                            value
                        );
                    }


                    referenceCounts.set(
                        value,
                        0
                    );
                }


                const createdBeforeReacquire =
                    createCount;


                /*
                 * Every object ever created should now have been completely
                 * released.
                 *
                 * We should therefore be able to acquire that many objects
                 * without invoking the factory again.
                 */
                const reacquired:
                    StressValue[] =
                    [];


                for (
                    let index = 0;
                    index < createdBeforeReacquire;
                    index++
                ) {
                    reacquired.push(
                        pool.acquire()
                    );
                }


                /*
                 * INVARIANT:
                 *
                 * No additional allocation was required.
                 */
                expect(
                    createCount
                ).toBe(
                    createdBeforeReacquire
                );


                /*
                 * INVARIANT:
                 *
                 * Every simultaneously live reacquisition is distinct.
                 */
                expect(
                    new Set(
                        reacquired
                    ).size
                ).toBe(
                    reacquired.length
                );
            }
        );
    }
);


/**
 * Small deterministic pseudo-random number generator.
 *
 * Stress tests should be irregular but reproducible. Using Math.random()
 * would make a failure difficult to reproduce.
 *
 * Returns values in the range [0, 1).
 */
function createDeterministicRandom(
    seed:
    number
): () => number {

    let state =
        seed >>> 0;


    return () => {

        /*
         * xorshift32
         */
        state ^=
            state << 13;

        state ^=
            state >>> 17;

        state ^=
            state << 5;


        state >>>=
            0;


        return state
            / 0x1_0000_0000;
    };
}