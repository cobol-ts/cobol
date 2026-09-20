import {
    isErrors
} from "@cobol-ts/errors";

import {
    type PhysicalRecordContent
} from "@cobol-ts/cursor-loader-types";

import {
    csvParser
} from "./cursor.loader.csv.parser";

import {
    type CsvParserDetails,
    type CsvPreparedDetails,
    type CsvRow
} from "./cursor.loader.csv.types";


const encoder =
    new TextEncoder();


function record(
    value: string
): PhysicalRecordContent {

    const buffer =
        encoder.encode(
            value
        );


    return {
        buffers: [
            buffer
        ],

        firstBufferOffset:
            0,

        length:
        buffer.length
    };
}


/*
 * Create a record whose logical contents span several physical buffers.
 */

function splitRecord(
    ...parts: string[]
): PhysicalRecordContent {

    const buffers =
        parts.map(
            part =>
                encoder.encode(
                    part
                )
        );

    let length =
        0;


    for (
        const buffer
        of buffers
        ) {
        length +=
            buffer.length;
    }


    return {
        buffers,

        firstBufferOffset:
            0,

        length
    };
}


/*
 * Create a record beginning part way through its first physical buffer.
 */

function offsetRecord(
    prefix: string,
    value: string
): PhysicalRecordContent {

    const prefixBytes =
        encoder.encode(
            prefix
        );

    const valueBytes =
        encoder.encode(
            value
        );

    const buffer =
        new Uint8Array(
            prefixBytes.length
            + valueBytes.length
        );


    buffer.set(
        prefixBytes,
        0
    );

    buffer.set(
        valueBytes,
        prefixBytes.length
    );


    return {
        buffers: [
            buffer
        ],

        firstBufferOffset:
        prefixBytes.length,

        length:
        valueBytes.length
    };
}


function prepare(
    details: CsvParserDetails,
    header: PhysicalRecordContent
): CsvPreparedDetails {

    const result =
        csvParser.prepare!(
            header,
            details
        );


    if (
        isErrors(
            result
        )
    ) {
        throw new Error(
            result.errors.join(
                "; "
            )
        );
    }


    return result;
}


function parse(
    prepared: CsvPreparedDetails,
    physicalRecord: PhysicalRecordContent
): CsvRow {

    const result =
        csvParser.parse(
            physicalRecord,
            prepared
        );


    if (
        isErrors(
            result
        )
    ) {
        throw new Error(
            result.errors.join(
                "; "
            )
        );
    }


    return result;
}


const standardDetails:
    CsvParserDetails = {

    columns: [
        {
            name: "id",
            type: "integer"
        },
        {
            name: "name",
            type: "string"
        },
        {
            name: "balance",
            type: "float"
        }
    ],

    separator:
        ",",

    quote:
        "\""
};


/*
 * Header mapping
 */

test(
    "maps header names to logical column indices",
    () => {

        const details:
            CsvParserDetails = {

            columns: [
                {
                    name: "name",
                    type: "string"
                },
                {
                    name: "id",
                    type: "integer"
                }
            ],

            separator:
                ",",

            quote:
                "\""
        };


        const prepared =
            prepare(
                details,
                record(
                    "id,unused,name"
                )
            );


        expect(
            Array.from(
                prepared.physicalToLogical
            )
        ).toEqual([
            1,
            -1,
            0
        ]);
    }
);


test(
    "records the physical column count defined by the header",
    () => {

        const details:
            CsvParserDetails = {

            columns: [
                {
                    name: "id",
                    type: "integer"
                },
                {
                    name: "name",
                    type: "string"
                }
            ],

            separator:
                ",",

            quote:
                "\""
        };


        const prepared =
            prepare(
                details,
                record(
                    "id,unused,name,anotherUnused"
                )
            );


        expect(
            prepared.physicalColumnCount
        ).toBe(
            4
        );
    }
);


test(
    "reads configured columns in logical rather than physical order",
    () => {

        const details:
            CsvParserDetails = {

            columns: [
                {
                    name: "name",
                    type: "string"
                },
                {
                    name: "id",
                    type: "integer"
                }
            ],

            separator:
                ",",

            quote:
                "\""
        };


        const prepared =
            prepare(
                details,
                record(
                    "id,unused,name"
                )
            );

        const row =
            parse(
                prepared,
                record(
                    "123,ignored,Fred"
                )
            );


        expect(
            row.string(
                0
            )
        ).toBe(
            "Fred"
        );

        expect(
            row.integer(
                1
            )
        ).toBe(
            123
        );
    }
);


/*
 * Basic value access
 */

test(
    "parses integer float and string columns",
    () => {

        const prepared =
            prepare(
                standardDetails,
                record(
                    "id,name,balance"
                )
            );

        const row =
            parse(
                prepared,
                record(
                    "123,Fred,19.95"
                )
            );


        expect(
            row.integer(
                0
            )
        ).toBe(
            123
        );

        expect(
            row.string(
                1
            )
        ).toBe(
            "Fred"
        );

        expect(
            row.float(
                2
            )
        ).toBe(
            19.95
        );
    }
);


test(
    "parses negative integers",
    () => {

        const prepared =
            prepare(
                standardDetails,
                record(
                    "id,name,balance"
                )
            );

        const row =
            parse(
                prepared,
                record(
                    "-123,Fred,19.95"
                )
            );


        expect(
            row.integer(
                0
            )
        ).toBe(
            -123
        );
    }
);


test(
    "parses explicitly positive integers",
    () => {

        const prepared =
            prepare(
                standardDetails,
                record(
                    "id,name,balance"
                )
            );

        const row =
            parse(
                prepared,
                record(
                    "+123,Fred,19.95"
                )
            );


        expect(
            row.integer(
                0
            )
        ).toBe(
            123
        );
    }
);


test(
    "invalid integer returns NaN",
    () => {

        const prepared =
            prepare(
                standardDetails,
                record(
                    "id,name,balance"
                )
            );

        const row =
            parse(
                prepared,
                record(
                    "12x,Fred,19.95"
                )
            );


        expect(
            Number.isNaN(
                row.integer(
                    0
                )
            )
        ).toBe(
            true
        );
    }
);


/*
 * Quotes
 */

test(
    "removes outer quotes from a string field",
    () => {

        const prepared =
            prepare(
                standardDetails,
                record(
                    "id,name,balance"
                )
            );

        const row =
            parse(
                prepared,
                record(
                    `123,"Fred",19.95`
                )
            );


        expect(
            row.string(
                1
            )
        ).toBe(
            "Fred"
        );
    }
);


test(
    "separator inside a quoted field is data",
    () => {

        const prepared =
            prepare(
                standardDetails,
                record(
                    "id,name,balance"
                )
            );

        const row =
            parse(
                prepared,
                record(
                    `123,"Smith, Fred",19.95`
                )
            );


        expect(
            row.string(
                1
            )
        ).toBe(
            "Smith, Fred"
        );

        expect(
            row.float(
                2
            )
        ).toBe(
            19.95
        );
    }
);


test(
    "quoted field can contain several separators",
    () => {

        const prepared =
            prepare(
                standardDetails,
                record(
                    "id,name,balance"
                )
            );

        const row =
            parse(
                prepared,
                record(
                    `123,"Smith, Fred, Mr",19.95`
                )
            );


        expect(
            row.string(
                1
            )
        ).toBe(
            "Smith, Fred, Mr"
        );
    }
);


test(
    "doubled quotes inside a quoted field become one quote",
    () => {

        const prepared =
            prepare(
                standardDetails,
                record(
                    "id,name,balance"
                )
            );

        const row =
            parse(
                prepared,
                record(
                    `123,"Fred ""Freddie"" Smith",19.95`
                )
            );


        expect(
            row.string(
                1
            )
        ).toBe(
            `Fred "Freddie" Smith`
        );
    }
);


test(
    "several doubled quotes are decoded correctly",
    () => {

        const prepared =
            prepare(
                standardDetails,
                record(
                    "id,name,balance"
                )
            );

        const row =
            parse(
                prepared,
                record(
                    `123,"""Fred"" ""Smith""",19.95`
                )
            );


        expect(
            row.string(
                1
            )
        ).toBe(
            `"Fred" "Smith"`
        );
    }
);


test(
    "quoted empty string is empty",
    () => {

        const prepared =
            prepare(
                standardDetails,
                record(
                    "id,name,balance"
                )
            );

        const row =
            parse(
                prepared,
                record(
                    `123,"",19.95`
                )
            );


        expect(
            row.string(
                1
            )
        ).toBe(
            ""
        );
    }
);


test(
    "empty unquoted string is empty",
    () => {

        const prepared =
            prepare(
                standardDetails,
                record(
                    "id,name,balance"
                )
            );

        const row =
            parse(
                prepared,
                record(
                    "123,,19.95"
                )
            );


        expect(
            row.string(
                1
            )
        ).toBe(
            ""
        );
    }
);


test(
    "quoted numeric values can be accessed as numbers",
    () => {

        const prepared =
            prepare(
                standardDetails,
                record(
                    "id,name,balance"
                )
            );

        const row =
            parse(
                prepared,
                record(
                    `"123",Fred,"19.95"`
                )
            );


        expect(
            row.integer(
                0
            )
        ).toBe(
            123
        );

        expect(
            row.float(
                2
            )
        ).toBe(
            19.95
        );
    }
);


/*
 * Quotes across physical buffers
 */

test(
    "opening quote may be the last byte before data in another buffer",
    () => {

        const prepared =
            prepare(
                standardDetails,
                record(
                    "id,name,balance"
                )
            );


        const row =
            parse(
                prepared,
                splitRecord(
                    `123,"`,
                    `Fred",19.95`
                )
            );


        expect(
            row.string(
                1
            )
        ).toBe(
            "Fred"
        );
    }
);


test(
    "closing quote may be the last byte of a physical buffer",
    () => {

        const prepared =
            prepare(
                standardDetails,
                record(
                    "id,name,balance"
                )
            );


        const row =
            parse(
                prepared,
                splitRecord(
                    `123,"Fred"`,
                    `,19.95`
                )
            );


        expect(
            row.string(
                1
            )
        ).toBe(
            "Fred"
        );

        expect(
            row.float(
                2
            )
        ).toBe(
            19.95
        );
    }
);


test(
    "doubled quote may cross a physical buffer boundary",
    () => {

        const prepared =
            prepare(
                standardDetails,
                record(
                    "id,name,balance"
                )
            );


        /*
         * The doubled quote is split:
         *
         *     buffer 1 ends with the first quote
         *     buffer 2 starts with the second quote
         */

        const row =
            parse(
                prepared,
                splitRecord(
                    `123,"Fred "`,
                    `"Smith",19.95`
                )
            );


        expect(
            row.string(
                1
            )
        ).toBe(
            `Fred "Smith`
        );
    }
);


test(
    "quoted field may span several physical buffers",
    () => {

        const prepared =
            prepare(
                standardDetails,
                record(
                    "id,name,balance"
                )
            );


        const row =
            parse(
                prepared,
                splitRecord(
                    `123,"Fred`,
                    ` Smith`,
                    ` Junior",`,
                    `19.95`
                )
            );


        expect(
            row.string(
                1
            )
        ).toBe(
            "Fred Smith Junior"
        );
    }
);


test(
    "quoted field with separators may span physical buffers",
    () => {

        const prepared =
            prepare(
                standardDetails,
                record(
                    "id,name,balance"
                )
            );


        const row =
            parse(
                prepared,
                splitRecord(
                    `123,"Smith`,
                    `, Fred`,
                    `, Mr",`,
                    `19.95`
                )
            );


        expect(
            row.string(
                1
            )
        ).toBe(
            "Smith, Fred, Mr"
        );
    }
);


test(
    "quoted field with doubled quotes may span several physical buffers",
    () => {

        const prepared =
            prepare(
                standardDetails,
                record(
                    "id,name,balance"
                )
            );


        const row =
            parse(
                prepared,
                splitRecord(
                    `123,"Fred `,
                    `"`,
                    `"Freddie`,
                    `"`,
                    `" Smith",19.95`
                )
            );


        expect(
            row.string(
                1
            )
        ).toBe(
            `Fred "Freddie" Smith`
        );
    }
);


/*
 * Quote syntax errors
 */

test(
    "quote in an unquoted field is rejected",
    () => {

        const prepared =
            prepare(
                standardDetails,
                record(
                    "id,name,balance"
                )
            );


        const result =
            csvParser.parse(
                record(
                    `123,Fr"ed,19.95`
                ),
                prepared
            );


        expect(
            isErrors(
                result
            )
        ).toBe(
            true
        );


        if (
            !isErrors(
                result
            )
        ) {
            throw new Error(
                "expected CSV error"
            );
        }


        expect(
            result.errors
        ).toContain(
            `CSV record column 2, byte 6: found quote "\\"" (0x22) inside an unquoted field; a quoted field must begin with the quote as its first byte.`
        );
    }
);


test(
    "data after a closing quote is rejected",
    () => {

        const prepared =
            prepare(
                standardDetails,
                record(
                    "id,name,balance"
                )
            );


        const result =
            csvParser.parse(
                record(
                    `123,"Fred"x,19.95`
                ),
                prepared
            );


        expect(
            isErrors(
                result
            )
        ).toBe(
            true
        );


        if (
            !isErrors(
                result
            )
        ) {
            throw new Error(
                "expected CSV error"
            );
        }


        expect(
            result.errors
        ).toContain(
            `CSV record column 2, byte 10: found "x" (0x78) after the closing quote at byte 9; expected separator "," (0x2C) or end of record.`
        );
    }
);


test(
    "unterminated quoted field is rejected",
    () => {

        const prepared =
            prepare(
                standardDetails,
                record(
                    "id,name,balance"
                )
            );


        const result =
            csvParser.parse(
                record(
                    `123,"Fred Smith,19.95`
                ),
                prepared
            );


        expect(
            isErrors(
                result
            )
        ).toBe(
            true
        );


        if (
            !isErrors(
                result
            )
        ) {
            throw new Error(
                "expected CSV error"
            );
        }


        expect(
            result.errors
        ).toContain(
            `CSV record column 2, byte 21: quoted field began at byte 4 with "\\"" (0x22), but the record ended before a closing quote was found.`
        );
    }
);


/*
 * Separate escape character
 */

test(
    "separate escape character escapes a quote in a quoted field",
    () => {

        const details:
            CsvParserDetails = {

            columns: [
                {
                    name: "name",
                    type: "string"
                }
            ],

            separator:
                ",",

            quote:
                "\"",

            escape:
                "\\"
        };


        const prepared =
            prepare(
                details,
                record(
                    "name"
                )
            );


        const row =
            parse(
                prepared,
                record(
                    `"Fred \\"Freddie\\" Smith"`
                )
            );


        expect(
            row.string(
                0
            )
        ).toBe(
            `Fred "Freddie" Smith`
        );
    }
);


test(
    "separate escape character can escape a separator",
    () => {

        const details:
            CsvParserDetails = {

            columns: [
                {
                    name: "name",
                    type: "string"
                }
            ],

            separator:
                ",",

            quote:
                "\"",

            escape:
                "\\"
        };


        const prepared =
            prepare(
                details,
                record(
                    "name"
                )
            );


        const row =
            parse(
                prepared,
                record(
                    `"Smith\\, Fred"`
                )
            );


        expect(
            row.string(
                0
            )
        ).toBe(
            "Smith, Fred"
        );
    }
);


test(
    "separate escape sequence may cross a physical buffer boundary",
    () => {

        const details:
            CsvParserDetails = {

            columns: [
                {
                    name: "name",
                    type: "string"
                }
            ],

            separator:
                ",",

            quote:
                "\"",

            escape:
                "\\"
        };


        const prepared =
            prepare(
                details,
                record(
                    "name"
                )
            );


        const row =
            parse(
                prepared,
                splitRecord(
                    `"Fred \\`,
                    `"Smith"`
                )
            );


        expect(
            row.string(
                0
            )
        ).toBe(
            `Fred "Smith`
        );
    }
);


test(
    "incomplete escape at end of quoted field is rejected",
    () => {

        const details:
            CsvParserDetails = {

            columns: [
                {
                    name: "name",
                    type: "string"
                }
            ],

            separator:
                ",",

            quote:
                "\"",

            escape:
                "\\"
        };


        const prepared =
            prepare(
                details,
                record(
                    "name"
                )
            );


        const result =
            csvParser.parse(
                record(
                    `"Fred\\`
                ),
                prepared
            );


        expect(
            isErrors(
                result
            )
        ).toBe(
            true
        );


        if (
            !isErrors(
                result
            )
        ) {
            throw new Error(
                "expected CSV error"
            );
        }


        expect(
            result.errors
        ).toContain(
            `CSV record column 1, byte 5: found escape character "\\\\" (0x5C) as the final byte of the field; an escape character must be followed by a byte to escape.`
        );
    }
);


/*
 * Character access
 */

test(
    "reads character column as its byte value",
    () => {

        const details:
            CsvParserDetails = {

            columns: [
                {
                    name: "status",
                    type: "character"
                }
            ],

            separator:
                ",",

            quote:
                "\""
        };


        const prepared =
            prepare(
                details,
                record(
                    "status"
                )
            );

        const row =
            parse(
                prepared,
                record(
                    "A"
                )
            );


        expect(
            row.character(
                0
            )
        ).toBe(
            "A".charCodeAt(
                0
            )
        );
    }
);


test(
    "reads quoted character column without returning the quote",
    () => {

        const details:
            CsvParserDetails = {

            columns: [
                {
                    name: "status",
                    type: "character"
                }
            ],

            separator:
                ",",

            quote:
                "\""
        };


        const prepared =
            prepare(
                details,
                record(
                    "status"
                )
            );

        const row =
            parse(
                prepared,
                record(
                    `"A"`
                )
            );


        expect(
            row.character(
                0
            )
        ).toBe(
            "A".charCodeAt(
                0
            )
        );
    }
);


test(
    "empty character column returns NaN",
    () => {

        const details:
            CsvParserDetails = {

            columns: [
                {
                    name: "status",
                    type: "character"
                }
            ],

            separator:
                ",",

            quote:
                "\""
        };


        const prepared =
            prepare(
                details,
                record(
                    "status"
                )
            );

        const row =
            parse(
                prepared,
                record(
                    ""
                )
            );


        expect(
            Number.isNaN(
                row.character(
                    0
                )
            )
        ).toBe(
            true
        );
    }
);


/*
 * PhysicalRecordContent layout
 */

test(
    "parses a record beginning part way through its first buffer",
    () => {

        const prepared =
            prepare(
                standardDetails,
                record(
                    "id,name,balance"
                )
            );


        const row =
            parse(
                prepared,
                offsetRecord(
                    "ignored bytes:",
                    `123,"Fred",19.95`
                )
            );


        expect(
            row.integer(
                0
            )
        ).toBe(
            123
        );

        expect(
            row.string(
                1
            )
        ).toBe(
            "Fred"
        );

        expect(
            row.float(
                2
            )
        ).toBe(
            19.95
        );
    }
);


test(
    "selected unquoted field may span several physical buffers",
    () => {

        const prepared =
            prepare(
                standardDetails,
                record(
                    "id,name,balance"
                )
            );


        const row =
            parse(
                prepared,
                splitRecord(
                    "123,Fre",
                    "d Smi",
                    "th,19.95"
                )
            );


        expect(
            row.string(
                1
            )
        ).toBe(
            "Fred Smith"
        );
    }
);


test(
    "integer may span physical buffers",
    () => {

        const prepared =
            prepare(
                standardDetails,
                record(
                    "id,name,balance"
                )
            );


        const row =
            parse(
                prepared,
                splitRecord(
                    "12",
                    "345,Fred,19.95"
                )
            );


        expect(
            row.integer(
                0
            )
        ).toBe(
            12345
        );
    }
);


/*
 * Physical column count
 *
 * The configured logical columns do not define the physical width.
 * The actual header does.
 */

test(
    "accepts ignored physical columns when they are defined by the header",
    () => {

        const details:
            CsvParserDetails = {

            columns: [
                {
                    name: "id",
                    type: "integer"
                },
                {
                    name: "name",
                    type: "string"
                }
            ],

            separator:
                ",",

            quote:
                "\""
        };


        const prepared =
            prepare(
                details,
                record(
                    "id,ignored,name,alsoIgnored"
                )
            );

        const row =
            parse(
                prepared,
                record(
                    "123,something,Fred,anything"
                )
            );


        expect(
            row.integer(
                0
            )
        ).toBe(
            123
        );

        expect(
            row.string(
                1
            )
        ).toBe(
            "Fred"
        );
    }
);


test(
    "reports when a record has fewer physical columns than its header",
    () => {

        const prepared =
            prepare(
                standardDetails,
                record(
                    "id,name,balance"
                )
            );


        const result =
            csvParser.parse(
                record(
                    "123,Fred"
                ),
                prepared
            );


        expect(
            isErrors(
                result
            )
        ).toBe(
            true
        );


        if (
            !isErrors(
                result
            )
        ) {
            throw new Error(
                "expected CSV error"
            );
        }


        expect(
            result.errors
        ).toContain(
            "CSV record has 2 physical columns, but its header has 3. The record therefore contains 1 fewer column than the header."
        );
    }
);


test(
    "reports when a record has more physical columns than its header",
    () => {

        const prepared =
            prepare(
                standardDetails,
                record(
                    "id,name,balance"
                )
            );


        const result =
            csvParser.parse(
                record(
                    "123,Fred,19.95,extra"
                ),
                prepared
            );


        expect(
            isErrors(
                result
            )
        ).toBe(
            true
        );


        if (
            !isErrors(
                result
            )
        ) {
            throw new Error(
                "expected CSV error"
            );
        }


        expect(
            result.errors
        ).toContain(
            "CSV record has 4 physical columns, but its header has 3. The record therefore contains 1 extra column."
        );
    }
);


/*
 * Header validation
 */

test(
    "rejects a missing configured header column",
    () => {

        const details:
            CsvParserDetails = {

            columns: [
                {
                    name: "id",
                    type: "integer"
                },
                {
                    name: "name",
                    type: "string"
                }
            ],

            separator:
                ",",

            quote:
                "\""
        };


        const result =
            csvParser.prepare!(
                record(
                    "id,other"
                ),
                details
            );


        expect(
            isErrors(
                result
            )
        ).toBe(
            true
        );


        if (
            !isErrors(
                result
            )
        ) {
            throw new Error(
                "expected CSV preparation error"
            );
        }


        expect(
            result.errors
        ).toContain(
            'CSV header is missing required column: "name". Actual header columns are: "id", "other".'
        );
    }
);


test(
    "reports all missing configured header columns",
    () => {

        const details:
            CsvParserDetails = {

            columns: [
                {
                    name: "id",
                    type: "integer"
                },
                {
                    name: "name",
                    type: "string"
                },
                {
                    name: "status",
                    type: "character"
                },
                {
                    name: "balance",
                    type: "float"
                }
            ],

            separator:
                ",",

            quote:
                "\""
        };


        const result =
            csvParser.prepare!(
                record(
                    "id,other,status"
                ),
                details
            );


        expect(
            isErrors(
                result
            )
        ).toBe(
            true
        );


        if (
            !isErrors(
                result
            )
        ) {
            throw new Error(
                "expected CSV preparation error"
            );
        }


        expect(
            result.errors
        ).toContain(
            'CSV header is missing required columns: "name", "balance". Actual header columns are: "id", "other", "status".'
        );
    }
);


test(
    "rejects duplicate configured column names",
    () => {

        const details:
            CsvParserDetails = {

            columns: [
                {
                    name: "id",
                    type: "integer"
                },
                {
                    name: "id",
                    type: "integer"
                }
            ],

            separator:
                ",",

            quote:
                "\""
        };


        const result =
            csvParser.prepare!(
                record(
                    "id"
                ),
                details
            );


        expect(
            isErrors(
                result
            )
        ).toBe(
            true
        );


        if (
            !isErrors(
                result
            )
        ) {
            throw new Error(
                "expected CSV preparation error"
            );
        }


        expect(
            result.errors
        ).toContain(
            'CSV configuration requires column "id" more than once. Configured column names must be unique.'
        );
    }
);


test(
    "rejects duplicate required columns in the physical header",
    () => {

        const details:
            CsvParserDetails = {

            columns: [
                {
                    name: "id",
                    type: "integer"
                },
                {
                    name: "name",
                    type: "string"
                }
            ],

            separator:
                ",",

            quote:
                "\""
        };


        const result =
            csvParser.prepare!(
                record(
                    "id,name,name"
                ),
                details
            );


        expect(
            isErrors(
                result
            )
        ).toBe(
            true
        );


        if (
            !isErrors(
                result
            )
        ) {
            throw new Error(
                "expected CSV preparation error"
            );
        }


        expect(
            result.errors
        ).toContain(
            'CSV header contains required column "name" more than once, at physical columns 2, 3. Required column names must identify exactly one physical column.'
        );
    }
);


test(
    "duplicate irrelevant header columns do not make required mapping ambiguous",
    () => {

        const details:
            CsvParserDetails = {

            columns: [
                {
                    name: "id",
                    type: "integer"
                }
            ],

            separator:
                ",",

            quote:
                "\""
        };


        const prepared =
            prepare(
                details,
                record(
                    "id,other,other"
                )
            );


        expect(
            Array.from(
                prepared.physicalToLogical
            )
        ).toEqual([
            0,
            -1,
            -1
        ]);
    }
);


test(
    "quoted header names are supported",
    () => {

        const details:
            CsvParserDetails = {

            columns: [
                {
                    name: "customer,name",
                    type: "string"
                }
            ],

            separator:
                ",",

            quote:
                "\""
        };


        const prepared =
            prepare(
                details,
                record(
                    `"customer,name",ignored`
                )
            );


        expect(
            Array.from(
                prepared.physicalToLogical
            )
        ).toEqual([
            0,
            -1
        ]);
    }
);


test(
    "escaped quotes in header names are decoded before matching",
    () => {

        const details:
            CsvParserDetails = {

            columns: [
                {
                    name: `customer "name"`,
                    type: "string"
                }
            ],

            separator:
                ",",

            quote:
                "\""
        };


        const prepared =
            prepare(
                details,
                record(
                    `"customer ""name""",ignored`
                )
            );


        expect(
            Array.from(
                prepared.physicalToLogical
            )
        ).toEqual([
            0,
            -1
        ]);
    }
);


test(
    "malformed quoted header reports header rather than record",
    () => {

        const details:
            CsvParserDetails = {

            columns: [
                {
                    name: "id",
                    type: "integer"
                }
            ],

            separator:
                ",",

            quote:
                "\""
        };


        const result =
            csvParser.prepare!(
                record(
                    `"id`
                ),
                details
            );


        expect(
            isErrors(
                result
            )
        ).toBe(
            true
        );


        if (
            !isErrors(
                result
            )
        ) {
            throw new Error(
                "expected CSV preparation error"
            );
        }


        expect(
            result.errors
        ).toContain(
            `CSV header column 1, byte 3: quoted field began at byte 0 with "\\"" (0x22), but the record ended before a closing quote was found.`
        );
    }
);


/*
 * CSV control-character validation
 */

test(
    "rejects a multi-byte separator",
    () => {

        const details:
            CsvParserDetails = {

            columns: [
                {
                    name: "id",
                    type: "integer"
                }
            ],

            separator:
                "||"
        };


        const result =
            csvParser.prepare!(
                record(
                    "id"
                ),
                details
            );


        expect(
            isErrors(
                result
            )
        ).toBe(
            true
        );


        if (
            !isErrors(
                result
            )
        ) {
            throw new Error(
                "expected CSV preparation error"
            );
        }


        expect(
            result.errors
        ).toContain(
            'CSV configuration has invalid separator "||": it encodes to 2 UTF-8 bytes, but the CSV scanner requires exactly one byte.'
        );
    }
);


test(
    "rejects a multi-byte quote",
    () => {

        const details:
            CsvParserDetails = {

            columns: [
                {
                    name: "id",
                    type: "integer"
                }
            ],

            separator:
                ",",

            quote:
                "£"
        };


        const result =
            csvParser.prepare!(
                record(
                    "id"
                ),
                details
            );


        expect(
            isErrors(
                result
            )
        ).toBe(
            true
        );


        if (
            !isErrors(
                result
            )
        ) {
            throw new Error(
                "expected CSV preparation error"
            );
        }


        expect(
            result.errors
        ).toContain(
            'CSV configuration has invalid quote "£": it encodes to 2 UTF-8 bytes, but the CSV scanner requires exactly one byte.'
        );
    }
);


test(
    "rejects identical separator and quote",
    () => {

        const details:
            CsvParserDetails = {

            columns: [
                {
                    name: "id",
                    type: "integer"
                }
            ],

            separator:
                ",",

            quote:
                ","
        };


        const result =
            csvParser.prepare!(
                record(
                    "id"
                ),
                details
            );


        expect(
            isErrors(
                result
            )
        ).toBe(
            true
        );


        if (
            !isErrors(
                result
            )
        ) {
            throw new Error(
                "expected CSV preparation error"
            );
        }


        expect(
            result.errors
        ).toContain(
            'CSV configuration is ambiguous: separator and quote are both "," (0x2C). They must be different characters.'
        );
    }
);


/*
 * Row reuse
 */

test(
    "reuses the same CsvRow for successive records",
    () => {

        const prepared =
            prepare(
                standardDetails,
                record(
                    "id,name,balance"
                )
            );


        const first =
            parse(
                prepared,
                record(
                    "1,Alice,10.5"
                )
            );

        const second =
            parse(
                prepared,
                record(
                    "2,Bob,20.5"
                )
            );


        expect(
            second
        ).toBe(
            first
        );


        expect(
            second.integer(
                0
            )
        ).toBe(
            2
        );

        expect(
            second.string(
                1
            )
        ).toBe(
            "Bob"
        );

        expect(
            second.float(
                2
            )
        ).toBe(
            20.5
        );
    }
);