import {createFileCursor} from "@cobol-ts/cursor-file";
import {type ProjectedArray} from "@cobol-ts/arrays";
import {createProjection,defineProjection} from "@cobol-ts/cursor-projection";
import {type ProjectionPhysicalRecord} from "@cobol-ts/cursor-loader-types";
import {createJsonRecordState,jsonParser} from "./cursor.loader.json.parser";

interface Item { sku():string; quantity():number }
interface Order { orderId():number; readonly items:ProjectedArray<Item> }
interface Customer {
    name():string;
    readonly orders:ProjectedArray<Order>;
    readonly address:Address;
}
interface Address { town():string }
const definition=defineProjection<Customer>({
    name:{type:"string"},
    address:{type:"object",fields:{town:{type:"string"}}},
    orders:{type:"array",element:{
        orderId:{type:"integer"},
        items:{type:"array",element:{
            sku:{type:"string"},quantity:{type:"integer"}
        }}
    }}
});
const row=(orders:unknown[]) => ({name:"Alice",address:{town:"London"},orders});
const orders=(letter:string,n:number) => Array.from({length:n},(_,i)=>({
    orderId:1000+i,items:[{sku:`${letter}${i}A`,quantity:1},{sku:`${letter}${i}B`,quantity:2}]
}));
const fakeRecord=(number:number,state=createJsonRecordState()):ProjectionPhysicalRecord=>({
    recordState:state, buffers:[new Uint8Array(0)],startByte:0,endByte:0,lastValidByte:0,
    source:"customers.jsonl",recordNumber:number
});

describe("nested JSONL projected arrays",()=>{
    test("navigates nested projected objects and lazy array elements",()=>{
        const factory=createProjection(jsonParser,undefined,undefined,definition);
        const projection=factory.create();
        factory.bind(projection,row(orders("A",2)),fakeRecord(1));
        expect(projection.name()).toBe("Alice");
        expect(projection.address.town()).toBe("London");
        expect(projection.orders.length).toBe(2);
        expect(projection.orders[0].orderId()).toBe(1000);
        expect(projection.orders[0].items.length).toBe(2);
        expect(projection.orders[0].items[1].sku()).toBe("A0B");
        expect([...projection.orders].map(o=>o.orderId())).toEqual([1000,1001]);
        expect(projection.orders[5]).toBeUndefined();
        expect(projection.orders[0]).toBe(projection.orders[0]);
        factory.clear(projection);
    });
    test("keeps separate live records and their nested views independent",()=>{
        const factory=createProjection(jsonParser,undefined,undefined,definition);
        const a=factory.create(),b=factory.create();
        factory.bind(a,row(orders("A",2)),fakeRecord(1));
        factory.bind(b,row(orders("B",2)),fakeRecord(2));
        const first=a.orders[0],second=a.orders[1],other=b.orders[0];
        expect(first.items[1].sku()).toBe("A0B");
        expect(second.items[1].sku()).toBe("A1B");
        expect(other.items[1].sku()).toBe("B0B");
        factory.clear(a);
        expect(other.items[1].sku()).toBe("B0B");
        factory.clear(b);
    });
    test("uses high-water slots but exposes only active length on a reused holder",()=>{
        const factory=createProjection(jsonParser,undefined,undefined,definition);
        const state=createJsonRecordState();
        const record=fakeRecord(1,state);
        const projection=factory.create();
        factory.bind(projection,row(orders("A",2)),record);
        const array=projection.orders;
        const a0=array[0];
        expect(array[1].orderId()).toBe(1001);
        factory.clear(projection);
        factory.bind(projection,row(orders("B",5)),record);
        expect(projection.orders).toBe(array);
        expect(array.length).toBe(5);
        const a4=array[4];
        expect(a4.items[1].sku()).toBe("B4B");
        factory.clear(projection);
        factory.bind(projection,row(orders("C",1)),record);
        expect(projection.orders.length).toBe(1);
        expect(array[1]).toBeUndefined();
        expect(array[4]).toBeUndefined();
        expect(array[0]).toBe(a0);
        expect(array[0].items[1].sku()).toBe("C0B");
        expect([...array].map(o=>o.orderId())).toEqual([1000]);
        factory.clear(projection);
        expect(array.length).toBe(0);
    });
    test("empty arrays and readonly collection methods",()=>{
        const factory=createProjection(jsonParser,undefined,undefined,definition);
        const projection=factory.create();
        factory.bind(projection,row([]),fakeRecord(3));
        expect(projection.orders.length).toBe(0);
        expect(projection.orders[0]).toBeUndefined();
        expect([...projection.orders]).toEqual([]);
        expect(projection.orders.map(order=>order.orderId())).toEqual([]);
        factory.clear(projection);
    });
    test("retained record-state array entries carry diagnostic site names",()=>{
        const factory=createProjection(jsonParser,undefined,undefined,definition);
        const state=createJsonRecordState();
        const projection=factory.create();
        factory.bind(projection,row(orders("A",1)),fakeRecord(1,state));
        expect(projection.orders[0].items[0].sku()).toBe("A0A");
        const roots=[...state.projectionViews.values()] as {name:string}[];
        expect(roots.map(r=>r.name)).toEqual(["root.orders"]);
        factory.clear(projection);
    });
    test("missing array is reported with source and logical path",()=>{
        const factory=createProjection(jsonParser,undefined,undefined,definition);
        const projection=factory.create();
        factory.bind(projection,{name:"Alice",address:{town:"London"}},fakeRecord(7));
        expect(()=>projection.orders.length).toThrow(/customers\.jsonl: record 7: projection orders/);
        factory.clear(projection);
    });
    test("uses real JSONL file cursor and retains simultaneous record leases",async()=>{
        const records=[row(orders("A",2)),row(orders("B",3))];
        const bytes=new TextEncoder().encode(records.map(r=>JSON.stringify(r)).join("\n")+"\n");
        const file={bytes,offset:0};
        const cursor=createFileCursor(
            {filename:"customers.jsonl",fileType:"json" as const,projection:definition},file,
            {parsers:{json:{parser:jsonParser,parserConfig:()=>undefined,createRecordState:createJsonRecordState}},
             bufferSize:7,
             fillFileBuffer:async (source:typeof file,target:Uint8Array)=>{
                const n=Math.min(target.length,source.bytes.length-source.offset);
                target.set(source.bytes.subarray(source.offset,source.offset+n));source.offset+=n;
                return n;
             }}
        );
        const a=await cursor.next(),b=await cursor.next();
        if (a.done===true||b.done===true||Array.isArray(a.value)||Array.isArray(b.value))
            throw new Error("Expected two JSONL rows");
        const first=a.value,second=b.value;
        try {
            expect(first.result.orders[1].items[1].sku()).toBe("A1B");
            expect(second.result.orders[2].items[1].sku()).toBe("B2B");
            first.close();
            expect(second.result.orders[0].items[0].sku()).toBe("B0A");
            second.close();
            expect((await cursor.next()).done).toBe(true);
        } finally {
            // Per-lease close is owned by the test; no stale borrowed views are retained.
        }
    });

});
