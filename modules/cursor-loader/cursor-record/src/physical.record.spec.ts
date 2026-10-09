import {
    createDefaultPhysicalRecordConfig,
    createPhysicalRecord
} from "./physical.record";


interface TestRecordState {
    value: number;
}

interface TestFile {
    readonly name: string;
}

const BUFFER_SIZE = 8;
const SOURCE = "test-source";


describe("physical record", () => {
    test("creates a physical record with empty lease state", () => {
        const config = createTestConfig();
        const record = createPhysicalRecord(config);

        expect(record.buffers).toHaveLength(0);
        expect(record.source).toBe(SOURCE);
        expect(record.recordNumber).toBe(0);
        expect(record.startByte).toBe(0);
        expect(record.endByte).toBe(0);
        expect(record.lastValidByte).toBe(0);
        expect(record.fileFinished).toBe(false);

        record.close();
    });


    test("uses the configured physical byte buffer size", async () => {
        const config = createTestConfig(BUFFER_SIZE);
        const record = createPhysicalRecord(config);

        await record.readMore();

        expect(record.buffers).toHaveLength(1);
        expect(record.buffers[0].length).toBe(BUFFER_SIZE);

        record.close();
    });


    test("stores the exact Uint8Array supplied to fillFileBuffer", async () => {
        let filledBuffer: Uint8Array | undefined;

        const file: TestFile = {
            name: "test"
        };

        const config = createDefaultPhysicalRecordConfig<TestRecordState,TestFile>({
            source: SOURCE,
            file,
            bufferSize: BUFFER_SIZE,
            fillFileBuffer: async (actualFile, buffer) => {
                expect(actualFile).toBe(file);

                filledBuffer = buffer;
                buffer[3] = 91;

                return buffer.length;
            },
            createRecordState: () => ({
                value: 0
            })
        });

        const record = createPhysicalRecord(config);

        await record.readMore();

        expect(record.buffers[0]).toBe(filledBuffer);
        expect(record.buffers[0][3]).toBe(91);

        record.close();
    });


    test("transfers the acquired byte buffer reference directly to the physical record", async () => {
        let filledBuffer: Uint8Array | undefined;

        const file: TestFile = {
            name: "test"
        };

        const config = createDefaultPhysicalRecordConfig<TestRecordState,TestFile>({
            source: SOURCE,
            file,
            bufferSize: BUFFER_SIZE,
            fillFileBuffer: async (_actualFile, buffer) => {
                filledBuffer = buffer;
                return buffer.length;
            },
            createRecordState: () => ({
                value: 0
            })
        });

        const record = createPhysicalRecord(config);

        await record.readMore();

        const recordBuffer = record.buffers[0];

        expect(recordBuffer).toBe(filledBuffer);

        /*
         * While the physical record owns the acquired reference, the pool
         * cannot hand this same Uint8Array out again.
         */
        const otherBuffer = config.byteBufferPool.acquire();

        expect(otherBuffer).not.toBe(recordBuffer);

        config.byteBufferPool.release(otherBuffer);
        record.close();

        /*
         * Once the physical record releases its reference, the buffer is
         * available to the pool again.
         */
        const reusedBuffer = config.byteBufferPool.acquire();

        expect(reusedBuffer).toBe(recordBuffer);

        config.byteBufferPool.release(reusedBuffer);
    });


    test("advances lastValidByte by the number of bytes read", async () => {
        const config = createTestConfig(
            BUFFER_SIZE,
            BUFFER_SIZE,
            3
        );

        const record = createPhysicalRecord(config);

        await record.readMore();
        expect(record.lastValidByte).toBe(BUFFER_SIZE);

        await record.readMore();
        expect(record.lastValidByte).toBe(BUFFER_SIZE * 2);

        await record.readMore();
        expect(record.lastValidByte).toBe((BUFFER_SIZE * 2) + 3);

        record.close();
    });


    test("does not set fileFinished for a full physical buffer", async () => {
        const config = createTestConfig(BUFFER_SIZE);
        const record = createPhysicalRecord(config);

        await record.readMore();

        expect(record.lastValidByte).toBe(BUFFER_SIZE);
        expect(record.fileFinished).toBe(false);

        record.close();
    });


    test("sets fileFinished for a partial final physical buffer", async () => {
        const config = createTestConfig(5);
        const record = createPhysicalRecord(config);

        await record.readMore();

        expect(record.buffers).toHaveLength(1);
        expect(record.lastValidByte).toBe(5);
        expect(record.fileFinished).toBe(true);

        record.close();
    });


    test("sets fileFinished when EOF is discovered exactly on a buffer boundary", async () => {
        const config = createTestConfig(
            BUFFER_SIZE,
            0
        );

        const record = createPhysicalRecord(config);

        await record.readMore();

        expect(record.lastValidByte).toBe(BUFFER_SIZE);
        expect(record.fileFinished).toBe(false);

        await record.readMore();

        /*
         * The EOF probe added no valid bytes.
         */
        expect(record.lastValidByte).toBe(BUFFER_SIZE);
        expect(record.fileFinished).toBe(true);

        /*
         * Current readMore() contract transfers the acquired buffer even when
         * the successful read contains zero valid bytes.
         */
        expect(record.buffers).toHaveLength(2);

        record.close();
    });


    test("readMore does not modify startByte or endByte", async () => {
        const config = createTestConfig(BUFFER_SIZE);
        const record = createPhysicalRecord(config);

        record.startByte = 3;
        record.endByte = 5;

        await record.readMore();

        expect(record.startByte).toBe(3);
        expect(record.endByte).toBe(5);
        expect(record.lastValidByte).toBe(BUFFER_SIZE);

        record.close();
    });


    test("each readMore appends a different pooled byte buffer", async () => {
        const config = createTestConfig(
            BUFFER_SIZE,
            BUFFER_SIZE,
            BUFFER_SIZE
        );

        const record = createPhysicalRecord(config);

        await record.readMore();
        await record.readMore();
        await record.readMore();

        expect(record.buffers).toHaveLength(3);
        expect(record.buffers[0]).not.toBe(record.buffers[1]);
        expect(record.buffers[1]).not.toBe(record.buffers[2]);
        expect(record.buffers[0]).not.toBe(record.buffers[2]);
        expect(record.lastValidByte).toBe(BUFFER_SIZE * 3);

        record.close();
    });


    test("close releases every byte buffer owned by the physical record", async () => {
        const config = createTestConfig(
            BUFFER_SIZE,
            BUFFER_SIZE,
            3
        );

        const record = createPhysicalRecord(config);

        await record.readMore();
        await record.readMore();
        await record.readMore();

        const firstBuffer = record.buffers[0];
        const secondBuffer = record.buffers[1];
        const thirdBuffer = record.buffers[2];

        record.close();

        /*
         * All three references have been returned to the byte pool.
         */
        const acquiredFirst = config.byteBufferPool.acquire();
        const acquiredSecond = config.byteBufferPool.acquire();
        const acquiredThird = config.byteBufferPool.acquire();

        const acquired = [
            acquiredFirst,
            acquiredSecond,
            acquiredThird
        ];

        expect(acquired).toContain(firstBuffer);
        expect(acquired).toContain(secondBuffer);
        expect(acquired).toContain(thirdBuffer);

        config.byteBufferPool.release(acquiredFirst);
        config.byteBufferPool.release(acquiredSecond);
        config.byteBufferPool.release(acquiredThird);
    });


    test("close clears the existing buffers array rather than replacing it", async () => {
        const config = createTestConfig(BUFFER_SIZE);
        const record = createPhysicalRecord(config);
        const buffers = record.buffers;

        await record.readMore();

        expect(buffers).toHaveLength(1);

        record.close();

        expect(buffers).toHaveLength(0);
        expect(record.buffers).toBe(buffers);
    });


    test("close returns the physical record object to its pool", () => {
        const config = createTestConfig();

        const first = createPhysicalRecord(config);

        first.close();

        const second = createPhysicalRecord(config);

        expect(second).toBe(first);

        second.close();
    });


    test("a shared byte buffer is not reusable until every owner releases it", async () => {
        const config = createTestConfig(BUFFER_SIZE);
        const record = createPhysicalRecord(config);

        await record.readMore();

        const sharedBuffer = record.buffers[0];

        sharedBuffer[0] = 77;

        /*
         * Simulate the cursor taking the additional carry reference.
         */
        config.retainBuffer(sharedBuffer);

        record.close();

        /*
         * The physical record released its reference, but the cursor reference
         * remains.
         */
        const otherBuffer = config.byteBufferPool.acquire();

        expect(otherBuffer).not.toBe(sharedBuffer);
        expect(sharedBuffer[0]).toBe(77);

        config.byteBufferPool.release(otherBuffer);

        /*
         * Release the simulated cursor reference.
         */
        config.releaseBuffer(sharedBuffer);

        /*
         * The original buffer is now available again.
         */
        const reusedBuffer = config.byteBufferPool.acquire();

        expect(reusedBuffer).toBe(sharedBuffer);

        config.byteBufferPool.release(reusedBuffer);
    });


    test("createPhysicalRecord resets physical lease state when reusing an object", () => {
        const config = createTestConfig();

        const first = createPhysicalRecord(config);

        first.source = "previous-source";
        first.recordNumber = 37;
        first.startByte = 3;
        first.endByte = 7;
        first.lastValidByte = 11;
        first.fileFinished = true;

        first.close();

        const second = createPhysicalRecord(config);

        expect(second).toBe(first);
        expect(second.source).toBe(SOURCE);
        expect(second.recordNumber).toBe(0);
        expect(second.startByte).toBe(0);
        expect(second.endByte).toBe(0);
        expect(second.lastValidByte).toBe(0);
        expect(second.fileFinished).toBe(false);

        second.close();
    });


    test("createPhysicalRecord does not reset parser-owned recordState", () => {
        const config = createTestConfig();

        const first = createPhysicalRecord(config);

        first.recordState.value = 123;
        first.close();

        const second = createPhysicalRecord(config);

        expect(second).toBe(first);
        expect(second.recordState.value).toBe(123);

        second.close();
    });


    test("releases the acquired byte buffer when fillFileBuffer throws", async () => {
        const expectedError = new Error("read failed");
        let acquiredBuffer: Uint8Array | undefined;

        const file: TestFile = {
            name: "test"
        };

        const config = createDefaultPhysicalRecordConfig<TestRecordState,TestFile>({
            source: SOURCE,
            file,
            bufferSize: BUFFER_SIZE,
            fillFileBuffer: async (_actualFile, buffer) => {
                acquiredBuffer = buffer;
                throw expectedError;
            },
            createRecordState: () => ({
                value: 0
            })
        });

        const record = createPhysicalRecord(config);

        await expect(
            record.readMore()
        ).rejects.toBe(expectedError);

        expect(record.buffers).toHaveLength(0);
        expect(record.lastValidByte).toBe(0);
        expect(record.fileFinished).toBe(false);

        /*
         * Failure occurred before ownership transferred to the physical record,
         * so the acquired buffer must already be available from the pool again.
         */
        const reusedBuffer = config.byteBufferPool.acquire();

        expect(reusedBuffer).toBe(acquiredBuffer);

        config.byteBufferPool.release(reusedBuffer);
        record.close();
    });


    test("rejects a negative byte count without transferring the buffer", async () => {
        let acquiredBuffer: Uint8Array | undefined;

        const file: TestFile = {
            name: "test"
        };

        const config = createDefaultPhysicalRecordConfig<TestRecordState,TestFile>({
            source: SOURCE,
            file,
            bufferSize: BUFFER_SIZE,
            fillFileBuffer: async (_actualFile, buffer) => {
                acquiredBuffer = buffer;
                return -1;
            },
            createRecordState: () => ({
                value: 0
            })
        });

        const record = createPhysicalRecord(config);

        await expect(
            record.readMore()
        ).rejects.toThrow(
            "fillFileBuffer returned an invalid byte count"
        );

        expect(record.buffers).toHaveLength(0);
        expect(record.lastValidByte).toBe(0);

        const reusedBuffer = config.byteBufferPool.acquire();

        expect(reusedBuffer).toBe(acquiredBuffer);

        config.byteBufferPool.release(reusedBuffer);
        record.close();
    });


    test("rejects a byte count greater than physical buffer capacity without transferring the buffer", async () => {
        let acquiredBuffer: Uint8Array | undefined;

        const file: TestFile = {
            name: "test"
        };

        const config = createDefaultPhysicalRecordConfig<TestRecordState,TestFile>({
            source: SOURCE,
            file,
            bufferSize: BUFFER_SIZE,
            fillFileBuffer: async (_actualFile, buffer) => {
                acquiredBuffer = buffer;
                return buffer.length + 1;
            },
            createRecordState: () => ({
                value: 0
            })
        });

        const record = createPhysicalRecord(config);

        await expect(
            record.readMore()
        ).rejects.toThrow(
            "fillFileBuffer returned an invalid byte count"
        );

        expect(record.buffers).toHaveLength(0);
        expect(record.lastValidByte).toBe(0);

        const reusedBuffer = config.byteBufferPool.acquire();

        expect(reusedBuffer).toBe(acquiredBuffer);

        config.byteBufferPool.release(reusedBuffer);
        record.close();
    });
});


/**
 * In-memory physical-file configuration.
 *
 * Each supplied number is returned by the next fillFileBuffer invocation.
 *
 * The exact pooled Uint8Array supplied by readMore() is modified directly.
 *
 * No mock pool and no intercepted pool operation is required.
 */
function createTestConfig(...readLengths: number[]) {
    const file: TestFile = {
        name: "test"
    };

    let readIndex = 0;
    let fillNumber = 1;

    return createDefaultPhysicalRecordConfig<TestRecordState,TestFile>({
        source: SOURCE,
        file,
        bufferSize: BUFFER_SIZE,
        fillFileBuffer: async (actualFile, buffer) => {
            expect(actualFile).toBe(file);

            const bytesRead = readLengths[readIndex] ?? BUFFER_SIZE;

            readIndex++;

            /*
             * Write only the bytes claimed to have been read.
             *
             * Invalid counts are returned unchanged so production code can
             * reject them.
             */
            const bytesToWrite = Math.max(
                0,
                Math.min(
                    bytesRead,
                    buffer.length
                )
            );

            for (let index = 0; index < bytesToWrite; index++) {
                buffer[index] = fillNumber;
            }

            fillNumber++;

            return bytesRead;
        },
        createRecordState: () => ({
            value: 0
        })
    });
}