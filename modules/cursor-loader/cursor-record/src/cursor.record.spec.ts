import {
    type Parser,
    type ParserPhysicalRecordContent,
    type RecordCursorResult
} from "@cobol-ts/cursor-loader-types";
import {createRecordCursor} from "./cursor.record";
import {
    createDefaultPhysicalRecordConfig,
    type RecordCursorPhysicalRecord,
    type RecordCursorResources
} from "./physical.record";


interface TestRepresentation {
    readonly value: number;
}

interface TestParserConfig {
    readonly unused: boolean;
}

interface TestParserDetails {
    readonly name: string;
}

interface TestRecordState {
    value: number;
}

interface TestFile {
    readonly name: string;
}

const BUFFER_SIZE = 8;
const SOURCE = "test-source";


describe("createRecordCursor", () => {
    test("initialises the first record, passes parser details, and returns the same physical record", async () => {
        const details = createDetails();
        let parserRecord: ParserPhysicalRecordContent<TestRecordState> | undefined;
        let receivedDetails: TestParserDetails | undefined;

        const parser = createParser(async (record, actualDetails) => {
            parserRecord = record;
            receivedDetails = actualDetails;

            expect(record.startByte).toBe(0);
            expect(record.endByte).toBe(0);
            expect(record.lastValidByte).toBe(0);
            expect(record.fileFinished).toBe(false);
            expect(record.source).toBe(SOURCE);
            expect(record.recordNumber).toBe(1);

            await record.readMore();
            record.endByte = 3;
            return {value: 17};
        });

        const iterator = createRecordCursor(parser, details, createTestConfig(BUFFER_SIZE));
        const first = await nextRecord(iterator);

        expect(receivedDetails).toBe(details);
        expect(first.result).toEqual({value: 17});
        expect(first.physicalRecord).toBe(parserRecord);
        expect(first.physicalRecord.startByte).toBe(0);
        expect(first.physicalRecord.endByte).toBe(3);
        expect(first.physicalRecord.lastValidByte).toBe(BUFFER_SIZE);
        expect(first.physicalRecord.source).toBe(SOURCE);
        expect(first.physicalRecord.recordNumber).toBe(1);

        first.physicalRecord.close();
        await iterator.return();
    });


    test("carries several records in one physical buffer without copying it", async () => {
        let parseCount = 0;
        let sharedBuffer: Uint8Array | undefined;

        const parser = createParser(async record => {
            parseCount++;

            if (parseCount === 1) {
                await record.readMore();
                sharedBuffer = record.buffers[0];
                expect(record.fileFinished).toBe(true);
                expect(record.lastValidByte).toBe(7);
                record.endByte = 2;
                return {value: 1};
            }

            expect(record.buffers).toHaveLength(1);
            expect(record.buffers[0]).toBe(sharedBuffer);
            expect(record.fileFinished).toBe(true);
            expect(record.lastValidByte).toBe(7);

            if (parseCount === 2) {
                expect(record.startByte).toBe(2);
                record.endByte = 5;
                return {value: 2};
            }

            expect(record.startByte).toBe(5);
            record.endByte = 7;
            return {value: 3};
        });

        const iterator = createRecordCursor(parser, createDetails(), createTestConfig(7));
        const first = await nextRecord(iterator);
        const second = await nextRecord(iterator);
        const third = await nextRecord(iterator);

        expect(first.physicalRecord.buffers[0]).toBe(sharedBuffer);
        expect(second.physicalRecord.buffers[0]).toBe(sharedBuffer);
        expect(third.physicalRecord.buffers[0]).toBe(sharedBuffer);
        expect(first.physicalRecord.recordNumber).toBe(1);
        expect(second.physicalRecord.recordNumber).toBe(2);
        expect(third.physicalRecord.recordNumber).toBe(3);

        first.physicalRecord.close();
        second.physicalRecord.close();
        third.physicalRecord.close();
        await expectFinished(iterator);
    });


    test("carries only the final buffer of a multi-buffer record and rebases offsets", async () => {
        let parseCount = 0;
        let firstBuffer: Uint8Array | undefined;
        let middleBuffer: Uint8Array | undefined;
        let finalBuffer: Uint8Array | undefined;

        const parser = createParser(async record => {
            parseCount++;

            if (parseCount === 1) {
                await record.readMore();
                await record.readMore();
                await record.readMore();

                [firstBuffer, middleBuffer, finalBuffer] = record.buffers;
                expect(record.lastValidByte).toBe(BUFFER_SIZE * 3);
                record.endByte = (BUFFER_SIZE * 2) + 3;
                return {value: 1};
            }

            expect(record.buffers).toHaveLength(1);
            expect(record.buffers[0]).toBe(finalBuffer);
            expect(record.buffers[0]).not.toBe(firstBuffer);
            expect(record.buffers[0]).not.toBe(middleBuffer);
            expect(record.startByte).toBe(3);
            expect(record.lastValidByte).toBe(BUFFER_SIZE);
            record.endByte = 4;
            return {value: 2};
        });

        const iterator = createRecordCursor(
            parser,
            createDetails(),
            createTestConfig(BUFFER_SIZE, BUFFER_SIZE, BUFFER_SIZE)
        );

        const first = await nextRecord(iterator);
        first.physicalRecord.close();

        const second = await nextRecord(iterator);
        second.physicalRecord.close();
        await iterator.return();
    });


    test("handles a record that begins part way through one buffer and ends in another", async () => {
        let parseCount = 0;

        const parser = createParser(async record => {
            parseCount++;

            if (parseCount === 1) {
                await record.readMore();
                record.endByte = 5;
                return {value: 1};
            }

            if (parseCount === 2) {
                expect(record.startByte).toBe(5);
                expect(record.lastValidByte).toBe(BUFFER_SIZE);

                await record.readMore();

                expect(record.buffers).toHaveLength(2);
                expect(record.lastValidByte).toBe(BUFFER_SIZE * 2);
                record.endByte = BUFFER_SIZE + 4;
                return {value: 2};
            }

            expect(record.startByte).toBe(4);
            expect(record.lastValidByte).toBe(BUFFER_SIZE);
            record.endByte = 5;
            return {value: 3};
        });

        const iterator = createRecordCursor(parser, createDetails(), createTestConfig(BUFFER_SIZE, BUFFER_SIZE));
        const first = await nextRecord(iterator);
        first.physicalRecord.close();
        const second = await nextRecord(iterator);
        second.physicalRecord.close();
        const third = await nextRecord(iterator);
        third.physicalRecord.close();
        await iterator.return();
    });


    test("handles a record ending exactly at a physical buffer boundary", async () => {
        let parseCount = 0;
        let finalBuffer: Uint8Array | undefined;

        const parser = createParser(async record => {
            parseCount++;

            if (parseCount === 1) {
                await record.readMore();
                await record.readMore();
                finalBuffer = record.buffers[1];
                record.endByte = BUFFER_SIZE * 2;
                return {value: 1};
            }

            expect(record.buffers).toHaveLength(1);
            expect(record.buffers[0]).toBe(finalBuffer);
            expect(record.startByte).toBe(BUFFER_SIZE);
            expect(record.lastValidByte).toBe(BUFFER_SIZE);

            await record.readMore();

            expect(record.buffers).toHaveLength(2);
            expect(record.lastValidByte).toBe(BUFFER_SIZE + 3);
            expect(record.fileFinished).toBe(true);
            record.endByte = BUFFER_SIZE + 3;
            return {value: 2};
        });

        const iterator = createRecordCursor(
            parser,
            createDetails(),
            createTestConfig(BUFFER_SIZE, BUFFER_SIZE, 3)
        );

        const first = await nextRecord(iterator);
        first.physicalRecord.close();
        const second = await nextRecord(iterator);
        second.physicalRecord.close();
        await expectFinished(iterator);
    });


    test("allows a yielded record to remain open while the next record is parsed", async () => {
        let parseCount = 0;
        let sharedBuffer: Uint8Array | undefined;

        const parser = createParser(async record => {
            parseCount++;

            if (parseCount === 1) {
                await record.readMore();
                sharedBuffer = record.buffers[0];
                record.endByte = 3;
                return {value: 1};
            }

            expect(record.buffers[0]).toBe(sharedBuffer);
            expect(record.startByte).toBe(3);
            record.endByte = 5;
            return {value: 2};
        });

        const iterator = createRecordCursor(parser, createDetails(), createTestConfig(BUFFER_SIZE));
        const first = await nextRecord(iterator);
        const second = await nextRecord(iterator);

        expect(first.physicalRecord.buffers[0]).toBe(sharedBuffer);
        expect(second.physicalRecord.buffers[0]).toBe(sharedBuffer);

        first.physicalRecord.close();
        second.physicalRecord.close();
        await iterator.return();
    });


    test("closes a cursor-owned record when the parser throws", async () => {
        const expectedError = new Error("parser failed");
        const resources = createTrackingResources(BUFFER_SIZE);
        const parser = createParser(async record => {
            await record.readMore();
            throw expectedError;
        });

        const iterator = createRecordCursor(parser, createDetails(), resources);
        await expect(iterator.next()).rejects.toBe(expectedError);

        expect(resources.activeRecords).toBe(0);
        expect(resources.carriedReferences).toBe(0);
    });


    test("releases cursor ownership when iteration is abandoned but leaves the yielded record open", async () => {
        const resources = createTrackingResources(BUFFER_SIZE);
        const parser = createParser(async record => {
            await record.readMore();
            record.endByte = 3;
            return {value: 1};
        });

        const iterator = createRecordCursor(parser, createDetails(), resources);
        const first = await nextRecord(iterator);

        expect(resources.activeRecords).toBe(1);
        expect(resources.carriedReferences).toBe(1);

        await iterator.return();

        expect(resources.activeRecords).toBe(1);
        expect(resources.carriedReferences).toBe(0);

        first.physicalRecord.close();
        expect(resources.activeRecords).toBe(0);
    });


    test("does not retain a carry reference for the final record", async () => {
        const resources = createTrackingResources(5);
        const parser = createParser(async record => {
            await record.readMore();
            expect(record.fileFinished).toBe(true);
            record.endByte = record.lastValidByte;
            return {value: 1};
        });

        const iterator = createRecordCursor(parser, createDetails(), resources);
        const first = await nextRecord(iterator);

        expect(resources.activeRecords).toBe(1);
        expect(resources.carriedReferences).toBe(0);

        first.physicalRecord.close();
        expect(resources.activeRecords).toBe(0);
        await expectFinished(iterator);
    });


    test("closes the cursor-owned record when parser output is invalid", async () => {
        const resources = createTrackingResources(5);
        const parser = createParser(async record => {
            await record.readMore();
            record.endByte = record.lastValidByte + 1;
            return {value: 1};
        });

        const iterator = createRecordCursor(parser, createDetails(), resources);

        await expect(iterator.next()).rejects.toThrow(
            "Parser returned a physical record range outside its byte buffers"
        );
        expect(resources.activeRecords).toBe(0);
        expect(resources.carriedReferences).toBe(0);
    });


    test("rejects a non-final record containing no physical byte buffer", async () => {
        const resources = createTrackingResources();
        const parser = createParser(async record => {
            record.endByte = 0;
            return {value: 1};
        });

        const iterator = createRecordCursor(parser, createDetails(), resources);

        await expect(iterator.next()).rejects.toThrow(
            "Parser completed a non-final physical record without a byte buffer"
        );
        expect(resources.activeRecords).toBe(0);
    });
});


async function nextRecord<TRepresentation,TRecordState>(
    iterator: AsyncGenerator<RecordCursorResult<TRepresentation,TRecordState>,void,void>
): Promise<RecordCursorResult<TRepresentation,TRecordState>> {
    const next = await iterator.next();

    if (next.done === true) {
        throw new Error("Expected another record");
    }

    return next.value;
}


async function expectFinished<TRepresentation,TRecordState>(
    iterator: AsyncGenerator<RecordCursorResult<TRepresentation,TRecordState>,void,void>
): Promise<void> {
    expect((await iterator.next()).done).toBe(true);
}


function createParser(
    parse: (
        record: ParserPhysicalRecordContent<TestRecordState>,
        details: TestParserDetails
    ) => Promise<TestRepresentation>
): Parser<TestRepresentation,TestParserConfig,TestParserDetails,TestRecordState> {
    const unsupported = () => {
        throw new Error("Record cursor must not use projection support");
    };

    return {
        parse,
        integer: unsupported,
        float: unsupported,
        character: unsupported,
        string: unsupported,
        toDebugString: () => {
            throw new Error("Record cursor must not render diagnostics");
        }
    };
}


function createDetails(): TestParserDetails {
    return {name: "test"};
}


function createTestConfig(...readLengths: number[]) {
    const file: TestFile = {name: "test"};
    let readIndex = 0;
    let fillNumber = 1;

    return createDefaultPhysicalRecordConfig<TestRecordState,TestFile>({
        source: SOURCE,
        file,
        bufferSize: BUFFER_SIZE,
        fillFileBuffer: async (actualFile, buffer) => {
            expect(actualFile).toBe(file);
            const bytesRead = readLengths[readIndex] ?? 0;
            readIndex++;

            if (bytesRead < 0 || bytesRead > buffer.length) {
                throw new Error("Invalid test read length");
            }

            for (let index = 0; index < bytesRead; index++) {
                buffer[index] = fillNumber;
            }
            fillNumber++;
            return bytesRead;
        },
        createRecordState: () => ({value: 0})
    });
}


interface TrackingResources extends RecordCursorResources<TestRecordState> {
    readonly activeRecords: number;
    readonly carriedReferences: number;
}


function createTrackingResources(...readLengths: number[]): TrackingResources {
    let readIndex = 0;
    let activeRecords = 0;
    const carried = new Map<Uint8Array,number>();

    const resources: TrackingResources = {
        bufferSize: BUFFER_SIZE,

        get activeRecords() {
            return activeRecords;
        },

        get carriedReferences() {
            let total = 0;
            for (const count of carried.values()) {
                total += count;
            }
            return total;
        },

        acquireRecord(): RecordCursorPhysicalRecord<TestRecordState> {
            activeRecords++;
            let closed = false;

            const record: RecordCursorPhysicalRecord<TestRecordState> = {
                buffers: [],
                recordState: {value: 0},
                startByte: 0,
                endByte: 0,
                lastValidByte: 0,
                fileFinished: false,
                source: SOURCE,
                recordNumber: 0,

                async readMore() {
                    const buffer = new Uint8Array(BUFFER_SIZE);
                    const bytesRead = readLengths[readIndex] ?? BUFFER_SIZE;
                    readIndex++;
                    record.buffers.push(buffer);
                    record.lastValidByte += bytesRead;
                    if (bytesRead < BUFFER_SIZE) {
                        record.fileFinished = true;
                    }
                },

                close() {
                    if (closed) {
                        throw new Error("Physical record closed twice");
                    }
                    closed = true;
                    activeRecords--;
                    record.buffers.length = 0;
                }
            };

            return record;
        },

        retainBuffer(buffer) {
            carried.set(buffer, (carried.get(buffer) ?? 0) + 1);
        },

        releaseBuffer(buffer) {
            const count = carried.get(buffer);
            if (count === undefined || count === 0) {
                throw new Error("Released an unretained carry buffer");
            }
            if (count === 1) {
                carried.delete(buffer);
            } else {
                carried.set(buffer, count - 1);
            }
        }
    };

    return resources;
}