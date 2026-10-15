import {readFile} from "node:fs/promises";
import {join} from "node:path";

import {
    type ParserPhysicalRecordContent
} from "@cobol-ts/cursor-loader-types";

import {
    createProjection,
    defineProjection
} from "@cobol-ts/cursor-projection";

import {
    createCsvRecordState,
    csvParser,
    type CsvRecordState
} from "./csv.parser";


interface CsvRow {
    id(): number;
    name(): string;
    note(): string;
}


const rowProjection = defineProjection<CsvRow>({
    note: {
        type: "string"
    },
    id: {
        type: "integer"
    },
    name: {
        type: "string"
    }
});


test("parses and projects a CSV file",async () => {
    const buffer = await readFile(
        join(__dirname,"..","csv.walker.test.csv")
    );

    const header = record(
        buffer,
        createCsvRecordState(),
        0,
        1
    );

    const prepared = await csvParser.prepare(
        header,
        {}
    );

    if ("errors" in prepared) {
        throw new Error(
            prepared.errors.join("; ")
        );
    }

    const projection = createProjection(
        csvParser,
        prepared,
        header,
        rowProjection
    );

    const row = projection.create();
    const state = createCsvRecordState();

    const rows: Array<{
        id: number;
        name: string;
        note: string;
    }> = [];

    let startByte = header.endByte;
    let recordNumber = 2;

    while (startByte < buffer.length) {
        const physicalRecord = record(
            buffer,
            state,
            startByte,
            recordNumber
        );

        const representation = await csvParser.parse(
            physicalRecord,
            prepared
        );

        if ("errors" in representation) {
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
                note: normaliseLineEndings(row.note())
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
            note: "hello, world"
        },
        {
            id: 2,
            name: "Bob",
            note: "said \"hello\""
        },
        {
            id: 3,
            name: "Chloë",
            note: "line one\nline two"
        },
        {
            id: 4,
            name: "Dan",
            note: ""
        }
    ]);
});


function normaliseLineEndings(value: string): string {
    return value.replace(/\r\n/g,"\n");
}


function record(
    buffer: Uint8Array,
    recordState: CsvRecordState,
    startByte: number,
    recordNumber: number
): ParserPhysicalRecordContent<CsvRecordState> {
    return {
        buffers: [buffer],
        recordState,
        startByte,
        endByte: startByte,
        lastValidByte: buffer.length,
        fileFinished: true,
        source: "csv.walker.test.csv",
        recordNumber,

        async readMore(): Promise<void> {
            throw new Error("Unexpected readMore");
        }
    };
}