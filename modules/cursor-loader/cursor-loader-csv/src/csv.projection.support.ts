import {type ProjectionSupport} from "@cobol-ts/cursor-loader-types";

import {
    type CsvParserDetails,
    type CsvRepresentation
} from "./csv.parser";

import {utf8String} from "./utf8.string";


export type CsvProjectionPath = number;


export const csvProjectionSupport = {
    compileProjectionPath,
    integer,
    float,
    character,
    string
} satisfies ProjectionSupport<
    CsvRepresentation,
    CsvParserDetails,
    CsvProjectionPath
>;


function compileProjectionPath(
    details: CsvParserDetails,
    path: readonly string[]
): CsvProjectionPath {
    if (path.length !== 1) {
        throw new Error(
            "CSV projection path must contain exactly one column name"
        );
    }

    const column = details.columns.get(path[0]);

    if (column === undefined) {
        throw new Error(
            `CSV column ${JSON.stringify(path[0])} does not exist`
        );
    }

    return column;
}


function integer(
    representation: CsvRepresentation,
    details: CsvParserDetails,
    column: CsvProjectionPath
): number {
    const value = fieldString(representation,details,column);

    if (value.length === 0) {
        throw new Error(
            "CSV value is empty; expected an integer"
        );
    }

    const result = Number(value);

    if (!Number.isInteger(result)) {
        throw new Error(
            `CSV value ${JSON.stringify(value)} is not an integer`
        );
    }

    return result;
}


function float(
    representation: CsvRepresentation,
    details: CsvParserDetails,
    column: CsvProjectionPath
): number {
    const value = fieldString(representation,details,column);

    if (value.length === 0) {
        throw new Error(
            "CSV value is empty; expected a number"
        );
    }

    const result = Number(value);

    if (!Number.isFinite(result)) {
        throw new Error(
            `CSV value ${JSON.stringify(value)} is not a number`
        );
    }

    return result;
}


function character(
    representation: CsvRepresentation,
    details: CsvParserDetails,
    column: CsvProjectionPath
): string {
    const value = fieldString(representation,details,column);

    if (value.length !== 1) {
        throw new Error(
            `CSV value ${JSON.stringify(value)} is not a character`
        );
    }

    return value;
}


function string(
    representation: CsvRepresentation,
    details: CsvParserDetails,
    column: CsvProjectionPath
): string {
    return fieldString(representation,details,column);
}


function fieldString(
    representation: CsvRepresentation,
    details: CsvParserDetails,
    column: CsvProjectionPath
): string {
    const state = representation.recordState;

    return utf8String(
        representation,
        state.starts[column],
        state.ends[column],
        true,
        details.quote
    );
}