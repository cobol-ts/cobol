import {
    type ProjectionPhysicalRecord
} from "@cobol-ts/cursor-loader-types";

import {
    createProjection,
    defineProjection
} from "./create.projection";

import {
    customerProjection,
    fakeParser,
    orderSummaryProjection
} from "./projection.fixture";


describe("createProjection",() => {
    test("creates a projection over a flat representation",() => {
        const factory = createProjection(
            fakeParser,
            undefined,
            undefined,
            customerProjection
        );

        const customer = factory.create();

        factory.bind(
            customer,
            {
                id: 101,
                age: 47,
                name: "Alice",
                initial: "A",
                balance: 123.45
            },
            physicalRecord()
        );

        expect(customer.id()).toBe(101);
        expect(customer.age()).toBe(47);
        expect(customer.name()).toBe("Alice");
        expect(customer.initial()).toBe("A");
        expect(customer.balance()).toBe(123.45);

        factory.clear(customer);
    });


    test("uses explicit nested paths",() => {
        const factory = createProjection(
            fakeParser,
            undefined,
            undefined,
            orderSummaryProjection
        );

        const order = factory.create();

        factory.bind(
            order,
            {
                order: {
                    id: 7001,
                    customer: {
                        name: "Bob"
                    },
                    total: 88.5
                }
            },
            physicalRecord()
        );

        expect(order.orderId()).toBe(7001);
        expect(order.customerName()).toBe("Bob");
        expect(order.total()).toBe(88.5);

        factory.clear(order);
    });


    test("created projections are independent",() => {
        const factory = createProjection(
            fakeParser,
            undefined,
            undefined,
            customerProjection
        );

        const first = factory.create();
        const second = factory.create();

        factory.bind(
            first,
            {
                id: 1,
                age: 20,
                name: "First",
                initial: "F",
                balance: 10.5
            },
            physicalRecord(1)
        );

        factory.bind(
            second,
            {
                id: 2,
                age: 30,
                name: "Second",
                initial: "S",
                balance: 20.5
            },
            physicalRecord(2)
        );

        expect(first.id()).toBe(1);
        expect(first.name()).toBe("First");
        expect(second.id()).toBe(2);
        expect(second.name()).toBe("Second");

        factory.clear(first);
        factory.clear(second);
    });


    test("rebinds the same projection after clear",() => {
        const factory = createProjection(
            fakeParser,
            undefined,
            undefined,
            customerProjection
        );

        const customer = factory.create();

        factory.bind(
            customer,
            {
                id: 1,
                age: 20,
                name: "First",
                initial: "F",
                balance: 10.5
            },
            physicalRecord(1)
        );

        expect(customer.id()).toBe(1);
        expect(customer.name()).toBe("First");

        factory.clear(customer);

        factory.bind(
            customer,
            {
                id: 2,
                age: 30,
                name: "Second",
                initial: "S",
                balance: 20.5
            },
            physicalRecord(2)
        );

        expect(customer.id()).toBe(2);
        expect(customer.name()).toBe("Second");

        factory.clear(customer);
    });


    test("rejects access while unbound",() => {
        const factory = createProjection(
            fakeParser,
            undefined,
            undefined,
            customerProjection
        );

        const customer = factory.create();

        expect(
            () => customer.id()
        ).toThrow(
            "Projection is not bound to a record"
        );
    });


    test("rejects access after clear",() => {
        const factory = createProjection(
            fakeParser,
            undefined,
            undefined,
            customerProjection
        );

        const customer = factory.create();

        factory.bind(
            customer,
            {
                id: 101,
                age: 47,
                name: "Alice",
                initial: "A",
                balance: 123.45
            },
            physicalRecord()
        );

        expect(customer.name()).toBe("Alice");

        factory.clear(customer);

        expect(
            () => customer.name()
        ).toThrow(
            "Projection is not bound to a record"
        );
    });


    test("rejects binding an already bound projection",() => {
        const factory = createProjection(
            fakeParser,
            undefined,
            undefined,
            customerProjection
        );

        const customer = factory.create();

        factory.bind(
            customer,
            {
                id: 1,
                age: 20,
                name: "First",
                initial: "F",
                balance: 10.5
            },
            physicalRecord(1)
        );

        expect(
            () => factory.bind(
                customer,
                {
                    id: 2,
                    age: 30,
                    name: "Second",
                    initial: "S",
                    balance: 20.5
                },
                physicalRecord(2)
            )
        ).toThrow(
            "Projection is already bound"
        );

        factory.clear(customer);
    });


    test("uses the parser for integer access",() => {
        const factory = createProjection(
            fakeParser,
            undefined,
            undefined,
            customerProjection
        );

        const customer = factory.create();

        factory.bind(
            customer,
            {
                id: 1.5,
                age: 47,
                name: "Alice",
                initial: "A",
                balance: 123.45
            },
            physicalRecord()
        );

        expect(
            () => customer.id()
        ).toThrow(
            /Expected integer at id/
        );

        factory.clear(customer);
    });


    test("uses the parser for character access",() => {
        const factory = createProjection(
            fakeParser,
            undefined,
            undefined,
            customerProjection
        );

        const customer = factory.create();

        factory.bind(
            customer,
            {
                id: 101,
                age: 47,
                name: "Alice",
                initial: "AB",
                balance: 123.45
            },
            physicalRecord()
        );

        expect(
            () => customer.initial()
        ).toThrow(
            /Expected character at initial/
        );

        factory.clear(customer);
    });


    test("accessors are lazy",() => {
        const factory = createProjection(
            fakeParser,
            undefined,
            undefined,
            customerProjection
        );

        const customer = factory.create();

        factory.bind(
            customer,
            {
                id: "not an integer",
                age: 47,
                name: "Alice",
                initial: "A",
                balance: 123.45
            },
            physicalRecord()
        );

        expect(customer.name()).toBe("Alice");

        expect(
            () => customer.id()
        ).toThrow(
            /Expected integer at id/
        );

        factory.clear(customer);
    });
});


describe("defineProjection types",() => {
    interface TypedCustomer {
        age(): number;
        name(): string;
    }


    test("accepts compatible projection field types",() => {
        defineProjection<TypedCustomer>({
            age: {
                type: "integer"
            },
            name: {
                type: "string"
            }
        });

        defineProjection<TypedCustomer>({
            age: {
                type: "float"
            },
            name: {
                type: "character"
            }
        });
    });


    test("rejects a projection field with the wrong primitive type",() => {
        defineProjection<TypedCustomer>({
            age: {
                // @ts-expect-error string cannot implement () => number
                type: "string"
            },
            name: {
                type: "string"
            }
        });
    });


    test("rejects a projection with a missing field",() => {
        defineProjection<TypedCustomer>(
            // @ts-expect-error name is required by TypedCustomer
            {
                age: {
                    type: "integer"
                }
            }
        );
    });
});


function physicalRecord(
    recordNumber = 1
): ProjectionPhysicalRecord {
    return {
        buffers: [
            new Uint8Array([
                116,
                101,
                115,
                116
            ])
        ],
        startByte: 0,
        endByte: 4,
        lastValidByte: 4,
        source: "test-source",
        recordNumber
    };
}