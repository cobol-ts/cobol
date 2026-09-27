import {
    validateFlatMap,
    validateFlatMapLazy,
    validateMap,
    validateMapLazy
} from "./validator.map.flatmap";

import {
    type ErrorsOr
} from "@cobol-ts/errors";

import {
    type Validator
} from "./validator";


describe(
    "validateMap",
    () => {

        const positive:
            Validator<number> =
            context =>
                value =>
                    value > 0
                        ? []
                        : [
                            `${context} must be positive`
                        ];


        test(
            "maps a valid value",
            () => {

                const map =
                    validateMap(
                        "value",
                        positive
                    );


                expect(
                    map(
                        5,
                        value =>
                            value * 2
                    )
                ).toEqual({
                    value:
                        10
                });
            }
        );


        test(
            "returns validation errors without calling the mapper",
            () => {

                const fn =
                    jest.fn(
                        (
                            value:
                            number
                        ) =>
                            value * 2
                    );


                const map =
                    validateMap(
                        "value",
                        positive
                    );


                expect(
                    map(
                        -1,
                        fn
                    )
                ).toEqual({
                    errors: [
                        "value must be positive"
                    ],

                    extras:
                        -1
                });


                expect(
                    fn
                ).not.toHaveBeenCalled();
            }
        );


        test(
            "uses the default validator",
            () => {

                const map =
                    validateMap<number, number>(
                        "value"
                    );


                expect(
                    map(
                        3,
                        value =>
                            value + 1
                    )
                ).toEqual({
                    value:
                        4
                });
            }
        );


        test(
            "converts mapper exceptions to Errors",
            () => {

                const map =
                    validateMap<number, number>(
                        "value"
                    );


                const result =
                    map(
                        7,
                        () => {

                            throw new Error(
                                "boom"
                            );
                        }
                    );


                expect(
                    "errors"
                    in result
                ).toBe(
                    true
                );


                if (
                    "errors"
                    in result
                ) {
                    expect(
                        result.errors.join(
                            " "
                        )
                    ).toContain(
                        "boom"
                    );

                    expect(
                        result.extras
                    ).toBe(
                        7
                    );
                }
            }
        );
    }
);


describe(
    "validateMapLazy",
    () => {

        const positive:
            Validator<number> =
            context =>
                value =>
                    value > 0
                        ? []
                        : [
                            `${context} must be positive`
                        ];


        test(
            "evaluates the thunk validates and maps the value",
            () => {

                const map =
                    validateMapLazy(
                        "value",
                        positive
                    );


                expect(
                    map(
                        () =>
                            5,
                        value =>
                            value * 2
                    )
                ).toEqual({
                    value:
                        10
                });
            }
        );


        test(
            "returns validation errors without calling the mapper",
            () => {

                const fn =
                    jest.fn(
                        (
                            value:
                            number
                        ) =>
                            value * 2
                    );


                const map =
                    validateMapLazy(
                        "value",
                        positive
                    );


                expect(
                    map(
                        () =>
                            -1,
                        fn
                    )
                ).toEqual({
                    errors: [
                        "value must be positive"
                    ],

                    extras:
                        -1
                });


                expect(
                    fn
                ).not.toHaveBeenCalled();
            }
        );


        test(
            "converts thunk exceptions to Errors",
            () => {

                const map =
                    validateMapLazy<number, number>(
                        "value"
                    );


                const result =
                    map(
                        () => {

                            throw new Error(
                                "thunk boom"
                            );
                        },
                        value =>
                            value * 2
                    );


                expect(
                    "errors"
                    in result
                ).toBe(
                    true
                );


                if (
                    "errors"
                    in result
                ) {
                    expect(
                        result.errors.join(
                            " "
                        )
                    ).toContain(
                        "thunk boom"
                    );

                    expect(
                        result.extras
                    ).toBeUndefined();
                }
            }
        );


        test(
            "converts mapper exceptions to Errors and keeps the thunk value as extras",
            () => {

                const map =
                    validateMapLazy<number, number>(
                        "value"
                    );


                const result =
                    map(
                        () =>
                            9,
                        () => {

                            throw new Error(
                                "mapper boom"
                            );
                        }
                    );


                expect(
                    "errors"
                    in result
                ).toBe(
                    true
                );


                if (
                    "errors"
                    in result
                ) {
                    expect(
                        result.errors.join(
                            " "
                        )
                    ).toContain(
                        "mapper boom"
                    );

                    expect(
                        result.extras
                    ).toBe(
                        9
                    );
                }
            }
        );
    }
);


describe(
    "validateFlatMap",
    () => {

        const positive:
            Validator<number> =
            context =>
                value =>
                    value > 0
                        ? []
                        : [
                            `${context} must be positive`
                        ];


        test(
            "returns the result from a successful flatMap",
            () => {

                const flatMap =
                    validateFlatMap(
                        "value",
                        positive
                    );


                expect(
                    flatMap(
                        5,
                        value => ({
                            value:
                                value * 2
                        })
                    )
                ).toEqual({
                    value:
                        10
                });
            }
        );


        test(
            "returns Errors produced by the flatMap",
            () => {

                const flatMap =
                    validateFlatMap<number, number>(
                        "value"
                    );


                const expected:
                    ErrorsOr<number> = {
                    errors: [
                        "mapping failed"
                    ],

                    extras:
                        5
                };


                expect(
                    flatMap(
                        5,
                        () =>
                            expected
                    )
                ).toBe(
                    expected
                );
            }
        );


        test(
            "returns validation errors without calling the flatMap",
            () => {

                const fn =
                    jest.fn(
                        (
                            value:
                            number
                        ): ErrorsOr<number> => ({
                            value:
                            value
                        })
                    );


                const flatMap =
                    validateFlatMap(
                        "value",
                        positive
                    );


                expect(
                    flatMap(
                        -1,
                        fn
                    )
                ).toEqual({
                    errors: [
                        "value must be positive"
                    ],

                    extras:
                        -1
                });


                expect(
                    fn
                ).not.toHaveBeenCalled();
            }
        );


        test(
            "converts flatMap exceptions to Errors",
            () => {

                const flatMap =
                    validateFlatMap<number, number>(
                        "value"
                    );


                const result =
                    flatMap(
                        6,
                        () => {

                            throw new Error(
                                "flatMap boom"
                            );
                        }
                    );


                expect(
                    "errors"
                    in result
                ).toBe(
                    true
                );


                if (
                    "errors"
                    in result
                ) {
                    expect(
                        result.errors.join(
                            " "
                        )
                    ).toContain(
                        "flatMap boom"
                    );

                    expect(
                        result.extras
                    ).toBe(
                        6
                    );
                }
            }
        );
    }
);


describe(
    "validateFlatMapLazy",
    () => {

        const positive:
            Validator<number> =
            context =>
                value =>
                    value > 0
                        ? []
                        : [
                            `${context} must be positive`
                        ];


        test(
            "evaluates validates and flatMaps the thunk value",
            () => {

                const flatMap =
                    validateFlatMapLazy(
                        "value",
                        positive
                    );


                expect(
                    flatMap(
                        () =>
                            5,
                        value => ({
                            value:
                                value * 2
                        })
                    )
                ).toEqual({
                    value:
                        10
                });
            }
        );


        test(
            "returns validation errors without calling the flatMap",
            () => {

                const fn =
                    jest.fn(
                        (
                            value:
                            number
                        ): ErrorsOr<number> => ({
                            value:
                            value
                        })
                    );


                const flatMap =
                    validateFlatMapLazy(
                        "value",
                        positive
                    );


                expect(
                    flatMap(
                        () =>
                            -1,
                        fn
                    )
                ).toEqual({
                    errors: [
                        "value must be positive"
                    ],

                    extras:
                        -1
                });


                expect(
                    fn
                ).not.toHaveBeenCalled();
            }
        );


        test(
            "returns Errors produced by the flatMap",
            () => {

                const flatMap =
                    validateFlatMapLazy<number, number>(
                        "value"
                    );


                const expected:
                    ErrorsOr<number> = {
                    errors: [
                        "mapping failed"
                    ],

                    extras:
                        5
                };


                expect(
                    flatMap(
                        () =>
                            5,
                        () =>
                            expected
                    )
                ).toBe(
                    expected
                );
            }
        );


        test(
            "converts thunk exceptions to Errors",
            () => {

                const flatMap =
                    validateFlatMapLazy<number, number>(
                        "value"
                    );


                const result =
                    flatMap(
                        () => {

                            throw new Error(
                                "thunk boom"
                            );
                        },
                        value => ({
                            value:
                            value
                        })
                    );


                expect(
                    "errors"
                    in result
                ).toBe(
                    true
                );


                if (
                    "errors"
                    in result
                ) {
                    expect(
                        result.errors.join(
                            " "
                        )
                    ).toContain(
                        "thunk boom"
                    );

                    expect(
                        result.extras
                    ).toBeUndefined();
                }
            }
        );


        test(
            "converts flatMap exceptions to Errors and keeps the thunk value as extras",
            () => {

                const flatMap =
                    validateFlatMapLazy<number, number>(
                        "value"
                    );


                const result =
                    flatMap(
                        () =>
                            8,
                        () => {

                            throw new Error(
                                "flatMap boom"
                            );
                        }
                    );


                expect(
                    "errors"
                    in result
                ).toBe(
                    true
                );


                if (
                    "errors"
                    in result
                ) {
                    expect(
                        result.errors.join(
                            " "
                        )
                    ).toContain(
                        "flatMap boom"
                    );

                    expect(
                        result.extras
                    ).toBe(
                        8
                    );
                }
            }
        );
    }
);