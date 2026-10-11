import {type CursorFileDefinition, type FileCursorInfrastructure} from "@cobol-ts/cursor-file";


import {defineProjection} from "@cobol-ts/cursor-projection";

import {readFileSync} from "node:fs";

import {resolve} from "node:path";

import {type Customer, type MinimalCustomer, minimalCustomerProjection} from "./cursor.loader.fixture";
import {createCsvRecordState, csvParser, CsvParserConfig} from "@cobol-ts/cursor-loader-csv";


export interface CsvFixtureFile {
    readonly bytes: Uint8Array;
    offset: number;
}


type CsvFixtureDefinition<TProjection> =
    CursorFileDefinition<TProjection, "csv">
    & {
    readonly parserConfig: CsvParserConfig;
};


export const customerCsvProjection =
    defineProjection<Customer>({
        id: {type: "integer"},
        name: {type: "string"},
        age: {type: "integer"},
        addressLine1: {type: "string"},
        addressLine2: {type: "string"},
        postcode: {type: "string"},
        status: {type: "character"},
        balance: {type: "float"}
    });


const commaConfig: CsvParserConfig = {
    separator:
        ",".charCodeAt(0),

    quote:
        "\"".charCodeAt(0)
};


const pipeConfig: CsvParserConfig = {
    separator:
        "|".charCodeAt(0),

    quote:
        "\"".charCodeAt(0)
};


export const customerCsvDefinition:
    CsvFixtureDefinition<Customer> = {
    filename:
        "test.comma.csv",

    fileType:
        "csv",

    parserConfig:
    commaConfig,

    projection:
    customerCsvProjection
};


export const minimalCustomerCsvDefinition:
    CsvFixtureDefinition<MinimalCustomer> = {
    filename:
        "test.comma.csv",

    fileType:
        "csv",

    parserConfig:
    commaConfig,

    projection:
    minimalCustomerProjection
};


export const richCustomerCsvDefinition:
    CsvFixtureDefinition<Customer> = {
    filename:
        "test.comma.rich.csv",

    fileType:
        "csv",

    parserConfig:
    commaConfig,

    projection:
    customerCsvProjection
};


export const pipeCustomerCsvDefinition:
    CsvFixtureDefinition<Customer> = {
    filename:
        "test.pipe.psv",

    fileType:
        "csv",

    parserConfig:
    pipeConfig,

    projection:
    customerCsvProjection
};


export const widthErrorCustomerCsvDefinition:
    CsvFixtureDefinition<Customer> = {
    filename:
        "test.comma.width.csv",

    fileType:
        "csv",

    parserConfig:
    commaConfig,

    projection:
    customerCsvProjection
};


export const badHeaderCustomerCsvDefinition:
    CsvFixtureDefinition<Customer> = {
    filename:
        "test.comma.bad-header.csv",

    fileType:
        "csv",

    parserConfig:
    commaConfig,

    projection:
    customerCsvProjection
};


export const unterminatedCustomerCsvDefinition:
    CsvFixtureDefinition<Customer> = {
    filename:
        "test.comma.unterminated.csv",

    fileType:
        "csv",

    parserConfig:
    commaConfig,

    projection:
    customerCsvProjection
};


const parserRegistry = {
    csv: {
        parser:
        csvParser,

        parserConfig:
            (
                definition: {
                    readonly parserConfig: CsvParserConfig;
                }
            ) =>
                definition.parserConfig,

        createRecordState:
        createCsvRecordState
    }
};


export function createCsvFixtureFile(
    filename: string
): CsvFixtureFile {
    const buffer =
        readFileSync(
            resolve(
                process.cwd(),
                filename
            )
        );

    return {
        bytes:
            new Uint8Array(
                buffer.buffer,
                buffer.byteOffset,
                buffer.byteLength
            ),

        offset:
            0
    };
}


export function createCsvInfrastructure(
    bufferSize: number
): FileCursorInfrastructure<CsvFixtureFile, "csv"> {
    return {
        parsers:
        parserRegistry,

        bufferSize,

        fillFileBuffer:
            async (file, target) => {
                const available =
                    file.bytes.length
                    - file.offset;

                const count =
                    Math.min(
                        target.length,
                        available
                    );

                if (count !== 0) {
                    target.set(
                        file.bytes.subarray(
                            file.offset,
                            file.offset + count
                        )
                    );

                    file.offset +=
                        count;
                }

                return count;
            }
    };
}