import {
    chunkAndMapArrays,
    chunkArray,
    collect,
    countByKey,
    type FindIdFn,
    interleave,
    removeDuplicates,
    toArray
} from "./arrays";


describe(
    "interleave",
    () => {

        it(
            "should interleave arrays",
            () => {

                const result =
                    interleave([
                        [
                            1,
                            2,
                            3
                        ],
                        [
                            4,
                            5,
                            6
                        ],
                        [
                            7,
                            8,
                            9
                        ]
                    ]);


                expect(
                    result
                ).toEqual([
                    1,
                    4,
                    7,
                    2,
                    5,
                    8,
                    3,
                    6,
                    9
                ]);
            }
        );


        it(
            "should interleave arrays of different lengths",
            () => {

                const result =
                    interleave([
                        [
                            1,
                            2,
                            3
                        ],
                        [
                            4
                        ],
                        [
                            5,
                            6
                        ]
                    ]);


                expect(
                    result
                ).toEqual([
                    1,
                    4,
                    5,
                    2,
                    6,
                    3
                ]);
            }
        );


        it(
            "should return an empty array for no arrays",
            () => {

                expect(
                    interleave([])
                ).toEqual(
                    []
                );
            }
        );


        it(
            "should handle empty arrays",
            () => {

                expect(
                    interleave([
                        [],
                        [
                            1,
                            2
                        ],
                        []
                    ])
                ).toEqual([
                    1,
                    2
                ]);
            }
        );
    }
);


describe(
    "removeDuplicates",
    () => {

        it(
            "should remove duplicates based on findIdFn",
            () => {

                interface Item {
                    readonly id:
                        string;

                    readonly value:
                        number;
                }


                const data:
                    Item[] = [
                    {
                        id:
                            "1",

                        value:
                            10
                    },
                    {
                        id:
                            "2",

                        value:
                            20
                    },
                    {
                        id:
                            "1",

                        value:
                            10
                    }
                ];


                const findIdFn:
                    FindIdFn<Item> =
                    item =>
                        item.id;


                const uniqueData =
                    removeDuplicates(
                        findIdFn
                    )(
                        data
                    );


                expect(
                    uniqueData
                ).toEqual([
                    {
                        id:
                            "1",

                        value:
                            10
                    },
                    {
                        id:
                            "2",

                        value:
                            20
                    }
                ]);
            }
        );


        it(
            "should keep the first item for each id",
            () => {

                interface Item {
                    readonly id:
                        string;

                    readonly value:
                        number;
                }


                const data:
                    Item[] = [
                    {
                        id:
                            "1",

                        value:
                            10
                    },
                    {
                        id:
                            "1",

                        value:
                            20
                    }
                ];


                const result =
                    removeDuplicates<Item>(
                        item =>
                            item.id
                    )(
                        data
                    );


                expect(
                    result
                ).toEqual([
                    {
                        id:
                            "1",

                        value:
                            10
                    }
                ]);
            }
        );


        it(
            "should return an empty array for empty input",
            () => {

                interface Item {
                    readonly id:
                        string;
                }


                const result =
                    removeDuplicates<Item>(
                        item =>
                            item.id
                    )(
                        []
                    );


                expect(
                    result
                ).toEqual(
                    []
                );
            }
        );
    }
);


describe(
    "countByKey",
    () => {

        it(
            "should count occurrences of each key value",
            () => {

                const data = [
                    {
                        category:
                            "fruit",

                        name:
                            "apple"
                    },
                    {
                        category:
                            "fruit",

                        name:
                            "banana"
                    },
                    {
                        category:
                            "vegetable",

                        name:
                            "carrot"
                    },
                    {
                        category:
                            "fruit",

                        name:
                            "apple"
                    },
                    {
                        category:
                            "vegetable",

                        name:
                            "broccoli"
                    }
                ];


                const result =
                    countByKey(
                        data,
                        "category"
                    );


                expect(
                    result
                ).toEqual({
                    fruit:
                        3,

                    vegetable:
                        2
                });
            }
        );


        it(
            "should handle empty array",
            () => {

                const data:
                    {
                        category: string;
                    }[] =
                    [];


                const result =
                    countByKey(
                        data,
                        "category"
                    );


                expect(
                    result
                ).toEqual(
                    {}
                );
            }
        );


        it(
            "should handle array with undefined or null key values",
            () => {

                const data = [
                    {
                        category:
                            "fruit",

                        name:
                            "apple"
                    },
                    {
                        category:
                            null,

                        name:
                            "banana"
                    },
                    {
                        category:
                            "vegetable",

                        name:
                            "carrot"
                    },
                    {
                        category:
                        undefined,

                        name:
                            "broccoli"
                    }
                ];


                const result =
                    countByKey(
                        data,
                        "category"
                    );


                expect(
                    result
                ).toEqual({
                    fruit:
                        1,

                    vegetable:
                        1
                });
            }
        );


        it(
            "should convert non-string key values to strings",
            () => {

                const data = [
                    {
                        value:
                            1
                    },
                    {
                        value:
                            2
                    },
                    {
                        value:
                            1
                    }
                ];


                expect(
                    countByKey(
                        data,
                        "value"
                    )
                ).toEqual({
                    "1":
                        2,

                    "2":
                        1
                });
            }
        );
    }
);


describe(
    "collect",
    () => {

        it(
            "should collect items that match the guard",
            () => {

                const data:
                    (number | string)[] = [
                    1,
                    "two",
                    3,
                    "four"
                ];


                const isNumber = (
                    item:
                        number | string
                ): item is number =>
                    typeof item
                    === "number";


                const result =
                    collect(
                        data,
                        isNumber
                    );


                expect(
                    result
                ).toEqual([
                    1,
                    3
                ]);
            }
        );


        it(
            "should return an empty array if no items match the guard",
            () => {

                const data:
                    (number | string)[] = [
                    "one",
                    "two",
                    "three"
                ];


                const isNumber = (
                    item:
                        number | string
                ): item is number =>
                    typeof item
                    === "number";


                const result =
                    collect(
                        data,
                        isNumber
                    );


                expect(
                    result
                ).toEqual(
                    []
                );
            }
        );
    }
);


describe(
    "toArray",
    () => {

        it(
            "should convert undefined to an empty array",
            () => {

                expect(
                    toArray(
                        undefined
                    )
                ).toEqual(
                    []
                );
            }
        );


        it(
            "should wrap a single value in an array",
            () => {

                expect(
                    toArray(
                        "one"
                    )
                ).toEqual([
                    "one"
                ]);
            }
        );


        it(
            "should return an existing array",
            () => {

                const values = [
                    "one",
                    "two"
                ];


                expect(
                    toArray(
                        values
                    )
                ).toBe(
                    values
                );
            }
        );
    }
);


describe(
    "chunkArray",
    () => {

        it(
            "should split an array into chunks",
            () => {

                expect(
                    chunkArray(
                        [
                            1,
                            2,
                            3,
                            4,
                            5
                        ],
                        2
                    )
                ).toEqual([
                    [
                        1,
                        2
                    ],
                    [
                        3,
                        4
                    ],
                    [
                        5
                    ]
                ]);
            }
        );


        it(
            "should return one chunk when chunk size exceeds array length",
            () => {

                expect(
                    chunkArray(
                        [
                            1,
                            2,
                            3
                        ],
                        10
                    )
                ).toEqual([
                    [
                        1,
                        2,
                        3
                    ]
                ]);
            }
        );


        it(
            "should return an empty array for empty input",
            () => {

                expect(
                    chunkArray(
                        [],
                        3
                    )
                ).toEqual(
                    []
                );
            }
        );
    }
);


describe(
    "chunkAndMapArrays",
    () => {

        it(
            "should process each chunk and concatenate the results",
            async () => {

                const processFn =
                    jest.fn(
                        async (
                            chunk:
                            number[]
                        ) =>
                            chunk.map(
                                value =>
                                    value * 10
                            )
                    );


                const process =
                    chunkAndMapArrays<
                        number,
                        number
                    >(
                        2,
                        processFn
                    );


                expect(
                    await process([
                        1,
                        2,
                        3,
                        4,
                        5
                    ])
                ).toEqual([
                    10,
                    20,
                    30,
                    40,
                    50
                ]);


                expect(
                    processFn
                ).toHaveBeenCalledTimes(
                    3
                );


                expect(
                    processFn
                ).toHaveBeenNthCalledWith(
                    1,
                    [
                        1,
                        2
                    ]
                );


                expect(
                    processFn
                ).toHaveBeenNthCalledWith(
                    2,
                    [
                        3,
                        4
                    ]
                );


                expect(
                    processFn
                ).toHaveBeenNthCalledWith(
                    3,
                    [
                        5
                    ]
                );
            }
        );


        it(
            "should not call processFn for empty input",
            async () => {

                const processFn =
                    jest.fn(
                        async (
                            chunk:
                            number[]
                        ) =>
                            chunk
                    );


                const process =
                    chunkAndMapArrays<
                        number,
                        number
                    >(
                        2,
                        processFn
                    );


                expect(
                    await process([])
                ).toEqual(
                    []
                );


                expect(
                    processFn
                ).not.toHaveBeenCalled();
            }
        );


        it(
            "should process chunks sequentially",
            async () => {

                const calls:
                    number[][] =
                    [];


                const process =
                    chunkAndMapArrays<
                        number,
                        number
                    >(
                        2,
                        async chunk => {

                            calls.push(
                                chunk
                            );


                            return chunk;
                        }
                    );


                await process([
                    1,
                    2,
                    3,
                    4
                ]);


                expect(
                    calls
                ).toEqual([
                    [
                        1,
                        2
                    ],
                    [
                        3,
                        4
                    ]
                ]);
            }
        );
    }
);