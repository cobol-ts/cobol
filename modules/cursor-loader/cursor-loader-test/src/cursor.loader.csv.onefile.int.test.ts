import {
    createFileCursor,
    type FileCursorResult
} from "@cobol-ts/cursor-file";

import {
    ErrorsException
} from "@cobol-ts/errors";

import {
    type Customer,
    type MinimalCustomer
} from "./cursor.loader.fixture";

import {
    badHeaderCustomerCsvDefinition,
    createCsvFixtureFile,
    createCsvInfrastructure,
    customerCsvDefinition,
    minimalCustomerCsvDefinition,
    pipeCustomerCsvDefinition,
    richCustomerCsvDefinition,
    unterminatedCustomerCsvDefinition,
    widthErrorCustomerCsvDefinition
} from "./cursor.loader.csv.fixture";


describe("CSV file cursor integration",() => {
    test("loads complete customers including quoted fields",async () => {
        const customers: CustomerValue[] = [];

        const cursor =
            createFileCursor(
                customerCsvDefinition,
                createCsvFixtureFile(
                    customerCsvDefinition.filename
                ),
                createCsvInfrastructure(7)
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


    test("loads a different projection from the same CSV records",async () => {
        const customers: MinimalCustomerValue[] = [];

        const cursor =
            createFileCursor(
                minimalCustomerCsvDefinition,
                createCsvFixtureFile(
                    minimalCustomerCsvDefinition.filename
                ),
                createCsvInfrastructure(5)
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


    test("loads quoted commas doubled quotes empty fields and quoted numbers",async () => {
        const customers: CustomerValue[] = [];

        const cursor =
            createFileCursor(
                richCustomerCsvDefinition,
                createCsvFixtureFile(
                    richCustomerCsvDefinition.filename
                ),
                createCsvInfrastructure(11)
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
            },
            {
                id: 1004,
                name: "David Green",
                age: 51,
                address: {
                    line1: "7 King's Road",
                    line2: "He said \"use the rear entrance\"",
                    postcode: "M1 2AB"
                },
                status: "A",
                balance: 42.10
            },
            {
                id: 1005,
                name: "Eve Black",
                age: 33,
                address: {
                    line1: "Apartment 4",
                    line2: "Floor 2, \"West Wing\"",
                    postcode: "EH1 1AA"
                },
                status: "I",
                balance: 100
            },
            {
                id: 1006,
                name: "Frank White",
                age: 60,
                address: {
                    line1: "1 Market Street",
                    line2: "",
                    postcode: "AB1 2CD"
                },
                status: "A",
                balance: 123.45
            },
            {
                id: 1007,
                name: "Grace Blue",
                age: 44,
                address: {
                    line1: "2 River Road",
                    line2: "Comma, and \"quotes\" together",
                    postcode: "YO1 7AA"
                },
                status: "A",
                balance: 9.50
            }
        ]);
    });


    test("uses the CSV configuration selected by the file definition",async () => {
        const customers: CustomerValue[] = [];

        const cursor =
            createFileCursor(
                pipeCustomerCsvDefinition,
                createCsvFixtureFile(
                    pipeCustomerCsvDefinition.filename
                ),
                createCsvInfrastructure(9)
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
                id: 2001,
                name: "Alice Pipe",
                age: 40,
                address: {
                    line1: "10 North | Road",
                    line2: "Wing | A",
                    postcode: "P1 1AA"
                },
                status: "A",
                balance: 12.50
            },
            {
                id: 2002,
                name: "Bob Pipe",
                age: 41,
                address: {
                    line1: "20 South Road",
                    line2: "He said \"hello\"",
                    postcode: "P2 2BB"
                },
                status: "I",
                balance: 20
            },
            {
                id: 2003,
                name: "Carol Pipe",
                age: 42,
                address: {
                    line1: "30 East Road",
                    line2: "",
                    postcode: "P3 3CC"
                },
                status: "A",
                balance: 0
            }
        ]);
    });


    test("returns a physical-width row error and continues",async () => {
        const results: Array<number | string[]> = [];

        const cursor =
            createFileCursor(
                widthErrorCustomerCsvDefinition,
                createCsvFixtureFile(
                    widthErrorCustomerCsvDefinition.filename
                ),
                createCsvInfrastructure(7)
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

        expect(results).toEqual([
            1001,
            [
                "CSV record has 9 columns; header has 8"
            ],
            1003
        ]);
    });


    test("throws when CSV header preparation fails",async () => {
        const cursor =
            createFileCursor(
                badHeaderCustomerCsvDefinition,
                createCsvFixtureFile(
                    badHeaderCustomerCsvDefinition.filename
                ),
                createCsvInfrastructure(7)
            );

        await expectErrorsException(
            cursor.next(),
            [
                "CSV header is missing required columns: "
                + "\"addressLine2\", \"postcode\", \"balance\". "
                + "Actual header columns are: "
                + "\"id\", \"name\", \"age\", \"addressLine1\", \"status\"."
            ]
        );
    });


    test("does not treat a newline inside an unterminated quoted field as a record boundary",async () => {
        const results: Array<number | string[]> = [];

        const cursor =
            createFileCursor(
                unterminatedCustomerCsvDefinition,
                createCsvFixtureFile(
                    unterminatedCustomerCsvDefinition.filename
                ),
                createCsvInfrastructure(7)
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

        expect(results).toEqual([
            1001,
            [
                "CSV record column 5 contains an unterminated quoted field at byte 129"
            ]
        ]);
    });
});


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


async function expectErrorsException(
    promise: Promise<unknown>,
    expectedErrors: string[]
): Promise<void> {
    try {
        await promise;
    } catch (error) {
        if (!(error instanceof ErrorsException)) {
            throw error;
        }

        expect(error.errors).toEqual(
            expectedErrors
        );

        return;
    }

    throw new Error(
        "Expected ErrorsException"
    );
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