import {
    type PhysicalRecordContent,
    type ProjectionFactory
} from "@cobol-ts/cursor-loader-types";

import {
    createFileCursorResult,
    createFileCursorResultPool
} from "./cursor.file.result";


interface Customer {
    name(): string;
}


interface Representation {
    readonly name: string;
}


describe("file cursor result", () => {
    test("binds a reusable projection to the supplied representation", () => {
        const projection = createCustomerProjection();
        const pool = createFileCursorResultPool(projection);
        const record = physicalRecord();

        const result = createFileCursorResult(
            {
                name: "Alice"
            },
            record.value,
            pool
        );

        expect(result.result.name()).toBe("Alice");

        result.close();

        expect(record.closed).toBe(true);
    });


    test("reuses the same result wrapper and projection for a later record", () => {
        const projection = createCustomerProjection();
        const pool = createFileCursorResultPool(projection);

        const firstRecord = physicalRecord();

        const first = createFileCursorResult(
            {
                name: "Alice"
            },
            firstRecord.value,
            pool
        );

        const firstProjection = first.result;

        expect(firstProjection.name()).toBe("Alice");

        first.close();

        expect(firstRecord.closed).toBe(true);

        const secondRecord = physicalRecord();

        const second = createFileCursorResult(
            {
                name: "Bob"
            },
            secondRecord.value,
            pool
        );

        expect(second).toBe(first);
        expect(second.result).toBe(firstProjection);
        expect(second.result.name()).toBe("Bob");

        second.close();

        expect(secondRecord.closed).toBe(true);
        expect(projection.created).toBe(1);
    });


    test("clears the projection when the result is closed", () => {
        const projection = createCustomerProjection();
        const pool = createFileCursorResultPool(projection);
        const record = physicalRecord();

        const result = createFileCursorResult(
            {
                name: "Alice"
            },
            record.value,
            pool
        );

        const customer = result.result;

        expect(customer.name()).toBe("Alice");

        result.close();

        expect(record.closed).toBe(true);
        expect(
            () => customer.name()
        ).toThrow(
            "Projection is not bound"
        );
    });


    test("allows several result leases to remain live simultaneously", () => {
        const projection = createCustomerProjection();
        const pool = createFileCursorResultPool(projection);

        const aliceRecord = physicalRecord();
        const bobRecord = physicalRecord();

        const alice = createFileCursorResult(
            {
                name: "Alice"
            },
            aliceRecord.value,
            pool
        );

        const bob = createFileCursorResult(
            {
                name: "Bob"
            },
            bobRecord.value,
            pool
        );

        expect(alice).not.toBe(bob);
        expect(alice.result).not.toBe(bob.result);

        expect(alice.result.name()).toBe("Alice");
        expect(bob.result.name()).toBe("Bob");

        expect(projection.created).toBe(2);

        alice.close();

        expect(aliceRecord.closed).toBe(true);
        expect(bobRecord.closed).toBe(false);
        expect(bob.result.name()).toBe("Bob");

        bob.close();

        expect(bobRecord.closed).toBe(true);
    });


    test("clears the projection before closing the physical record", () => {
        const projection = createCustomerProjection();
        const pool = createFileCursorResultPool(projection);

        let customer: Customer | undefined;

        const record = physicalRecord(
            () => {
                if (customer === undefined) {
                    throw new Error("Expected projection");
                }

                expect(
                    () => customer.name()
                ).toThrow(
                    "Projection is not bound"
                );
            }
        );

        const result = createFileCursorResult(
            {
                name: "Alice"
            },
            record.value,
            pool
        );

        customer = result.result;

        expect(customer.name()).toBe("Alice");

        result.close();

        expect(record.closed).toBe(true);
    });


    test("returns the pooled result after a failed bind without taking ownership of the physical record", () => {
        const projection = createFailingCustomerProjection();
        const pool = createFileCursorResultPool(projection);

        const failedRecord = physicalRecord();

        expect(
            () => createFileCursorResult(
                {
                    name: "Alice"
                },
                failedRecord.value,
                pool
            )
        ).toThrow(
            "bind failed"
        );

        /*
         * Ownership transfers only after a successful bind.
         */
        expect(failedRecord.closed).toBe(false);

        /*
         * bind() deliberately left partial state behind before throwing.
         * createFileCursorResult() must have cleared it.
         */
        expect(projection.bound).toBe(false);

        projection.failBinding = false;

        const successfulRecord = physicalRecord();

        const result = createFileCursorResult(
            {
                name: "Bob"
            },
            successfulRecord.value,
            pool
        );

        /*
         * The failed lease was returned to the pool, so no second projection
         * object needed to be created.
         */
        expect(projection.created).toBe(1);
        expect(result.result.name()).toBe("Bob");

        result.close();

        expect(successfulRecord.closed).toBe(true);

        /*
         * The failed record was never owned by the result.
         */
        expect(failedRecord.closed).toBe(false);

        failedRecord.value.close();

        expect(failedRecord.closed).toBe(true);
    });
});


interface CustomerProjection
    extends ProjectionFactory<Customer,Representation> {

    readonly created: number;
}


function createCustomerProjection(): CustomerProjection {
    const bindings = new WeakMap<Customer,Representation>();
    let created = 0;

    return {
        get created() {
            return created;
        },

        create(): Customer {
            created++;

            const customer: Customer = {
                name: () => {
                    const representation = bindings.get(customer);

                    if (representation === undefined) {
                        throw new Error("Projection is not bound");
                    }

                    return representation.name;
                }
            };

            return customer;
        },

        bind(customer, representation): void {
            bindings.set(customer, representation);
        },

        clear(customer): void {
            bindings.delete(customer);
        }
    };
}


interface FailingCustomerProjection
    extends ProjectionFactory<Customer,Representation> {

    failBinding: boolean;

    readonly created: number;

    readonly bound: boolean;
}


function createFailingCustomerProjection(): FailingCustomerProjection {
    const bindings = new WeakMap<Customer,Representation>();

    let created = 0;
    let bound = false;

    return {
        failBinding:
            true,

        get created() {
            return created;
        },

        get bound() {
            return bound;
        },

        create(): Customer {
            created++;

            const customer: Customer = {
                name: () => {
                    const representation = bindings.get(customer);

                    if (representation === undefined) {
                        throw new Error("Projection is not bound");
                    }

                    return representation.name;
                }
            };

            return customer;
        },

        bind(customer, representation): void {
            /*
             * Deliberately leave partial binding state before failing. This
             * verifies that createFileCursorResult() calls clear() when bind()
             * throws.
             */
            bindings.set(customer, representation);
            bound = true;

            if (this.failBinding) {
                throw new Error("bind failed");
            }
        },

        clear(customer): void {
            bindings.delete(customer);
            bound = false;
        }
    };
}


interface TestPhysicalRecord {
    readonly value: PhysicalRecordContent<undefined>;

    readonly closed: boolean;
}


function physicalRecord(
    onClose: () => void =
    () => undefined
): TestPhysicalRecord {
    let closed = false;

    const value: PhysicalRecordContent<undefined> = {
        buffers: [],
        recordState: undefined,
        startByte: 0,
        endByte: 0,
        lastValidByte: 0,
        fileFinished: true,
        source: "test-source",
        recordNumber: 1,

        close(): void {
            if (closed) {
                throw new Error("Physical record closed twice");
            }

            onClose();

            closed = true;
        }
    };

    return {
        value,

        get closed() {
            return closed;
        }
    };
}