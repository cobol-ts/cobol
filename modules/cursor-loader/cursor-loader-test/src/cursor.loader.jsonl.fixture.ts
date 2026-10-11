import {jsonParser} from "@cobol-ts/cursor-loader-json";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";

import {
    customerProjection,
    minimalCustomerProjection
} from "./cursor.loader.fixture";


export interface JsonlFixtureFile {
    readonly bytes: Uint8Array;
    offset: number;
}


export const customerJsonlDefinition = {
    filename: "test.customer.jsonl",
    fileType: "json" as const,
    projection: customerProjection
};


export const minimalCustomerJsonlDefinition = {
    filename: "test.customer.jsonl",
    fileType: "json" as const,
    projection: minimalCustomerProjection
};


export const badJsonCustomerJsonlDefinition = {
    filename: "test.customer.bad-json.jsonl",
    fileType: "json" as const,
    projection: customerProjection
};


export const lazyErrorCustomerJsonlDefinition = {
    filename: "test.customer.lazy-error.jsonl",
    fileType: "json" as const,
    projection: customerProjection
};


const parserRegistry = {
    json: {
        parser: jsonParser,
        parserConfig: () => undefined,
        createRecordState: () => undefined
    }
};


export function createJsonlFixtureFile(
    filename: string
): JsonlFixtureFile {
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


export function createJsonlInfrastructure(
    bufferSize: number
) {
    return {
        parsers:
        parserRegistry,

        bufferSize,

        fillFileBuffer:
            async (
                file: JsonlFixtureFile,
                target: Uint8Array
            ) => {
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

                    file.offset += count;
                }

                return count;
            }
    };
}