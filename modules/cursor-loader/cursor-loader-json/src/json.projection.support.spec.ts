import {jsonProjectionSupport} from "./json.projection.support";


describe("jsonProjectionSupport",() => {
    describe("compileProjectionPath",() => {
        test("uses the tokenised JSON path unchanged",() => {
            const path = ["customer","age"];

            expect(
                jsonProjectionSupport.compileProjectionPath(
                    undefined,
                    undefined,
                    path
                )
            ).toBe(path);
        });
    });


    describe("integer",() => {
        test("reads an integer at the root path",() => {
            expect(
                jsonProjectionSupport.integer(
                    42,
                    undefined,
                    []
                )
            ).toBe(42);
        });


        test("reads an integer from a nested object",() => {
            const representation = {
                customer: {
                    age: 62
                }
            };

            expect(
                jsonProjectionSupport.integer(
                    representation,
                    undefined,
                    [
                        "customer",
                        "age"
                    ]
                )
            ).toBe(62);
        });


        test("accepts negative integers",() => {
            expect(
                jsonProjectionSupport.integer(
                    {
                        value: -17
                    },
                    undefined,
                    [
                        "value"
                    ]
                )
            ).toBe(-17);
        });


        test("accepts zero",() => {
            expect(
                jsonProjectionSupport.integer(
                    {
                        value: 0
                    },
                    undefined,
                    [
                        "value"
                    ]
                )
            ).toBe(0);
        });


        test("rejects a non-integer number",() => {
            expectError(
                () => jsonProjectionSupport.integer(
                    {
                        value: 12.5
                    },
                    undefined,
                    [
                        "value"
                    ]
                ),
                "JSON value is number 12.5; expected an integer."
            );
        });


        test("rejects a string containing an integer",() => {
            expectError(
                () => jsonProjectionSupport.integer(
                    {
                        value: "12"
                    },
                    undefined,
                    [
                        "value"
                    ]
                ),
                'JSON value is string "12"; expected an integer.'
            );
        });
    });


    describe("float",() => {
        test("reads a floating point number",() => {
            expect(
                jsonProjectionSupport.float(
                    {
                        value: 12.5
                    },
                    undefined,
                    [
                        "value"
                    ]
                )
            ).toBe(12.5);
        });


        test("also accepts an integer",() => {
            expect(
                jsonProjectionSupport.float(
                    {
                        value: 12
                    },
                    undefined,
                    [
                        "value"
                    ]
                )
            ).toBe(12);
        });


        test("rejects a numeric string",() => {
            expectError(
                () => jsonProjectionSupport.float(
                    {
                        value: "12.5"
                    },
                    undefined,
                    [
                        "value"
                    ]
                ),
                'JSON value is string "12.5"; expected a number.'
            );
        });
    });


    describe("character",() => {
        test("reads a single-character string",() => {
            expect(
                jsonProjectionSupport.character(
                    {
                        value: "A"
                    },
                    undefined,
                    [
                        "value"
                    ]
                )
            ).toBe("A");
        });


        test("rejects an empty string",() => {
            expectError(
                () => jsonProjectionSupport.character(
                    {
                        value: ""
                    },
                    undefined,
                    [
                        "value"
                    ]
                ),
                'JSON value is string ""; expected a single character.'
            );
        });


        test("rejects a multi-character string",() => {
            expectError(
                () => jsonProjectionSupport.character(
                    {
                        value: "AB"
                    },
                    undefined,
                    [
                        "value"
                    ]
                ),
                'JSON value is string "AB"; expected a single character.'
            );
        });


        test("rejects a non-string value",() => {
            expectError(
                () => jsonProjectionSupport.character(
                    {
                        value: 65
                    },
                    undefined,
                    [
                        "value"
                    ]
                ),
                "JSON value is number 65; expected a single character."
            );
        });
    });


    describe("string",() => {
        test("reads a string",() => {
            expect(
                jsonProjectionSupport.string(
                    {
                        customer: {
                            name: "Fred"
                        }
                    },
                    undefined,
                    [
                        "customer",
                        "name"
                    ]
                )
            ).toBe("Fred");
        });


        test("accepts an empty string",() => {
            expect(
                jsonProjectionSupport.string(
                    {
                        value: ""
                    },
                    undefined,
                    [
                        "value"
                    ]
                )
            ).toBe("");
        });


        test("rejects a number",() => {
            expectError(
                () => jsonProjectionSupport.string(
                    {
                        value: 123
                    },
                    undefined,
                    [
                        "value"
                    ]
                ),
                "JSON value is number 123; expected a string."
            );
        });


        test("rejects null",() => {
            expectError(
                () => jsonProjectionSupport.string(
                    {
                        value: null
                    },
                    undefined,
                    [
                        "value"
                    ]
                ),
                "JSON value is null; expected a string."
            );
        });
    });


    describe("path traversal",() => {
        test("supports deeply nested paths",() => {
            const representation = {
                customer: {
                    address: {
                        postcode: "HG1"
                    }
                }
            };

            expect(
                jsonProjectionSupport.string(
                    representation,
                    undefined,
                    [
                        "customer",
                        "address",
                        "postcode"
                    ]
                )
            ).toBe("HG1");
        });


        test("supports array indexes as path segments",() => {
            const representation = {
                customers: [
                    {
                        age: 27
                    },
                    {
                        age: 34
                    }
                ]
            };

            expect(
                jsonProjectionSupport.integer(
                    representation,
                    undefined,
                    [
                        "customers",
                        "1",
                        "age"
                    ]
                )
            ).toBe(34);
        });


        test("supports properties whose names contain dots",() => {
            const representation = {
                "customer.age": 42
            };

            expect(
                jsonProjectionSupport.integer(
                    representation,
                    undefined,
                    [
                        "customer.age"
                    ]
                )
            ).toBe(42);
        });


        test("supports an empty path as the representation itself",() => {
            expect(
                jsonProjectionSupport.string(
                    "Fred",
                    undefined,
                    []
                )
            ).toBe("Fred");
        });


        test("reports a missing first path segment",() => {
            expectError(
                () => jsonProjectionSupport.string(
                    {
                        customer: {
                            name: "Fred"
                        }
                    },
                    undefined,
                    [
                        "missing",
                        "name"
                    ]
                ),
                'JSON property "missing" does not exist in object at <root>. '
                + 'Available properties: "customer".'
            );
        });


        test("reports the path up to a missing nested segment",() => {
            expectError(
                () => jsonProjectionSupport.string(
                    {
                        customer: {
                            address: {}
                        }
                    },
                    undefined,
                    [
                        "customer",
                        "address",
                        "postcode"
                    ]
                ),
                'JSON property "postcode" does not exist in object at customer.address. '
                + "Available properties: <none>."
            );
        });


        test("fails when traversal encounters null",() => {
            expectError(
                () => jsonProjectionSupport.string(
                    {
                        customer: null
                    },
                    undefined,
                    [
                        "customer",
                        "name"
                    ]
                ),
                "JSON path cannot continue at customer: "
                + 'value is null; cannot resolve property "name".'
            );
        });


        test("fails when traversal encounters a primitive",() => {
            expectError(
                () => jsonProjectionSupport.string(
                    {
                        customer: "Fred"
                    },
                    undefined,
                    [
                        "customer",
                        "name"
                    ]
                ),
                "JSON path cannot continue at customer: "
                + 'value is string "Fred"; cannot resolve property "name".'
            );
        });


        test("does not traverse inherited properties",() => {
            const prototype = {
                age: 62
            };

            const representation =
                Object.create(prototype);

            expectError(
                () => jsonProjectionSupport.integer(
                    representation,
                    undefined,
                    [
                        "age"
                    ]
                ),
                'JSON property "age" does not exist in object at <root>. '
                + "Available properties: <none>."
            );
        });
    });


    describe("JSON primitive distinctions",() => {
        test("boolean is not accepted as an integer",() => {
            expectError(
                () => jsonProjectionSupport.integer(
                    true,
                    undefined,
                    []
                ),
                "JSON value is boolean true; expected an integer."
            );
        });


        test("boolean is not accepted as a string",() => {
            expectError(
                () => jsonProjectionSupport.string(
                    false,
                    undefined,
                    []
                ),
                "JSON value is boolean false; expected a string."
            );
        });


        test("null cannot be traversed",() => {
            expectError(
                () => jsonProjectionSupport.string(
                    null,
                    undefined,
                    [
                        "name"
                    ]
                ),
                "JSON path cannot continue at <root>: "
                + 'value is null; cannot resolve property "name".'
            );
        });
    });
});


function expectError(
    action: () => unknown,
    message: string
): void {
    try {
        action();
    } catch (error) {
        expect(error).toEqual(
            new Error(message)
        );
        return;
    }

    throw new Error("Expected error");
}