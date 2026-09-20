import {
    FILE_LINE_BUFFER_SIZE,
    createFileLineBufferPool
} from "./cursor.loader.fileline";


describe(
    "file line buffer pool",
    () => {
        test(
            "acquires a fixed-size buffer",
            () => {
                const pool =
                    createFileLineBufferPool();

                const buffer =
                    pool.acquire();

                expect(
                    buffer
                ).toBeInstanceOf(
                    Uint8Array
                );

                expect(
                    buffer.length
                ).toBe(
                    FILE_LINE_BUFFER_SIZE
                );
            }
        );


        test(
            "acquires different buffers while previous buffers are still in use",
            () => {
                const pool =
                    createFileLineBufferPool();

                const first =
                    pool.acquire();

                const second =
                    pool.acquire();

                const third =
                    pool.acquire();

                expect(
                    second
                ).not.toBe(
                    first
                );

                expect(
                    third
                ).not.toBe(
                    first
                );

                expect(
                    third
                ).not.toBe(
                    second
                );
            }
        );


        test(
            "reuses a released buffer",
            () => {
                const pool =
                    createFileLineBufferPool();

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
            }
        );


        test(
            "released buffers remain unchanged until reused",
            () => {
                const pool =
                    createFileLineBufferPool();

                const buffer =
                    pool.acquire();

                buffer[0] =
                    17;

                buffer[
                FILE_LINE_BUFFER_SIZE - 1
                    ] =
                    99;

                pool.release(
                    buffer
                );

                const reused =
                    pool.acquire();

                expect(
                    reused
                ).toBe(
                    buffer
                );

                expect(
                    reused[0]
                ).toBe(
                    17
                );

                expect(
                    reused[
                    FILE_LINE_BUFFER_SIZE - 1
                        ]
                ).toBe(
                    99
                );
            }
        );


        test(
            "does not clear a reused buffer",
            () => {
                const pool =
                    createFileLineBufferPool();

                const buffer =
                    pool.acquire();

                buffer[123] =
                    42;

                pool.release(
                    buffer
                );

                const reused =
                    pool.acquire();

                expect(
                    reused[123]
                ).toBe(
                    42
                );
            }
        );


        test(
            "rejects a buffer with the wrong size",
            () => {
                const pool =
                    createFileLineBufferPool();

                const invalid =
                    new Uint8Array(
                        FILE_LINE_BUFFER_SIZE + 1
                    );

                expect(
                    () =>
                        pool.release(
                            invalid
                        )
                ).toThrow(
                    "File line buffer has an invalid size"
                );
            }
        );


        test(
            "rejects a buffer smaller than the required size",
            () => {
                const pool =
                    createFileLineBufferPool();

                const invalid =
                    new Uint8Array(
                        FILE_LINE_BUFFER_SIZE - 1
                    );

                expect(
                    () =>
                        pool.release(
                            invalid
                        )
                ).toThrow(
                    "File line buffer has an invalid size"
                );
            }
        );


        test(
            "reuses all buffers from a released population",
            () => {
                const pool =
                    createFileLineBufferPool();

                const count =
                    1000;

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


                for (
                    const buffer
                    of firstWave
                    ) {
                    pool.release(
                        buffer
                    );
                }


                const firstWaveSet =
                    new Set(
                        firstWave
                    );

                const secondWave:
                    Uint8Array[] =
                    [];


                for (
                    let index = 0;
                    index < count;
                    index++
                ) {
                    secondWave.push(
                        pool.acquire()
                    );
                }


                expect(
                    new Set(
                        secondWave
                    ).size
                ).toBe(
                    count
                );


                for (
                    const buffer
                    of secondWave
                    ) {
                    expect(
                        firstWaveSet.has(
                            buffer
                        )
                    ).toBe(
                        true
                    );
                }
            }
        );


        test(
            "supports repeated high-water reuse without creating aliases",
            () => {
                const pool =
                    createFileLineBufferPool();

                const count =
                    256;

                let knownBuffers:
                    Set<Uint8Array>
                    | undefined;


                for (
                    let iteration = 0;
                    iteration < 1000;
                    iteration++
                ) {
                    const active:
                        Uint8Array[] =
                        [];


                    for (
                        let index = 0;
                        index < count;
                        index++
                    ) {
                        active.push(
                            pool.acquire()
                        );
                    }


                    expect(
                        new Set(
                            active
                        ).size
                    ).toBe(
                        count
                    );


                    if (
                        knownBuffers === undefined
                    ) {
                        knownBuffers =
                            new Set(
                                active
                            );
                    } else {
                        for (
                            const buffer
                            of active
                            ) {
                            expect(
                                knownBuffers.has(
                                    buffer
                                )
                            ).toBe(
                                true
                            );
                        }
                    }


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
            "can sustain a large temporary high-water mark and reuse it",
            () => {
                const pool =
                    createFileLineBufferPool();

                const count =
                    10_000;

                const buffers:
                    Uint8Array[] =
                    [];


                for (
                    let index = 0;
                    index < count;
                    index++
                ) {
                    buffers.push(
                        pool.acquire()
                    );
                }


                expect(
                    new Set(
                        buffers
                    ).size
                ).toBe(
                    count
                );


                for (
                    const buffer
                    of buffers
                    ) {
                    pool.release(
                        buffer
                    );
                }


                const original =
                    new Set(
                        buffers
                    );


                for (
                    let index = 0;
                    index < count;
                    index++
                ) {
                    const reused =
                        pool.acquire();

                    expect(
                        original.has(
                            reused
                        )
                    ).toBe(
                        true
                    );
                }
            }
        );
    }
);