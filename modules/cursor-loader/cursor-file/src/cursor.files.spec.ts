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


function cursorValue<T>(result: IteratorResult<T, void>): T {
    if ("done" in result && result.done === true) {
        throw new Error("Expected cursor value");
    }

    if (!("value" in result)) {
        throw new Error("Expected iterator yield result");
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


function customerProjection(): ProjectionFactory<Customer, Representation> {
    return {
        create(representation): Customer {
            return {
                name: () => representation.name
            };
        }
    };
}


function physicalRecord(
    onClose: () => void
): PhysicalRecordContent<undefined> {
    return {
        buffers: [],
        recordState: undefined,
        startByte: 0,
        endByte: 0,
        lastValidByte: 0,
        fileFinished: true,
        close: onClose
    };
}


function recordCursor(
    ...records: RecordCursorResult<Representation, undefined>[]
): RecordCursor<Representation, undefined> {
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
            recordCursor(
                {
                    result: {
                        name: "Alice"
                    },
                    physicalRecord: physicalRecord(
                        () => closeCount++
                    )
                }
            ),
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
            recordCursor(
                {
                    result: {
                        errors: [
                            "bad row"
                        ]
                    },
                    physicalRecord: physicalRecord(
                        () => closeCount++
                    )
                }
            ),
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
});


describe("createErrorsOrFileCursor", () => {

    test("wraps a successful row in ErrorsOr", async () => {
        const cursor = createErrorsOrFileCursor(
            recordCursor(
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
            recordCursor(
                {
                    result: errors,
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

        expect(result).toBe(errors);
    });
});


describe("createThrowingFileCursor", () => {

    test("throws ErrorsException for a row error", async () => {
        let closeCount = 0;

        const cursor = createThrowingFileCursor(
            recordCursor(
                {
                    result: {
                        errors: [
                            "bad row"
                        ],
                        reference: "row-7"
                    },
                    physicalRecord: physicalRecord(
                        () => closeCount++
                    )
                }
            ),
            customerProjection()
        );

        await expect(
            cursor.next()
        ).rejects.toEqual(
            expect.objectContaining(
                {
                    name: "ErrorsException",
                    errors: [
                        "bad row"
                    ],
                    reference: "row-7"
                }
            )
        );

        expect(closeCount).toBe(1);
    });


    test("returns successful rows normally", async () => {
        const cursor = createThrowingFileCursor(
            recordCursor(
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
            recordCursor(
                {
                    result: errors,
                    physicalRecord: physicalRecord(
                        () => undefined
                    )
                }
            ),
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

    test("closes the physical record before propagating the exception", async () => {
        let closeCount = 0;

        const projection: ProjectionFactory<Customer, Representation> = {
            create(): Customer {
                throw new Error("projection failed");
            }
        };

        const cursor = createFileCursor(
            recordCursor(
                {
                    result: {
                        name: "Alice"
                    },
                    physicalRecord: physicalRecord(
                        () => closeCount++
                    )
                }
            ),
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
