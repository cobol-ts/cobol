import {type ParserPhysicalRecordContent} from "@cobol-ts/cursor-loader-types";

import {
    type CsvFieldVisitor,
    type CsvWalkOptions,
    walkCsvRecord
} from "./csv.walker";


const encoder = new TextEncoder();


interface Field {
    readonly column: number;
    readonly startByte: number;
    readonly endByte: number;
}


const collectField: CsvFieldVisitor<Field[]> = (
    fields,
    column,
    startByte,
    endByte
): void => {
    fields.push({column,startByte,endByte});
};


describe("walkCsvRecord",() => {
    test("walks ordinary fields",async () => {
        const record = createRecord("a,b,c\n");
        const fields: Field[] = [];

        await walkCsvRecord(record,collectField,fields);

        expect(fields).toEqual([
            {column: 0,startByte: 0,endByte: 1},
            {column: 1,startByte: 2,endByte: 3},
            {column: 2,startByte: 4,endByte: 5}
        ]);

        expect(record.endByte).toBe(6);
    });


    test("reports empty fields",async () => {
        const record = createRecord(",a,\n");
        const fields: Field[] = [];

        await walkCsvRecord(record,collectField,fields);

        expect(fields).toEqual([
            {column: 0,startByte: 0,endByte: 0},
            {column: 1,startByte: 1,endByte: 2},
            {column: 2,startByte: 3,endByte: 3}
        ]);

        expect(record.endByte).toBe(4);
    });


    test("excludes surrounding quotes but retains doubled quotes",async () => {
        const record = createRecord("\"a,b\",\"c\"\"d\"\n");
        const fields: Field[] = [];

        await walkCsvRecord(record,collectField,fields);

        expect(fields).toEqual([
            {column: 0,startByte: 1,endByte: 4},
            {column: 1,startByte: 7,endByte: 11}
        ]);

        expect(record.endByte).toBe(13);
    });


    test("allows CR and LF inside quoted fields",async () => {
        const record = createRecord("\"a\r\nb\",c\n");
        const fields: Field[] = [];

        await walkCsvRecord(record,collectField,fields);

        expect(fields).toEqual([
            {column: 0,startByte: 1,endByte: 5},
            {column: 1,startByte: 7,endByte: 8}
        ]);

        expect(record.endByte).toBe(9);
    });


    test("accepts CRLF and excludes CR from an unquoted final field",async () => {
        const record = createRecord("a,b\r\n");
        const fields: Field[] = [];

        await walkCsvRecord(record,collectField,fields);

        expect(fields).toEqual([
            {column: 0,startByte: 0,endByte: 1},
            {column: 1,startByte: 2,endByte: 3}
        ]);

        expect(record.endByte).toBe(5);
    });


    test("accepts CRLF immediately after a quoted field",async () => {
        const record = createRecord("\"abc\"\r\n");
        const fields: Field[] = [];

        await walkCsvRecord(record,collectField,fields);

        expect(fields).toEqual([
            {column: 0,startByte: 1,endByte: 4}
        ]);

        expect(record.endByte).toBe(7);
    });


    test("accepts a final record without a line terminator",async () => {
        /*
         * Buffer size 1 deliberately means EOF is not known when the final
         * source byte is read. One further readMore() is required to discover
         * EOF.
         */
        const record = createStreamingRecord("a,b",1);
        const fields: Field[] = [];

        await walkCsvRecord(record,collectField,fields);

        expect(fields).toEqual([
            {column: 0,startByte: 0,endByte: 1},
            {column: 1,startByte: 2,endByte: 3}
        ]);

        expect(record.endByte).toBe(3);
    });


    test("reports a trailing empty field at EOF",async () => {
        const record = createStreamingRecord("a,b,",2);
        const fields: Field[] = [];

        await walkCsvRecord(record,collectField,fields);

        expect(fields).toEqual([
            {column: 0,startByte: 0,endByte: 1},
            {column: 1,startByte: 2,endByte: 3},
            {column: 2,startByte: 4,endByte: 4}
        ]);

        expect(record.endByte).toBe(4);
    });


    test("an empty source contains no fields",async () => {
        const record = createRecord("");
        const fields: Field[] = [];

        await walkCsvRecord(record,collectField,fields);

        expect(fields).toEqual([]);
        expect(record.endByte).toBe(0);
    });


    test("an empty CSV record contains one empty field",async () => {
        const record = createRecord("\n");
        const fields: Field[] = [];

        await walkCsvRecord(record,collectField,fields);

        expect(fields).toEqual([
            {column: 0,startByte: 0,endByte: 0}
        ]);

        expect(record.endByte).toBe(1);
    });


    test("stops at the first logical record when later records are already available",async () => {
        const value = "a,b\nnext,row\n";
        const record = createRecord(value);
        const fields: Field[] = [];

        await walkCsvRecord(record,collectField,fields);

        expect(fields).toEqual([
            {column: 0,startByte: 0,endByte: 1},
            {column: 1,startByte: 2,endByte: 3}
        ]);

        expect(record.endByte).toBe(4);
        expect(record.lastValidByte).toBe(encode(value).length);
    });


    test("starts from a non-zero logical byte",async () => {
        const value = "xxxxa,b\nnext,row\n";
        const record = createRecord(value,4);
        const fields: Field[] = [];

        await walkCsvRecord(record,collectField,fields);

        expect(fields).toEqual([
            {column: 0,startByte: 4,endByte: 5},
            {column: 1,startByte: 6,endByte: 7}
        ]);

        expect(record.endByte).toBe(8);
    });


    test("is independent of physical buffer boundaries",async () => {
        /*
         * This record exercises:
         *
         *     unquoted fields
         *     separators
         *     quoted separators
         *     doubled quotes
         *     an empty field
         *     CR/LF inside a quoted field
         *     quoted-field close
         *     CRLF record termination
         *
         * Every possible fixed physical buffer size is tested. At buffer size
         * 1 every state transition can occur across readMore().
         */
        const value = "a,\"b,c\",\"d\"\"e\",,\"f\r\ng\"\r\n";
        const bytes = encode(value);

        const expected: Field[] = [
            {column: 0,startByte: 0,endByte: 1},
            {column: 1,startByte: 3,endByte: 6},
            {column: 2,startByte: 9,endByte: 13},
            {column: 3,startByte: 15,endByte: 15},
            {column: 4,startByte: 17,endByte: 21}
        ];

        for (let bufferSize = 1; bufferSize <= bytes.length; bufferSize++) {
            const record = createStreamingRecord(value,bufferSize);
            const fields: Field[] = [];

            await walkCsvRecord(record,collectField,fields);

            expect(fields).toEqual(expected);
            expect(record.endByte).toBe(24);
        }
    });


    test("does not inspect unused capacity beyond lastValidByte",async () => {
        /*
         * createStreamingRecord fills unused capacity with LF bytes.
         *
         * If the walker incorrectly treats Uint8Array.length as valid source
         * length, this record would terminate inside the unused capacity.
         */
        const record = createStreamingRecord("a,b",8);
        const fields: Field[] = [];

        await walkCsvRecord(record,collectField,fields);

        expect(fields).toEqual([
            {column: 0,startByte: 0,endByte: 1},
            {column: 1,startByte: 2,endByte: 3}
        ]);

        expect(record.lastValidByte).toBe(3);
        expect(record.buffers[0].length).toBe(8);
        expect(record.endByte).toBe(3);
    });


    test("continues from a carried buffer into a newly read buffer",async () => {
        /*
         * Model the cursor handing the parser a carried full buffer containing
         * bytes from the previous record before startByte.
         *
         *     buffer 0                  buffer 1
         *     xxxx a , " b              , c " LF ...
         *          ^
         *          startByte
         *
         * The quoted second field crosses the physical-buffer boundary.
         */
        const firstBuffer = encode("xxxxa,\"b");
        const secondData = encode(",c\"\n");

        const buffers: Uint8Array[] = [firstBuffer];
        let lastValidByte = firstBuffer.length;
        let fileFinished = false;

        const record: ParserPhysicalRecordContent<undefined> = {
            buffers,
            recordState: undefined,
            startByte: 4,
            endByte: 4,

            get lastValidByte(): number {
                return lastValidByte;
            },

            get fileFinished(): boolean {
                return fileFinished;
            },

            source: "test.csv",
            recordNumber: 2,

            async readMore(): Promise<void> {
                const buffer = new Uint8Array(firstBuffer.length);
                buffer.fill(0x0a);
                buffer.set(secondData);

                buffers.push(buffer);
                lastValidByte += secondData.length;
                fileFinished = true;
            }
        };

        const fields: Field[] = [];

        await walkCsvRecord(record,collectField,fields);

        expect(fields).toEqual([
            {column: 0,startByte: 4,endByte: 5},
            {column: 1,startByte: 7,endByte: 10}
        ]);

        expect(record.endByte).toBe(12);
    });


    test("reads more when startByte is exactly at the end of the carried buffer",async () => {
        const firstBuffer = encode("xxxx");
        const secondData = encode("a,b\n");

        const buffers: Uint8Array[] = [firstBuffer];
        let lastValidByte = firstBuffer.length;
        let fileFinished = false;

        const record: ParserPhysicalRecordContent<undefined> = {
            buffers,
            recordState: undefined,
            startByte: firstBuffer.length,
            endByte: firstBuffer.length,

            get lastValidByte(): number {
                return lastValidByte;
            },

            get fileFinished(): boolean {
                return fileFinished;
            },

            source: "test.csv",
            recordNumber: 2,

            async readMore(): Promise<void> {
                const buffer = new Uint8Array(firstBuffer.length);
                buffer.set(secondData);

                buffers.push(buffer);
                lastValidByte += secondData.length;
                fileFinished = true;
            }
        };

        const fields: Field[] = [];

        await walkCsvRecord(record,collectField,fields);

        expect(fields).toEqual([
            {column: 0,startByte: 4,endByte: 5},
            {column: 1,startByte: 6,endByte: 7}
        ]);

        expect(record.endByte).toBe(8);
    });


    test("reports UTF-8 byte offsets rather than character offsets",async () => {
        /*
         * UTF-8:
         *
         *     é       bytes 0..1
         *     ,       byte 2
         *     "       byte 3
         *     £       bytes 4..5
         *     "       byte 6
         *     ,       byte 7
         *     x       byte 8
         *     LF      byte 9
         *
         * Buffer size 1 also splits both multi-byte characters physically.
         */
        const record = createStreamingRecord("é,\"£\",x\n",1);
        const fields: Field[] = [];

        await walkCsvRecord(record,collectField,fields);

        expect(fields).toEqual([
            {column: 0,startByte: 0,endByte: 2},
            {column: 1,startByte: 4,endByte: 6},
            {column: 2,startByte: 8,endByte: 9}
        ]);

        expect(record.endByte).toBe(10);
    });


    test("supports custom separator and quote bytes",async () => {
        const record = createRecord("'a;b';c\n");
        const fields: Field[] = [];

        const options: CsvWalkOptions = {
            separator: 0x3b,
            quote: 0x27
        };

        await walkCsvRecord(record,collectField,fields,options);

        expect(fields).toEqual([
            {column: 0,startByte: 1,endByte: 4},
            {column: 1,startByte: 6,endByte: 7}
        ]);

        expect(record.endByte).toBe(8);
    });


    test("rejects a quote inside an unquoted field across byte boundaries",async () => {
        const record = createStreamingRecord("a\"b,c\n",1);
        const fields: Field[] = [];

        await expect(
            walkCsvRecord(record,collectField,fields)
        ).rejects.toThrow(
            "CSV column 0: quote inside unquoted field at logical byte 1"
        );
    });


    test("rejects data after a closing quote across byte boundaries",async () => {
        const record = createStreamingRecord("\"a\"x,b\n",1);
        const fields: Field[] = [];

        await expect(
            walkCsvRecord(record,collectField,fields)
        ).rejects.toThrow(
            "CSV column 0: unexpected byte after closing quote at logical byte 3"
        );
    });


    test("rejects CR after a closing quote when it is not followed by LF",async () => {
        const record = createStreamingRecord("\"a\"\rb\n",1);
        const fields: Field[] = [];

        await expect(
            walkCsvRecord(record,collectField,fields)
        ).rejects.toThrow(
            "CSV column 0: CR after closing quote was not followed by LF at logical byte 4"
        );
    });


    test("rejects an unterminated quoted field at EOF",async () => {
        const record = createStreamingRecord("\"a,b",1);
        const fields: Field[] = [];

        await expect(
            walkCsvRecord(record,collectField,fields)
        ).rejects.toThrow(
            "CSV column 0: unterminated quoted field at logical byte 4"
        );
    });


    test("accepts a quoted field closed exactly at EOF",async () => {
        const record = createStreamingRecord("\"abc\"",1);
        const fields: Field[] = [];

        await walkCsvRecord(record,collectField,fields);

        expect(fields).toEqual([
            {column: 0,startByte: 1,endByte: 4}
        ]);

        expect(record.endByte).toBe(5);
    });
});


function createRecord(
    value: string,
    startByte = 0
): ParserPhysicalRecordContent<undefined> {
    const buffer = encode(value);

    return {
        buffers: buffer.length === 0 ? [] : [buffer],
        recordState: undefined,
        startByte,
        endByte: startByte,
        lastValidByte: buffer.length,
        fileFinished: true,
        source: "test.csv",
        recordNumber: 1,

        async readMore(): Promise<void> {
            throw new Error("Unexpected readMore()");
        }
    };
}


/*
 * Model the real physical-reader contract:
 *
 *     - every allocated buffer has fixed capacity;
 *     - lastValidByte describes actual source bytes, not capacity;
 *     - unused final-buffer capacity is poisoned;
 *     - a short fill establishes EOF immediately;
 *     - a completely full final buffer does not establish EOF until the next
 *       readMore() discovers zero additional bytes.
 *
 * Starting with no buffer also matches the first-record cursor path: the parser
 * asks readMore() for physical input when it needs it.
 */
function createStreamingRecord(
    value: string,
    bufferSize: number
): ParserPhysicalRecordContent<undefined> {
    const source = encode(value);
    const buffers: Uint8Array[] = [];

    let sourceByte = 0;
    let lastValidByte = 0;
    let fileFinished = false;

    return {
        buffers,
        recordState: undefined,
        startByte: 0,
        endByte: 0,

        get lastValidByte(): number {
            return lastValidByte;
        },

        get fileFinished(): boolean {
            return fileFinished;
        },

        source: "test.csv",
        recordNumber: 1,

        async readMore(): Promise<void> {
            const remaining = source.length - sourceByte;

            if (remaining === 0) {
                fileFinished = true;
                return;
            }

            const count = Math.min(bufferSize,remaining);
            const buffer = new Uint8Array(bufferSize);

            /*
             * Make reading beyond lastValidByte fail conspicuously: LF would
             * look like a record terminator if the walker scanned capacity
             * rather than valid source bytes.
             */
            buffer.fill(0x0a);
            buffer.set(source.subarray(sourceByte,sourceByte + count));

            buffers.push(buffer);

            sourceByte += count;
            lastValidByte += count;

            if (count < bufferSize) {
                fileFinished = true;
            }
        }
    };
}


function encode(value: string): Uint8Array {
    return encoder.encode(value);
}