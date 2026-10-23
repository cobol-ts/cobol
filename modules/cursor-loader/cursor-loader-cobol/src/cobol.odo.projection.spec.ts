import type {ProjectedArray} from "@cobol-ts/arrays";
import type {ProjectionPhysicalRecord} from "@cobol-ts/cursor-loader-types";
import {createProjection, defineProjection} from "@cobol-ts/cursor-projection";
import {valueOrThrow} from "@cobol-ts/errors";
import {parseCopybook} from "@cobol-ts/copybook";
import {compileCobolLayout} from "@cobol-ts/layout";
import {cobolParser, createCobolProjectionDetails, createCobolRecordState} from "./cobol.parser";
import {customerOdoRedefines, customerHexBytes} from "./customer.fixtures";

interface Parts { sku(): string; quantity(): string }
interface Purchase { raw(): string; readonly parts: Parts }
interface Customer {
    id(): number;
    readonly purchases: ProjectedArray<Purchase>;
    status(): string;
}
const definition = defineProjection<Customer>({
    id: {type:"integer",path:["CUSTOMER","CUSTOMER-ID"]},
    purchases:{type:"array",path:["CUSTOMER","PURCHASES"],element:{
        raw:{type:"string",path:["PURCHASE-RAW"]},
        parts:{type:"object",path:["PURCHASE-PARTS"],fields:{
            sku:{type:"string",path:["SKU"]},
            quantity:{type:"string",path:["QUANTITY"]}
        }}
    }},
    status:{type:"character",path:["CUSTOMER","STATUS"]}
});

// Framing is deliberately supplied by the completed borrowed record: the
// fixed-capacity versus active-length framing decision is a separate milestone.
const details = valueOrThrow(createCobolProjectionDetails(customerOdoRedefines.layout));
const one = customerHexBytes(
    "F1 F1 F0 F0 F1 C1 D3 C9 C3 C5 40 40 40 C1 C2 F2 C1"
); // count=1, one purchase [13,16), STATUS [16,17)
const source = [customerOdoRedefines.records[0].bytes,one,customerOdoRedefines.records[1].bytes];
const record = (index:number, state=createCobolRecordState()):ProjectionPhysicalRecord => ({
    buffers:[source[index]],startByte:0,endByte:source[index].length,
    lastValidByte:source[index].length,source:"odo-active.fb",recordNumber:index+1,recordState:state
});
const bind = (index:number,state=createCobolRecordState()) => {
    const factory=createProjection(cobolParser,details,undefined,definition);
    const customer=factory.create();
    const physical=record(index,state);
    factory.bind(customer,physical,physical);
    return {customer, physical, factory};
};

describe("single-depth ODO byte-backed projections",()=>{
    test.each([
        [0,0,"13/14/c1"],
        [1,1,"16/17/c1"],
        [2,3,"22/23/c9"]
    ] as const)("resolves active count and right-anchored suffix for row %i",(row,count,status)=>{
        const {customer,factory}=bind(row);
        expect(customer.id()).toBe(65541); // record-relative [1,5) debug integer
        expect(customer.status()).toBe(status);
        expect(customer.purchases.length).toBe(count);
        expect(customer.purchases[count]).toBeUndefined();
        factory.clear(customer);
    });

    test("selects occurrences lazily and preserves REDEFINES relative positions",()=>{
        const {customer,physical,factory}=bind(2);
        const purchases=customer.purchases;
        const state=physical.recordState as ReturnType<typeof createCobolRecordState>;
        const cache=[...state.projectionViews.values()][0] as {elements:unknown[]};
        expect(purchases.length).toBe(3);
        expect(cache.elements.length).toBe(0);
        const third=purchases[2];
        expect(third.raw()).toBe("19/22/c5 c6 f3");
        expect(third.parts.sku()).toBe("19/21/c5 c6");
        expect(third.parts.quantity()).toBe("21/22/f3");
        expect(purchases[0].raw()).toBe("13/16/c1 c2 f1");
        expect(purchases[1].parts.sku()).toBe("16/18/c3 c4");
        expect(purchases[2]).toBe(third);
        factory.clear(customer);
    });

    test("can read the right-anchored suffix without decoding an invalid controller",()=>{
        const bad=Uint8Array.from(source[2]);bad[0]=0xff;
        const factory=createProjection(cobolParser,details,undefined,definition);
        const customer=factory.create();
        const physical:ProjectionPhysicalRecord={...record(2),buffers:[bad]};
        factory.bind(customer,physical,physical);
        expect(customer.status()).toBe("22/23/c9");
        expect(customer.id()).toBe(65541);
        expect(()=>customer.purchases.length).toThrow(/count|digit|DISPLAY|controller/i);
        expect(()=>customer.purchases.length).toThrow(/odo-active.fb: record 3: projection CUSTOMER.PURCHASES/);
        factory.clear(customer);
    });

    test("rebinds length and occurrence locations without retaining stale values",()=>{
        const state=createCobolRecordState();
        const factory=createProjection(cobolParser,details,undefined,definition);
        const customer=factory.create();
        let physical=record(2,state);
        factory.bind(customer,physical,physical);
        const purchases=customer.purchases;
        const element=purchases[0];
        expect(element.raw()).toBe("13/16/c1 c2 f1");
        factory.clear(customer);
        expect(purchases.length).toBe(0);
        physical=record(0,state);factory.bind(customer,physical,physical);
        expect(customer.purchases).toBe(purchases);
        expect(purchases.length).toBe(0);
        expect(purchases[0]).toBeUndefined();
        expect(customer.status()).toBe("13/14/c1");
        factory.clear(customer);
        physical=record(1,state);factory.bind(customer,physical,physical);
        expect(customer.purchases).toBe(purchases);
        expect(purchases.length).toBe(1);
        expect(purchases[0]).toBe(element);
        expect(element.raw()).toBe("13/16/c1 c2 f2");
        expect(customer.status()).toBe("16/17/c1");
        factory.clear(customer);
    });

    test("two simultaneously leased rows retain independent active lengths",()=>{
        const a=bind(0),b=bind(2);
        expect(a.customer.purchases.length).toBe(0);
        expect(b.customer.purchases.length).toBe(3);
        expect(b.customer.purchases[2].raw()).toBe("19/22/c5 c6 f3");
        a.factory.clear(a.customer);
        expect(b.customer.status()).toBe("22/23/c9");
        b.factory.clear(b.customer);
    });
});


describe("single-depth ODO anchoring choices",()=>{
    test("uses left expressions when neither offset is constant, and right for a suffix",()=>{
        const text=[
            "01 ROW.",
            "   05 A-COUNT PIC 9.",
            "   05 B-COUNT PIC 9.",
            "   05 A OCCURS 0 TO 2 TIMES DEPENDING ON A-COUNT.",
            "      10 A-BYTE PIC X.",
            "   05 MIDDLE PIC X.",
            "   05 B OCCURS 0 TO 2 TIMES DEPENDING ON B-COUNT.",
            "      10 B-BYTE PIC X.",
            "   05 SUFFIX PIC X."
        ].join("\n");
        const layout=valueOrThrow(compileCobolLayout(valueOrThrow(parseCopybook(text)),"two-odo.cpy"));
        const details=valueOrThrow(createCobolProjectionDetails(layout));
        const schema=defineProjection<{
            middle():string;suffix():string;readonly a:ProjectedArray<{byte():string}>;
            readonly b:ProjectedArray<{byte():string}>;
        }>({
            middle:{type:"character",path:["ROW","MIDDLE"]},
            suffix:{type:"character",path:["ROW","SUFFIX"]},
            a:{type:"array",path:["ROW","A"],element:{byte:{type:"character",path:["A-BYTE"]}}},
            b:{type:"array",path:["ROW","B"],element:{byte:{type:"character",path:["B-BYTE"]}}}
        });
        // A=2, B=1: 2 count bytes, A [2,4), MIDDLE [4,5),
        // B [5,6), SUFFIX [6,7). All byte values specified independently.
        const bytes=customerHexBytes("F2 F1 C1 C2 D4 C3 E5");
        const physical:ProjectionPhysicalRecord={buffers:[bytes],startByte:0,endByte:7,
            lastValidByte:7,source:"two-odo.fb",recordNumber:1,recordState:createCobolRecordState()};
        const factory=createProjection(cobolParser,details,undefined,schema),row=factory.create();
        factory.bind(row,physical,physical);
        expect(row.middle()).toBe("4/5/d4");
        expect(row.suffix()).toBe("6/7/e5");
        expect(row.a.length).toBe(2);
        expect(row.a[1].byte()).toBe("3/4/c2");
        expect(row.b.length).toBe(1);
        expect(row.b[0].byte()).toBe("5/6/c3");
        factory.clear(row);
    });

    test("checks active count on a literal occurrence selector",()=>{
        const selected=defineProjection<{last():string}>({
            last:{type:"string",path:["CUSTOMER","PURCHASES",2,"PURCHASE-RAW"]}
        });
        const factory=createProjection(cobolParser,details,undefined,selected);
        const projection=factory.create(),physical=record(2);
        factory.bind(projection,physical,physical);
        expect(projection.last()).toBe("19/22/c5 c6 f3");
        factory.clear(projection);
        const empty=record(0);
        factory.bind(projection,empty,empty);
        expect(()=>projection.last()).toThrow(/index 2 outside 0\.\.-1/);
        factory.clear(projection);
    });

    test("rejects a controller outside its declared maximum without preventing suffix access",()=>{
        const wrong=Uint8Array.from(source[2]);wrong[0]=0xf4; // 4 > max 3
        const factory=createProjection(cobolParser,details,undefined,definition);
        const customer=factory.create(),physical:ProjectionPhysicalRecord={...record(2),buffers:[wrong]};
        factory.bind(customer,physical,physical);
        expect(customer.status()).toBe("22/23/c9");
        expect(()=>customer.purchases.length).toThrow(/bounds 0\.\.3/);
        factory.clear(customer);
    });
});

describe("single-depth ODO nested in an ordinary group (not nested OCCURS)",()=>{
    test("uses the enclosing group's right boundary without reading its controller",()=>{
        const source=[
            "01 ROW.",
            "  05 PREFIX PIC X.",
            "  05 CONTAINER.",
            "     10 ITEM-COUNT PIC 9.",
            "     10 ITEMS OCCURS 0 TO 2 TIMES DEPENDING ON ITEM-COUNT.",
            "        15 CODE PIC X(2).",
            "     10 GROUP-SUFFIX PIC X.",
            "  05 TRAILER PIC X."
        ].join("\n");
        const layout=valueOrThrow(compileCobolLayout(valueOrThrow(parseCopybook(source)),"group-odo.cpy"));
        const details=valueOrThrow(createCobolProjectionDetails(layout));
        const projection=defineProjection<{
            readonly container:{readonly items:ProjectedArray<{code():string}>;suffix():string};
            trailer():string;
        }>({
            container:{type:"object",path:["ROW","CONTAINER"],fields:{
                items:{type:"array",path:["ITEMS"],element:{code:{type:"string",path:["CODE"]}}},
                suffix:{type:"character",path:["GROUP-SUFFIX"]}
            }},
            trailer:{type:"character",path:["ROW","TRAILER"]}
        });
        const original=customerHexBytes("E1 F2 C1 C2 C3 C4 D1 E5");
        const factory=createProjection(cobolParser,details,undefined,projection),row=factory.create();
        const physical:ProjectionPhysicalRecord={buffers:[original],startByte:0,endByte:8,
            lastValidByte:8,source:"group-odo.fb",recordNumber:1,recordState:createCobolRecordState()};
        factory.bind(row,physical,physical);
        expect(row.container.items.length).toBe(2);
        expect(row.container.items[1].code()).toBe("4/6/c3 c4");
        expect(row.container.suffix()).toBe("6/7/d1");
        expect(row.trailer()).toBe("7/8/e5");
        factory.clear(row);

        const invalid=Uint8Array.from(original);invalid[1]=0xff;
        const current:ProjectionPhysicalRecord={...physical,buffers:[invalid],recordState:createCobolRecordState()};
        factory.bind(row,current,current);
        expect(row.container.suffix()).toBe("6/7/d1");
        expect(row.trailer()).toBe("7/8/e5");
        expect(()=>row.container.items.length).toThrow(/DISPLAY ODO controller/);
        factory.clear(row);
    });

    test("reads a controller across borrowed buffers with a nonzero record start",()=>{
        const bytes=customerOdoRedefines.records[1].bytes;
        const prefix=customerHexBytes("00 00 00");
        const first=Uint8Array.from([...prefix,...bytes.subarray(0,3)]);
        const physical:ProjectionPhysicalRecord={
            buffers:[first,bytes.subarray(3,11),bytes.subarray(11)],
            startByte:3,endByte:3+bytes.length,lastValidByte:3+bytes.length,
            source:"split-buffers.fb",recordNumber:1,recordState:createCobolRecordState()
        };
        const factory=createProjection(cobolParser,detailsForCustomerOdo(),undefined,definition),row=factory.create();
        factory.bind(row,physical,physical);
        expect(row.purchases.length).toBe(3);
        expect(row.purchases[2].raw()).toBe("19/22/c5 c6 f3");
        expect(row.status()).toBe("22/23/c9");
        factory.clear(row);
    });

    test("accepts a runtime occurrence argument without expanding the table",()=>{
        const projection=defineProjection<{raw(index:number):string}>({
            raw:{type:"string",path:["CUSTOMER","PURCHASES","PURCHASE-RAW"]}
        });
        const factory=createProjection(cobolParser,detailsForCustomerOdo(),undefined,projection),row=factory.create();
        const current=record(2);factory.bind(row,current,current);
        expect(row.raw(2)).toBe("19/22/c5 c6 f3");
        expect(row.raw(0)).toBe("13/16/c1 c2 f1");
        expect(()=>row.raw(3)).toThrow(/index 3 outside 0\.\.2/);
        factory.clear(row);
    });
});

function detailsForCustomerOdo() {return valueOrThrow(createCobolProjectionDetails(customerOdoRedefines.layout));}
