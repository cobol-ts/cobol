import {type Errors} from "@cobol-ts/errors";

import {
    type Parser,
    type ParserPhysicalRecordContent,
    type PhysicalRecordData,
    utf8RangeToString
} from "@cobol-ts/cursor-loader-types";

import {
    csvProjectionSupport,
    type CsvProjectionPath
} from "./csv.projection.support";

import {walkCsvRecord} from "./csv.walker";
import {utf8String} from "./utf8.string";


const DEFAULT_SEPARATOR = ",".charCodeAt(0);
const DEFAULT_QUOTE = "\"".charCodeAt(0);


export interface CsvParserConfig {
    readonly separator?: number;
    readonly quote?: number;
}


export interface CsvParserDetails {
    readonly columns: ReadonlyMap<string,number>;
    readonly columnCount: number;
    readonly separator: number;
    readonly quote: number;
}


export interface CsvRecordState {
    starts: Int32Array;
    ends: Int32Array;
    fieldCount: number;
}


export type CsvRepresentation =
    PhysicalRecordData<CsvRecordState>;


export type CsvParser = Parser<
    CsvRepresentation,
    CsvParserConfig,
    CsvParserDetails,
    CsvRecordState,
    CsvProjectionPath
>;


export function createCsvRecordState(): CsvRecordState {
    return {
        starts: new Int32Array(0),
        ends: new Int32Array(0),
        fieldCount: 0
    };
}


export const csvParser = {
    ...csvProjectionSupport,
    prepare,
    parse,
    toDebugString: utf8RangeToString
} satisfies CsvParser;


async function prepare(
    record: ParserPhysicalRecordContent<CsvRecordState>,
    config: CsvParserConfig
): Promise<CsvParserDetails | Errors> {
    const separator = config.separator ?? DEFAULT_SEPARATOR;
    const quote = config.quote ?? DEFAULT_QUOTE;

    validateByte("separator",separator);
    validateByte("quote",quote);

    if (separator === quote) {
        throw new Error("CSV separator and quote must be different");
    }

    const context: HeaderContext = {
        record,
        columns: new Map<string,number>(),
        quote,
        fieldCount: 0,
        duplicate: undefined,
        decodeError: undefined
    };

    await walkCsvRecord(
        record,
        collectHeaderField,
        context,
        {separator,quote}
    );

    if (context.decodeError !== undefined) {
        return {
            errors: [
                context.decodeError
            ]
        };
    }

    if (context.duplicate !== undefined) {
        return {
            errors: [
                `CSV header contains duplicate column ${JSON.stringify(context.duplicate)}`
            ]
        };
    }

    return {
        columns: context.columns,
        columnCount: context.fieldCount,
        separator,
        quote
    };
}


interface HeaderContext {
    readonly record: CsvRepresentation;
    readonly columns: Map<string,number>;
    readonly quote: number;
    fieldCount: number;
    duplicate: string | undefined;
    decodeError: string | undefined;
}


function collectHeaderField(
    context: HeaderContext,
    column: number,
    startByte: number,
    endByte: number
): void {
    context.fieldCount = column + 1;

    if (context.decodeError !== undefined) {
        return;
    }

    let name: string;

    try {
        name = utf8String(
            context.record,
            startByte,
            endByte,
            true,
            context.quote
        );
    } catch (error) {
        context.decodeError =
            `CSV header column ${column + 1} is not valid UTF-8: ${errorMessage(error)}`;

        return;
    }

    if (context.columns.has(name)) {
        context.duplicate ??= name;
        return;
    }

    context.columns.set(name,column);
}


async function parse(
    record: ParserPhysicalRecordContent<CsvRecordState>,
    details: CsvParserDetails
): Promise<CsvRepresentation | Errors> {
    const state = record.recordState;

    prepareState(state,details.columnCount);
    state.fieldCount = 0;

    await walkCsvRecord(
        record,
        collectField,
        state,
        {
            separator: details.separator,
            quote: details.quote
        }
    );

    if (state.fieldCount !== details.columnCount) {
        return {
            errors: [
                `CSV record has ${state.fieldCount} columns; header has ${details.columnCount}`
            ]
        };
    }

    return record;
}


function prepareState(
    state: CsvRecordState,
    columnCount: number
): void {
    if (state.starts.length !== 0) {
        return;
    }

    state.starts = new Int32Array(columnCount);
    state.ends = new Int32Array(columnCount);
}


function collectField(
    state: CsvRecordState,
    column: number,
    startByte: number,
    endByte: number
): void {
    if (column < state.starts.length) {
        state.starts[column] = startByte;
        state.ends[column] = endByte;
    }

    state.fieldCount = column + 1;
}


function validateByte(
    name: string,
    value: number
): void {
    if (
        !Number.isInteger(value)
        || value < 0
        || value > 255
    ) {
        throw new Error(
            `CSV ${name} must be a byte value from 0 to 255`
        );
    }
}


function errorMessage(error: unknown): string {
    return error instanceof Error
        ? error.message
        : String(error);
}