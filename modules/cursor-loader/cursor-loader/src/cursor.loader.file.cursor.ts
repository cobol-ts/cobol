import {
    type Errors,
    isErrors
} from "@cobol-ts/errors";

import {
    type CursorOptions,
    type FileDetails,
    NO_VALIDATION_ERRORS,
    type ParserDetails,
    type ParserMap,
    type PhysicalFileDetails,
    type RecordReader
} from "@cobol-ts/cursor-loader-types";


export async function* createFileCursor<
    TParsers extends ParserMap,
    TEntityId,
    TParserName extends keyof TParsers & string,
    TResult
>(
    details:
    FileDetails<
        TParsers,
        TParserName,
        TResult,
        TEntityId
    >,
    options:
    CursorOptions<
        TParsers,
        TEntityId
    >
): AsyncGenerator<
    TResult | Errors,
    void,
    unknown
> {

    const parser =
        options.parsers[
            details.parser
            ];


    /**
     * RecordReaderMap is the dispatch table for physical file types.
     *
     * TypeScript does not preserve the relationship between the
     * discriminated PhysicalFileDetails union and the corresponding
     * mapped reader parameter through the indexed lookup, so the selected
     * reader is asserted back to the reader for this details type.
     */
    const recordReader =
        options.recordReaders[
            details.type
            ] as RecordReader<
            typeof details
        >;


    const physicalCursor =
        recordReader(
            details
        );


    let parserDetails:
        ParserDetails<
            typeof parser
        > =
        details.parserConfig as
            ParserDetails<
                typeof parser
            >;


    let parserPrepared =
        parser.prepare
        === undefined;


    /**
     * Physical record number.
     *
     * For line files this is also the one-based line number.
     *
     * The first physical record is therefore line 1, which if the file is a
     * CSV is the CSV header.
     */
    let recordNumber =
        0;


    for await (
        const record
        of physicalCursor
        ) {
        recordNumber++;


        /**
         * Physical reader validation failure.
         */
        if (
            !(
                "buffers"
                in record
            )
        ) {
            yield withSource(
                {
                    errors: [
                        ...record
                    ]
                },
                details,
                recordNumber
            );


            /**
             * If the record required for parser preparation is invalid,
             * preparation cannot continue.
             */
            if (
                !parserPrepared
            ) {
                return;
            }


            continue;
        }


        /**
         * Parser preparation.
         *
         * For CSV this consumes the header record.
         */
        if (
            !parserPrepared
        ) {
            let prepared:
                ReturnType<
                    NonNullable<
                        typeof parser.prepare
                    >
                >;


            try {
                prepared =
                    parser.prepare!(
                        record,
                        details.parserConfig
                    );
            } catch (
                error
                ) {
                throw parserException(
                    details,
                    recordNumber,
                    "preparation",
                    error
                );
            }


            if (
                isErrors(
                    prepared
                )
            ) {
                yield withSource(
                    prepared,
                    details,
                    recordNumber
                );

                return;
            }


            parserDetails =
                prepared as
                    ParserDetails<
                        typeof parser
                    >;

            parserPrepared =
                true;


            /**
             * The preparation record is not a data record.
             */
            continue;
        }


        /**
         * Parse physical record into the parser-specific representation.
         */
        let parsed:
            ReturnType<
                typeof parser.parse
            >;


        try {
            parsed =
                parser.parse(
                    record,
                    parserDetails
                );
        } catch (
            error
            ) {
            throw parserException(
                details,
                recordNumber,
                "parse",
                error
            );
        }


        if (
            isErrors(
                parsed
            )
        ) {
            yield withSource(
                parsed,
                details,
                recordNumber
            );

            continue;
        }


        /**
         * Optional representation validation.
         */
        const validationErrors =
            details.checkRepresentation
            === undefined
                ? NO_VALIDATION_ERRORS
                : details.checkRepresentation(
                    parsed
                );


        if (
            validationErrors.length
            !== 0
        ) {
            yield withSource(
                {
                    errors: [
                        ...validationErrors
                    ]
                },
                details,
                recordNumber
            );

            continue;
        }


        /**
         * Projection must complete before the physical cursor advances,
         * because the parser representation may still refer directly to
         * cursor-owned physical buffers.
         */
        yield details.project(
            parsed
        );
    }


    /**
     * A parser with prepare() requires a preparation record.
     *
     * An empty file therefore cannot be prepared.
     */
    if (
        !parserPrepared
    ) {
        yield withFilename(
            {
                errors: [
                    "Parser preparation record is missing"
                ]
            },
            details.filename
        );
    }
}


/**
 * Convert an exception thrown by parser code into an exception carrying
 * the complete physical source context.
 *
 * Parser-returned Errors remain recoverable values and are handled
 * separately by withSource().
 *
 * A thrown exception indicates that parser execution itself failed. The
 * original exception is retained as cause so its original stack and type
 * remain available to diagnostics.
 */
function parserException(
    details: PhysicalFileDetails & {
        readonly parser:
            string;
    },
    recordNumber: number,
    phase:
        "preparation"
        | "parse",
    error: unknown
): Error {

    const location =
        sourceLocation(
            details,
            recordNumber
        );

    const action =
        phase === "preparation"
            ? "preparation failed"
            : "failed";


    return new Error(
        `${details.filename}: ${
            location
        }: parser ${
            JSON.stringify(
                details.parser
            )
        } ${
            action
        }: ${
            errorMessage(
                error
            )
        }`,
        {
            cause:
            error
        }
    );
}


/**
 * Add physical source information to a record-related error.
 *
 * For line files the physical record number is naturally a line number.
 *
 * For fixed and length-prefixed files it is described as a record
 * number instead.
 *
 * Location is deliberately included in the human-readable error text
 * as well as extras. Callers commonly surface errors simply with:
 *
 *     errors.join("; ")
 *
 * so hiding source information only in metadata would make diagnostics
 * unnecessarily difficult.
 */
function withSource(
    errors: Errors,
    details: PhysicalFileDetails,
    recordNumber: number
): Errors {

    const location =
        sourceLocation(
            details,
            recordNumber
        );


    return {
        ...errors,

        errors:
            errors.errors.map(
                error =>
                    `${details.filename}: ${
                        location
                    }: ${
                        error
                    }`
            ),

        extras: {
            ...errors.extras,

            filename:
            details.filename,

            recordNumber
        }
    };
}


/**
 * Return the human-readable location of one physical record.
 */
function sourceLocation(
    details: PhysicalFileDetails,
    recordNumber: number
): string {

    return details.type === "line"
        ? `line ${recordNumber}`
        : `record ${recordNumber}`;
}


/**
 * Add filename context where there is no physical record to identify.
 *
 * The obvious example is an empty file where parser preparation was
 * required but no first record existed.
 */
function withFilename(
    errors: Errors,
    filename: string
): Errors {

    return {
        ...errors,

        errors:
            errors.errors.map(
                error =>
                    `${filename}: ${
                        error
                    }`
            ),

        extras: {
            ...errors.extras,

            filename
        }
    };
}


/**
 * Convert an unknown thrown value into useful diagnostic text.
 */
function errorMessage(
    error: unknown
): string {

    if (
        error instanceof Error
    ) {
        return error.message;
    }


    return String(
        error
    );
}