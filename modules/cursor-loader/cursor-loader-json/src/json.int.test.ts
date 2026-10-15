import {readFile} from "node:fs/promises";
import {join} from "node:path";

import {isErrors} from "@cobol-ts/errors";

import {
    type ParserPhysicalRecordContent
} from "@cobol-ts/cursor-loader-types";

import {
    createProjection,
    defineProjection
} from "@cobol-ts/cursor-projection";

import {
    jsonParser
} from "./cursor.loader.json.parser";


interface JsonRow {
    id(): number;
    name(): string;
    age(): number;
}


const rowProjection = defineProjection<JsonRow>({
    age: {
        type: "integer"
    },
    id: {
        type: "integer"
    },
    name: {
        type: "string"
    }
});


test("parses and projects a JSONL file",async () => {
    const buffer = await readFile(
        join(__dirname,"..","json.parser.test.jsonl")
    );

    const projection = createProjection(
        jsonParser,
        undefined,
        undefined,
        rowProjection
    );

    const row = projection.create();

    const rows: Array<{
        id: number;
        name: string;
        age: number;
    }> = [];

    let startByte = 0;
    let recordNumber = 1;

    while (startByte < buffer.length) {
        const physicalRecord = record(
            buffer,
            startByte,
            recordNumber
        );

        const representation = await jsonParser.parse(
            physicalRecord,
            undefined
        );

        if (isErrors(representation)) {
            throw new Error(
                representation.errors.join("; ")
            );
        }

        projection.bind(
            row,
            representation,
            physicalRecord
        );

        try {
            rows.push({
                id: row.id(),
                name: row.name(),
                age: row.age()
            });
        } finally {
            projection.clear(row);
        }

        startByte = physicalRecord.endByte;
        recordNumber++;
    }

    expect(rows).toEqual([
        {
            id: 1,
            name: "Alice",
            age: 31
        },
        {
            id: 2,
            name: "Bob",
            age: 42
        },
        {
            id: 3,
            name: "Chloë",
            age: 27
        }
    ]);
});


function record(
    buffer: Uint8Array,
    startByte: number,
    recordNumber: number
): ParserPhysicalRecordContent<undefined> {
    return {
        buffers: [buffer],
        recordState: undefined,
        startByte,
        endByte: startByte,
        lastValidByte: buffer.length,
        fileFinished: true,
        source: "json.parser.test.jsonl",
        recordNumber,

        async readMore(): Promise<void> {
            throw new Error("Unexpected readMore");
        }
    };
}