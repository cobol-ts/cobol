import {
    type CsvParserDetails,
    type CsvRecordState,
    type CsvRepresentation
} from "./csv.parser";

import {csvProjectionSupport} from "./csv.projection.support";


const ENCODER = new TextEncoder();
const SEPARATOR = ",".charCodeAt(0);
const QUOTE = "\"".charCodeAt(0);


describe("csvProjectionSupport",() => {
    test("compiles a column name to its column index",() => {
        const details = csvDetails(
            "id",
            "name",
            "age"
        );

        expect(
            csvProjectionSupport.compileProjectionPath(
                details,
                ["age"]
            )
        ).toBe(2);
    });


    test("rejects an empty projection path",() => {
        const details = csvDetails(
            "id"
        );

        expect(
            () =>
                csvProjectionSupport.compileProjectionPath(
                    details,
                    []
                )
        ).toThrow(
            "CSV projection path must contain exactly one column name"
        );
    });


    test("rejects a nested projection path",() => {
        const details = csvDetails(
            "name"
        );

        expect(
            () =>
                csvProjectionSupport.compileProjectionPath(
                    details,
                    ["customer","name"]
                )
        ).toThrow(
            "CSV projection path must contain exactly one column name"
        );
    });


    test("rejects an unknown column",() => {
        const details = csvDetails(
            "id",
            "name"
        );

        expect(
            () =>
                csvProjectionSupport.compileProjectionPath(
                    details,
                    ["age"]
                )
        ).toThrow(
            "CSV column \"age\" does not exist"
        );
    });


    test("reads a string using a compiled column index",() => {
        const representation = csvRepresentation(
            "1001",
            "Alice",
            "42"
        );

        const details = csvDetails(
            "id",
            "name",
            "age"
        );

        expect(
            csvProjectionSupport.string(
                representation,
                details,
                1
            )
        ).toBe("Alice");
    });


    test("uses byte offsets rather than character offsets",() => {
        const representation = csvRepresentation(
            "Chloë",
            "42"
        );

        const details = csvDetails(
            "name",
            "age"
        );

        expect(
            csvProjectionSupport.string(
                representation,
                details,
                1
            )
        ).toBe("42");
    });


    test("reads a field spanning physical buffers",() => {
        const representation: CsvRepresentation = {
            buffers: [
                ENCODER.encode("Ali"),
                ENCODER.encode("ce,42")
            ],

            recordState: {
                starts: new Int32Array([
                    0,
                    6
                ]),

                ends: new Int32Array([
                    5,
                    8
                ]),

                fieldCount: 2
            }
        };

        const details = csvDetails(
            "name",
            "age"
        );

        expect(
            csvProjectionSupport.string(
                representation,
                details,
                0
            )
        ).toBe("Alice");

        expect(
            csvProjectionSupport.integer(
                representation,
                details,
                1
            )
        ).toBe(42);
    });


    test("collapses doubled quotes when materialising a string",() => {
        const representation = csvRepresentation(
            "said \"\"hello\"\""
        );

        const details = csvDetails(
            "note"
        );

        expect(
            csvProjectionSupport.string(
                representation,
                details,
                0
            )
        ).toBe(
            "said \"hello\""
        );
    });


    test("reads an integer",() => {
        const representation = csvRepresentation(
            "-42"
        );

        const details = csvDetails(
            "value"
        );

        expect(
            csvProjectionSupport.integer(
                representation,
                details,
                0
            )
        ).toBe(-42);
    });


    test("rejects a non-integer",() => {
        const representation = csvRepresentation(
            "42.5"
        );

        const details = csvDetails(
            "value"
        );

        expect(
            () =>
                csvProjectionSupport.integer(
                    representation,
                    details,
                    0
                )
        ).toThrow(
            "CSV value \"42.5\" is not an integer"
        );
    });


    test("rejects an empty integer",() => {
        const representation = csvRepresentation(
            ""
        );

        const details = csvDetails(
            "value"
        );

        expect(
            () =>
                csvProjectionSupport.integer(
                    representation,
                    details,
                    0
                )
        ).toThrow(
            "CSV value is empty; expected an integer"
        );
    });


    test("reads a float",() => {
        const representation = csvRepresentation(
            "1234.56"
        );

        const details = csvDetails(
            "value"
        );

        expect(
            csvProjectionSupport.float(
                representation,
                details,
                0
            )
        ).toBe(1234.56);
    });


    test("rejects a non-number",() => {
        const representation = csvRepresentation(
            "banana"
        );

        const details = csvDetails(
            "value"
        );

        expect(
            () =>
                csvProjectionSupport.float(
                    representation,
                    details,
                    0
                )
        ).toThrow(
            "CSV value \"banana\" is not a number"
        );
    });


    test("rejects an empty float",() => {
        const representation = csvRepresentation(
            ""
        );

        const details = csvDetails(
            "value"
        );

        expect(
            () =>
                csvProjectionSupport.float(
                    representation,
                    details,
                    0
                )
        ).toThrow(
            "CSV value is empty; expected a number"
        );
    });


    test("reads a character",() => {
        const representation = csvRepresentation(
            "A"
        );

        const details = csvDetails(
            "status"
        );

        expect(
            csvProjectionSupport.character(
                representation,
                details,
                0
            )
        ).toBe("A");
    });


    test("rejects more than one character",() => {
        const representation = csvRepresentation(
            "AB"
        );

        const details = csvDetails(
            "status"
        );

        expect(
            () =>
                csvProjectionSupport.character(
                    representation,
                    details,
                    0
                )
        ).toThrow(
            "CSV value \"AB\" is not a character"
        );
    });


    test("rejects an empty character",() => {
        const representation = csvRepresentation(
            ""
        );

        const details = csvDetails(
            "status"
        );

        expect(
            () =>
                csvProjectionSupport.character(
                    representation,
                    details,
                    0
                )
        ).toThrow(
            "CSV value \"\" is not a character"
        );
    });
});


function csvDetails(...columns: string[]): CsvParserDetails {
    return {
        columns: new Map(
            columns.map(
                (name,index) => [
                    name,
                    index
                ]
            )
        ),
        columnCount: columns.length,
        separator: SEPARATOR,
        quote: QUOTE
    };
}


function csvRepresentation(...fields: string[]): CsvRepresentation {
    const starts = new Int32Array(fields.length);
    const ends = new Int32Array(fields.length);

    let byte = 0;

    for (let index = 0; index < fields.length; index++) {
        const field = ENCODER.encode(fields[index]);

        starts[index] = byte;
        byte += field.length;
        ends[index] = byte;

        if (index + 1 < fields.length) {
            byte++;
        }
    }

    return {
        buffers: [
            ENCODER.encode(
                fields.join(",")
            )
        ],

        recordState: {
            starts,
            ends,
            fieldCount: fields.length
        } satisfies CsvRecordState
    };
}