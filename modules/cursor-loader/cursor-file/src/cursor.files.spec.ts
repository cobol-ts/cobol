import {type Errors, isValue} from "@cobol-ts/errors";

import {
    type PhysicalRecordContent,
    type ProjectionFactory,
    type RecordCursor,
    type RecordCursorResult
} from "@cobol-ts/cursor-loader-types";

import {
    createErrorsOrFileCursor,
    createFileCursor,
    createIgnoringFileCursor,
    createThrowingFileCursor
} from "./cursor.file";

import {type FileCursorResult} from "./cursor.file.result";


interface Customer {
    name(): string;
}


type Representation = {
    name: string;
};


function cursorValue<T>(result: IteratorResult<T,void>): T {
    if (result.done === true) {
        throw new Error("Expected cursor value");
    }

    return result.value;
}


function projectedValue<T>(
    result: FileCursorResult<T> | string[]
): FileCursorResult<T> {
    if (Array.isArray(result)) {
        throw new Error(
            `Expected projected value but got errors: ${result.join(", ")}`
        );
    }

    return result;
}


function customerProjection(): ProjectionFactory<Customer,Representation> {
    const bindings = new WeakMap<Customer,Representation>();

    return {
        create(): Customer {
            const projection: Customer = {
                name: () => {
                    const representation = bindings.get(projection);

                    if (representation === undefined) {
                        throw new Error("Projection is not bound");
                    }

                    return representation.name;
                }
            };

            return projection;
        },

        bind(projection, representation): void {
            bindings.set(projection, representation);
        },

        clear(projection): void {
            bindings.delete(projection);
        }
    };
}


function physicalRecord(onClose: () => void): PhysicalRecordContent<undefined> {
    return {
        buffers: [],
        recordState: undefined,
        startByte: 0,
        endByte: 0,
        lastValidByte: 0,
        fileFinished: true,
        source: "test-source",
        recordNumber: 1,
        close: onClose
    };
}


function recordCursor(
    ...records: RecordCursorResult<Representation,undefined>[]
): RecordCursor<Representation,undefined> {
    return (
        async function* () {
            for (const record of records) {
                yield record;
            }
        }
    )();
}


describe("createFileCursor", () => {
    test("returns a projected value", async () => {
        let closeCount = 0;

        const cursor = createFileCursor(
            recordCursor({
                result: {
                    name: "Alice"
                },
                physicalRecord: physicalRecord(
                    () => closeCount++
                )
            }),
            customerProjection()
        );

        const result = projectedValue(
            cursorValue(
                await cursor.next()
            )
        );

        expect(result.result.name()).toBe("Alice");
        expect(closeCount).toBe(0);

        result.close();

        expect(closeCount).toBe(1);
    });


    test("returns string errors and closes the failed physical record", async () => {
        let closeCount = 0;

        const cursor = createFileCursor(
            recordCursor({
                result: {
                    errors: [
                        "bad row"
                    ]
                },
                physicalRecord: physicalRecord(
                    () => closeCount++
                )
            }),
            customerProjection()
        );

        const result = cursorValue(
            await cursor.next()
        );

        expect(result).toEqual([
            "bad row"
        ]);

        expect(closeCount).toBe(1);
    });


    test("clears the projection and closes the physical record when the result closes", async () => {
        let clearCount = 0;
        let closeCount = 0;

        const base = customerProjection();

        const projection: ProjectionFactory<Customer,Representation> = {
            create: base.create,
            bind: base.bind,

            clear(value): void {
                clearCount++;
                base.clear(value);
            }
        };

        const cursor = createFileCursor(
            recordCursor({
                result: {
                    name: "Alice"
                },
                physicalRecord: physicalRecord(
                    () => closeCount++
                )
            }),
            projection
        );

        const result = projectedValue(
            cursorValue(
                await cursor.next()
            )
        );

        expect(result.result.name()).toBe("Alice");
        expect(clearCount).toBe(0);
        expect(closeCount).toBe(0);

        result.close();

        expect(clearCount).toBe(1);
        expect(closeCount).toBe(1);
    });
});


describe("createErrorsOrFileCursor", () => {
    test("wraps a successful row in ErrorsOr", async () => {
        const cursor = createErrorsOrFileCursor(
            recordCursor({
                result: {
                    name: "Alice"
                },
                physicalRecord: physicalRecord(
                    () => undefined
                )
            }),
            customerProjection()
        );

        const result = cursorValue(
            await cursor.next()
        );

        if (!isValue(result)) {
            throw new Error("Expected value");
        }

        expect(result.value.result.name()).toBe("Alice");

        result.value.close();
    });


    test("returns Errors unchanged", async () => {
        const errors: Errors = {
            errors: [
                "bad row"
            ],
            reference: "row-7"
        };

        const cursor = createErrorsOrFileCursor(
            recordCursor({
                result: errors,
                physicalRecord: physicalRecord(
                    () => undefined
                )
            }),
            customerProjection()
        );

        const result = cursorValue(
            await cursor.next()
        );

        expect(result).toBe(errors);
    });
});


describe("createThrowingFileCursor", () => {
    test("throws ErrorsException for a row error", async () => {
        let closeCount = 0;

        const cursor = createThrowingFileCursor(
            recordCursor({
                result: {
                    errors: [
                        "bad row"
                    ],
                    reference: "row-7"
                },
                physicalRecord: physicalRecord(
                    () => closeCount++
                )
            }),
            customerProjection()
        );

        await expect(
            cursor.next()
        ).rejects.toEqual(
            expect.objectContaining({
                name: "ErrorsException",
                errors: [
                    "bad row"
                ],
                reference: "row-7"
            })
        );

        expect(closeCount).toBe(1);
    });


    test("returns successful rows normally", async () => {
        const cursor = createThrowingFileCursor(
            recordCursor({
                result: {
                    name: "Alice"
                },
                physicalRecord: physicalRecord(
                    () => undefined
                )
            }),
            customerProjection()
        );

        const result = cursorValue(
            await cursor.next()
        );

        expect(result.result.name()).toBe("Alice");

        result.close();
    });
});


describe("createIgnoringFileCursor", () => {
    test("skips errors and continues to the next successful row", async () => {
        let failedCloseCount = 0;

        const cursor = createIgnoringFileCursor(
            recordCursor(
                {
                    result: {
                        errors: [
                            "bad row"
                        ]
                    },
                    physicalRecord: physicalRecord(
                        () => failedCloseCount++
                    )
                },
                {
                    result: {
                        name: "Alice"
                    },
                    physicalRecord: physicalRecord(
                        () => undefined
                    )
                }
            ),
            customerProjection()
        );

        const result = cursorValue(
            await cursor.next()
        );

        expect(failedCloseCount).toBe(1);
        expect(result.result.name()).toBe("Alice");

        result.close();
    });


    test("calls onError with the full Errors object", async () => {
        const received: Errors[] = [];

        const errors: Errors = {
            errors: [
                "bad row"
            ],
            reference: "row-7",
            extras: {
                line: 7
            }
        };

        const cursor = createIgnoringFileCursor(
            recordCursor({
                result: errors,
                physicalRecord: physicalRecord(
                    () => undefined
                )
            }),
            customerProjection(),
            error => received.push(error)
        );

        const next = await cursor.next();

        expect(next.done).toBe(true);
        expect(received).toEqual([
            errors
        ]);
    });
});


describe("projection failure", () => {
    test("closes the physical record before propagating a binding exception", async () => {
        let closeCount = 0;

        const projection: ProjectionFactory<Customer,Representation> = {
            create(): Customer {
                return {
                    name: () => {
                        throw new Error("Projection is not bound");
                    }
                };
            },

            bind(): void {
                throw new Error("projection failed");
            },

            clear(): void {
                // Nothing was successfully bound.
            }
        };

        const cursor = createFileCursor(
            recordCursor({
                result: {
                    name: "Alice"
                },
                physicalRecord: physicalRecord(
                    () => closeCount++
                )
            }),
            projection
        );

        await expect(
            cursor.next()
        ).rejects.toThrow(
            "projection failed"
        );

        expect(closeCount).toBe(1);
    });
});