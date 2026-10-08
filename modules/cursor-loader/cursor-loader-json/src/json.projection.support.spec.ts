import {jsonProjectionSupport} from "./json.projection.support";


describe(
    "jsonProjectionSupport",
    () => {

        describe(
            "integer",
            () => {

                test(
                    "reads an integer at the root path",
                    () => {

                        expect(
                            jsonProjectionSupport.integer(
                                42,
                                []
                            )
                        ).toBe(
                            42
                        );
                    }
                );


                test(
                    "reads an integer from a nested object",
                    () => {

                        const representation = {
                            customer: {
                                age:
                                    62
                            }
                        };


                        expect(
                            jsonProjectionSupport.integer(
                                representation,
                                [
                                    "customer",
                                    "age"
                                ]
                            )
                        ).toBe(
                            62
                        );
                    }
                );


                test(
                    "accepts negative integers",
                    () => {

                        expect(
                            jsonProjectionSupport.integer(
                                {
                                    value:
                                        -17
                                },
                                [
                                    "value"
                                ]
                            )
                        ).toBe(
                            -17
                        );
                    }
                );


                test(
                    "accepts zero",
                    () => {

                        expect(
                            jsonProjectionSupport.integer(
                                {
                                    value:
                                        0
                                },
                                [
                                    "value"
                                ]
                            )
                        ).toBe(
                            0
                        );
                    }
                );


                test(
                    "rejects a non-integer number",
                    () => {

                        expect(
                            () =>
                                jsonProjectionSupport.integer(
                                    {
                                        value:
                                            12.5
                                    },
                                    [
                                        "value"
                                    ]
                                )
                        ).toThrow(
                            "JSON projection value at value is not integer"
                        );
                    }
                );


                test(
                    "rejects a string containing an integer",
                    () => {

                        expect(
                            () =>
                                jsonProjectionSupport.integer(
                                    {
                                        value:
                                            "12"
                                    },
                                    [
                                        "value"
                                    ]
                                )
                        ).toThrow(
                            "JSON projection value at value is not integer"
                        );
                    }
                );
            }
        );


        describe(
            "float",
            () => {

                test(
                    "reads a floating point number",
                    () => {

                        expect(
                            jsonProjectionSupport.float(
                                {
                                    value:
                                        12.5
                                },
                                [
                                    "value"
                                ]
                            )
                        ).toBe(
                            12.5
                        );
                    }
                );


                test(
                    "also accepts an integer",
                    () => {

                        expect(
                            jsonProjectionSupport.float(
                                {
                                    value:
                                        12
                                },
                                [
                                    "value"
                                ]
                            )
                        ).toBe(
                            12
                        );
                    }
                );


                test(
                    "rejects a numeric string",
                    () => {

                        expect(
                            () =>
                                jsonProjectionSupport.float(
                                    {
                                        value:
                                            "12.5"
                                    },
                                    [
                                        "value"
                                    ]
                                )
                        ).toThrow(
                            "JSON projection value at value is not float"
                        );
                    }
                );
            }
        );


        describe(
            "character",
            () => {

                test(
                    "reads a single-character string",
                    () => {

                        expect(
                            jsonProjectionSupport.character(
                                {
                                    value:
                                        "A"
                                },
                                [
                                    "value"
                                ]
                            )
                        ).toBe(
                            "A"
                        );
                    }
                );


                test(
                    "rejects an empty string",
                    () => {

                        expect(
                            () =>
                                jsonProjectionSupport.character(
                                    {
                                        value:
                                            ""
                                    },
                                    [
                                        "value"
                                    ]
                                )
                        ).toThrow(
                            "JSON projection value at value is not character"
                        );
                    }
                );


                test(
                    "rejects a multi-character string",
                    () => {

                        expect(
                            () =>
                                jsonProjectionSupport.character(
                                    {
                                        value:
                                            "AB"
                                    },
                                    [
                                        "value"
                                    ]
                                )
                        ).toThrow(
                            "JSON projection value at value is not character"
                        );
                    }
                );


                test(
                    "rejects a non-string value",
                    () => {

                        expect(
                            () =>
                                jsonProjectionSupport.character(
                                    {
                                        value:
                                            65
                                    },
                                    [
                                        "value"
                                    ]
                                )
                        ).toThrow(
                            "JSON projection value at value is not character"
                        );
                    }
                );
            }
        );


        describe(
            "string",
            () => {

                test(
                    "reads a string",
                    () => {

                        expect(
                            jsonProjectionSupport.string(
                                {
                                    customer: {
                                        name:
                                            "Fred"
                                    }
                                },
                                [
                                    "customer",
                                    "name"
                                ]
                            )
                        ).toBe(
                            "Fred"
                        );
                    }
                );


                test(
                    "accepts an empty string",
                    () => {

                        expect(
                            jsonProjectionSupport.string(
                                {
                                    value:
                                        ""
                                },
                                [
                                    "value"
                                ]
                            )
                        ).toBe(
                            ""
                        );
                    }
                );


                test(
                    "rejects a number",
                    () => {

                        expect(
                            () =>
                                jsonProjectionSupport.string(
                                    {
                                        value:
                                            123
                                    },
                                    [
                                        "value"
                                    ]
                                )
                        ).toThrow(
                            "JSON projection value at value is not string"
                        );
                    }
                );


                test(
                    "rejects null",
                    () => {

                        expect(
                            () =>
                                jsonProjectionSupport.string(
                                    {
                                        value:
                                            null
                                    },
                                    [
                                        "value"
                                    ]
                                )
                        ).toThrow(
                            "JSON projection value at value is not string"
                        );
                    }
                );
            }
        );


        describe(
            "path traversal",
            () => {

                test(
                    "supports deeply nested paths",
                    () => {

                        const representation = {
                            customer: {
                                address: {
                                    postcode:
                                        "HG1"
                                }
                            }
                        };


                        expect(
                            jsonProjectionSupport.string(
                                representation,
                                [
                                    "customer",
                                    "address",
                                    "postcode"
                                ]
                            )
                        ).toBe(
                            "HG1"
                        );
                    }
                );


                test(
                    "supports array indexes as path segments",
                    () => {

                        const representation = {
                            customers: [
                                {
                                    age:
                                        27
                                },
                                {
                                    age:
                                        34
                                }
                            ]
                        };


                        expect(
                            jsonProjectionSupport.integer(
                                representation,
                                [
                                    "customers",
                                    "1",
                                    "age"
                                ]
                            )
                        ).toBe(
                            34
                        );
                    }
                );


                test(
                    "supports properties whose names contain dots",
                    () => {

                        const representation = {
                            "customer.age":
                                42
                        };


                        expect(
                            jsonProjectionSupport.integer(
                                representation,
                                [
                                    "customer.age"
                                ]
                            )
                        ).toBe(
                            42
                        );
                    }
                );


                test(
                    "supports an empty path as the representation itself",
                    () => {

                        expect(
                            jsonProjectionSupport.string(
                                "Fred",
                                []
                            )
                        ).toBe(
                            "Fred"
                        );
                    }
                );


                test(
                    "reports a missing first path segment",
                    () => {

                        expect(
                            () =>
                                jsonProjectionSupport.string(
                                    {
                                        customer: {
                                            name:
                                                "Fred"
                                        }
                                    },
                                    [
                                        "missing",
                                        "name"
                                    ]
                                )
                        ).toThrow(
                            "JSON projection path not found: missing"
                        );
                    }
                );


                test(
                    "reports the path up to a missing nested segment",
                    () => {

                        expect(
                            () =>
                                jsonProjectionSupport.string(
                                    {
                                        customer: {
                                            address: {}
                                        }
                                    },
                                    [
                                        "customer",
                                        "address",
                                        "postcode"
                                    ]
                                )
                        ).toThrow(
                            "JSON projection path not found: customer.address.postcode"
                        );
                    }
                );


                test(
                    "fails when traversal encounters null",
                    () => {

                        expect(
                            () =>
                                jsonProjectionSupport.string(
                                    {
                                        customer:
                                            null
                                    },
                                    [
                                        "customer",
                                        "name"
                                    ]
                                )
                        ).toThrow(
                            "JSON projection path not found: customer.name"
                        );
                    }
                );


                test(
                    "fails when traversal encounters a primitive",
                    () => {

                        expect(
                            () =>
                                jsonProjectionSupport.string(
                                    {
                                        customer:
                                            "Fred"
                                    },
                                    [
                                        "customer",
                                        "name"
                                    ]
                                )
                        ).toThrow(
                            "JSON projection path not found: customer.name"
                        );
                    }
                );


                test(
                    "does not traverse inherited properties",
                    () => {

                        const prototype = {
                            age:
                                62
                        };

                        const representation =
                            Object.create(
                                prototype
                            );


                        expect(
                            () =>
                                jsonProjectionSupport.integer(
                                    representation,
                                    [
                                        "age"
                                    ]
                                )
                        ).toThrow(
                            "JSON projection path not found: age"
                        );
                    }
                );
            }
        );


        describe(
            "JSON primitive distinctions",
            () => {

                test(
                    "boolean is not accepted as an integer",
                    () => {

                        expect(
                            () =>
                                jsonProjectionSupport.integer(
                                    true,
                                    []
                                )
                        ).toThrow(
                            "JSON projection value at <root> is not integer"
                        );
                    }
                );


                test(
                    "boolean is not accepted as a string",
                    () => {

                        expect(
                            () =>
                                jsonProjectionSupport.string(
                                    false,
                                    []
                                )
                        ).toThrow(
                            "JSON projection value at <root> is not string"
                        );
                    }
                );


                test(
                    "null cannot be traversed",
                    () => {

                        expect(
                            () =>
                                jsonProjectionSupport.string(
                                    null,
                                    [
                                        "name"
                                    ]
                                )
                        ).toThrow(
                            "JSON projection path not found: name"
                        );
                    }
                );
            }
        );
    }
);
