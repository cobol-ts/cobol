import {
    createProjection,
    defineProjection
} from "./create.projection";

import {
    customerProjection,
    fakeParser,
    orderSummaryProjection
} from "./projection.fixture";


describe(
    "createProjection",
    () => {

        test(
            "creates a projection over a flat representation",
            () => {

                const projection =
                    createProjection(
                        fakeParser,
                        customerProjection
                    );


                const customer =
                    projection.create(
                        {
                            id:
                                101,

                            age:
                                47,

                            name:
                                "Alice",

                            initial:
                                "A",

                            balance:
                                123.45
                        }
                    );


                expect(
                    customer.id()
                ).toBe(
                    101
                );

                expect(
                    customer.age()
                ).toBe(
                    47
                );

                expect(
                    customer.name()
                ).toBe(
                    "Alice"
                );

                expect(
                    customer.initial()
                ).toBe(
                    "A"
                );

                expect(
                    customer.balance()
                ).toBe(
                    123.45
                );
            }
        );


        test(
            "uses explicit nested paths",
            () => {

                const projection =
                    createProjection(
                        fakeParser,
                        orderSummaryProjection
                    );


                const order =
                    projection.create(
                        {
                            order: {
                                id:
                                    7001,

                                customer: {
                                    name:
                                        "Bob"
                                },

                                total:
                                    88.5
                            }
                        }
                    );


                expect(
                    order.orderId()
                ).toBe(
                    7001
                );

                expect(
                    order.customerName()
                ).toBe(
                    "Bob"
                );

                expect(
                    order.total()
                ).toBe(
                    88.5
                );
            }
        );


        test(
            "binds each created projection to its own representation",
            () => {

                const projection =
                    createProjection(
                        fakeParser,
                        customerProjection
                    );


                const first =
                    projection.create(
                        {
                            id:
                                1,

                            age:
                                20,

                            name:
                                "First",

                            initial:
                                "F",

                            balance:
                                10.5
                        }
                    );


                const second =
                    projection.create(
                        {
                            id:
                                2,

                            age:
                                30,

                            name:
                                "Second",

                            initial:
                                "S",

                            balance:
                                20.5
                        }
                    );


                expect(
                    first.id()
                ).toBe(
                    1
                );

                expect(
                    first.name()
                ).toBe(
                    "First"
                );

                expect(
                    second.id()
                ).toBe(
                    2
                );

                expect(
                    second.name()
                ).toBe(
                    "Second"
                );
            }
        );


        test(
            "uses the parser for integer access",
            () => {

                const projection =
                    createProjection(
                        fakeParser,
                        customerProjection
                    );


                const customer =
                    projection.create(
                        {
                            id:
                                1.5,

                            age:
                                47,

                            name:
                                "Alice",

                            initial:
                                "A",

                            balance:
                                123.45
                        }
                    );


                expect(
                    () =>
                        customer.id()
                ).toThrow(
                    "Expected integer at id"
                );
            }
        );


        test(
            "uses the parser for character access",
            () => {

                const projection =
                    createProjection(
                        fakeParser,
                        customerProjection
                    );


                const customer =
                    projection.create(
                        {
                            id:
                                101,

                            age:
                                47,

                            name:
                                "Alice",

                            initial:
                                "AB",

                            balance:
                                123.45
                        }
                    );


                expect(
                    () =>
                        customer.initial()
                ).toThrow(
                    "Expected character at initial"
                );
            }
        );


        test(
            "accessors are lazy",
            () => {

                const projection =
                    createProjection(
                        fakeParser,
                        customerProjection
                    );


                const customer =
                    projection.create(
                        {
                            id:
                                "not an integer",

                            age:
                                47,

                            name:
                                "Alice",

                            initial:
                                "A",

                            balance:
                                123.45
                        }
                    );


                expect(
                    customer.name()
                ).toBe(
                    "Alice"
                );


                expect(
                    () =>
                        customer.id()
                ).toThrow(
                    "Expected integer at id"
                );
            }
        );
    }
);


describe(
    "defineProjection types",
    () => {

        interface TypedCustomer {

            age():
                number;

            name():
                string;
        }


        test(
            "accepts compatible projection field types",
            () => {

                defineProjection<
                    TypedCustomer
                >(
                    {
                        age: {
                            type:
                                "integer"
                        },

                        name: {
                            type:
                                "string"
                        }
                    }
                );


                defineProjection<
                    TypedCustomer
                >(
                    {
                        age: {
                            type:
                                "float"
                        },

                        name: {
                            type:
                                "character"
                        }
                    }
                );
            }
        );


        test(
            "rejects a projection field with the wrong primitive type",
            () => {

                defineProjection<
                    TypedCustomer
                >(
                    {
                        age: {
                            // @ts-expect-error string cannot implement () => number
                            type:
                                "string"
                        },

                        name: {
                            type:
                                "string"
                        }
                    }
                );
            }
        );


        test(
            "rejects a projection with a missing field",
            () => {

                defineProjection<
                    TypedCustomer
                >(
                    // @ts-expect-error name is required by TypedCustomer
                    {
                        age: {
                            type:
                                "integer"
                        }
                    }
                );
            }
        );
    }
);
