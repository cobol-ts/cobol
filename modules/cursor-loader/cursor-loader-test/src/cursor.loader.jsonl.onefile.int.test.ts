import {
    createErrorsOrFileCursor,
    createFileCursor,
    createIgnoringFileCursor,
    createThrowingFileCursor,
    type FileCursorResult
} from "@cobol-ts/cursor-file";

import {type Errors, isValue} from "@cobol-ts/errors";

import {type Customer, type MinimalCustomer} from "./cursor.loader.fixture";

import {
    badJsonCustomerJsonlDefinition,
    createJsonlFixtureFile,
    createJsonlInfrastructure,
    customerJsonlDefinition,
    lazyErrorCustomerJsonlDefinition,
    minimalCustomerJsonlDefinition
} from "./cursor.loader.jsonl.fixture";


describe("JSONL file cursor integration",() => {
    test("loads complete customers including nested paths",async () => {
        const customers: CustomerValue[] = [];

        const cursor =
            createFileCursor(
                customerJsonlDefinition,
                createJsonlFixtureFile(
                    customerJsonlDefinition.filename
                ),
                createJsonlInfrastructure(7)
            );

        for await (const result of cursor) {
            const row =
                projectedValue(result);

            customers.push(
                readCustomer(
                    row.result
                )
            );

            row.close();
        }

        expect(customers).toEqual([
            {
                id: 1001,
                name: "Alice Smith",
                age: 42,
                address: {
                    line1: "12 High Street",
                    line2: "Flat 2, Rear",
                    postcode: "SW1A 1AA"
                },
                status: "A",
                balance: 1234.56
            },
            {
                id: 1002,
                name: "Bob Jones",
                age: 37,
                address: {
                    line1: "8 Station Road",
                    line2: "",
                    postcode: "LS1 4AB"
                },
                status: "I",
                balance: 98.75
            },
            {
                id: 1003,
                name: "Carol Brown",
                age: 29,
                address: {
                    line1: "The Old Mill",
                    line2: "Riverside, East Wing",
                    postcode: "BS1 5TY"
                },
                status: "A",
                balance: 0
            }
        ]);
    });


    test("loads a different projection from the same JSONL records",async () => {
        const customers:
            MinimalCustomerValue[] =
            [];

        const cursor =
            createFileCursor(
                minimalCustomerJsonlDefinition,
                createJsonlFixtureFile(
                    minimalCustomerJsonlDefinition.filename
                ),
                createJsonlInfrastructure(5)
            );

        for await (const result of cursor) {
            const row =
                projectedValue(result);

            customers.push(
                readMinimalCustomer(
                    row.result
                )
            );

            row.close();
        }

        expect(customers).toEqual([
            {
                id: 1001,
                status: "A"
            },
            {
                id: 1002,
                status: "I"
            },
            {
                id: 1003,
                status: "A"
            }
        ]);
    });


    test("returns a malformed JSON row as string errors and continues",async () => {
        const results:
            Array<number | string[]> =
            [];

        const cursor =
            createFileCursor(
                badJsonCustomerJsonlDefinition,
                createJsonlFixtureFile(
                    badJsonCustomerJsonlDefinition.filename
                ),
                createJsonlInfrastructure(6)
            );

        for await (const result of cursor) {
            if (Array.isArray(result)) {
                results.push(result);
                continue;
            }

            results.push(
                result.result.id()
            );

            result.close();
        }

        expect(results).toHaveLength(3);
        expect(results[0]).toBe(1001);
        expect(results[2]).toBe(1003);

        const malformed =
            results[1];

        if (!Array.isArray(malformed)) {
            throw new Error(
                "Expected malformed JSON row to return string[]"
            );
        }

        expect(malformed).toHaveLength(1);

        expect(
            malformed[0]
        ).toContain(
            "JSON parse"
        );
    });


    test("rebinds pooled projections and reports the current record in lazy errors",async () => {
        const cursor =
            createFileCursor(
                lazyErrorCustomerJsonlDefinition,
                createJsonlFixtureFile(
                    lazyErrorCustomerJsonlDefinition.filename
                ),
                createJsonlInfrastructure(7)
            );

        const first =
            projectedValue(
                cursorValue(
                    await cursor.next()
                )
            );

        const reusedProjection =
            first.result;

        expect(
            first.result.id()
        ).toBe(
            1001
        );

        expect(
            first.result.name()
        ).toBe(
            "Alice Smith"
        );

        expect(
            first.result.age()
        ).toBe(
            42
        );

        first.close();

        expect(
            () =>
                reusedProjection.name()
        ).toThrow(
            "Projection is not bound to a record"
        );

        const second =
            projectedValue(
                cursorValue(
                    await cursor.next()
                )
            );

        expect(
            second.result
        ).toBe(
            reusedProjection
        );

        expect(
            second.result.id()
        ).toBe(
            1002
        );

        expect(
            second.result.name()
        ).toBe(
            "Broken Age"
        );

        const error =
            thrownError(
                () =>
                    second.result.age()
            );

        expect(
            error.message
        ).toBe(
            `${lazyErrorCustomerJsonlDefinition.filename}: record 2: projection age: `
            + `JSON value is string "forty two"; expected an integer.\n`
            + `{"id":1002,"name":"Broken Age","age":"forty two","address":{"line1":"8 Station Road","line2":"","postcode":"LS1 4AB"},"status":"I","balance":98.75}\n`
        );

        second.close();

        expect(
            () =>
                reusedProjection.name()
        ).toThrow(
            "Projection is not bound to a record"
        );

        const third =
            projectedValue(
                cursorValue(
                    await cursor.next()
                )
            );

        expect(
            third.result
        ).toBe(
            reusedProjection
        );

        expect(
            third.result.id()
        ).toBe(
            1003
        );

        expect(
            third.result.name()
        ).toBe(
            "Carol Brown"
        );

        expect(
            third.result.age()
        ).toBe(
            29
        );

        third.close();
    });


    test("returns row errors through ErrorsOr and continues",async () => {
        const results:
            Array<number | "error"> =
            [];

        const cursor =
            createErrorsOrFileCursor(
                badJsonCustomerJsonlDefinition,
                createJsonlFixtureFile(
                    badJsonCustomerJsonlDefinition.filename
                ),
                createJsonlInfrastructure(7)
            );

        for await (const result of cursor) {
            if (!isValue(result)) {
                results.push(
                    "error"
                );

                continue;
            }

            results.push(
                result.value.result.id()
            );

            result.value.close();
        }

        expect(results).toEqual([
            1001,
            "error",
            1003
        ]);
    });


    test("throws on the first row error in the throwing cursor",async () => {
        const cursor =
            createThrowingFileCursor(
                badJsonCustomerJsonlDefinition,
                createJsonlFixtureFile(
                    badJsonCustomerJsonlDefinition.filename
                ),
                createJsonlInfrastructure(7)
            );

        const first =
            cursorValue(
                await cursor.next()
            );

        expect(
            first.result.id()
        ).toBe(
            1001
        );

        first.close();

        await expect(
            cursor.next()
        ).rejects.toEqual(
            expect.objectContaining({
                name:
                    "ErrorsException"
            })
        );
    });


    test("ignores row errors, calls onError and continues",async () => {
        const ids: number[] = [];
        const errors: Errors[] = [];

        const cursor =
            createIgnoringFileCursor(
                badJsonCustomerJsonlDefinition,
                createJsonlFixtureFile(
                    badJsonCustomerJsonlDefinition.filename
                ),
                createJsonlInfrastructure(7),
                error =>
                    errors.push(error)
            );

        for await (const result of cursor) {
            ids.push(
                result.result.id()
            );

            result.close();
        }

        expect(ids).toEqual([
            1001,
            1003
        ]);

        expect(errors).toHaveLength(1);

        expect(
            errors[0].errors[0]
        ).toContain(
            "JSON parse"
        );
    });
});


function isIteratorYieldResult<T>(
    result: IteratorResult<T,void>
): result is IteratorYieldResult<T> {
    return result.done !== true;
}


function cursorValue<T>(
    result: IteratorResult<T,void>
): T {
    if (!isIteratorYieldResult(result)) {
        throw new Error(
            "Expected cursor value"
        );
    }

    return result.value;
}


function thrownError(
    action: () => void
): Error {
    try {
        action();
    } catch (error) {
        if (error instanceof Error) {
            return error;
        }

        throw error;
    }

    throw new Error(
        "Expected action to throw"
    );
}


function projectedValue<T>(
    result:
        FileCursorResult<T>
        | string[]
): FileCursorResult<T> {
    if (Array.isArray(result)) {
        throw new Error(
            `Expected projected value but got errors: ${result.join(", ")}`
        );
    }

    return result;
}


interface CustomerValue {
    readonly id: number;
    readonly name: string;
    readonly age: number;

    readonly address: {
        readonly line1: string;
        readonly line2: string;
        readonly postcode: string;
    };

    readonly status: string;
    readonly balance: number;
}


interface MinimalCustomerValue {
    readonly id: number;
    readonly status: string;
}


function readCustomer(
    customer: Customer
): CustomerValue {
    return {
        id:
            customer.id(),

        name:
            customer.name(),

        age:
            customer.age(),

        address: {
            line1:
                customer.addressLine1(),

            line2:
                customer.addressLine2(),

            postcode:
                customer.postcode()
        },

        status:
            customer.status(),

        balance:
            customer.balance()
    };
}


function readMinimalCustomer(
    customer: MinimalCustomer
): MinimalCustomerValue {
    return {
        id:
            customer.id(),

        status:
            customer.status()
    };
}