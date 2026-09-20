import {
    type Errors
} from "@cobol-ts/errors";

import {
    type PhysicalRecordContent
} from "@cobol-ts/cursor-loader-types";

import {
    type CsvParser,
    type CsvParserDetails,
    type CsvPreparedDetails,
    type MutableCsvRow
} from "./cursor.loader.csv.types";


const encoder =
    new TextEncoder();


interface InternalMutableCsvRow
    extends MutableCsvRow {

    setColumnValue(
        index: number,
        start: number,
        end: number,
        escaped: boolean
    ): void;
}


type ScanSource =
    "header"
    | "record";


export const csvParser:
    CsvParser = {

    prepare(
        firstRecord,
        parserDetails
    ) {
        return prepareCsv(
            firstRecord,
            parserDetails
        );
    },


    parse(
        record,
        details
    ) {
        return parseCsvRecord(
            record,
            details
        );
    }
};


/*
 * Prepare one CSV file.
 *
 * Configuration defines the named columns the application requires.
 *
 * The actual CSV header defines:
 *
 *     - which physical position contains each named column;
 *     - the physical width of subsequent records.
 */

function prepareCsv(
    headerRecord: PhysicalRecordContent,
    parserDetails: CsvParserDetails
): CsvPreparedDetails | Errors {

    const separatorByte =
        controlByte(
            "separator",
            parserDetails.separator
        );


    if (
        typeof separatorByte
        !== "number"
    ) {
        return separatorByte;
    }


    const quoteByte =
        optionalControlByte(
            "quote",
            parserDetails.quote
        );


    if (
        quoteByte !== undefined
        && typeof quoteByte
        !== "number"
    ) {
        return quoteByte;
    }


    const escapeByte =
        optionalControlByte(
            "escape",
            parserDetails.escape
        );


    if (
        escapeByte !== undefined
        && typeof escapeByte
        !== "number"
    ) {
        return escapeByte;
    }


    if (
        quoteByte !== undefined
        && quoteByte === separatorByte
    ) {
        return {
            errors: [
                `CSV configuration is ambiguous: separator and quote are both ${
                    formatByte(
                        separatorByte
                    )
                }. They must be different characters.`
            ]
        };
    }


    /*
     * Configured logical name -> logical column index.
     */

    const configuredColumns =
        new Map<
            string,
            number
        >();


    for (
        let logicalIndex = 0;
        logicalIndex
        < parserDetails.columns.length;
        logicalIndex++
    ) {
        const column =
            parserDetails.columns[
                logicalIndex
                ];


        if (
            configuredColumns.has(
                column.name
            )
        ) {
            return {
                errors: [
                    `CSV configuration requires column ${
                        JSON.stringify(
                            column.name
                        )
                    } more than once. Configured column names must be unique.`
                ]
            };
        }


        configuredColumns.set(
            column.name,
            logicalIndex
        );
    }


    /*
     * Header field locations are needed only during preparation.
     */

    const headerStarts:
        number[] =
        [];

    const headerEnds:
        number[] =
        [];

    const headerEscaped:
        boolean[] =
        [];


    const headerContext:
        HeaderFieldContext = {

        starts:
        headerStarts,

        ends:
        headerEnds,

        escaped:
        headerEscaped
    };


    const headerResult =
        scanRecord(
            headerRecord,
            separatorByte,
            quoteByte,
            escapeByte,
            "header",
            headerContext,
            collectHeaderField
        );


    if (
        typeof headerResult
        !== "number"
    ) {
        return headerResult;
    }


    /*
     * This is the physical width specified by the actual file.
     */

    const physicalColumnCount =
        headerResult;


    /*
     * Decode every physical header name.
     *
     * We keep the complete list during preparation because it makes
     * missing-column diagnostics genuinely useful.
     */

    const physicalColumnNames:
        string[] =
        new Array(
            physicalColumnCount
        );


    for (
        let physicalIndex = 0;
        physicalIndex
        < physicalColumnCount;
        physicalIndex++
    ) {
        try {
            physicalColumnNames[
                physicalIndex
                ] =
                decodeField(
                    headerRecord,
                    headerStarts[
                        physicalIndex
                        ],
                    headerEnds[
                        physicalIndex
                        ],
                    headerEscaped[
                        physicalIndex
                        ],
                    quoteByte,
                    escapeByte
                );
        } catch (
            error
            ) {
            return {
                errors: [
                    `CSV header column ${
                        physicalIndex + 1
                    } cannot be decoded as UTF-8: ${
                        errorMessage(
                            error
                        )
                    }`
                ]
            };
        }
    }


    /*
     * physicalToLogical:
     *
     *     physical CSV position
     *         ->
     *     configured logical position
     *
     * -1 means the physical column is not required.
     */

    const physicalToLogical =
        new Int32Array(
            physicalColumnCount
        );


    physicalToLogical.fill(
        -1
    );


    const found =
        new Uint8Array(
            parserDetails.columns.length
        );


    /*
     * Track all physical occurrences of configured names.
     *
     * Header preparation is one-time work, so the Map/arrays here are
     * worth having for high-quality diagnostics.
     */

    const occurrences =
        new Map<
            string,
            number[]
        >();


    for (
        let physicalIndex = 0;
        physicalIndex
        < physicalColumnNames.length;
        physicalIndex++
    ) {
        const name =
            physicalColumnNames[
                physicalIndex
                ];


        if (
            !configuredColumns.has(
                name
            )
        ) {
            continue;
        }


        const existing =
            occurrences.get(
                name
            );


        if (
            existing === undefined
        ) {
            occurrences.set(
                name,
                [
                    physicalIndex + 1
                ]
            );
        } else {
            existing.push(
                physicalIndex + 1
            );
        }
    }


    /*
     * Build the hot-path mapping.
     */

    for (
        let physicalIndex = 0;
        physicalIndex
        < physicalColumnCount;
        physicalIndex++
    ) {
        const name =
            physicalColumnNames[
                physicalIndex
                ];

        const logicalIndex =
            configuredColumns.get(
                name
            );


        if (
            logicalIndex === undefined
        ) {
            continue;
        }


        /*
         * Do not establish an ambiguous mapping.
         *
         * A useful error is produced below after all header names have
         * been considered.
         */

        const nameOccurrences =
            occurrences.get(
                name
            );


        if (
            nameOccurrences === undefined
            || nameOccurrences.length
            !== 1
        ) {
            continue;
        }


        found[
            logicalIndex
            ] =
            1;

        physicalToLogical[
            physicalIndex
            ] =
            logicalIndex;
    }


    /*
     * Find every required name absent from the physical header.
     */

    const missingColumns:
        string[] =
        [];


    for (
        let logicalIndex = 0;
        logicalIndex
        < parserDetails.columns.length;
        logicalIndex++
    ) {
        const name =
            parserDetails.columns[
                logicalIndex
                ].name;

        const nameOccurrences =
            occurrences.get(
                name
            );


        if (
            nameOccurrences === undefined
        ) {
            missingColumns.push(
                name
            );
        }
    }


    /*
     * Find every required name whose physical position is ambiguous.
     */

    const duplicateColumns:
        {
            readonly name:
                string;

            readonly positions:
                readonly number[];
        }[] =
        [];


    for (
        const [
            name,
            positions
        ]
        of occurrences
        ) {
        if (
            positions.length > 1
        ) {
            duplicateColumns.push({
                name,
                positions
            });
        }
    }


    const headerErrors:
        string[] =
        [];


    if (
        missingColumns.length > 0
    ) {
        headerErrors.push(
            `CSV header is missing required ${
                missingColumns.length === 1
                    ? "column"
                    : "columns"
            }: ${
                formatColumnNames(
                    missingColumns
                )
            }. Actual header columns are: ${
                formatColumnNames(
                    physicalColumnNames
                )
            }.`
        );
    }


    for (
        const duplicate
        of duplicateColumns
        ) {
        headerErrors.push(
            `CSV header contains required column ${
                JSON.stringify(
                    duplicate.name
                )
            } more than once, at physical columns ${
                duplicate.positions.join(
                    ", "
                )
            }. Required column names must identify exactly one physical column.`
        );
    }


    if (
        headerErrors.length > 0
    ) {
        return {
            errors:
            headerErrors
        };
    }


    let prepared:
        CsvPreparedDetails;


    const row =
        createCsvRow(
            () =>
                prepared,
            parserDetails.columns.length
        );


    prepared = {
        parserDetails,

        physicalToLogical,

        physicalColumnCount,

        separatorByte,

        quoteByte,

        escapeByte,

        row
    };


    return prepared;
}


/*
 * Parse one data record.
 *
 * The physical width comes from the actual header, not from the
 * configured set of required columns.
 */

function parseCsvRecord(
    record: PhysicalRecordContent,
    details: CsvPreparedDetails
): MutableCsvRow | Errors {

    const row =
        details.row as
            InternalMutableCsvRow;


    row.reset(
        record
    );


    const result =
        scanRecord(
            record,
            details.separatorByte,
            details.quoteByte,
            details.escapeByte,
            "record",
            {
                details,
                row
            },
            setDataField
        );


    if (
        typeof result
        !== "number"
    ) {
        return result;
    }


    if (
        result
        !== details.physicalColumnCount
    ) {
        const difference =
            result
            - details.physicalColumnCount;


        if (
            difference > 0
        ) {
            return {
                errors: [
                    `CSV record has ${
                        result
                    } physical columns, but its header has ${
                        details.physicalColumnCount
                    }. The record therefore contains ${
                        difference
                    } extra ${
                        difference === 1
                            ? "column"
                            : "columns"
                    }.`
                ]
            };
        }


        return {
            errors: [
                `CSV record has ${
                    result
                } physical columns, but its header has ${
                    details.physicalColumnCount
                }. The record therefore contains ${
                    -difference
                } fewer ${
                    difference === -1
                        ? "column"
                        : "columns"
                } than the header.`
            ]
        };
    }


    return row;
}


/*
 * Sequential CSV scanner.
 *
 * Every logical byte is visited once.
 *
 * start/end exclude the outer quote characters.
 */

function scanRecord<Context>(
    record: PhysicalRecordContent,
    separatorByte: number,
    quoteByte: number | undefined,
    escapeByte: number | undefined,
    source: ScanSource,
    context: Context,
    field:
    (
        context: Context,
        physicalColumn: number,
        start: number,
        end: number,
        escaped: boolean
    ) => void
): number | Errors {

    let physicalColumn =
        0;

    let logicalOffset =
        0;

    let fieldStart =
        0;

    let atFieldStart =
        true;

    let quoted =
        false;

    let escaped =
        false;

    let quotePending =
        false;

    let quoteOffset =
        0;

    let openingQuoteOffset =
        -1;

    let escapeNext =
        false;

    let escapeOffset =
        -1;

    let remaining =
        record.length;


    for (
        let bufferIndex = 0;
        bufferIndex
        < record.buffers.length
        && remaining > 0;
        bufferIndex++
    ) {
        const buffer =
            record.buffers[
                bufferIndex
                ];

        const bufferStart =
            bufferIndex === 0
                ? record.firstBufferOffset
                : 0;


        if (
            bufferStart < 0
            || bufferStart > buffer.length
        ) {
            throw new Error(
                `Physical record metadata is inconsistent: firstBufferOffset is ${
                    record.firstBufferOffset
                }, but the first buffer contains only ${
                    buffer.length
                } ${
                    buffer.length === 1
                        ? "byte"
                        : "bytes"
                }.`
            );
        }


        const byteCount =
            Math.min(
                buffer.length
                - bufferStart,
                remaining
            );

        const bufferEnd =
            bufferStart
            + byteCount;


        for (
            let bufferOffset =
                bufferStart;
            bufferOffset
            < bufferEnd;
            bufferOffset++
        ) {
            const value =
                buffer[
                    bufferOffset
                    ];


            /*
             * A quote was encountered inside a quoted field.
             *
             * The current byte tells us whether that quote was the first
             * half of:
             *
             *     ""
             *
             * or whether it closed the field.
             */

            if (
                quotePending
            ) {
                /*
                 * Doubled quote -> one literal quote.
                 */

                if (
                    value === quoteByte
                ) {
                    escaped =
                        true;

                    quotePending =
                        false;

                    logicalOffset++;

                    continue;
                }


                /*
                 * The previous quote closed the field.
                 *
                 * At this point only a separator is legal. End of record
                 * is handled after the scan.
                 */

                if (
                    value !== separatorByte
                ) {
                    return syntaxError(
                        source,
                        physicalColumn,
                        logicalOffset,
                        `found ${
                            formatByte(
                                value
                            )
                        } after the closing quote at byte ${
                            quoteOffset
                        }; expected separator ${
                            formatByte(
                                separatorByte
                            )
                        } or end of record`
                    );
                }


                field(
                    context,
                    physicalColumn,
                    fieldStart,
                    quoteOffset,
                    escaped
                );


                physicalColumn++;

                logicalOffset++;

                fieldStart =
                    logicalOffset;

                atFieldStart =
                    true;

                quoted =
                    false;

                escaped =
                    false;

                quotePending =
                    false;

                openingQuoteOffset =
                    -1;

                continue;
            }


            /*
             * Inside a quoted field.
             */

            if (
                quoted
            ) {
                /*
                 * The previous byte was a distinct escape character.
                 *
                 * This byte is therefore data regardless of whether it
                 * would otherwise be a quote or separator.
                 */

                if (
                    escapeNext
                ) {
                    escapeNext =
                        false;

                    logicalOffset++;

                    continue;
                }


                /*
                 * A separate configured escape character.
                 */

                if (
                    escapeByte !== undefined
                    && escapeByte !== quoteByte
                    && value === escapeByte
                ) {
                    escaped =
                        true;

                    escapeNext =
                        true;

                    escapeOffset =
                        logicalOffset;

                    logicalOffset++;

                    continue;
                }


                /*
                 * Could be either:
                 *
                 *     closing quote
                 *
                 * or:
                 *
                 *     first half of doubled quote
                 */

                if (
                    value === quoteByte
                ) {
                    quotePending =
                        true;

                    quoteOffset =
                        logicalOffset;

                    logicalOffset++;

                    continue;
                }


                logicalOffset++;

                continue;
            }


            /*
             * Opening quote.
             */

            if (
                quoteByte !== undefined
                && atFieldStart
                && value === quoteByte
            ) {
                quoted =
                    true;

                atFieldStart =
                    false;

                openingQuoteOffset =
                    logicalOffset;

                logicalOffset++;

                fieldStart =
                    logicalOffset;

                continue;
            }


            /*
             * A quote has no valid meaning once an unquoted field has
             * already begun.
             */

            if (
                quoteByte !== undefined
                && value === quoteByte
            ) {
                return syntaxError(
                    source,
                    physicalColumn,
                    logicalOffset,
                    `found quote ${
                        formatByte(
                            value
                        )
                    } inside an unquoted field; a quoted field must begin with the quote as its first byte`
                );
            }


            /*
             * Separator terminates an unquoted field.
             */

            if (
                value === separatorByte
            ) {
                field(
                    context,
                    physicalColumn,
                    fieldStart,
                    logicalOffset,
                    false
                );


                physicalColumn++;

                logicalOffset++;

                fieldStart =
                    logicalOffset;

                atFieldStart =
                    true;

                escaped =
                    false;

                openingQuoteOffset =
                    -1;

                continue;
            }


            atFieldStart =
                false;

            logicalOffset++;
        }


        remaining -=
            byteCount;
    }


    /*
     * The PhysicalRecordContent contract says record.length logical bytes
     * exist in the supplied buffers.
     */

    if (
        remaining !== 0
    ) {
        const available =
            record.length
            - remaining;


        throw new Error(
            `Physical record metadata is inconsistent: record.length declares ${
                record.length
            } ${
                record.length === 1
                    ? "byte"
                    : "bytes"
            }, but the supplied buffers contain only ${
                available
            } logical ${
                available === 1
                    ? "byte"
                    : "bytes"
            } from firstBufferOffset.`
        );
    }


    /*
     * A separate escape character must escape another byte.
     */

    if (
        escapeNext
    ) {
        return syntaxError(
            source,
            physicalColumn,
            escapeOffset,
            `found escape character ${
                escapeByte === undefined
                    ? "(unknown)"
                    : formatByte(
                        escapeByte
                    )
            } as the final byte of the field; an escape character must be followed by a byte to escape`
        );
    }


    /*
     * The final byte was a quote encountered inside a quoted field.
     *
     * Since there is no following byte, it is the closing quote.
     */

    if (
        quotePending
    ) {
        field(
            context,
            physicalColumn,
            fieldStart,
            quoteOffset,
            escaped
        );


        return physicalColumn
            + 1;
    }


    /*
     * Reached end of record while still inside a quoted field.
     */

    if (
        quoted
    ) {
        return syntaxError(
            source,
            physicalColumn,
            logicalOffset,
            `quoted field began at byte ${
                openingQuoteOffset
            } with ${
                quoteByte === undefined
                    ? "a quote"
                    : formatByte(
                        quoteByte
                    )
            }, but the record ended before a closing quote was found`
        );
    }


    /*
     * Complete the final unquoted field.
     *
     * This correctly represents both:
     *
     *     empty record
     *
     * and:
     *
     *     a,b,
     */

    field(
        context,
        physicalColumn,
        fieldStart,
        logicalOffset,
        false
    );


    return physicalColumn
        + 1;
}


/*
 * CSV syntax errors.
 *
 * Human column numbers are one-based.
 *
 * Byte offsets are zero-based logical offsets within the physical
 * record.
 *
 * Filename and line/record number are added by the file cursor.
 */

function syntaxError(
    source: ScanSource,
    physicalColumn: number,
    byteOffset: number,
    message: string
): Errors {

    const subject =
        source === "header"
            ? "CSV header"
            : "CSV record";


    return {
        errors: [
            `${
                subject
            } column ${
                physicalColumn + 1
            }, byte ${
                byteOffset
            }: ${
                message
            }.`
        ]
    };
}


/*
 * Header field collection.
 */

interface HeaderFieldContext {
    readonly starts:
        number[];

    readonly ends:
        number[];

    readonly escaped:
        boolean[];
}


function collectHeaderField(
    context: HeaderFieldContext,
    _physicalColumn: number,
    start: number,
    end: number,
    escaped: boolean
): void {

    context.starts.push(
        start
    );

    context.ends.push(
        end
    );

    context.escaped.push(
        escaped
    );
}


/*
 * Data field collection.
 *
 * Only required configured columns are retained.
 */

interface DataFieldContext {
    readonly details:
        CsvPreparedDetails;

    readonly row:
        InternalMutableCsvRow;
}


function setDataField(
    context: DataFieldContext,
    physicalColumn: number,
    start: number,
    end: number,
    escaped: boolean
): void {

    /*
     * A malformed row may contain more physical columns than the
     * header.
     *
     * Continue scanning so parseCsvRecord() can report the actual width
     * rather than stopping with a less useful indexing failure.
     */

    if (
        physicalColumn
        >= context.details
            .physicalToLogical.length
    ) {
        return;
    }


    const logicalColumn =
        context.details
            .physicalToLogical[
            physicalColumn
            ];


    if (
        logicalColumn < 0
    ) {
        return;
    }


    context.row.setColumnValue(
        logicalColumn,
        start,
        end,
        escaped
    );
}


/*
 * Reusable CSV row.
 *
 * Arrays are indexed by configured logical column.
 */

function createCsvRow(
    details:
    () => CsvPreparedDetails,
    columnCount: number
): InternalMutableCsvRow {

    const starts =
        new Int32Array(
            columnCount
        );

    const ends =
        new Int32Array(
            columnCount
        );

    const escaped =
        new Uint8Array(
            columnCount
        );


    starts.fill(
        -1
    );

    ends.fill(
        -1
    );


    let record:
        PhysicalRecordContent
        | undefined;


    const row:
        InternalMutableCsvRow = {

        get details():
            CsvPreparedDetails {

            return details();
        },


        reset(
            nextRecord:
            PhysicalRecordContent
        ): void {

            record =
                nextRecord;

            starts.fill(
                -1
            );

            ends.fill(
                -1
            );

            escaped.fill(
                0
            );
        },


        setColumn(
            index: number,
            start: number,
            end: number
        ): void {

            row.setColumnValue(
                index,
                start,
                end,
                false
            );
        },


        setColumnValue(
            index: number,
            start: number,
            end: number,
            requiresUnescape:
            boolean
        ): void {

            starts[
                index
                ] =
                start;

            ends[
                index
                ] =
                end;

            escaped[
                index
                ] =
                requiresUnescape
                    ? 1
                    : 0;
        },


        integer(
            index: number
        ): number {

            const range =
                columnRange(
                    record,
                    starts,
                    ends,
                    escaped,
                    index
                );


            if (
                !range.escaped
            ) {
                return parseInteger(
                    range.record,
                    range.start,
                    range.end
                );
            }


            return Number(
                decodeEscapedField(
                    range.record,
                    range.start,
                    range.end,
                    details().quoteByte,
                    details().escapeByte
                )
            );
        },


        float(
            index: number
        ): number {

            const range =
                columnRange(
                    record,
                    starts,
                    ends,
                    escaped,
                    index
                );


            if (
                !range.escaped
            ) {
                return Number(
                    decodeRange(
                        range.record,
                        range.start,
                        range.end
                    )
                );
            }


            return Number(
                decodeEscapedField(
                    range.record,
                    range.start,
                    range.end,
                    details().quoteByte,
                    details().escapeByte
                )
            );
        },


        character(
            index: number
        ): number {

            const range =
                columnRange(
                    record,
                    starts,
                    ends,
                    escaped,
                    index
                );


            if (
                range.start
                >= range.end
            ) {
                return Number.NaN;
            }


            if (
                !range.escaped
            ) {
                return byteAt(
                    range.record,
                    range.start
                );
            }


            return firstUnescapedByte(
                range.record,
                range.start,
                range.end,
                details().quoteByte,
                details().escapeByte
            );
        },


        string(
            index: number
        ): string {

            const range =
                columnRange(
                    record,
                    starts,
                    ends,
                    escaped,
                    index
                );


            if (
                !range.escaped
            ) {
                return decodeRange(
                    range.record,
                    range.start,
                    range.end
                );
            }


            return decodeEscapedField(
                range.record,
                range.start,
                range.end,
                details().quoteByte,
                details().escapeByte
            );
        }
    };


    return row;
}


/*
 * Resolve one configured logical column.
 */

function columnRange(
    record:
        PhysicalRecordContent
        | undefined,
    starts: Int32Array,
    ends: Int32Array,
    escaped: Uint8Array,
    index: number
): {
    readonly record:
        PhysicalRecordContent;

    readonly start:
        number;

    readonly end:
        number;

    readonly escaped:
        boolean;
} {

    if (
        record === undefined
    ) {
        throw new Error(
            "CSV row cannot be accessed because no physical record is currently bound to it."
        );
    }


    if (
        index < 0
        || index >= starts.length
    ) {
        throw new Error(
            `CSV logical column index ${
                index
            } is outside the configured range 0 to ${
                starts.length - 1
            }.`
        );
    }


    const start =
        starts[
            index
            ];

    const end =
        ends[
            index
            ];


    if (
        start < 0
        || end < start
    ) {
        throw new Error(
            `CSV logical column index ${
                index
            } has no value in the current record.`
        );
    }


    return {
        record,
        start,
        end,

        escaped:
            escaped[
                index
                ] !== 0
    };
}


/*
 * Decode one field whose outer quotes have already been removed by the
 * scanner.
 */

function decodeField(
    record: PhysicalRecordContent,
    start: number,
    end: number,
    escaped: boolean,
    quoteByte: number | undefined,
    escapeByte: number | undefined
): string {

    if (
        !escaped
    ) {
        return decodeRange(
            record,
            start,
            end
        );
    }


    return decodeEscapedField(
        record,
        start,
        end,
        quoteByte,
        escapeByte
    );
}


/*
 * Lazily materialise an escaped field.
 *
 * Data rows reach this code only if projection actually accesses an
 * escaped value.
 */

function decodeEscapedField(
    record: PhysicalRecordContent,
    start: number,
    end: number,
    quoteByte: number | undefined,
    escapeByte: number | undefined
): string {

    if (
        start === end
    ) {
        return "";
    }


    const output =
        new Uint8Array(
            end - start
        );


    const position =
        locatePosition(
            record,
            start
        );

    let bufferIndex =
        position.bufferIndex;

    let bufferOffset =
        position.bufferOffset;

    let logicalOffset =
        start;

    let outputLength =
        0;


    while (
        logicalOffset < end
        ) {
        const buffer =
            record.buffers[
                bufferIndex
                ];

        const value =
            buffer[
                bufferOffset
                ];


        /*
         * Doubled quote.
         */

        if (
            quoteByte !== undefined
            && value === quoteByte
            && logicalOffset + 1 < end
            && byteAt(
                record,
                logicalOffset + 1
            ) === quoteByte
        ) {
            output[
                outputLength++
                ] =
                quoteByte;


            logicalOffset +=
                2;


            if (
                logicalOffset < end
            ) {
                const nextPosition =
                    locatePosition(
                        record,
                        logicalOffset
                    );

                bufferIndex =
                    nextPosition.bufferIndex;

                bufferOffset =
                    nextPosition.bufferOffset;
            }


            continue;
        }


        /*
         * Distinct configured escape character.
         */

        if (
            escapeByte !== undefined
            && escapeByte !== quoteByte
            && value === escapeByte
            && logicalOffset + 1 < end
        ) {
            output[
                outputLength++
                ] =
                byteAt(
                    record,
                    logicalOffset + 1
                );


            logicalOffset +=
                2;


            if (
                logicalOffset < end
            ) {
                const nextPosition =
                    locatePosition(
                        record,
                        logicalOffset
                    );

                bufferIndex =
                    nextPosition.bufferIndex;

                bufferOffset =
                    nextPosition.bufferOffset;
            }


            continue;
        }


        output[
            outputLength++
            ] =
            value;


        logicalOffset++;

        bufferOffset++;


        if (
            bufferOffset
            === buffer.length
            && logicalOffset < end
        ) {
            bufferIndex++;

            bufferOffset =
                0;
        }
    }


    return new TextDecoder(
        "utf-8",
        {
            fatal:
                true
        }
    ).decode(
        output.subarray(
            0,
            outputLength
        )
    );
}


/*
 * Return the first logical value byte from an escaped field without
 * materialising the complete value.
 */

function firstUnescapedByte(
    record: PhysicalRecordContent,
    start: number,
    end: number,
    quoteByte: number | undefined,
    escapeByte: number | undefined
): number {

    if (
        start >= end
    ) {
        return Number.NaN;
    }


    const first =
        byteAt(
            record,
            start
        );


    if (
        escapeByte !== undefined
        && escapeByte !== quoteByte
        && first === escapeByte
        && start + 1 < end
    ) {
        return byteAt(
            record,
            start + 1
        );
    }


    if (
        quoteByte !== undefined
        && first === quoteByte
        && start + 1 < end
        && byteAt(
            record,
            start + 1
        ) === quoteByte
    ) {
        return quoteByte;
    }


    return first;
}


/*
 * Parse an integer directly from the underlying physical bytes.
 */

function parseInteger(
    record: PhysicalRecordContent,
    start: number,
    end: number
): number {

    if (
        start >= end
    ) {
        return Number.NaN;
    }


    const position =
        locatePosition(
            record,
            start
        );

    let bufferIndex =
        position.bufferIndex;

    let bufferOffset =
        position.bufferOffset;

    let logicalOffset =
        start;

    let negative =
        false;

    let digits =
        0;

    let value =
        0;


    while (
        logicalOffset < end
        ) {
        const buffer =
            record.buffers[
                bufferIndex
                ];

        const byte =
            buffer[
                bufferOffset
                ];


        if (
            logicalOffset === start
            && (
                byte === 45
                || byte === 43
            )
        ) {
            negative =
                byte === 45;
        } else {
            const digit =
                byte - 48;


            if (
                digit < 0
                || digit > 9
            ) {
                return Number.NaN;
            }


            value =
                (
                    value * 10
                )
                + digit;

            digits++;
        }


        logicalOffset++;

        bufferOffset++;


        if (
            bufferOffset
            === buffer.length
            && logicalOffset < end
        ) {
            bufferIndex++;

            bufferOffset =
                0;
        }
    }


    if (
        digits === 0
    ) {
        return Number.NaN;
    }


    return negative
        ? -value
        : value;
}


/*
 * Decode a logical record range as UTF-8.
 */

function decodeRange(
    record: PhysicalRecordContent,
    start: number,
    end: number
): string {

    if (
        start === end
    ) {
        return "";
    }


    const decoder =
        new TextDecoder(
            "utf-8",
            {
                fatal:
                    true
            }
        );


    const position =
        locatePosition(
            record,
            start
        );

    let bufferIndex =
        position.bufferIndex;

    let bufferOffset =
        position.bufferOffset;

    let logicalOffset =
        start;

    let result =
        "";


    while (
        logicalOffset < end
        ) {
        const buffer =
            record.buffers[
                bufferIndex
                ];

        const byteCount =
            Math.min(
                buffer.length
                - bufferOffset,
                end
                - logicalOffset
            );


        result +=
            decoder.decode(
                buffer.subarray(
                    bufferOffset,
                    bufferOffset
                    + byteCount
                ),
                {
                    stream:
                        true
                }
            );


        logicalOffset +=
            byteCount;

        bufferIndex++;

        bufferOffset =
            0;
    }


    return result
        + decoder.decode();
}


/*
 * Occasional random logical-byte access.
 *
 * The main scanner never uses this per byte.
 */

function byteAt(
    record: PhysicalRecordContent,
    logicalOffset: number
): number {

    const position =
        locatePosition(
            record,
            logicalOffset
        );


    return record.buffers[
        position.bufferIndex
        ][
        position.bufferOffset
        ];
}


/*
 * Resolve a logical record offset to a physical buffer position.
 */

function locatePosition(
    record: PhysicalRecordContent,
    logicalOffset: number
): {
    readonly bufferIndex:
        number;

    readonly bufferOffset:
        number;
} {

    if (
        logicalOffset < 0
        || logicalOffset >= record.length
    ) {
        throw new Error(
            `Cannot access logical byte ${
                logicalOffset
            } of a physical record containing ${
                record.length
            } ${
                record.length === 1
                    ? "byte"
                    : "bytes"
            }.`
        );
    }


    let remaining =
        logicalOffset;


    for (
        let bufferIndex = 0;
        bufferIndex
        < record.buffers.length;
        bufferIndex++
    ) {
        const buffer =
            record.buffers[
                bufferIndex
                ];

        const start =
            bufferIndex === 0
                ? record.firstBufferOffset
                : 0;

        const available =
            buffer.length
            - start;


        if (
            remaining < available
        ) {
            return {
                bufferIndex,

                bufferOffset:
                    start
                    + remaining
            };
        }


        remaining -=
            available;
    }


    throw new Error(
        `Physical record metadata is inconsistent: logical byte ${
            logicalOffset
        } should exist within record length ${
            record.length
        }, but the supplied buffers do not contain it.`
    );
}


/*
 * Format names unambiguously.
 */

function formatColumnNames(
    names: readonly string[]
): string {

    if (
        names.length === 0
    ) {
        return "(none)";
    }


    return names
        .map(
            name =>
                JSON.stringify(
                    name
                )
        )
        .join(
            ", "
        );
}


/*
 * Format a byte for diagnostics.
 *
 * Printable ASCII shows both its character and byte value.
 */

function formatByte(
    value: number
): string {

    const hexadecimal =
        value
            .toString(
                16
            )
            .toUpperCase()
            .padStart(
                2,
                "0"
            );


    if (
        value >= 32
        && value <= 126
    ) {
        return `${
            JSON.stringify(
                String.fromCharCode(
                    value
                )
            )
        } (0x${hexadecimal})`;
    }


    return `0x${hexadecimal}`;
}


/*
 * Compile one required CSV control character.
 */

function controlByte(
    name: string,
    value: string
): number | Errors {

    const encoded =
        encoder.encode(
            value
        );


    if (
        encoded.length !== 1
    ) {
        return {
            errors: [
                `CSV configuration has invalid ${name} ${
                    JSON.stringify(
                        value
                    )
                }: it encodes to ${
                    encoded.length
                } UTF-8 ${
                    encoded.length === 1
                        ? "byte"
                        : "bytes"
                }, but the CSV scanner requires exactly one byte.`
            ]
        };
    }


    return encoded[0];
}


/*
 * Compile one optional CSV control character.
 */

function optionalControlByte(
    name: string,
    value: string | undefined
): number | undefined | Errors {

    if (
        value === undefined
    ) {
        return undefined;
    }


    return controlByte(
        name,
        value
    );
}


/*
 * Convert an unknown exception to useful diagnostic text.
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