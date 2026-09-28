import {
    type CursorLoaderConfig,
    type CursorOptions,
    type EntityDataSet,
    type FixedFile,
    type LengthPrefixedFile,
    type LineFile,
    type Parser,
    type ParserMap,
    type ParserRecordState,
    type PhysicalRecordContent,
    type RecordReaderMap
} from "./cursor.loader.types";


/*
 * Test parser representations
 */

interface CustomerRow {
    id: string;
    name: string;
}


interface TransactionRow {
    customerId: string;
    amount: number;
}


/*
 * Test application values
 */

interface Customer {
    id: string;
    displayName: string;
}


interface Transaction {
    customerId: string;
    amount: number;
}


/*
 * Parser-specific configuration and prepared details
 */

interface DelimitedParserConfig {
    readonly separator: string;
}


interface DelimitedParserDetails {
    readonly config: DelimitedParserConfig;
    readonly separatorByte: number;
}


/*
 * Parser-specific per-record state
 */

interface DelimitedRecordState {
    readonly starts: Int32Array;
    readonly ends: Int32Array;
}


/*
 * Valid parsers
 *
 * These parsers require no source-specific parser configuration,
 * prepared details or per-record state.
 */

const customerParser:
    Parser<
        CustomerRow,
        undefined,
        undefined,
        undefined
    > = {

    parse: () => ({
        id: "customer-1",
        name: "Customer One"
    })
};


const transactionParser:
    Parser<
        TransactionRow,
        undefined,
        undefined,
        undefined
    > = {

    parse: () => ({
        customerId: "customer-1",
        amount: 42
    })
};


/*
 * Parser requiring source-specific configuration and prepared details.
 */

const delimitedCustomerParser:
    Parser<
        CustomerRow,
        DelimitedParserConfig,
        DelimitedParserDetails,
        DelimitedRecordState
    > = {

    prepare: (
        _firstRecord,
        config
    ) => ({
        config,

        separatorByte:
            config.separator.charCodeAt(
                0
            )
    }),

    parse: (
        record,
        details
    ) => {
        const firstStart: number =
            record.recordState.starts[0];

        return {
            id:
                String(
                    details.separatorByte
                    + firstStart
                ),

            name:
            details.config.separator
        };
    }
};


const parsers = {
    customer:
    customerParser,

    transaction:
    transactionParser,

    delimitedCustomer:
    delimitedCustomerParser
} satisfies ParserMap;


type Parsers =
    typeof parsers;


/*
 * Parser record-state associated type
 */

type CustomerRecordState =
    ParserRecordState<
        typeof customerParser
    >;


const customerRecordState:
    CustomerRecordState =
    undefined;


// @ts-expect-error customer parser has no per-record state
const invalidCustomerRecordState:
    CustomerRecordState = {
    starts: new Int32Array(1),
    ends: new Int32Array(1)
};


type DelimitedCustomerRecordState =
    ParserRecordState<
        typeof delimitedCustomerParser
    >;


declare const delimitedRecordState:
    DelimitedCustomerRecordState;


const delimitedFirstStart: number =
    delimitedRecordState.starts[0];


// @ts-expect-error delimited parser requires DelimitedRecordState
const invalidDelimitedRecordState:
    undefined =
    delimitedRecordState;


/*
 * Parser implementation must satisfy its declared representation
 */

const invalidCustomerParser:
    Parser<
        CustomerRow,
        undefined,
        undefined,
        undefined
    > = {

    // @ts-expect-error parser must return CustomerRow
    parse: () => ({
        customerId: "customer-1",
        amount: 42
    })
};


/*
 * Parser implementation receives its declared prepared details.
 */

const parserUsesDetails:
    Parser<
        CustomerRow,
        DelimitedParserConfig,
        DelimitedParserDetails,
        DelimitedRecordState
    > = {

    prepare: (
        _firstRecord,
        config
    ) => ({
        config,

        separatorByte:
            config.separator.charCodeAt(
                0
            )
    }),

    parse: (
        _record,
        details
    ) => {
        const separator: string =
            details.config.separator;

        const separatorByte: number =
            details.separatorByte;

        return {
            id:
                String(
                    separatorByte
                ),

            name:
            separator
        };
    }
};


/*
 * prepare receives the declared parser configuration.
 */

const parserUsesConfig:
    Parser<
        CustomerRow,
        DelimitedParserConfig,
        DelimitedParserDetails,
        DelimitedRecordState
    > = {

    prepare: (
        _firstRecord,
        config
    ) => {
        const separator: string =
            config.separator;

        return {
            config,

            separatorByte:
                separator.charCodeAt(
                    0
                )
        };
    },

    parse: (
        _record,
        details
    ) => ({
        id:
            String(
                details.separatorByte
            ),

        name:
        details.config.separator
    })
};


/*
 * prepare must return the declared prepared details type.
 */

const invalidPrepareResult:
    Parser<
        CustomerRow,
        DelimitedParserConfig,
        DelimitedParserDetails,
        DelimitedRecordState
    > = {

    // @ts-expect-error prepare must return DelimitedParserDetails
    prepare: (
        _firstRecord,
        config
    ) => ({
        config,
        somethingElse: 123
    }),

    parse: () => ({
        id: "customer-1",
        name: "Customer One"
    })
};


/*
 * A parser accepts only physical records carrying its declared state.
 */

declare const noStatePhysicalRecord:
    PhysicalRecordContent<undefined>;


declare const delimitedPhysicalRecord:
    PhysicalRecordContent<DelimitedRecordState>;


declare const delimitedPreparedDetails:
    DelimitedParserDetails;


delimitedCustomerParser.parse(
    delimitedPhysicalRecord,
    delimitedPreparedDetails
);


delimitedCustomerParser.parse(
    // @ts-expect-error delimited parser requires DelimitedRecordState
    noStatePhysicalRecord,
    delimitedPreparedDetails
);


/*
 * Parser registry entries must be parsers
 */

const invalidParserMap = {
    customer:
    customerParser,

    broken: {
        // @ts-expect-error registry values must implement Parser
        somethingElse: () =>
            "not a parser"
    }
} satisfies ParserMap;


/*
 * Valid configuration
 */

const config = {
    customer: {
        type: "line",
        filename: "customers.csv",
        parser: "customer",

        project: (
            row: CustomerRow
        ): Customer => ({
            id:
            row.id,

            displayName:
            row.name
        }),

        entityId: (
            customer: Customer
        ) =>
            customer.id,

        cardinality:
            "one"
    },

    transactions: {
        type: "line",
        filename: "transactions.csv",
        parser: "transaction",

        project: (
            row: TransactionRow
        ): Transaction => ({
            customerId:
            row.customerId,

            amount:
            row.amount
        }),

        entityId: (
            transaction: Transaction
        ) =>
            transaction.customerId,

        cardinality:
            "many"
    }
} satisfies CursorLoaderConfig<
    Parsers,
    string
>;


/*
 * Dataset inference
 */

type DataSet =
    EntityDataSet<
        typeof config
    >;


declare const dataset:
    DataSet;


/*
 * Positive dataset type tests
 */

const customer: Customer =
    dataset.customer;


const customerId: string =
    dataset.customer.id;


const customerName: string =
    dataset.customer.displayName;


const transactions: Transaction[] =
    dataset.transactions;


const transaction: Transaction =
    dataset.transactions[0];


const transactionAmount: number =
    dataset.transactions[0].amount;


/*
 * "one" must not behave as "many"
 */

// @ts-expect-error customer is not an array
dataset.customer.map(
    (customerValue:any) =>
        customerValue.id
);


// @ts-expect-error customer is not assignable to Customer[]
const badCustomerArray: Customer[] =
    dataset.customer;


/*
 * "many" must behave as an array
 */

// @ts-expect-error transactions is an array, not a single Transaction
dataset.transactions.amount;


// @ts-expect-error Transaction[] is not assignable to Transaction
const badTransaction: Transaction =
    dataset.transactions;


/*
 * Error API is constrained to configured source names
 */

dataset.errorsFor(
    "customer"
);

dataset.errorsFor(
    "transactions"
);

dataset.errorsFor(
    // @ts-expect-error "accounts" is not a configured source
    "accounts"
);


/*
 * Illegal parser name
 */

const invalidParserConfig = {
    customer: {
        type: "line",
        filename: "customers.csv",

        // @ts-expect-error parser must be a key of parsers
        parser: "does-not-exist",

        project: (
            row: CustomerRow
        ): Customer => ({
            id:
            row.id,

            displayName:
            row.name
        }),

        entityId: (
            customer: Customer
        ) =>
            customer.id,

        cardinality:
            "one"
    }
} satisfies CursorLoaderConfig<
    Parsers,
    string
>;


/*
 * Projection input must match the representation
 * produced by the selected parser
 */

const invalidProjectionConfig = {
    // @ts-expect-error projection input does not match selected parser representation
    customer: {
        type: "line",
        filename: "customers.csv",
        parser: "customer",

        project: (
            row: TransactionRow
        ): Customer => ({
            id:
            row.customerId,

            displayName:
                String(
                    row.amount
                )
        }),

        entityId: (
            customer: Customer
        ) =>
            customer.id,

        cardinality:
            "one"
    }
} satisfies CursorLoaderConfig<
    Parsers,
    string
>;


/*
 * Illegal cardinality
 */

const invalidCardinalityConfig = {
    customer: {
        type: "line",
        filename: "customers.csv",
        parser: "customer",

        project: (
            row: CustomerRow
        ): Customer => ({
            id:
            row.id,

            displayName:
            row.name
        }),

        entityId: (
            customer: Customer
        ) =>
            customer.id,

        // @ts-expect-error invalid cardinality
        cardinality:
            "lots"
    }
} satisfies CursorLoaderConfig<
    Parsers,
    string
>;


/*
 * Entity ID type must match the common EntityId
 */

const invalidEntityIdConfig = {
    customer: {
        type: "line",
        filename: "customers.csv",
        parser: "customer",

        project: (
            row: CustomerRow
        ): Customer => ({
            id:
            row.id,

            displayName:
            row.name
        }),

        // @ts-expect-error configured EntityId is string
        entityId: (
            _customer: Customer
        ): number =>
            123,

        cardinality:
            "one"
    }
} satisfies CursorLoaderConfig<
    Parsers,
    string
>;


/*
 * Required FileDetails members must be present
 */

const missingEntityIdConfig = {
    // @ts-expect-error entityId is required
    customer: {
        type: "line",
        filename: "customers.csv",
        parser: "customer",

        project: (
            row: CustomerRow
        ): Customer => ({
            id:
            row.id,

            displayName:
            row.name
        }),

        cardinality:
            "one"
    }
} satisfies CursorLoaderConfig<
    Parsers,
    string
>;


/*
 * Optional cardinality
 */

const optionalConfig = {
    customer: {
        type: "line",
        filename: "customers.csv",
        parser: "customer",

        project: (
            row: CustomerRow
        ): Customer => ({
            id:
            row.id,

            displayName:
            row.name
        }),

        entityId: (
            customer: Customer
        ) =>
            customer.id,

        cardinality:
            "optional"
    }
} satisfies CursorLoaderConfig<
    Parsers,
    string
>;


type OptionalDataSet =
    EntityDataSet<
        typeof optionalConfig
    >;


declare const optionalDataset:
    OptionalDataSet;


const optionalCustomer:
    Customer | undefined =
    optionalDataset.customer;


// @ts-expect-error optional source may be undefined
const requiredCustomer: Customer =
    optionalDataset.customer;


/*
 * Validation function input types
 */

const validationConfig = {
    customer: {
        type: "line",
        filename: "customers.csv",
        parser: "customer",

        project: (
            row: CustomerRow
        ): Customer => ({
            id:
            row.id,

            displayName:
            row.name
        }),

        entityId: (
            customer: Customer
        ) =>
            customer.id,

        cardinality:
            "one",

        checkRepresentation: (
            row: CustomerRow
        ): readonly string[] =>
            row.id.length === 0
                ? [
                    "missing id"
                ]
                : []
    }
} satisfies CursorLoaderConfig<
    Parsers,
    string
>;


/*
 * Representation validation must match parser representation
 */

const invalidRepresentationValidationConfig = {
    // @ts-expect-error representation validator input must match selected parser representation
    customer: {
        type: "line",
        filename: "customers.csv",
        parser: "customer",

        project: (
            row: CustomerRow
        ): Customer => ({
            id:
            row.id,

            displayName:
            row.name
        }),

        entityId: (
            customer: Customer
        ) =>
            customer.id,

        cardinality:
            "one",

        checkRepresentation: (
            _row: TransactionRow
        ): readonly string[] =>
            []
    }
} satisfies CursorLoaderConfig<
    Parsers,
    string
>;


/*
 * Parser configuration is not required for a parser whose
 * ParserConfig type is undefined.
 */

const noParserConfig = {
    customer: {
        type: "line",
        filename: "customers.csv",
        parser: "customer",

        project: (
            row: CustomerRow
        ): Customer => ({
            id:
            row.id,

            displayName:
            row.name
        }),

        entityId: (
            customer: Customer
        ) =>
            customer.id,

        cardinality:
            "one"
    }
} satisfies CursorLoaderConfig<
    Parsers,
    string
>;


/*
 * A parser with source-specific configuration requires parserConfig.
 */

const parserConfig = {
    customer: {
        type: "line",
        filename: "customers.psv",
        parser: "delimitedCustomer",

        parserConfig: {
            separator:
                "|"
        },

        project: (
            row: CustomerRow
        ): Customer => ({
            id:
            row.id,

            displayName:
            row.name
        }),

        entityId: (
            customer: Customer
        ) =>
            customer.id,

        cardinality:
            "one"
    }
} satisfies CursorLoaderConfig<
    Parsers,
    string
>;


/*
 * Missing parser configuration is rejected when the selected parser
 * requires it.
 */

const missingParserConfig = {
    // @ts-expect-error delimitedCustomer requires parserConfig
    customer: {
        type: "line",
        filename: "customers.psv",
        parser: "delimitedCustomer",

        project: (
            row: CustomerRow
        ): Customer => ({
            id:
            row.id,

            displayName:
            row.name
        }),

        entityId: (
            customer: Customer
        ) =>
            customer.id,

        cardinality:
            "one"
    }
} satisfies CursorLoaderConfig<
    Parsers,
    string
>;


/*
 * Parser configuration must match the selected parser's
 * ParserConfig type.
 */

const invalidParserConfigType = {
    customer: {
        type: "line",
        filename: "customers.psv",
        parser: "delimitedCustomer",

        parserConfig: {
            // @ts-expect-error separator must be string
            separator:
                123
        },

        project: (
            row: CustomerRow
        ): Customer => ({
            id:
            row.id,

            displayName:
            row.name
        }),

        entityId: (
            customer: Customer
        ) =>
            customer.id,

        cardinality:
            "one"
    }
} satisfies CursorLoaderConfig<
    Parsers,
    string
>;


/*
 * Configuration belonging to another parser must not be accepted.
 */

const unexpectedParserConfig = {
    // @ts-expect-error customer parser does not accept parserConfig
    customer: {
        type: "line",
        filename: "customers.csv",
        parser: "customer",

        parserConfig: {
            separator:
                ","
        },

        project: (
            row: CustomerRow
        ): Customer => ({
            id:
            row.id,

            displayName:
            row.name
        }),

        entityId: (
            customer: Customer
        ) =>
            customer.id,

        cardinality:
            "one"
    }
} satisfies CursorLoaderConfig<
    Parsers,
    string
>;


/*
 * Prepared parser details are not part of FileDetails.
 *
 * Consumers configure the parser using parserConfig. ParserDetails
 * are produced internally by prepare().
 */

const preparedDetailsMustNotBeConfigured = {
    customer: {
        type: "line",
        filename: "customers.psv",
        parser: "delimitedCustomer",

        parserConfig: {
            separator:
                "|"
        },

        // @ts-expect-error FileDetails contains parserConfig, not prepared parserDetails
        parserDetails: {
            config: {
                separator:
                    "|"
            },

            separatorByte:
                124
        },

        project: (
            row: CustomerRow
        ): Customer => ({
            id:
            row.id,

            displayName:
            row.name
        }),

        entityId: (
            customer: Customer
        ) =>
            customer.id,

        cardinality:
            "one"
    }
} satisfies CursorLoaderConfig<
    Parsers,
    string
>;


/*
 * Fixed files require a record size
 */

const fixedConfig = {
    customer: {
        type: "fixed",
        filename: "customers.dat",
        recordSize: 128,
        parser: "customer",

        project: (
            row: CustomerRow
        ): Customer => ({
            id:
            row.id,

            displayName:
            row.name
        }),

        entityId: (
            customer: Customer
        ) =>
            customer.id,

        cardinality:
            "one"
    }
} satisfies CursorLoaderConfig<
    Parsers,
    string
>;


/*
 * Fixed files without a record size are invalid
 */

const invalidFixedConfig = {
    // @ts-expect-error fixed files require recordSize
    customer: {
        type: "fixed",
        filename: "customers.dat",
        parser: "customer",

        project: (
            row: CustomerRow
        ): Customer => ({
            id:
            row.id,

            displayName:
            row.name
        }),

        entityId: (
            customer: Customer
        ) =>
            customer.id,

        cardinality:
            "one"
    }
} satisfies CursorLoaderConfig<
    Parsers,
    string
>;


/*
 * Length-prefixed files require prefix configuration
 */

const lengthPrefixedConfig = {
    customer: {
        type:
            "length-prefixed",

        filename:
            "customers.dat",

        prefixSize:
            4,

        recordLength: (
            buffers:
            readonly Uint8Array[],

            prefixStart:
            number
        ) =>
            (
                (
                    buffers[
                        0
                        ][
                        prefixStart
                        ]
                    << 8
                )
                | buffers[
                    0
                    ][
                prefixStart + 1
                    ]
            ),

        parser:
            "customer",

        project: (
            row: CustomerRow
        ): Customer => ({
            id:
            row.id,

            displayName:
            row.name
        }),

        entityId: (
            customer: Customer
        ) =>
            customer.id,

        cardinality:
            "one"
    }
} satisfies CursorLoaderConfig<
    Parsers,
    string
>;


/*
 * Length-prefixed recordLength receives physical buffers and logical
 * prefix start rather than a copied contiguous prefix.
 */

const invalidLengthPrefixedRecordLength = {
    customer: {
        type:
            "length-prefixed",

        filename:
            "customers.dat",

        prefixSize:
            4,

        // @ts-expect-error recordLength receives buffers and prefixStart
        recordLength: (
            prefix:
            Uint8Array
        ): number =>
            prefix[
                0
                ],

        parser:
            "customer",

        project: (
            row: CustomerRow
        ): Customer => ({
            id:
            row.id,

            displayName:
            row.name
        }),

        entityId: (
            customer: Customer
        ) =>
            customer.id,

        cardinality:
            "one"
    }
} satisfies CursorLoaderConfig<
    Parsers,
    string
>;


/*
 * Illegal physical file type
 */

const invalidPhysicalTypeConfig = {
    customer: {
        // @ts-expect-error unsupported physical file type
        type: "csv",
        filename: "customers.csv",
        parser: "customer",

        project: (
            row: CustomerRow
        ): Customer => ({
            id:
            row.id,

            displayName:
            row.name
        }),

        entityId: (
            customer: Customer
        ) =>
            customer.id,

        cardinality:
            "one"
    }
} satisfies CursorLoaderConfig<
    Parsers,
    string
>;


/*
 * CursorOptions is a heterogeneous record-reader registry boundary.
 *
 * Individual RecordReader entries remain strongly typed, but different
 * entries may carry different TRecordState types. CursorOptions therefore
 * exposes the registry as RecordReaderMap<unknown>.
 */

const heterogeneousRecordReaders = {
    line:
        async function* (
            _details: LineFile
        ) {
            yield physicalRecord(
                new Uint8Array(0),
                undefined
            );
        },

    fixed:
        async function* (
            _details: FixedFile
        ) {
            yield physicalRecord(
                new Uint8Array(0),
                {
                    starts:
                        new Int32Array(
                            1
                        ),

                    ends:
                        new Int32Array(
                            1
                        )
                } satisfies DelimitedRecordState
            );
        },

    "length-prefixed":
        async function* (
            _details:
            LengthPrefixedFile
        ) {
            yield physicalRecord(
                new Uint8Array(0),
                undefined
            );
        }
};


const heterogeneousCursorOptions:
    CursorOptions<
        Parsers,
        string
    > = {

    parsers,

    recordReaders:
    heterogeneousRecordReaders,

    compareEntityId:
        (
            left,
            right
        ) =>
            left.localeCompare(
                right
            )
};


/*
 * Record reader map must contain every physical file type
 */

const completeRecordReaders = {
    line:
        async function* (
            _details
        ) {
        },

    fixed:
        async function* (
            _details
        ) {
        },

    "length-prefixed":
        async function* (
            _details
        ) {
        }
} satisfies RecordReaderMap<undefined>;


/*
 * Missing record reader is invalid
 */

const missingRecordReader = {
    line:
        async function* (
            _details: LineFile
        ) {
        },

    fixed:
        async function* (
            _details: FixedFile
        ) {
        }

// @ts-expect-error every physical file type must have a record reader
} satisfies RecordReaderMap<undefined>;


/*
 * Record reader details must match the physical file type
 */

const invalidRecordReaderDetails = {
    // @ts-expect-error line reader must accept LineFile
    line:
        async function* (
            _details: FixedFile
        ) {
        },

    fixed:
        async function* (
            _details: FixedFile
        ) {
        },

    "length-prefixed":
        async function* (
            _details:
            LengthPrefixedFile
        ) {
        }
} satisfies RecordReaderMap<undefined>;


/*
 * Test physical-record helper
 *
 * RecordReader implementations now return a read-only physical-record
 * view rather than a raw Uint8Array.
 *
 * These type tests use one contiguous buffer whose record starts at
 * offset zero.
 */

function physicalRecord<TRecordState>(
    bytes: Uint8Array,
    recordState: TRecordState
): PhysicalRecordContent<TRecordState> {

    return {
        buffers: [
            bytes
        ],

        startOffset:
            0,

        length:
        bytes.length,

        recordState
    };
}


/*
 * Physical records require an explicit record state.
 */

// @ts-expect-error recordState is required even when its type is undefined
const missingPhysicalRecordState:
    PhysicalRecordContent<undefined> = {
    buffers: [
        new Uint8Array(0)
    ],

    startOffset:
        0,

    length:
        0
};


/*
 * Fixed reader receives recordSize
 */

const fixedReaderUsesRecordSize:
    RecordReaderMap<undefined>["fixed"] =
    async function* (
        details
    ) {
        const size: number =
            details.recordSize;

        yield physicalRecord(
            new Uint8Array(
                size
            ),
            undefined
        );
    };


/*
 * Length-prefixed reader receives prefix configuration
 */

const lengthPrefixedReaderUsesDetails:
    RecordReaderMap<undefined>[
        "length-prefixed"
        ] =
    async function* (
        details
    ) {
        const prefixSize:
            number =
            details.prefixSize;


        const buffers:
            readonly Uint8Array[] = [
            new Uint8Array(
                prefixSize
            )
        ];


        const length:
            number =
            details.recordLength(
                buffers,
                0
            );


        yield physicalRecord(
            new Uint8Array(
                length
            ),
            undefined
        );
    };


/*
 * Line reader does not expose fixed-size configuration
 */

const lineReaderHasOnlyLineDetails:
    RecordReaderMap<undefined>["line"] =
    async function* (
        details
    ) {
        const filename: string =
            details.filename;

        // @ts-expect-error LineFile has no recordSize
        details.recordSize;

        yield physicalRecord(
            new Uint8Array(
                filename.length
            ),
            undefined
        );
    };
