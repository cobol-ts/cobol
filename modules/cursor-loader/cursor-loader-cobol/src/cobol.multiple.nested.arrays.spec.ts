import type {ProjectedArray} from "@cobol-ts/arrays";
import type {ProjectionPhysicalRecord} from "@cobol-ts/cursor-loader-types";
import {parseCopybook} from "@cobol-ts/copybook";
import {compileCobolLayout} from "@cobol-ts/layout";
import {createFileCursor} from "@cobol-ts/cursor-file";
import {createProjection, defineProjection} from "@cobol-ts/cursor-projection";
import {valueOrThrow} from "@cobol-ts/errors";
import {cobolParser, createCobolFixedDetails, createCobolRecordState} from "./cobol.parser";
import {customerHexBytes} from "./customer.fixtures";

/** Byte and offset oracles are literal, independent of the layout compiler. */
const siblingCopybook = [
    "01 CUSTOMER.",
    "   05 CUSTOMER-ID PIC X(2).",
    "   05 TELEPHONES OCCURS 2 TIMES.",
    "      10 NUMBER PIC X(3).",
    "   05 ADDRESSES OCCURS 3 TIMES.",
    "      10 POSTCODE PIC X(2).",
    "   05 STATUS PIC X."
].join("\n");
const siblingBytes = [
    customerHexBytes("C1 C2  F1 F2 F3  F4 F5 F6  C1 C2  C3 C4  C5 C6  C9"),
    customerHexBytes("C2 C3  F7 F8 F9  F1 F1 F1  D1 D2  D3 D4  D5 D6  C1")
];

interface Telephone { number(): string }
interface Address { postcode(): string }
interface SiblingCustomer {
    id(): string;
    readonly telephones: ProjectedArray<Telephone>;
    readonly addresses: ProjectedArray<Address>;
    status(): string;
}
const siblingProjection = defineProjection<SiblingCustomer>({
    id: {type: "string", path: ["CUSTOMER", "CUSTOMER-ID"]},
    telephones: {type: "array", path: ["CUSTOMER", "TELEPHONES"], element: {
        number: {type: "string", path: ["NUMBER"]}
    }},
    addresses: {type: "array", path: ["CUSTOMER", "ADDRESSES"], element: {
        postcode: {type: "string", path: ["POSTCODE"]}
    }},
    status: {type: "character", path: ["CUSTOMER", "STATUS"]}
});

const nestedCopybook = [
    "01 CUSTOMER.",
    "   05 CUSTOMER-ID PIC X(2).",
    "   05 ORDERS OCCURS 2 TIMES.",
    "      10 ORDER-ID PIC X(2).",
    "      10 ITEMS OCCURS 3 TIMES.",
    "         15 SKU PIC X(2).",
    "         15 QUANTITY PIC 9.",
    "      10 TAIL PIC X.",
    "   05 STATUS PIC X."
].join("\n");
const nestedBytes = [
    customerHexBytes("C1 C2  D1 D2  C1 C1 F1 C2 C2 F2 C3 C3 F3 E1  D3 D4  C4 C4 F4 C5 C5 F5 C6 C6 F6 E2  C9"),
    customerHexBytes("C2 C3  D5 D6  C7 C7 F7 C8 C8 F8 C9 C9 F9 E3  D7 D8  D1 D1 F1 D2 D2 F2 D3 D3 F3 E4  C1")
];
interface Item { sku(): string; quantity(): string }
interface Order {
    id(): string;
    readonly items: ProjectedArray<Item>;
    tail(): string;
}
interface NestedCustomer {
    id(): string;
    readonly orders: ProjectedArray<Order>;
    status(): string;
}
const nestedProjection = defineProjection<NestedCustomer>({
    id: {type: "string", path: ["CUSTOMER", "CUSTOMER-ID"]},
    orders: {type: "array", path: ["CUSTOMER", "ORDERS"], element: {
        id: {type: "string", path: ["ORDER-ID"]},
        items: {type: "array", path: ["ITEMS"], element: {
            sku: {type: "string", path: ["SKU"]},
            quantity: {type: "character", path: ["QUANTITY"]}
        }},
        tail: {type: "character", path: ["TAIL"]}
    }},
    status: {type: "character", path: ["CUSTOMER", "STATUS"]}
});

const details = (copybook:string) => valueOrThrow(createCobolFixedDetails(
    valueOrThrow(compileCobolLayout(valueOrThrow(parseCopybook(copybook)),"arrays.cpy"))
));
const physicalRecord = (bytes:Uint8Array, state=createCobolRecordState(), number=1): ProjectionPhysicalRecord => ({
    buffers:[bytes], startByte:0, endByte:bytes.length, lastValidByte:bytes.length,
    source:"arrays.fb", recordNumber:number, recordState:state
});

const cursorFor = <T>(copybook:string, projection:ReturnType<typeof defineProjection<T>>, rows:readonly Uint8Array[]) => {
    const bytes=Uint8Array.from(rows.flatMap(row=>Array.from(row)));
    const source={bytes,offset:0};
    return createFileCursor(
        {filename:"arrays.fb",fileType:"cobol" as const,projection},source,
        {parsers:{cobol:{parser:cobolParser,parserConfig:()=>details(copybook),createRecordState:createCobolRecordState}},
        bufferSize:7,
        fillFileBuffer:async(s:typeof source,destination:Uint8Array)=>{
            const n=Math.min(destination.length,s.bytes.length-s.offset);
            destination.set(s.bytes.subarray(s.offset,s.offset+n));s.offset+=n;return n;
        }});
};

describe("multiple independent fixed OCCURS arrays",()=>{
    test("compiles distinct named array sites with independent count, stride and byte oracles",()=>{
        const factory=createProjection(cobolParser,details(siblingCopybook),undefined,siblingProjection);
        const customer=factory.create(),record=physicalRecord(siblingBytes[0]);
        factory.bind(customer,record,record);
        expect(customer.telephones.length).toBe(2);
        expect(customer.addresses.length).toBe(3);
        expect(customer.id()).toBe("0/2/c1 c2");
        expect(customer.telephones[0].number()).toBe("2/5/f1 f2 f3");
        expect(customer.addresses[2].postcode()).toBe("12/14/c5 c6");
        expect(customer.telephones[1].number()).toBe("5/8/f4 f5 f6");
        expect(customer.addresses[0].postcode()).toBe("8/10/c1 c2");
        expect(customer.addresses[1].postcode()).toBe("10/12/c3 c4");
        expect(customer.status()).toBe("14/15/c9");
        expect(customer.telephones[2]).toBeUndefined();
        expect(customer.addresses[3]).toBeUndefined();
        expect(customer.telephones[0]).toBe(customer.telephones[0]);
        expect(customer.addresses[2]).toBe(customer.addresses[2]);
        expect(customer.telephones.map(x=>x.number())).toEqual(["2/5/f1 f2 f3","5/8/f4 f5 f6"]);
        factory.clear(customer);
    });

    test("stores the two array runtimes separately in one pooled record state and reuses each",()=>{
        const factory=createProjection(cobolParser,details(siblingCopybook),undefined,siblingProjection);
        const customer=factory.create(),state=createCobolRecordState();
        const first=physicalRecord(siblingBytes[0],state);
        factory.bind(customer,first,first);
        const phones=customer.telephones, addresses=customer.addresses;
        const phone=phones[1],address=addresses[2];
        expect([...state.projectionViews.values()].map(x=>(x as {name:string}).name).sort()).toEqual([
            "root.addresses","root.telephones"
        ]);
        expect(phone.number()).toBe("5/8/f4 f5 f6");
        expect(address.postcode()).toBe("12/14/c5 c6");
        factory.clear(customer);
        expect(phones.length).toBe(0);
        expect(addresses.length).toBe(0);
        const second=physicalRecord(siblingBytes[1],state,2);
        factory.bind(customer,second,second);
        expect(customer.telephones).toBe(phones);
        expect(customer.addresses).toBe(addresses);
        expect(customer.telephones[1]).toBe(phone);
        expect(customer.addresses[2]).toBe(address);
        expect(phone.number()).toBe("5/8/f1 f1 f1");
        expect(address.postcode()).toBe("12/14/d5 d6");
        factory.clear(customer);
    });

    test("keeps two sibling arrays independent through real file-cursor leases",async()=>{
        const cursor=cursorFor(siblingCopybook,siblingProjection,siblingBytes);
        const a=await cursor.next(),b=await cursor.next();
        if(a.done===true||b.done===true||Array.isArray(a.value)||Array.isArray(b.value)) {
            throw new Error("Expected two record leases");
        }
        const first=a.value,second=b.value;
        const firstPhone=first.result.telephones[1];
        const firstAddress=first.result.addresses[0];
        const secondPhone=second.result.telephones[0];
        const secondAddress=second.result.addresses[2];
        expect(firstPhone.number()).toBe("5/8/f4 f5 f6");
        expect(firstAddress.postcode()).toBe("8/10/c1 c2");
        expect(secondPhone.number()).toBe("2/5/f7 f8 f9");
        expect(secondAddress.postcode()).toBe("12/14/d5 d6");
        first.close();
        expect(secondPhone.number()).toBe("2/5/f7 f8 f9");
        expect(secondAddress.postcode()).toBe("12/14/d5 d6");
        second.close();
        expect((await cursor.next()).done).toBe(true);
    });
});

describe("nested fixed OCCURS as arrays of projected arrays",()=>{
    test("composes independently compiled outer and inner displacements without materialising data",()=>{
        const factory=createProjection(cobolParser,details(nestedCopybook),undefined,nestedProjection);
        const customer=factory.create(),record=physicalRecord(nestedBytes[0]);
        factory.bind(customer,record,record);
        expect(customer.orders.length).toBe(2);
        expect(customer.orders[0].items.length).toBe(3);
        expect(customer.orders[1].items.length).toBe(3);
        expect(customer.id()).toBe("0/2/c1 c2");
        expect(customer.orders[0].id()).toBe("2/4/d1 d2");
        expect(customer.orders[1].id()).toBe("14/16/d3 d4");
        expect(customer.orders[0].items[0].sku()).toBe("4/6/c1 c1");
        expect(customer.orders[0].items[2].quantity()).toBe("12/13/f3");
        expect(customer.orders[1].items[0].sku()).toBe("16/18/c4 c4");
        expect(customer.orders[1].items[1].sku()).toBe("19/21/c5 c5");
        expect(customer.orders[1].items[2].quantity()).toBe("24/25/f6");
        // The nested view also behaves as an array of arrays during iteration.
        expect(customer.orders.map(order=>order.items.map(item=>item.sku()))).toEqual([
            ["4/6/c1 c1", "7/9/c2 c2", "10/12/c3 c3"],
            ["16/18/c4 c4", "19/21/c5 c5", "22/24/c6 c6"]
        ]);
        expect(customer.orders[0].tail()).toBe("13/14/e1");
        expect(customer.orders[1].tail()).toBe("25/26/e2");
        expect(customer.status()).toBe("26/27/c9");
        expect(customer.orders[1].items[3]).toBeUndefined();
        expect(customer.orders[2]).toBeUndefined();
        factory.clear(customer);
    });

    test("retains separate high-water child slots and active length for each outer occurrence",()=>{
        const factory=createProjection(cobolParser,details(nestedCopybook),undefined,nestedProjection);
        const customer=factory.create(),state=createCobolRecordState();
        const record=physicalRecord(nestedBytes[0],state);
        factory.bind(customer,record,record);
        const orders=customer.orders;
        expect(orders.length).toBe(2);
        // Logical length is independent of the number of allocated projections.
        const rootRuntime=[...state.projectionViews.values()][0] as {name:string;elements:unknown[]};
        expect(rootRuntime.name).toBe("root.orders");
        expect(rootRuntime.elements.length).toBe(0);
        // Access only index 1 first: unused index 0 must not be materialised.
        const second=orders[1],secondItems=second.items;
        expect(rootRuntime.elements.length).toBe(2);
        expect(0 in rootRuntime.elements).toBe(false); // no eager creation of index 0
        const secondLast=secondItems[2];
        expect(secondLast.sku()).toBe("22/24/c6 c6");
        expect(orders.length).toBe(2);
        expect(secondItems.length).toBe(3);
        const first=orders[0],firstItems=first.items;
        expect(firstItems === secondItems).toBe(false);
        // Two distinct orders own two distinct inner array views and caches.
        expect(firstItems.length).toBe(3);
        expect(secondItems.length).toBe(3);
        const firstFirst=firstItems[0];
        expect(firstFirst.sku()).toBe("4/6/c1 c1");
        expect(firstItems.length).toBe(3);
        expect(secondItems.length).toBe(3);
        expect(firstItems[0]).toBe(firstFirst);
        expect(secondItems[2]).toBe(secondLast);
        // A mutation of the underlying bytes is visible through an existing
        // nested element projection: no second representation was materialised.
        const original=record.buffers[0][22];
        record.buffers[0][22]=0xFF;
        expect(secondLast.sku()).toBe("22/24/ff c6");
        record.buffers[0][22]=original;
        // The outer indexed cache and each separate inner cache retain their slots.
        expect(rootRuntime.elements.length).toBe(2);
        expect(rootRuntime.elements[0]).toBe(first);
        expect(rootRuntime.elements[1]).toBe(second);
        factory.clear(customer);
        expect(orders.length).toBe(0);
        expect(firstItems.length).toBe(0);
        expect(secondItems.length).toBe(0);
        const next=physicalRecord(nestedBytes[1],state,2);
        factory.bind(customer,next,next);
        expect(customer.orders).toBe(orders);
        expect(customer.orders[0]).toBe(first);
        expect(customer.orders[1]).toBe(second);
        expect(customer.orders[0].items).toBe(firstItems);
        expect(customer.orders[1].items).toBe(secondItems);
        expect(customer.orders[0].items[0]).toBe(firstFirst);
        expect(customer.orders[1].items[2]).toBe(secondLast);
        expect(firstFirst.sku()).toBe("4/6/c7 c7");
        expect(secondLast.sku()).toBe("22/24/d3 d3");
        expect(firstItems.length).toBe(3);
        expect(secondItems.length).toBe(3);
        factory.clear(customer);
    });

    test("retains independent nested projections for two live file-cursor leases",async()=>{
        const cursor=cursorFor(nestedCopybook,nestedProjection,nestedBytes);
        const a=await cursor.next(),b=await cursor.next();
        if(a.done===true||b.done===true||Array.isArray(a.value)||Array.isArray(b.value)) throw new Error("Expected two record leases");
        const first=a.value,second=b.value;
        const old=first.result.orders[0].items[1],fresh=second.result.orders[1].items[2];
        expect(old.sku()).toBe("7/9/c2 c2");
        expect(fresh.sku()).toBe("22/24/d3 d3");
        first.close();
        expect(second.result.orders[0].items[0].sku()).toBe("4/6/c7 c7");
        expect(fresh.quantity()).toBe("24/25/f3");
        second.close();
        expect((await cursor.next()).done).toBe(true);
    });
});
