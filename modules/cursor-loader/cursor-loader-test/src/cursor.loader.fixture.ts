import {
    type CursorLoaderConfig,
    type ParserMap
} from "@cobol-ts/cursor-loader-types";

import {
    csvParser,
    type CsvParserDetails,
    type CsvRow
} from "@cobol-ts/cursor-loader-csv";


/**
 * Application values
 */

export interface CustomerAddress {
    line1: string;
    line2: string;
    postcode: string;
}


export interface Customer {
    id: number;
    name: string;
    age: number;
    address: CustomerAddress;
    status: number;
    balance: number;
}


export type MinimalCustomer =
    Pick<
        Customer,
        "id" | "status"
    >;


/**
 * CSV parser details
 *
 * These are the static CSV details supplied as parserConfig.
 *
 * prepare() combines these details with the CSV header to create the
 * per-file CsvPreparedDetails used while parsing data records.
 */

export const customerCsvDetails = {
    separator:
        ",",

    quote:
        "\"",

    columns: [
        {
            name:
                "id",

            type:
                "integer"
        },
        {
            name:
                "name",

            type:
                "string"
        },
        {
            name:
                "age",

            type:
                "integer"
        },
        {
            name:
                "addressLine1",

            type:
                "string"
        },
        {
            name:
                "addressLine2",

            type:
                "string"
        },
        {
            name:
                "postcode",

            type:
                "string"
        },
        {
            name:
                "status",

            type:
                "character"
        },
        {
            name:
                "balance",

            type:
                "float"
        }
    ]
} satisfies CsvParserDetails;


/**
 * Parser registry
 */

export const parsers = {
    csv:
    csvParser
} satisfies ParserMap;


/**
 * Full customer configuration
 *
 * Exercises every configured logical CSV column.
 */

export const allCustomerConfig = {
    customer: {
        type:
            "line",

        filename:
            "test.comma.csv",

        parser:
            "csv",

        parserConfig:
        customerCsvDetails,

        project: (
            row: CsvRow
        ): Customer => ({
            id:
                row.integer(
                    0
                ),

            name:
                row.string(
                    1
                ),

            age:
                row.integer(
                    2
                ),

            address: {
                line1:
                    row.string(
                        3
                    ),

                line2:
                    row.string(
                        4
                    ),

                postcode:
                    row.string(
                        5
                    )
            },

            status:
                row.character(
                    6
                ),

            balance:
                row.float(
                    7
                )
        }),

        entityId: (
            customer: Customer
        ): number =>
            customer.id,

        cardinality:
            "one"
    }
} satisfies CursorLoaderConfig<
    typeof parsers,
    number
>;


/**
 * Minimal customer configuration
 *
 * Uses the same physical CSV schema but deliberately accesses only the
 * values required by the resulting application object.
 *
 * This is important for the low-allocation design.
 *
 * The CSV parser still scans the complete physical row once because it
 * must validate CSV syntax and locate field boundaries.
 *
 * However, unused string columns are never decoded or materialised.
 */

export const minimalCustomerConfig = {
    customer: {
        type:
            "line",

        filename:
            "test.comma.csv",

        parser:
            "csv",

        parserConfig:
        customerCsvDetails,

        project: (
            row: CsvRow
        ): MinimalCustomer => ({
            id:
                row.integer(
                    0
                ),

            status:
                row.character(
                    6
                )
        }),

        entityId: (
            customer:
            MinimalCustomer
        ): number =>
            customer.id,

        cardinality:
            "one"
    }
} satisfies CursorLoaderConfig<
    typeof parsers,
    number
>;