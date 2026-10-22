import type {ProjectedArray} from "@cobol-ts/arrays";
import type {ProjectionPhysicalRecord} from "@cobol-ts/cursor-loader-types";
import {parseCopybook} from "@cobol-ts/copybook";
import {compileCobolLayout} from "@cobol-ts/layout";
import {createFileCursor} from "@cobol-ts/cursor-file";
import {createProjection, defineProjection} from "@cobol-ts/cursor-projection";
import {valueOrThrow} from "@cobol-ts/errors";
import {cobolParser, createCobolFixedDetails, createCobolRecordState} from "./cobol.parser";
import {customerHexBytes} from "./customer.fixtures";

/**
 * Independent byte oracle for nested OCCURS and an unequal-length REDEFINES.
 *
 * PREFIX                          [0, 1)
 * ORDERS[0]                      [1, 14)
 *   ITEMS[0..2], 4 bytes each    [1,5), [5,9), [9,13)
 *   TAIL                         [13,14)
 * ORDERS[1]                      [14,27)
 *   ITEMS[0..2], 4 bytes each    [14,18), [18,22), [22,26)
 *   TAIL                         [26,27)
 * STATUS                         [27,28)
 *
 * Each item's RAW uses its first two bytes. EXTENDED REDEFINES RAW with
 * KIND (one byte) and PAYLOAD (three bytes), and therefore requires the
 * full four-byte stride even though RAW itself only occupies two bytes.
 * The literal bytes and expected ranges below are not derived from the
 * production parser, compiler or a test-only storage-layout algorithm.
 */
const copybook = [
    "01 CUSTOMER.",
    "   05 PREFIX PIC X.",
    "   05 ORDERS OCCURS 2 TIMES.",
    "      10 ITEMS OCCURS 3 TIMES.",
    "         15 RAW PIC X(2).",
    "         15 EXTENDED REDEFINES RAW.",
    "            20 KIND PIC X.",
    "            20 PAYLOAD PIC X(3).",
    "      10 TAIL PIC X.",
    "   05 STATUS PIC X."
].join("\n");

const rows = [
    customerHexBytes([
        "C1",                              // PREFIX [0,1)
        "D1 D2 D3 D4", "E1 E2 E3 E4", "F1 F2 F3 F4", "C2", // ORDER[0]
        "C3 C4 C5 C6", "D5 D6 D7 D8", "E5 E6 E7 E8", "C7", // ORDER[1]
        "C8"                               // STATUS [27,28)
    ].join("  ")),
    customerHexBytes([
        "E9",
        "F9 F8 F7 F6", "E4 E3 E2 E1", "D4 D3 D2 D1", "C9",
        "C1 C2 C3 C4", "B1 B2 B3 B4", "A1 A2 A3 A4", "D9",
        "E1"
    ].join("  "))
];

interface ExtendedItem {
    kind(): string;
    payload(): string;
}
interface Item {
    raw(): string;
    readonly extended: ExtendedItem;
}
interface Order {
    readonly items: ProjectedArray<Item>;
    tail(): string;
}
interface Customer {
    prefix(): string;
    readonly orders: ProjectedArray<Order>;
    status(): string;
}

const projection = defineProjection<Customer>({
    prefix: {type: "character", path: ["CUSTOMER", "PREFIX"]},
    orders: {type: "array", path: ["CUSTOMER", "ORDERS"], element: {
        items: {type: "array", path: ["ITEMS"], element: {
            raw: {type: "string", path: ["RAW"]},
            extended: {type: "object", path: ["EXTENDED"], fields: {
                kind: {type: "character", path: ["KIND"]},
                payload: {type: "string", path: ["PAYLOAD"]}
            }}
        }},
        tail: {type: "character", path: ["TAIL"]}
    }},
    status: {type: "character", path: ["CUSTOMER", "STATUS"]}
});

const details = valueOrThrow(createCobolFixedDetails(
    valueOrThrow(compileCobolLayout(valueOrThrow(parseCopybook(copybook)), "nested-redefines.cpy"))
));

const record = (number: number, state = createCobolRecordState()): ProjectionPhysicalRecord => ({
    buffers: [rows[number]], startByte: 0, endByte: 28, lastValidByte: 28,
    source: "nested-redefines.fb", recordNumber: number + 1, recordState: state
});

const createCursor = () => {
    const bytes = Uint8Array.from([...rows[0], ...rows[1]]);
    const source = {bytes, offset: 0};
    return createFileCursor(
        {filename: "nested-redefines.fb", fileType: "cobol" as const, projection}, source,
        {parsers: {cobol: {
            parser: cobolParser, parserConfig: () => details, createRecordState: createCobolRecordState
        }}, bufferSize: 9,
        fillFileBuffer: async (s: typeof source, destination: Uint8Array) => {
            const count = Math.min(destination.length, s.bytes.length - s.offset);
            destination.set(s.bytes.subarray(s.offset, s.offset + count));
            s.offset += count;
            return count;
        }}
    );
};

describe("nested fixed OCCURS with unequal-length REDEFINES", () => {
    test("selects both overlay interpretations independently in different nested occurrences", () => {
        const factory = createProjection(cobolParser, details, undefined, projection);
        const customer = factory.create(), physical = record(0);
        factory.bind(customer, physical, physical);
        expect(customer.orders.length).toBe(2);
        expect(customer.orders[0].items.length).toBe(3);
        expect(customer.orders[1].items.length).toBe(3);

        const first = customer.orders[0].items[0];
        const last = customer.orders[1].items[2];
        expect(first.raw()).toBe("1/3/d1 d2");
        expect(first.extended.kind()).toBe("1/2/d1");
        expect(first.extended.payload()).toBe("2/5/d2 d3 d4");
        expect(last.raw()).toBe("22/24/e5 e6");
        expect(last.extended.kind()).toBe("22/23/e5");
        expect(last.extended.payload()).toBe("23/26/e6 e7 e8");
        expect(customer.orders[0].items[0]).toBe(first);
        expect(customer.orders[1].items[2]).toBe(last);
        expect(first.extended.payload()).toBe("2/5/d2 d3 d4");
        factory.clear(customer);
    });

    test("uses maximum overlay extent for both strides and correctly locates following fields", () => {
        const factory = createProjection(cobolParser, details, undefined, projection);
        const customer = factory.create(), physical = record(0);
        expect(rows[0].length).toBe(28); // Independently specified 1 + 2 * (3 * 4 + 1) + 1
        expect(details.recordLengthBytes).toBe(28);
        factory.bind(customer, physical, physical);

        // Inner occurrences advance four bytes, NOT RAW's two bytes.
        expect(customer.orders[0].items[1].raw()).toBe("5/7/e1 e2");
        expect(customer.orders[0].items[1].extended.payload()).toBe("6/9/e2 e3 e4");
        expect(customer.orders[0].items[2].raw()).toBe("9/11/f1 f2");
        expect(customer.orders[0].items[2].extended.payload()).toBe("10/13/f2 f3 f4");

        // Outer occurrences advance thirteen bytes, including their TAIL.
        expect(customer.orders[1].items[0].raw()).toBe("14/16/c3 c4");
        expect(customer.orders[1].items[1].extended.payload()).toBe("19/22/d6 d7 d8");
        expect(customer.orders[0].tail()).toBe("13/14/c2");
        expect(customer.orders[1].tail()).toBe("26/27/c7");
        expect(customer.prefix()).toBe("0/1/c1");
        expect(customer.status()).toBe("27/28/c8");
        expect(customer.orders[2]).toBeUndefined();
        expect(customer.orders[1].items[3]).toBeUndefined();
        factory.clear(customer);
    });

    test("retains distinct nested high-water slots and rebinds them to a reused physical-record state", () => {
        const factory = createProjection(cobolParser, details, undefined, projection);
        const customer = factory.create(), state = createCobolRecordState();
        const firstRecord = record(0, state);
        factory.bind(customer, firstRecord, firstRecord);

        const orders = customer.orders;
        expect(orders.length).toBe(2);
        const root = [...state.projectionViews.values()][0] as {name: string; elements: unknown[]};
        expect(root.name).toBe("root.orders");
        expect(root.elements.length).toBe(0); // Array length is not allocated capacity.

        // Select the last item of order 1, and only the first item of order 0.
        const second = orders[1], secondItems = second.items, secondLast = secondItems[2];
        expect(root.elements.length).toBe(2);
        expect(0 in root.elements).toBe(false);
        const first = orders[0], firstItems = first.items, firstFirst = firstItems[0];
        expect(firstItems).not.toBe(secondItems);
        expect(firstItems.length).toBe(3);
        expect(secondItems.length).toBe(3);
        expect(firstFirst.raw()).toBe("1/3/d1 d2");
        expect(secondLast.extended.payload()).toBe("23/26/e6 e7 e8");

        // No second data representation: a byte mutation is visible immediately.
        const previous = firstRecord.buffers[0][23];
        firstRecord.buffers[0][23] = 0xFE;
        expect(secondLast.extended.payload()).toBe("23/26/fe e7 e8");
        firstRecord.buffers[0][23] = previous;

        factory.clear(customer);
        expect(orders.length).toBe(0);
        expect(firstItems.length).toBe(0);
        expect(secondItems.length).toBe(0);
        expect(root.elements.length).toBe(2); // Retain allocated slots after clear.

        const nextRecord = record(1, state);
        factory.bind(customer, nextRecord, nextRecord);
        expect(customer.orders).toBe(orders);
        expect(customer.orders[0]).toBe(first);
        expect(customer.orders[1]).toBe(second);
        expect(customer.orders[0].items).toBe(firstItems);
        expect(customer.orders[1].items).toBe(secondItems);
        expect(customer.orders[0].items[0]).toBe(firstFirst);
        expect(customer.orders[1].items[2]).toBe(secondLast);
        expect(firstItems.length).toBe(3);
        expect(secondItems.length).toBe(3);
        expect(firstFirst.raw()).toBe("1/3/f9 f8");
        expect(secondLast.extended.payload()).toBe("23/26/a2 a3 a4");
        expect(customer.orders[0].tail()).toBe("13/14/c9");
        expect(customer.orders[1].tail()).toBe("26/27/d9");
        expect(customer.status()).toBe("27/28/e1");
        factory.clear(customer);
    });

    test("keeps two live nested-overlay projections independent through the real file cursor", async () => {
        const cursor = createCursor();
        const a = await cursor.next(), b = await cursor.next();
        if (a.done === true || b.done === true || Array.isArray(a.value) || Array.isArray(b.value)) {
            throw new Error("Expected two leased COBOL records");
        }
        const first = a.value, second = b.value;
        const oldItem = first.result.orders[1].items[2];
        const newItem = second.result.orders[0].items[1];
        expect(oldItem.extended.payload()).toBe("23/26/e6 e7 e8");
        expect(newItem.extended.payload()).toBe("6/9/e3 e2 e1");
        first.close();
        expect(newItem.raw()).toBe("5/7/e4 e3");
        expect(second.result.orders[1].tail()).toBe("26/27/d9");
        second.close();
        expect((await cursor.next()).done).toBe(true);
    });
});
