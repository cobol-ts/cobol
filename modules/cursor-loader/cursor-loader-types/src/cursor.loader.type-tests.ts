import {type Errors} from "@cobol-ts/errors";

import {
    type CanonicalProjection,
    type FillFileBuffer,
    type Parser,
    type ParserConfig,
    type ParserDetails,
    type ParserPhysicalRecordContent,
    type ParserProjectionPath,
    type ParserRecordState,
    type ParserRepresentation,
    type ParserResult,
    type PhysicalRecordContent,
    type PhysicalRecordContext,
    type PhysicalRecordDebugRenderer,
    type PooledPhysicalRecordContent,
    type ProjectionAuthoring,
    type ProjectionDefinition,
    type ProjectionFactory,
    type ProjectionFieldValue,
    type ProjectionPhysicalRecord,
    type ProjectionSupport,
    type ProjectionView,
    type RecordCursor,
    type RecordCursorResult
} from "./cursor.loader.types";


type Equal<TLeft,TRight> =
    (<T>() => T extends TLeft ? 1 : 2) extends
        (<T>() => T extends TRight ? 1 : 2)
        ? true
        : false;


type Expect<T extends true> = T;


/*
 * Test parser representations and application views
 */

interface CustomerRow {
    readonly id: string;
    readonly name: string;
    readonly age: number;
}


interface TransactionRow {
    readonly customerId: string;
    readonly amount: number;
}


interface Customer {
    id(): string;
    name(): string;
    age(): number;
    initial(): string;
}


/*
 * Parser-specific configuration, prepared details, record state and compiled
 * projection path.
 */

interface DelimitedParserConfig {
    readonly separator: string;
}


interface DelimitedParserDetails {
    readonly config: DelimitedParserConfig;
    readonly separatorByte: number;
    readonly columns: ReadonlyMap<string,number>;
}


interface DelimitedRecordState {
    readonly starts: Int32Array;
    readonly ends: Int32Array;
}


type CustomerProjectionPath =
    readonly string[];


type DelimitedProjectionPath =
    number;


/*
 * Shared parser support used only to keep the parser type tests focused on the
 * parser contract rather than repetitive projection boilerplate.
 */

function parserSupport<
    TRepresentation,
    TParserDetails,
    TProjectionPath
>(
    compileProjectionPath:
    (
        details: TParserDetails,
        context: PhysicalRecordContext | undefined,
        path: readonly string[]
    ) => TProjectionPath
): ProjectionSupport<
    TRepresentation,
    TParserDetails,
    TProjectionPath
> & PhysicalRecordDebugRenderer {
    return {
        compileProjectionPath,
        integer: () => 0,
        float: () => 0,
        character: () => "",
        string: () => "",
        toDebugString: () => ""
    };
}


/*
 * Valid parsers
 */

const customerParser: Parser<
    CustomerRow,
    undefined,
    undefined,
    undefined,
    CustomerProjectionPath
> = {
    ...parserSupport<
        CustomerRow,
        undefined,
        CustomerProjectionPath
    >(
        (_details,_context,path) => path
    ),

    parse: async () => ({
        id: "customer-1",
        name: "Customer One",
        age: 42
    })
};


const delimitedCustomerParser: Parser<
    CustomerRow,
    DelimitedParserConfig,
    DelimitedParserDetails,
    DelimitedRecordState,
    DelimitedProjectionPath
> = {
    ...parserSupport<
        CustomerRow,
        DelimitedParserDetails,
        DelimitedProjectionPath
    >(
        (details,_context,path) => {
            const column =
                path.length === 1
                    ? details.columns.get(path[0])
                    : undefined;

            if (column === undefined) {
                throw new Error(
                    "Delimited projection path not found"
                );
            }

            return column;
        }
    ),

    prepare: async (record,config) => {
        const firstStart: number =
            record.recordState.starts[0];

        record.endByte =
            firstStart;

        return {
            config,
            separatorByte:
                config.separator.charCodeAt(0),
            columns:
                new Map<string,number>([
                    ["id",0],
                    ["name",1],
                    ["age",2]
                ])
        };
    },

    parse: async (record,details) => {
        const firstStart: number =
            record.recordState.starts[0];

        const firstEnd: number =
            record.recordState.ends[0];

        const separator: string =
            details.config.separator;

        const separatorByte: number =
            details.separatorByte;

        record.endByte =
            firstEnd;

        return {
            id:
                String(
                    separatorByte
                    + firstStart
                ),
            name:
            separator,
            age:
                firstEnd
                - firstStart
        };
    }
};


/*
 * Parser associated types
 */

type _CustomerRepresentation =
    Expect<
        Equal<
            ParserRepresentation<typeof customerParser>,
            CustomerRow
        >
    >;


type _CustomerConfig =
    Expect<
        Equal<
            ParserConfig<typeof customerParser>,
            undefined
        >
    >;


type _CustomerDetails =
    Expect<
        Equal<
            ParserDetails<typeof customerParser>,
            undefined
        >
    >;


type _CustomerRecordState =
    Expect<
        Equal<
            ParserRecordState<typeof customerParser>,
            undefined
        >
    >;


type _CustomerProjectionPath =
    Expect<
        Equal<
            ParserProjectionPath<typeof customerParser>,
            CustomerProjectionPath
        >
    >;


type _DelimitedRepresentation =
    Expect<
        Equal<
            ParserRepresentation<typeof delimitedCustomerParser>,
            CustomerRow
        >
    >;


type _DelimitedConfig =
    Expect<
        Equal<
            ParserConfig<typeof delimitedCustomerParser>,
            DelimitedParserConfig
        >
    >;


type _DelimitedDetails =
    Expect<
        Equal<
            ParserDetails<typeof delimitedCustomerParser>,
            DelimitedParserDetails
        >
    >;


type _DelimitedRecordState =
    Expect<
        Equal<
            ParserRecordState<typeof delimitedCustomerParser>,
            DelimitedRecordState
        >
    >;


type _DelimitedProjectionPath =
    Expect<
        Equal<
            ParserProjectionPath<typeof delimitedCustomerParser>,
            DelimitedProjectionPath
        >
    >;


/*
 * Parser configuration, details, record-state and projection-path types remain
 * independently associated with the parser.
 */

const validDelimitedConfig:
    ParserConfig<typeof delimitedCustomerParser> = {
    separator: "|"
};


const invalidDelimitedConfig:
    ParserConfig<typeof delimitedCustomerParser> = {
    // @ts-expect-error separator must be a string
    separator: 123
};


const validDelimitedDetails:
    ParserDetails<typeof delimitedCustomerParser> = {
    config:
    validDelimitedConfig,
    separatorByte:
        124,
    columns:
        new Map<string,number>([
            ["id",0],
            ["name",1],
            ["age",2]
        ])
};


// @ts-expect-error separatorByte and columns are required
const invalidDelimitedDetails:
    ParserDetails<typeof delimitedCustomerParser> = {
    config:
    validDelimitedConfig
};


const validDelimitedRecordState:
    ParserRecordState<typeof delimitedCustomerParser> = {
    starts:
        new Int32Array(4),
    ends:
        new Int32Array(4)
};


// @ts-expect-error delimited parser requires its record state
const invalidDelimitedRecordState:
    ParserRecordState<typeof delimitedCustomerParser> =
    undefined;


const validCustomerProjectionPath:
    ParserProjectionPath<typeof customerParser> = [
    "customer",
    "name"
];


const validDelimitedProjectionPath:
    ParserProjectionPath<typeof delimitedCustomerParser> =
    2;


// @ts-expect-error delimited runtime projection path is a compiled number
const invalidDelimitedProjectionPath:
    ParserProjectionPath<typeof delimitedCustomerParser> = [
    "age"
];


/*
 * Parser result typing
 */

declare const errors:
    Errors;


const validParserValue:
    ParserResult<CustomerRow> = {
    id: "customer-1",
    name: "Customer One",
    age: 42
};


const validParserErrors:
    ParserResult<CustomerRow> =
    errors;


// @ts-expect-error parser result must be the representation or Errors
const invalidParserResult:
    ParserResult<CustomerRow> =
    42;


/*
 * Parser implementation must satisfy its declared async result types.
 */

const invalidCustomerParserResult: Parser<
    CustomerRow,
    undefined,
    undefined,
    undefined,
    CustomerProjectionPath
> = {
    ...parserSupport<
        CustomerRow,
        undefined,
        CustomerProjectionPath
    >(
        (_details,_context,path) => path
    ),

    // @ts-expect-error parse must return CustomerRow or Errors
    parse: async () => ({
        customerId: "customer-1",
        amount: 42
    })
};


const synchronousCustomerParser: Parser<
    CustomerRow,
    undefined,
    undefined,
    undefined,
    CustomerProjectionPath
> = {
    ...parserSupport<
        CustomerRow,
        undefined,
        CustomerProjectionPath
    >(
        (_details,_context,path) => path
    ),

    // @ts-expect-error parse is asynchronous
    parse: () => ({
        id: "customer-1",
        name: "Customer One",
        age: 42
    })
};


const invalidPrepareResult: Parser<
    CustomerRow,
    DelimitedParserConfig,
    DelimitedParserDetails,
    DelimitedRecordState,
    DelimitedProjectionPath
> = {
    ...parserSupport<
        CustomerRow,
        DelimitedParserDetails,
        DelimitedProjectionPath
    >(
        (_details,_context,_path) => 0
    ),

    // @ts-expect-error prepare must return DelimitedParserDetails or Errors
    prepare: async (_record,config) => ({
        config,
        somethingElse: 123
    }),

    parse: async () => ({
        id: "customer-1",
        name: "Customer One",
        age: 42
    })
};


const synchronousPrepare: Parser<
    CustomerRow,
    DelimitedParserConfig,
    DelimitedParserDetails,
    DelimitedRecordState,
    DelimitedProjectionPath
> = {
    ...parserSupport<
        CustomerRow,
        DelimitedParserDetails,
        DelimitedProjectionPath
    >(
        (_details,_context,_path) => 0
    ),

    // @ts-expect-error prepare is asynchronous
    prepare: (_record,config) => ({
        config,
        separatorByte: 124,
        columns:
            new Map<string,number>()
    }),

    parse: async () => ({
        id: "customer-1",
        name: "Customer One",
        age: 42
    })
};


/*
 * Parser record-state compatibility
 */

declare const noStateParserRecord:
    ParserPhysicalRecordContent<undefined>;


declare const delimitedParserRecord:
    ParserPhysicalRecordContent<DelimitedRecordState>;


declare const delimitedDetails:
    DelimitedParserDetails;


delimitedCustomerParser.parse(
    delimitedParserRecord,
    delimitedDetails
);


void delimitedCustomerParser.parse(
    // @ts-expect-error delimited parser requires DelimitedRecordState
    noStateParserRecord,
    delimitedDetails
);


/*
 * Parser physical-record capability
 *
 * The parser may establish endByte and call readMore(). Cursor-owned positions,
 * EOF state, provenance and lifetime are intentionally unavailable for mutation.
 */

const parserReadMore:
    Promise<void> =
    delimitedParserRecord.readMore();


const parserStartByte:
    number =
    delimitedParserRecord.startByte;


const parserLastValidByte:
    number =
    delimitedParserRecord.lastValidByte;


const parserFileFinished:
    boolean =
    delimitedParserRecord.fileFinished;


const parserSource:
    string =
    delimitedParserRecord.source;


const parserRecordNumber:
    number =
    delimitedParserRecord.recordNumber;


const parserRecordState:
    DelimitedRecordState =
    delimitedParserRecord.recordState;


delimitedParserRecord.endByte =
    17;


// @ts-expect-error cursor owns startByte
noStateParserRecord.startByte =
    1;


// @ts-expect-error readMore owns lastValidByte
noStateParserRecord.lastValidByte =
    1;


// @ts-expect-error readMore owns fileFinished
noStateParserRecord.fileFinished =
    true;


// @ts-expect-error cursor owns source provenance
noStateParserRecord.source =
    "other";


// @ts-expect-error cursor owns record numbering
noStateParserRecord.recordNumber =
    99;


// @ts-expect-error parser does not own the physical-record lifetime
noStateParserRecord.close();


// @ts-expect-error parser cannot append or remove physical buffers
noStateParserRecord.buffers.push(
    new Uint8Array(8)
);


/*
 * Completed physical-record capability
 */

declare const completedRecord:
    PhysicalRecordContent<DelimitedRecordState>;


const completedSource:
    string =
    completedRecord.source;


const completedRecordNumber:
    number =
    completedRecord.recordNumber;


const completedState:
    DelimitedRecordState =
    completedRecord.recordState;


completedRecord.close();


// @ts-expect-error completed records cannot perform further I/O
completedRecord.readMore();


// @ts-expect-error completed physical range is readonly
completedRecord.endByte =
    20;


// @ts-expect-error completed EOF state is readonly
completedRecord.fileFinished =
    false;


const completePhysicalRecord:
    PhysicalRecordContent<undefined> = {
    buffers: [],
    recordState: undefined,
    startByte: 0,
    endByte: 0,
    lastValidByte: 0,
    fileFinished: true,
    source: "test-source",
    recordNumber: 1,
    close: () => undefined
};


// @ts-expect-error completed records require source provenance
const missingPhysicalRecordSource:
    PhysicalRecordContent<undefined> = {
    buffers: [],
    recordState: undefined,
    startByte: 0,
    endByte: 0,
    lastValidByte: 0,
    fileFinished: true,
    recordNumber: 1,
    close: () => undefined
};


// @ts-expect-error completed records require an explicit recordState even when undefined
const missingPhysicalRecordState:
    PhysicalRecordContent<undefined> = {
    buffers: [],
    startByte: 0,
    endByte: 0,
    lastValidByte: 0,
    fileFinished: true,
    source: "test-source",
    recordNumber: 1,
    close: () => undefined
};


/*
 * Internal pooled physical-record capability remains mutable for cursor and
 * lifetime machinery.
 */

declare const pooledRecord:
    PooledPhysicalRecordContent<DelimitedRecordState>;


pooledRecord.startByte =
    1;

pooledRecord.endByte =
    2;

pooledRecord.lastValidByte =
    8;

pooledRecord.fileFinished =
    true;

pooledRecord.source =
    "other-source";

pooledRecord.recordNumber =
    7;


pooledRecord.buffers.push(
    new Uint8Array(8)
);


pooledRecord.close();

void pooledRecord.readMore();


// @ts-expect-error the parser-owned recordState object is permanent for the pooled entry
pooledRecord.recordState =
    validDelimitedRecordState;


/*
 * Physical fill operation keeps the file type associated with the callback and
 * is asynchronous.
 */

interface TestFile {
    readonly name: string;
}


const fillFileBuffer:
    FillFileBuffer<TestFile> =
    async (file,buffer) => {
        const filename: string =
            file.name;

        const capacity: number =
            buffer.length;

        return filename.length === 0
            ? 0
            : capacity;
    };


const invalidFillResult:
    FillFileBuffer<TestFile> =
    // @ts-expect-error fill operation must resolve to a byte count
    async () => "invalid";


/*
 * Projection authoring and canonicalisation
 */

const projection = {
    id: {
        type: "string"
    },

    name: {
        type: "string",
        path: [
            "customer",
            "name"
        ]
    },

    age: {
        type: "integer"
    },

    initial: {
        type: "character",
        path: [
            "customer",
            "name"
        ]
    }
} as const satisfies ProjectionDefinition<Customer>;


type Projection =
    typeof projection;


type CanonicalCustomerProjection =
    CanonicalProjection<Projection>;


type CustomerView =
    ProjectionView<Projection>;


declare const customerView:
    CustomerView;


const projectedId:
    string =
    customerView.id();


const projectedName:
    string =
    customerView.name();


const projectedAge:
    number =
    customerView.age();


const projectedInitial:
    string =
    customerView.initial();


// @ts-expect-error integer projection accessor returns number
const invalidProjectedAge:
    string =
    customerView.age();


// @ts-expect-error string projection accessor returns string
const invalidProjectedName:
    number =
    customerView.name();


const canonicalProjection:
    CanonicalCustomerProjection = {
    id: {
        type: "string",
        path: [
            "id"
        ]
    },

    name: {
        type: "string",
        path: [
            "customer",
            "name"
        ]
    },

    age: {
        type: "integer",
        path: [
            "age"
        ]
    },

    initial: {
        type: "character",
        path: [
            "customer",
            "name"
        ]
    }
};


const invalidCanonicalProjection:
    CanonicalCustomerProjection = {
    // @ts-expect-error canonical fields always have an explicit path
    id: {
        type: "string"
    },

    name:
    canonicalProjection.name,

    age:
    canonicalProjection.age,

    initial:
    canonicalProjection.initial
};


/*
 * Projection field type compatibility
 */

type _IntegerValue =
    Expect<
        Equal<
            ProjectionFieldValue<{
                readonly type: "integer";
            }>,
            number
        >
    >;


type _FloatValue =
    Expect<
        Equal<
            ProjectionFieldValue<{
                readonly type: "float";
            }>,
            number
        >
    >;


type _CharacterValue =
    Expect<
        Equal<
            ProjectionFieldValue<{
                readonly type: "character";
            }>,
            string
        >
    >;


type _StringValue =
    Expect<
        Equal<
            ProjectionFieldValue<{
                readonly type: "string";
            }>,
            string
        >
    >;


const floatingPointProjection = {
    id: {
        type: "character"
    },

    name: {
        type: "string"
    },

    age: {
        type: "float"
    },

    initial: {
        type: "character"
    }
} as const satisfies ProjectionDefinition<Customer>;


const invalidCustomerProjection = {
    id: {
        type: "string"
    },

    name: {
        type: "string"
    },

    age: {
        // @ts-expect-error numeric accessor cannot be backed by a string field
        type: "string"
    },

    initial: {
        type: "character"
    }
} as const satisfies ProjectionDefinition<Customer>;


const projectionWithExtraField = {
    id: {
        type: "string"
    },

    name: {
        type: "string"
    },

    age: {
        type: "integer"
    },

    initial: {
        type: "character"
    },

    // @ts-expect-error projection may not define fields absent from Customer
    unknown: {
        type: "string"
    }
} as const satisfies ProjectionDefinition<Customer>;


// @ts-expect-error every Customer accessor requires a projection field
const projectionMissingField:
    ProjectionDefinition<Customer> = {
    id: {
        type: "string"
    },

    name: {
        type: "string"
    },

    age: {
        type: "integer"
    }
};


interface UnsupportedProjection {
    active(): boolean;
}


const unsupportedProjection = {
    // @ts-expect-error boolean accessors are not a supported projection field type
    active: {
        type: "string"
    }
} satisfies ProjectionDefinition<UnsupportedProjection>;


/*
 * ProjectionAuthoring accepts arbitrary logical field names but only supported
 * scalar kinds.
 */

const authoredProjection = {
    arbitrary: {
        type: "string",
        path: [
            "anything"
        ]
    }
} as const satisfies ProjectionAuthoring;


const invalidAuthoredProjection = {
    broken: {
        // @ts-expect-error unsupported projection scalar kind
        type: "boolean"
    }
} as const satisfies ProjectionAuthoring;


/*
 * ProjectionFactory keeps projection, representation and physical capabilities
 * strongly associated.
 */

declare const customerProjection:
    Customer;


declare const customerRow:
    CustomerRow;


declare const transactionRow:
    TransactionRow;


declare const projectionPhysicalRecord:
    ProjectionPhysicalRecord;


const customerProjectionFactory:
    ProjectionFactory<Customer,CustomerRow> = {
    create:
        () => customerProjection,

    bind:
        (
            target,
            representation,
            physicalRecord
        ) => {
            const id: string =
                representation.id;

            const name: string =
                target.name();

            const source: string =
                physicalRecord.source;

            const recordNumber: number =
                physicalRecord.recordNumber;

            const startByte: number =
                physicalRecord.startByte;

            const endByte: number =
                physicalRecord.endByte;

            const lastValidByte: number =
                physicalRecord.lastValidByte;

            const buffers: readonly Uint8Array[] =
                physicalRecord.buffers;

            void id;
            void name;
            void source;
            void recordNumber;
            void startByte;
            void endByte;
            void lastValidByte;
            void buffers;

            // @ts-expect-error projection capability does not own physical lifetime
            physicalRecord.close();

            // @ts-expect-error projection capability cannot perform I/O
            physicalRecord.readMore();

            // @ts-expect-error projection capability deliberately excludes parser recordState
            physicalRecord.recordState;
        },

    clear:
        target => {
            const name: string =
                target.name();

            void name;
        }
};


customerProjectionFactory.bind(
    customerProjection,
    customerRow,
    projectionPhysicalRecord
);


customerProjectionFactory.bind(
    customerProjection,
    // @ts-expect-error factory representation is CustomerRow
    transactionRow,
    projectionPhysicalRecord
);


customerProjectionFactory.bind(
    {
        // @ts-expect-error factory projection is Customer
        amount:
            () => 1
    },
    customerRow,
    projectionPhysicalRecord
);


/*
 * ProjectionSupport compilation is source-scoped.
 *
 * Canonical authoring paths are readonly string[]. The parser decides what
 * runtime path representation should be retained by the projection.
 * The optional physical-record context provides source diagnostics during
 * compilation, without exposing the record's I/O or lifetime capabilities.
 */

const projectionCompilationContext: PhysicalRecordContext = {
    source: "test-source",
    recordNumber: 1
};

const compiledCustomerPathWithContext:
    ParserProjectionPath<typeof customerParser> =
    customerParser.compileProjectionPath(
        undefined,
        projectionCompilationContext,
        ["name"]
    );

// @ts-expect-error projection compilation requires all three arguments
customerParser.compileProjectionPath(undefined, ["name"]);

customerParser.compileProjectionPath(
    undefined,
    // @ts-expect-error context must provide physical-record provenance
    {source: "test-source"},
    ["name"]
);


const compiledCustomerIdPath:
    ParserProjectionPath<typeof customerParser> =
    customerParser.compileProjectionPath(
        undefined,
        undefined,
        [
            "id"
        ]
    );


const compiledDelimitedAgePath:
    ParserProjectionPath<typeof delimitedCustomerParser> =
    delimitedCustomerParser.compileProjectionPath(
        delimitedDetails,
        undefined,
        [
            "age"
        ]
    );


// @ts-expect-error compiled delimited paths are numbers
const invalidCompiledDelimitedPath:
    ParserProjectionPath<typeof delimitedCustomerParser> =
    customerParser.compileProjectionPath(
        undefined,
        undefined,
        [
            "age"
        ]
    );


/*
 * Parser projection support is tied to representation, prepared details and
 * compiled projection-path type.
 */

const customerIdFromParser:
    string =
    customerParser.string(
        customerRow,
        undefined,
        compiledCustomerIdPath
    );


const customerAgeFromParser:
    number =
    customerParser.integer(
        customerRow,
        undefined,
        [
            "age"
        ]
    );


const delimitedAgeFromParser:
    number =
    delimitedCustomerParser.integer(
        customerRow,
        delimitedDetails,
        compiledDelimitedAgePath
    );


customerParser.string(
    // @ts-expect-error customer parser projection support consumes CustomerRow
    transactionRow,
    undefined,
    [
        "customerId"
    ]
);


delimitedCustomerParser.integer(
    customerRow,
    // @ts-expect-error delimited projection access requires prepared details
    undefined,
    2
);


delimitedCustomerParser.integer(
    customerRow,
    delimitedDetails,
    // @ts-expect-error delimited runtime projection path has already compiled to number
    [
        "age"
    ]
);


/*
 * Record cursor result carries both parser result and matching record state.
 */

declare const cursorResult:
    RecordCursorResult<
        CustomerRow,
        DelimitedRecordState
    >;


const cursorParserResult:
    ParserResult<CustomerRow> =
    cursorResult.result;


const cursorRecordState:
    DelimitedRecordState =
    cursorResult.physicalRecord.recordState;


const cursorRecordSource:
    string =
    cursorResult.physicalRecord.source;


cursorResult.physicalRecord.close();


// @ts-expect-error cursor result record state is DelimitedRecordState
const invalidCursorRecordState:
    undefined =
    cursorResult.physicalRecord.recordState;


/*
 * RecordCursor preserves representation and record-state types through the
 * async iterator boundary.
 */

declare const cursor:
    RecordCursor<
        CustomerRow,
        DelimitedRecordState
    >;


const nextRecord:
    Promise<
        IteratorResult<
            RecordCursorResult<
                CustomerRow,
                DelimitedRecordState
            >,
            void
        >
    > =
    cursor.next();


// @ts-expect-error cursor representation is CustomerRow, not TransactionRow
const wrongCursor:
    RecordCursor<
        TransactionRow,
        DelimitedRecordState
    > =
    cursor;


/*
 * Keep compile-time documentation values live for strict unused checking.
 */

void validCustomerProjectionPath;
void validDelimitedProjectionPath;
void parserReadMore;
void parserStartByte;
void parserLastValidByte;
void parserFileFinished;
void parserSource;
void parserRecordNumber;
void parserRecordState;
void completedSource;
void completedRecordNumber;
void completedState;
void validParserValue;
void validParserErrors;
void completePhysicalRecord;
void fillFileBuffer;
void projectedId;
void projectedName;
void projectedAge;
void projectedInitial;
void floatingPointProjection;
void authoredProjection;
void customerIdFromParser;
void customerAgeFromParser;
void delimitedAgeFromParser;
void compiledCustomerIdPath;
void compiledCustomerPathWithContext;
void compiledDelimitedAgePath;
void cursorParserResult;
void cursorRecordState;
void cursorRecordSource;
void nextRecord;
