import {
    canonicalProjection,

} from "./projection.definition";
import {
    CanonicalProjection,
    ProjectionAuthoring,
    ProjectionFieldValue,
    ProjectionView
} from "@cobol-ts/cursor-loader-types";
import {defineProjection} from "./create.projection";


describe(
    "canonicalProjection",
    () => {

        test(
            "uses the field name as the default path",
            () => {

                const projection = {
                    age: {
                        type:
                            "integer"
                    },

                    name: {
                        type:
                            "string"
                    }
                } as const;


                expect(
                    canonicalProjection(
                        projection
                    )
                ).toEqual(
                    {
                        age: {
                            type:
                                "integer",

                            path: [
                                "age"
                            ]
                        },

                        name: {
                            type:
                                "string",

                            path: [
                                "name"
                            ]
                        }
                    }
                );
            }
        );


        test(
            "preserves an explicitly supplied path",
            () => {

                const projection = {
                    postcode: {
                        type:
                            "string",

                        path: [
                            "address",
                            "postcode"
                        ]
                    }
                } as const;


                expect(
                    canonicalProjection(
                        projection
                    )
                ).toEqual(
                    {
                        postcode: {
                            type:
                                "string",

                            path: [
                                "address",
                                "postcode"
                            ]
                        }
                    }
                );
            }
        );


        test(
            "preserves each field type",
            () => {

                const projection = {
                    id: {
                        type:
                            "integer"
                    },

                    weight: {
                        type:
                            "float"
                    },

                    initial: {
                        type:
                            "character"
                    },

                    name: {
                        type:
                            "string"
                    }
                } as const;


                expect(
                    canonicalProjection(
                        projection
                    )
                ).toEqual(
                    {
                        id: {
                            type:
                                "integer",

                            path: [
                                "id"
                            ]
                        },

                        weight: {
                            type:
                                "float",

                            path: [
                                "weight"
                            ]
                        },

                        initial: {
                            type:
                                "character",

                            path: [
                                "initial"
                            ]
                        },

                        name: {
                            type:
                                "string",

                            path: [
                                "name"
                            ]
                        }
                    }
                );
            }
        );


        test(
            "does not replace an explicitly empty path",
            () => {

                const projection = {
                    value: {
                        type:
                            "integer",

                        path:
                            []
                    }
                } as const;


                expect(
                    canonicalProjection(
                        projection
                    )
                ).toEqual(
                    {
                        value: {
                            type:
                                "integer",

                            path:
                                []
                        }
                    }
                );
            }
        );


        test(
            "does not modify the authoring projection",
            () => {

                const projection = {
                    age: {
                        type:
                            "integer"
                    },

                    postcode: {
                        type:
                            "string",

                        path: [
                            "address",
                            "postcode"
                        ]
                    }
                } as const;


                canonicalProjection(
                    projection
                );


                expect(
                    projection
                ).toEqual(
                    {
                        age: {
                            type:
                                "integer"
                        },

                        postcode: {
                            type:
                                "string",

                            path: [
                                "address",
                                "postcode"
                            ]
                        }
                    }
                );
            }
        );


        test(
            "creates a new canonical field object",
            () => {

                const field = {
                    type:
                        "string" as const,

                    path: [
                        "customer",
                        "name"
                    ] as const
                };

                const projection = {
                    name:
                    field
                };


                const canonical =
                    canonicalProjection(
                        projection
                    );


                expect(
                    canonical.name
                ).not.toBe(
                    field
                );

                expect(
                    canonical.name.path
                ).toBe(
                    field.path
                );
            }
        );
    }
);


/*
 * Compile-time tests.
 *
 * These assignments deliberately rely on TypeScript checking the derived
 * projection types. If the type arithmetic changes incorrectly, this file
 * should stop compiling.
 */

describe(
    "projection types",
    () => {

        test(
            "derives number and string accessor types",
            () => {

                const projection = {
                    age: {
                        type:
                            "integer"
                    },

                    weight: {
                        type:
                            "float"
                    },

                    initial: {
                        type:
                            "character"
                    },

                    name: {
                        type:
                            "string"
                    }
                } as const satisfies ProjectionAuthoring;


                type Customer =
                    ProjectionView<
                        typeof projection
                    >;


                const customer:
                    Customer = {

                    age:
                        () =>
                            62,

                    weight:
                        () =>
                            81.5,

                    initial:
                        () =>
                            "P",

                    name:
                        () =>
                            "Phil"
                };


                const age:
                    number =
                    customer.age();

                const weight:
                    number =
                    customer.weight();

                const initial:
                    string =
                    customer.initial();

                const name:
                    string =
                    customer.name();


                expect(
                    {
                        age,
                        weight,
                        initial,
                        name
                    }
                ).toEqual(
                    {
                        age:
                            62,

                        weight:
                            81.5,

                        initial:
                            "P",

                        name:
                            "Phil"
                    }
                );
            }
        );


        test(
            "derives the field value type",
            () => {

                type Integer =
                    ProjectionFieldValue<
                        {
                            readonly type:
                                "integer";
                        }
                    >;

                type Float =
                    ProjectionFieldValue<
                        {
                            readonly type:
                                "float";
                        }
                    >;

                type Character =
                    ProjectionFieldValue<
                        {
                            readonly type:
                                "character";
                        }
                    >;

                type StringValue =
                    ProjectionFieldValue<
                        {
                            readonly type:
                                "string";
                        }
                    >;


                const integer:
                    Integer =
                    1;

                const float:
                    Float =
                    1.5;

                const character:
                    Character =
                    "A";

                const string:
                    StringValue =
                    "Fred";


                expect(
                    [
                        integer,
                        float,
                        character,
                        string
                    ]
                ).toEqual(
                    [
                        1,
                        1.5,
                        "A",
                        "Fred"
                    ]
                );
            }
        );


        test(
            "canonical type requires every path",
            () => {

                const projection = {
                    age: {
                        type:
                            "integer"
                    },

                    name: {
                        type:
                            "string",

                        path: [
                            "customer",
                            "name"
                        ]
                    }
                } as const;


                type Canonical =
                    CanonicalProjection<
                        typeof projection
                    >;


                const canonical:
                    Canonical = {

                    age: {
                        type:
                            "integer",

                        path: [
                            "age"
                        ]
                    },

                    name: {
                        type:
                            "string",

                        path: [
                            "customer",
                            "name"
                        ]
                    }
                };


                expect(
                    canonical.age.path
                ).toEqual(
                    [
                        "age"
                    ]
                );
            }
        );
    }
);

interface Customer {

    id():
        number;

    age():
        number;

    name():
        string;

    initial():
        string;

    balance():
        number;
}


describe(
    "defineProjection",
    () => {

        test(
            "makes omitted paths canonical using the projection field name",
            () => {

                const projection =
                    defineProjection<
                        Customer
                    >(
                        {
                            id: {
                                type:
                                    "integer"
                            },

                            age: {
                                type:
                                    "integer"
                            },

                            name: {
                                type:
                                    "string"
                            },

                            initial: {
                                type:
                                    "character"
                            },

                            balance: {
                                type:
                                    "float"
                            }
                        }
                    );


                expect(
                    projection
                ).toEqual(
                    {
                        id: {
                            type:
                                "integer",

                            path: [
                                "id"
                            ]
                        },

                        age: {
                            type:
                                "integer",

                            path: [
                                "age"
                            ]
                        },

                        name: {
                            type:
                                "string",

                            path: [
                                "name"
                            ]
                        },

                        initial: {
                            type:
                                "character",

                            path: [
                                "initial"
                            ]
                        },

                        balance: {
                            type:
                                "float",

                            path: [
                                "balance"
                            ]
                        }
                    }
                );
            }
        );


        test(
            "preserves an explicitly supplied path",
            () => {

                const path =
                    [
                        "order",
                        "customer",
                        "name"
                    ] as const;


                const projection =
                    defineProjection<
                        Pick<
                            Customer,
                            "name"
                        >
                    >(
                        {
                            name: {
                                type:
                                    "string",

                                path
                            }
                        }
                    );


                expect(
                    projection.name
                ).toEqual(
                    {
                        type:
                            "string",

                        path
                    }
                );


                expect(
                    projection.name.path
                ).toBe(
                    path
                );
            }
        );


        test(
            "preserves an explicitly empty path",
            () => {

                const path =
                    [] as const;


                const projection =
                    defineProjection<
                        Pick<
                            Customer,
                            "name"
                        >
                    >(
                        {
                            name: {
                                type:
                                    "string",

                                path
                            }
                        }
                    );


                expect(
                    projection.name.path
                ).toBe(
                    path
                );
            }
        );


        test(
            "does not modify the authoring definition",
            () => {

                const definition = {
                    age: {
                        type:
                            "integer"
                    }
                } as const;


                const projection =
                    defineProjection<
                        Pick<
                            Customer,
                            "age"
                        >
                    >(
                        definition
                    );


                expect(
                    definition
                ).toEqual(
                    {
                        age: {
                            type:
                                "integer"
                        }
                    }
                );


                expect(
                    projection.age
                ).not.toBe(
                    definition.age
                );
            }
        );
    }
);
