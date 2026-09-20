import {
    createReadStream
} from "node:fs";

import {
    resolve
} from "node:path";

import {
    createInterface
} from "node:readline";

import {
    isErrors
} from "@cobol-ts/errors";

import {
    type CursorOptions,
    type PhysicalRecordContent,
    type RecordReaderMap
} from "@cobol-ts/cursor-loader-types";

import {
    createFileCursor
} from "@cobol-ts/cursor-loader";

import {
    csvParser
} from "@cobol-ts/cursor-loader-csv";

import {
    allCustomerConfig,
    type Customer,
    minimalCustomerConfig,
    type MinimalCustomer
} from "./cursor.loader.fixture";


const encoder =
    new TextEncoder();


/**
 * Test record reader
 *
 * This deliberately reads the real fixture file while keeping the
 * integration test focused on:
 *
 *     file cursor
 *     CSV preparation/parsing
 *     projection
 *
 * The production end-of-line reader is tested separately.
 */

const recordReaders:
    RecordReaderMap = {

    line:
        async function* (
            details
        ) {
            const filename =
                resolve(
                    process.cwd(),
                    details.filename
                );

            const input =
                createReadStream(
                    filename,
                    {
                        encoding:
                            "utf8"
                    }
                );

            const lines =
                createInterface({
                    input,
                    crlfDelay:
                    Infinity
                });


            for await (
                const line
                of lines
                ) {
                const bytes =
                    encoder.encode(
                        line
                    );

                const record:
                    PhysicalRecordContent = {

                    buffers: [
                        bytes
                    ],

                    firstBufferOffset:
                        0,

                    length:
                    bytes.length
                };


                yield record;
            }
        },


    fixed:
        async function* () {
            throw new Error(
                "fixed reader should not be used"
            );
        },


    "length-prefixed":
        async function* () {
            throw new Error(
                "length-prefixed reader should not be used"
            );
        }
};


/**
 * Parser registry
 */

const parsers = {
    csv:
    csvParser
};


/**
 * Cursor options
 */

const options:
    CursorOptions<
        typeof parsers,
        number
    > = {

    parsers,

    recordReaders,

    compareEntityId: (
        left,
        right
    ) =>
        left - right
};


/**
 * The fixture contains conventional quoted CSV fields.
 *
 * In particular:
 *
 *     "Flat 2, Rear"
 *     "Riverside, East Wing"
 *
 * so quote handling is part of the format definition, not merely an
 * optional convenience for these tests.
 */

const allCustomers =
    {
        ...allCustomerConfig.customer,

        parserConfig: {
            ...allCustomerConfig.customer
                .parserConfig,

            quote:
                "\""
        }
    };


const minimalCustomers =
    {
        ...minimalCustomerConfig.customer,

        parserConfig: {
            ...minimalCustomerConfig.customer
                .parserConfig,

            quote:
                "\""
        }
    };


/**
 * Full projection
 *
 * Exercises every configured logical CSV column and every CsvRow
 * accessor used by the fixture.
 */

test(
    "loads complete customers from the CSV fixture",
    async () => {

        const customers:
            Customer[] =
            [];


        const cursor =
            createFileCursor(
                allCustomers,
                options
            );


        for await (
            const result
            of cursor
            ) {
            if (
                isErrors(
                    result
                )
            ) {
                throw new Error(
                    result.errors.join(
                        "; "
                    )
                );
            }


            customers.push(
                result
            );
        }


        expect(
            customers
        ).toEqual([
            {
                id:
                    1001,

                name:
                    "Alice Smith",

                age:
                    42,

                address: {
                    line1:
                        "12 High Street",

                    line2:
                        "Flat 2, Rear",

                    postcode:
                        "SW1A 1AA"
                },

                status:
                    "A".charCodeAt(
                        0
                    ),

                balance:
                    1234.56
            },

            {
                id:
                    1002,

                name:
                    "Bob Jones",

                age:
                    37,

                address: {
                    line1:
                        "8 Station Road",

                    line2:
                        "",

                    postcode:
                        "LS1 4AB"
                },

                status:
                    "I".charCodeAt(
                        0
                    ),

                balance:
                    98.75
            },

            {
                id:
                    1003,

                name:
                    "Carol Brown",

                age:
                    29,

                address: {
                    line1:
                        "The Old Mill",

                    line2:
                        "Riverside, East Wing",

                    postcode:
                        "BS1 5TY"
                },

                status:
                    "A".charCodeAt(
                        0
                    ),

                balance:
                    0
            }
        ]);
    }
);


/**
 * Minimal projection
 *
 * The same physical CSV records are scanned and validated, but the
 * projection accesses only id and status.
 *
 * Unused string fields are therefore never materialised by the
 * projection.
 */

test(
    "loads minimal customers from the same CSV fixture",
    async () => {

        const customers:
            MinimalCustomer[] =
            [];


        const cursor =
            createFileCursor(
                minimalCustomers,
                options
            );


        for await (
            const result
            of cursor
            ) {
            if (
                isErrors(
                    result
                )
            ) {
                throw new Error(
                    result.errors.join(
                        "; "
                    )
                );
            }


            customers.push(
                result
            );
        }


        expect(
            customers
        ).toEqual([
            {
                id:
                    1001,

                status:
                    "A".charCodeAt(
                        0
                    )
            },

            {
                id:
                    1002,

                status:
                    "I".charCodeAt(
                        0
                    )
            },

            {
                id:
                    1003,

                status:
                    "A".charCodeAt(
                        0
                    )
            }
        ]);
    }
);
/**
 * Rich comma-separated fixture
 *
 * Exercises several legal CSV constructs through the complete:
 *
 *     physical file
 *         ->
 *     file cursor
 *         ->
 *     CSV preparation
 *         ->
 *     CSV parsing
 *         ->
 *     projection
 *
 * The detailed byte/buffer edge cases remain the responsibility of the
 * CSV parser unit tests.
 */

test(
    "loads a richer CSV fixture containing commas quotes empty fields and quoted numbers",
    async () => {

        const customers:
            Customer[] =
            [];


        const config = {
            ...allCustomerConfig.customer,

            filename:
                "test.comma.rich.csv",

            parserConfig: {
                ...allCustomerConfig.customer
                    .parserConfig,

                separator:
                    ",",

                quote:
                    "\""
            }
        };


        const cursor =
            createFileCursor(
                config,
                options
            );


        for await (
            const result
            of cursor
            ) {
            if (
                isErrors(
                    result
                )
            ) {
                throw new Error(
                    result.errors.join(
                        "; "
                    )
                );
            }


            customers.push(
                result
            );
        }


        expect(
            customers
        ).toEqual([
            {
                id:
                    1001,

                name:
                    "Alice Smith",

                age:
                    42,

                address: {
                    line1:
                        "12 High Street",

                    line2:
                        "Flat 2, Rear",

                    postcode:
                        "SW1A 1AA"
                },

                status:
                    "A".charCodeAt(
                        0
                    ),

                balance:
                    1234.56
            },

            {
                id:
                    1002,

                name:
                    "Bob Jones",

                age:
                    37,

                address: {
                    line1:
                        "8 Station Road",

                    line2:
                        "",

                    postcode:
                        "LS1 4AB"
                },

                status:
                    "I".charCodeAt(
                        0
                    ),

                balance:
                    98.75
            },

            {
                id:
                    1003,

                name:
                    "Carol Brown",

                age:
                    29,

                address: {
                    line1:
                        "The Old Mill",

                    line2:
                        "Riverside, East Wing",

                    postcode:
                        "BS1 5TY"
                },

                status:
                    "A".charCodeAt(
                        0
                    ),

                balance:
                    0
            },

            {
                id:
                    1004,

                name:
                    "David Green",

                age:
                    51,

                address: {
                    line1:
                        "7 King's Road",

                    line2:
                        `He said "use the rear entrance"`,

                    postcode:
                        "M1 2AB"
                },

                status:
                    "A".charCodeAt(
                        0
                    ),

                balance:
                    42.1
            },

            {
                id:
                    1005,

                name:
                    "Eve Black",

                age:
                    33,

                address: {
                    line1:
                        "Apartment 4",

                    line2:
                        `Floor 2, "West Wing"`,

                    postcode:
                        "EH1 1AA"
                },

                status:
                    "I".charCodeAt(
                        0
                    ),

                balance:
                    100
            },

            {
                id:
                    1006,

                name:
                    "Frank White",

                age:
                    60,

                address: {
                    line1:
                        "1 Market Street",

                    line2:
                        "",

                    postcode:
                        "AB1 2CD"
                },

                status:
                    "A".charCodeAt(
                        0
                    ),

                balance:
                    123.45
            },

            {
                id:
                    1007,

                name:
                    "Grace Blue",

                age:
                    44,

                address: {
                    line1:
                        "2 River Road",

                    line2:
                        `Comma, and "quotes" together`,

                    postcode:
                        "YO1 7AA"
                },

                status:
                    "A".charCodeAt(
                        0
                    ),

                balance:
                    9.5
            }
        ]);
    }
);


/**
 * Non-comma separator
 *
 * This proves that separator configuration survives the complete file
 * cursor / parser path rather than comma behaviour being accidentally
 * hard-coded somewhere in the integration.
 */

test(
    "loads a pipe-separated fixture including quoted pipe characters",
    async () => {

        const customers:
            Customer[] =
            [];


        const config = {
            ...allCustomerConfig.customer,

            filename:
                "test.pipe.psv",

            parserConfig: {
                ...allCustomerConfig.customer
                    .parserConfig,

                separator:
                    "|",

                quote:
                    "\""
            }
        };


        const cursor =
            createFileCursor(
                config,
                options
            );


        for await (
            const result
            of cursor
            ) {
            if (
                isErrors(
                    result
                )
            ) {
                throw new Error(
                    result.errors.join(
                        "; "
                    )
                );
            }


            customers.push(
                result
            );
        }


        expect(
            customers
        ).toEqual([
            {
                id:
                    2001,

                name:
                    "Alice Pipe",

                age:
                    40,

                address: {
                    line1:
                        "10 North | Road",

                    line2:
                        "Wing | A",

                    postcode:
                        "P1 1AA"
                },

                status:
                    "A".charCodeAt(
                        0
                    ),

                balance:
                    12.5
            },

            {
                id:
                    2002,

                name:
                    "Bob Pipe",

                age:
                    41,

                address: {
                    line1:
                        "20 South Road",

                    line2:
                        `He said "hello"`,

                    postcode:
                        "P2 2BB"
                },

                status:
                    "I".charCodeAt(
                        0
                    ),

                balance:
                    20
            },

            {
                id:
                    2003,

                name:
                    "Carol Pipe",

                age:
                    42,

                address: {
                    line1:
                        "30 East Road",

                    line2:
                        "",

                    postcode:
                        "P3 3CC"
                },

                status:
                    "A".charCodeAt(
                        0
                    ),

                balance:
                    0
            }
        ]);
    }
);


/**
 * Malformed quoted record
 *
 * The malformed third physical line should produce one recoverable CSV
 * error. The following valid line must still be processed.
 */

test(
    "reports an unterminated quoted field with filename and line number and continues",
    async () => {

        const config = {
            ...allCustomerConfig.customer,

            filename:
                "test.comma.unterminated.csv",

            parserConfig: {
                ...allCustomerConfig.customer
                    .parserConfig,

                separator:
                    ",",

                quote:
                    "\""
            }
        };


        const results =
            [];


        const cursor =
            createFileCursor(
                config,
                options
            );


        for await (
            const result
            of cursor
            ) {
            results.push(
                result
            );
        }


        expect(
            results
        ).toHaveLength(
            3
        );


        const first =
            results[
                0
                ];

        const malformed =
            results[
                1
                ];

        const last =
            results[
                2
                ];


        expect(
            isErrors(
                first
            )
        ).toBe(
            false
        );

        expect(
            isErrors(
                malformed
            )
        ).toBe(
            true
        );

        expect(
            isErrors(
                last
            )
        ).toBe(
            false
        );


        if (
            !isErrors(
                malformed
            )
        ) {
            throw new Error(
                "expected malformed line to produce Errors"
            );
        }


        expect(
            malformed.errors
        ).toHaveLength(
            1
        );

        expect(
            malformed.errors[
                0
                ]
        ).toContain(
            "test.comma.unterminated.csv: line 3:"
        );

        expect(
            malformed.errors[
                0
                ]
        ).toContain(
            "CSV record column 5"
        );

        expect(
            malformed.errors[
                0
                ]
        ).toContain(
            "record ended before a closing quote was found"
        );


        if (
            isErrors(
                first
            )
            || isErrors(
                last
            )
        ) {
            throw new Error(
                "expected valid records before and after malformed record"
            );
        }


        expect(
            first.id
        ).toBe(
            1001
        );

        expect(
            last.id
        ).toBe(
            1003
        );
    }
);


/**
 * Physical-width error
 *
 * The malformed record is structurally valid CSV, but contains one more
 * physical field than the header.
 *
 * This is the exact class of failure that exposed the missing quote
 * configuration in the original integration fixture.
 */

test(
    "reports an extra physical CSV column with filename and line number and continues",
    async () => {

        const config = {
            ...allCustomerConfig.customer,

            filename:
                "test.comma.width.csv",

            parserConfig: {
                ...allCustomerConfig.customer
                    .parserConfig,

                separator:
                    ",",

                quote:
                    "\""
            }
        };


        const results =
            [];


        const cursor =
            createFileCursor(
                config,
                options
            );


        for await (
            const result
            of cursor
            ) {
            results.push(
                result
            );
        }


        expect(
            results
        ).toHaveLength(
            3
        );


        const first =
            results[
                0
                ];

        const malformed =
            results[
                1
                ];

        const last =
            results[
                2
                ];


        if (
            !isErrors(
                malformed
            )
        ) {
            throw new Error(
                "expected malformed line to produce Errors"
            );
        }


        expect(
            malformed.errors
        ).toEqual([
            "test.comma.width.csv: line 3: CSV record has 9 physical columns, but its header has 8. The record therefore contains 1 extra column."
        ]);


        if (
            isErrors(
                first
            )
            || isErrors(
                last
            )
        ) {
            throw new Error(
                "expected valid records before and after malformed record"
            );
        }


        expect(
            first.id
        ).toBe(
            1001
        );

        expect(
            last.id
        ).toBe(
            1003
        );
    }
);


/**
 * Header/schema failure
 *
 * Parser preparation fails on line 1 and the cursor must stop because
 * subsequent records cannot be interpreted safely without prepared
 * header information.
 */

test(
    "reports all missing required header columns and the actual header",
    async () => {

        const config = {
            ...allCustomerConfig.customer,

            filename:
                "test.comma.bad-header.csv",

            parserConfig: {
                ...allCustomerConfig.customer
                    .parserConfig,

                separator:
                    ",",

                quote:
                    "\""
            }
        };


        const results =
            [];


        const cursor =
            createFileCursor(
                config,
                options
            );


        for await (
            const result
            of cursor
            ) {
            results.push(
                result
            );
        }


        expect(
            results
        ).toHaveLength(
            1
        );


        const result =
            results[
                0
                ];


        if (
            !isErrors(
                result
            )
        ) {
            throw new Error(
                "expected malformed header to produce Errors"
            );
        }


        expect(
            result.errors
        ).toEqual([
            'test.comma.bad-header.csv: line 1: CSV header is missing required columns: "addressLine2", "postcode", "balance". Actual header columns are: "id", "name", "age", "addressLine1", "status".'
        ]);
    }
);