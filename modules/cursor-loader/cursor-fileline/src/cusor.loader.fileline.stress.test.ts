import {
    FILE_LINE_BUFFER_SIZE,
    createFileLineBufferPool
} from "./cursor.loader.fileline";


describe(
    "FileLineBufferPool stress",
    () => {
        test(
            "sustained bounded-concurrency load reuses buffers safely",
            () => {
                const pool =
                    createFileLineBufferPool();

                const active:
                    Uint8Array[] =
                    [];

                const activeSet =
                    new Set<Uint8Array>();

                const knownBuffers =
                    new Set<Uint8Array>();

                const iterations =
                    100_000;

                const maxConcurrent =
                    64;


                for (
                    let iteration = 0;
                    iteration < iterations;
                    iteration++
                ) {
                    /*
                     * Release one buffer whenever the simulated workload
                     * reaches its concurrency limit.
                     */

                    if (
                        active.length
                        >= maxConcurrent
                    ) {
                        const released =
                            active.shift();

                        if (
                            released === undefined
                        ) {
                            throw new Error(
                                "Active buffer state is invalid"
                            );
                        }


                        expect(
                            activeSet.delete(
                                released
                            )
                        ).toBe(
                            true
                        );


                        pool.release(
                            released
                        );
                    }


                    const buffer =
                        pool.acquire();


                    /*
                     * An acquired buffer must never already be active.
                     */

                    expect(
                        activeSet.has(
                            buffer
                        )
                    ).toBe(
                        false
                    );


                    active.push(
                        buffer
                    );

                    activeSet.add(
                        buffer
                    );

                    knownBuffers.add(
                        buffer
                    );


                    /*
                     * Exercise both ends of the buffer to make sure
                     * repeated reuse does not affect its usable size.
                     */

                    buffer[0] =
                        iteration & 0xff;

                    buffer[
                    FILE_LINE_BUFFER_SIZE - 1
                        ] =
                        (
                            iteration >>> 8
                        )
                        & 0xff;
                }


                while (
                    active.length > 0
                    ) {
                    const buffer =
                        active.pop();

                    if (
                        buffer === undefined
                    ) {
                        throw new Error(
                            "Active buffer state is invalid"
                        );
                    }


                    expect(
                        activeSet.delete(
                            buffer
                        )
                    ).toBe(
                        true
                    );


                    pool.release(
                        buffer
                    );
                }


                expect(
                    activeSet.size
                ).toBe(
                    0
                );


                /*
                 * With bounded concurrency, the pool should have needed
                 * no more than the high-water active population.
                 */

                expect(
                    knownBuffers.size
                ).toBe(
                    maxConcurrent
                );
            }
        );


        test(
            "repeated waves reuse the same high-water buffer population",
            () => {
                const pool =
                    createFileLineBufferPool();

                const concurrency =
                    256;

                const firstWave:
                    Uint8Array[] =
                    [];


                for (
                    let index = 0;
                    index < concurrency;
                    index++
                ) {
                    firstWave.push(
                        pool.acquire()
                    );
                }


                const knownBuffers =
                    new Set(
                        firstWave
                    );


                expect(
                    knownBuffers.size
                ).toBe(
                    concurrency
                );


                for (
                    const buffer
                    of firstWave
                    ) {
                    pool.release(
                        buffer
                    );
                }


                for (
                    let wave = 0;
                    wave < 1_000;
                    wave++
                ) {
                    const active:
                        Uint8Array[] =
                        [];


                    for (
                        let index = 0;
                        index < concurrency;
                        index++
                    ) {
                        const buffer =
                            pool.acquire();


                        expect(
                            knownBuffers.has(
                                buffer
                            )
                        ).toBe(
                            true
                        );


                        active.push(
                            buffer
                        );
                    }


                    expect(
                        new Set(
                            active
                        ).size
                    ).toBe(
                        concurrency
                    );


                    for (
                        const buffer
                        of active
                        ) {
                        pool.release(
                            buffer
                        );
                    }
                }
            }
        );


        test(
            "a large transient high-water mark remains fully reusable",
            () => {
                const pool =
                    createFileLineBufferPool();

                const count =
                    10_000;

                const firstWave:
                    Uint8Array[] =
                    [];


                for (
                    let index = 0;
                    index < count;
                    index++
                ) {
                    firstWave.push(
                        pool.acquire()
                    );
                }


                expect(
                    new Set(
                        firstWave
                    ).size
                ).toBe(
                    count
                );


                const knownBuffers =
                    new Set(
                        firstWave
                    );


                for (
                    const buffer
                    of firstWave
                    ) {
                    pool.release(
                        buffer
                    );
                }


                const secondWave:
                    Uint8Array[] =
                    [];


                for (
                    let index = 0;
                    index < count;
                    index++
                ) {
                    const buffer =
                        pool.acquire();


                    expect(
                        knownBuffers.has(
                            buffer
                        )
                    ).toBe(
                        true
                    );


                    secondWave.push(
                        buffer
                    );
                }


                expect(
                    new Set(
                        secondWave
                    ).size
                ).toBe(
                    count
                );
            }
        );


        test(
            "mixed acquire and release operations never alias active buffers",
            () => {
                const pool =
                    createFileLineBufferPool();

                const active:
                    Uint8Array[] =
                    [];

                const activeSet =
                    new Set<Uint8Array>();

                const iterations =
                    250_000;


                for (
                    let iteration = 0;
                    iteration < iterations;
                    iteration++
                ) {
                    /*
                     * Deterministic mixed workload.
                     *
                     * Roughly one third of operations release a buffer;
                     * the others acquire one.
                     */

                    if (
                        active.length > 0
                        && iteration % 3 === 0
                    ) {
                        const index =
                            iteration
                            % active.length;

                        const buffer =
                            active[index];

                        const last =
                            active.pop();

                        if (
                            last === undefined
                        ) {
                            throw new Error(
                                "Active buffer state is invalid"
                            );
                        }


                        if (
                            index
                            < active.length
                        ) {
                            active[index] =
                                last;
                        }


                        expect(
                            activeSet.delete(
                                buffer
                            )
                        ).toBe(
                            true
                        );


                        pool.release(
                            buffer
                        );

                        continue;
                    }


                    const buffer =
                        pool.acquire();


                    expect(
                        activeSet.has(
                            buffer
                        )
                    ).toBe(
                        false
                    );


                    active.push(
                        buffer
                    );

                    activeSet.add(
                        buffer
                    );
                }


                for (
                    const buffer
                    of active
                    ) {
                    expect(
                        activeSet.delete(
                            buffer
                        )
                    ).toBe(
                        true
                    );


                    pool.release(
                        buffer
                    );
                }


                expect(
                    activeSet.size
                ).toBe(
                    0
                );
            }
        );


        test(
            "all acquired buffers always have the fixed line-buffer size",
            () => {
                const pool =
                    createFileLineBufferPool();

                const iterations =
                    100_000;


                for (
                    let iteration = 0;
                    iteration < iterations;
                    iteration++
                ) {
                    const buffer =
                        pool.acquire();


                    expect(
                        buffer.length
                    ).toBe(
                        FILE_LINE_BUFFER_SIZE
                    );


                    pool.release(
                        buffer
                    );
                }
            }
        );
    }
);