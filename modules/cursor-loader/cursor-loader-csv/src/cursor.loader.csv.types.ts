import {
    type Parser,
    type PhysicalRecordContent
} from "@cobol-ts/cursor-loader-types";


/*
 * CSV column types
 */

export type CsvColumnType =
    | "string"
    | "integer"
    | "float"
    | "character";


/*
 * CSV column metadata
 */

export interface CsvColumn {
    readonly name: string;

    readonly type: CsvColumnType;
}


/*
 * CSV parser details
 *
 * These are the static source-specific details supplied by the consumer
 * in FileDetails as parserConfig.
 *
 * The columns are the logical columns required by the application.
 * Their order defines the indices used when accessing CsvRow.
 *
 * They do not need to be in the same order as the physical columns in
 * the CSV file.
 */

export interface CsvParserDetails {
    readonly columns: readonly CsvColumn[];

    readonly separator: string;

    readonly quote?: string;

    readonly escape?: string;
}


/*
 * Prepared CSV details
 *
 * Runtime details created once for a particular CSV file by combining
 * the static CsvParserDetails with information from the header row.
 *
 * These details are reused for every subsequent data record in the file.
 *
 * physicalToLogical maps each physical CSV column position to the
 * corresponding logical column index in parserDetails.columns.
 *
 * A value of -1 means that physical column is not required and can be
 * ignored while parsing data records.
 *
 * separatorByte, quoteByte and escapeByte are the compiled single-byte
 * forms of the configured CSV control characters so that the hot record
 * parsing path can compare bytes directly.
 *
 * row is the single reusable mutable CsvRow representation for this file.
 * It is rebound to each physical record and its column boundaries are
 * overwritten rather than allocating a new row for every record.
 */

export interface CsvPreparedDetails {
    readonly parserDetails: CsvParserDetails;

    /*
     * Physical CSV column -> logical configured column.
     *
     * -1 means the physical column is not required.
     */

    readonly physicalToLogical: Int32Array;

    readonly physicalColumnCount: number;

    readonly separatorByte: number;

    readonly quoteByte?: number;

    readonly escapeByte?: number;

    /*
     * One reusable representation for this file.
     */

    readonly row: MutableCsvRow;
}


/*
 * CSV row
 *
 * The row is a view over the current physical record.
 *
 * The prepared details are shared between all rows for the file.
 *
 * Numeric and character values can be read directly from the logical
 * bytes of the physical record. Strings are decoded only when requested.
 *
 * A value may span more than one underlying Uint8Array.
 *
 * Indices passed to the accessors are logical column indices from
 * CsvParserDetails.columns, not physical CSV column positions.
 */

export interface CsvRow {
    readonly details: CsvPreparedDetails;

    integer(
        index: number
    ): number;

    float(
        index: number
    ): number;

    character(
        index: number
    ): number;

    string(
        index: number
    ): string;
}


/*
 * Mutable CSV row
 *
 * Used internally by the parser.
 *
 * One instance can be reused for every physical data record. The
 * physical record reference and column boundaries are replaced as each
 * record is parsed.
 *
 * Column boundaries use start-inclusive, end-exclusive byte offsets
 * relative to the beginning of the logical PhysicalRecordContent.
 *
 * They are not offsets into an individual underlying Uint8Array.
 *
 * The column index supplied here is the logical column index.
 */

export interface MutableCsvRow
    extends CsvRow {

    reset(
        record: PhysicalRecordContent
    ): void;

    setColumn(
        index: number,
        start: number,
        end: number
    ): void;
}


/*
 * CSV parser
 *
 * CsvParserDetails are supplied by FileDetails as parserConfig.
 *
 * prepare() consumes the header record and produces CsvPreparedDetails.
 *
 * parse() then uses those prepared details for every subsequent
 * physical data record.
 */

export type CsvParser =
    Parser<
        CsvRow,
        CsvParserDetails,
        CsvPreparedDetails
    >;