import type {ProjectedArray} from "@cobol-ts/arrays";
import type {ProjectionPhysicalRecord} from "@cobol-ts/cursor-loader-types";
import {createFileCursor} from "@cobol-ts/cursor-file";
import {createProjection,defineProjection} from "@cobol-ts/cursor-projection";
import {valueOrThrow} from "@cobol-ts/errors";
import {cobolParser, createCobolFixedDetails,createCobolRecordState,cleanCobolRecordState} from "./cobol.parser";
import {customerFixedOccurs} from "./customer.fixtures";

interface PhoneParts {
    kind():string;
    number():string;
}
interface Phone {
    raw():string;
    readonly parts:PhoneParts;
}
interface Customer {
    id():number;
    readonly telephones:ProjectedArray<Phone>;
    status():string;
}
const definition=defineProjection<Customer>({
    id:{type:"integer",path:["CUSTOMER","CUSTOMER-ID"]},
    telephones:{type:"array",path:["CUSTOMER","TELEPHONES"],element:{
        raw:{type:"string",path:["PHONE-RAW"]},
        parts:{type:"object",path:["PHONE-PARTS"],fields:{
            kind:{type:"character",path:["PHONE-KIND"]},
            number:{type:"string",path:["PHONE-NUMBER"]}
        }}
    }},
    status:{type:"character",path:["CUSTOMER","STATUS"]}
});
const details=valueOrThrow(createCobolFixedDetails(customerFixedOccurs.layout));
const record=(n:number,state=createCobolRecordState()):ProjectionPhysicalRecord=>({
    buffers:[customerFixedOccurs.records[n].bytes],
    startByte:0,endByte:17,lastValidByte:17,
    source:"phones.fb",recordNumber:n+1,recordState:state
});

describe("COBOL fixed OCCURS projected array",()=>{
    test("uses compiled byte offsets for a single fixed array without copying bytes",()=>{
        const factory=createProjection(cobolParser,details,undefined,definition);
        const customer=factory.create();
        const bytes=record(0);
        factory.bind(customer,bytes,bytes);
        expect(customer.telephones.length).toBe(2);
        const first=customer.telephones[0];
        const second=customer.telephones[1];
        expect(first.raw()).toBe("4/10/c8 f1 f2 f3 f4 f5");
        expect(second.raw()).toBe("10/16/d4 f6 f7 f8 f9 f0");
        expect(first.raw()).toBe("4/10/c8 f1 f2 f3 f4 f5");
        expect(customer.telephones[0]).toBe(first);
        expect(customer.telephones[2]).toBeUndefined();
        expect(customer.telephones.map(p=>p.raw())).toEqual([
            "4/10/c8 f1 f2 f3 f4 f5","10/16/d4 f6 f7 f8 f9 f0"
        ]);
        expect(customer.status()).toBe("16/17/c1");
        // The projection borrows the original byte buffer: no element payloads
        // have been copied or decoded into an alternative representation.
        const original=bytes.buffers[0][4];
        bytes.buffers[0][4]=0xC9;
        expect(first.raw()).toBe("4/10/c9 f1 f2 f3 f4 f5");
        bytes.buffers[0][4]=original;
        factory.clear(customer);
    });

    test("selects a REDEFINES group inside a fixed occurrence without extra data",()=>{
        const factory=createProjection(cobolParser,details,undefined,definition);
        const customer=factory.create(),bytes=record(0);
        factory.bind(customer,bytes,bytes);
        expect(customer.telephones[0].parts.kind()).toBe("4/5/c8");
        expect(customer.telephones[1].parts.number()).toBe("11/16/f6 f7 f8 f9 f0");
        expect(customer.telephones[0].parts.number()).toBe("5/10/f1 f2 f3 f4 f5");
        factory.clear(customer);
    });

    test("retains projections on the pooled physical state and clears bindings on reuse",()=>{
        const factory=createProjection(cobolParser,details,undefined,definition);
        const customer=factory.create();
        const state=createCobolRecordState();
        const first=record(0,state);
        factory.bind(customer,first,first);
        const phones=customer.telephones;
        const a=phones[0],b=phones[1];
        expect(a.raw()).toBe("4/10/c8 f1 f2 f3 f4 f5");
        factory.clear(customer);
        expect(phones.length).toBe(0);
        const next=record(1,state);
        factory.bind(customer,next,next);
        expect(customer.telephones).toBe(phones);
        expect(customer.telephones[0]).toBe(a);
        expect(customer.telephones[1]).toBe(b);
        expect(a.raw()).toBe("4/10/e6 f5 f4 f3 f2 f1");
        expect(b.raw()).toBe("10/16/c2 f1 f1 f2 f2 f3");
        factory.clear(customer);
    });

    test("holds two independent record leases through the real byte cursor",async()=>{
        const bytes=Uint8Array.from([...customerFixedOccurs.records[0].bytes,...customerFixedOccurs.records[1].bytes]);
        const source={bytes,offset:0};
        let cleanCalls=0;
        const cursor=createFileCursor(
            {filename:"phones.fb",fileType:"cobol" as const,projection:definition},source,
            {parsers:{cobol:{parser:cobolParser,parserConfig:()=>details,
                createRecordState:createCobolRecordState,
                cleanRecordState:state=>{cleanCalls++;cleanCobolRecordState(state);}}},
            bufferSize:7,
            fillFileBuffer:async(s:typeof source,dst:Uint8Array)=>{
                const n=Math.min(dst.length,s.bytes.length-s.offset);
                dst.set(s.bytes.subarray(s.offset,s.offset+n));s.offset+=n;return n;
            }});
        const a=await cursor.next(),b=await cursor.next();
        if(a.done===true||b.done===true||Array.isArray(a.value)||Array.isArray(b.value)) throw new Error("Expected two records");
        const first=a.value,second=b.value;
        expect(first.result.telephones[1].raw()).toBe("10/16/d4 f6 f7 f8 f9 f0");
        expect(second.result.telephones[1].raw()).toBe("10/16/c2 f1 f1 f2 f2 f3");
        first.close();
        expect(cleanCalls).toBe(1);
        expect(second.result.telephones[0].raw()).toBe("4/10/e6 f5 f4 f3 f2 f1");
        second.close();
        expect(cleanCalls).toBe(2);
        expect((await cursor.next()).done).toBe(true);
    });
});
