import type {ProjectedArray} from "@cobol-ts/arrays";
import type {ProjectionPhysicalRecord} from "@cobol-ts/cursor-loader-types";
import {createProjection,defineProjection} from "@cobol-ts/cursor-projection";
import {parseCopybook} from "@cobol-ts/copybook";
import {compileCobolLayout} from "@cobol-ts/layout";
import {valueOrThrow} from "@cobol-ts/errors";
import {cobolParser,createCobolProjectionDetails,createCobolRecordState,cleanCobolRecordState} from "./cobol.parser";

const copybook=[
    "01 ROW.",
    "  05 O-COUNT PIC 9.",
    "  05 M-COUNT PIC 9.",
    "  05 I-COUNT PIC 9.",
    "  05 OUTERS OCCURS 0 TO 3 TIMES DEPENDING ON O-COUNT.",
    "    10 O-HEAD PIC X.",
    "    10 MIDDLES OCCURS 0 TO 3 TIMES DEPENDING ON M-COUNT.",
    "      15 M-HEAD PIC X.",
    "      15 INNERS OCCURS 0 TO 3 TIMES DEPENDING ON I-COUNT.",
    "        20 CODE PIC X(2).",
    "      15 M-TAIL PIC X.",
    "    10 O-TAIL PIC X.",
    "  05 FINAL PIC X."
].join("\n");
interface Inner { code():string }
interface Middle { readonly inners:ProjectedArray<Inner>; head():string;tail():string }
interface Outer { readonly middles:ProjectedArray<Middle>;head():string;tail():string }
interface Row { readonly outers:ProjectedArray<Outer>;final():string }
const details=valueOrThrow(createCobolProjectionDetails(valueOrThrow(
    compileCobolLayout(valueOrThrow(parseCopybook(copybook)),"three-level-odo.cpy"))));
const projection=defineProjection<Row>({
    outers:{type:"array",path:["ROW","OUTERS"],element:{
        head:{type:"string",path:["O-HEAD"]},
        middles:{type:"array",path:["MIDDLES"],element:{
            head:{type:"string",path:["M-HEAD"]},
            inners:{type:"array",path:["INNERS"],element:{code:{type:"string",path:["CODE"]}}},
            tail:{type:"string",path:["M-TAIL"]}
        }},tail:{type:"string",path:["O-TAIL"]}
    }},final:{type:"string",path:["ROW","FINAL"]}
});
/** Literal byte fixture: counts 2/2/2; 3-byte header + 2 x 14-byte outer body + final. */
const bytes=Uint8Array.from([
    0xf2,0xf2,0xf2,
    0xc1,0xc2,0xc3,0xc4,0xc5,0xc6,0xc7,0xc8,0xc9,0xca,0xcb,0xcc,0xcd,0xce,
    0xd1,0xd2,0xd3,0xd4,0xd5,0xd6,0xd7,0xd8,0xd9,0xda,0xdb,0xdc,0xdd,0xde,
    0xe9
]);
const record=(content=bytes,state=createCobolRecordState(),number=41):ProjectionPhysicalRecord=>({
    buffers:[content],startByte:0,endByte:content.length,lastValidByte:content.length,
    source:"three-level-odo.fb",recordNumber:number,recordState:state
});

describe("three levels of ODO projected arrays",()=>{
    test("finds third-level selections out of order without making preceding views",()=>{
        const factory=createProjection(cobolParser,details,undefined,projection);
        const row=factory.create(),physical=record();factory.bind(row,physical,physical);
        try {
            expect(row.outers.length).toBe(2);
            const second=row.outers[1];
            expect(second.head()).toBe("17/18/d1");
            const secondMiddle=second.middles[1];
            expect(secondMiddle.head()).toBe("24/25/d8");
            expect(secondMiddle.inners[1].code()).toBe("27/29/db dc");
            expect(secondMiddle.tail()).toBe("29/30/dd");
            expect(second.tail()).toBe("30/31/de");
            expect(row.final()).toBe("31/32/e9");
            expect(secondMiddle.inners[0].code()).toBe("25/27/d9 da");
            expect(row.outers[1]).toBe(second);
            expect(second.middles[1]).toBe(secondMiddle);
        } finally {factory.clear(row);}
    });

    test("locates a third-level scalar that straddles physical byte buffers",()=>{
        const factory=createProjection(cobolParser,details,undefined,projection),row=factory.create();
        const physical:ProjectionPhysicalRecord={...record(),
            buffers:[bytes.subarray(0,6),bytes.subarray(6,28),bytes.subarray(28)]};
        factory.bind(row,physical,physical);
        try {
            expect(row.outers[1].middles[1].inners[1].code()).toBe("27/29/db dc");
        }finally {factory.clear(row);}
    });

    test("changes all three counts after cleaning and rebinding the same record state",()=>{
        const state=createCobolRecordState(),factory=createProjection(cobolParser,details,undefined,projection);
        const row=factory.create(),first=record(bytes,state);factory.bind(row,first,first);
        const original=row.outers[0].middles[0].inners[1];
        expect(original.code()).toBe("7/9/c5 c6");
        factory.clear(row);cleanCobolRecordState(state);
        // Counts 1/1/0: one outer (head + middle head/tail + outer tail), then final.
        const shorter=Uint8Array.of(0xf1,0xf1,0xf0,0xc1,0xc2,0xc3,0xc4,0xe9);
        const next=record(shorter,state,42);
        factory.bind(row,next,next);
        try {
            expect(row.outers.length).toBe(1);
            expect(row.outers[0].middles.length).toBe(1);
            expect(row.outers[0].middles[0].inners.length).toBe(0);
            expect(row.outers[0].middles[0].inners[0]).toBeUndefined();
            expect(row.outers[0].middles[0].tail()).toBe("5/6/c3");
            expect(row.outers[0].tail()).toBe("6/7/c4");
            expect(row.final()).toBe("7/8/e9");
        }finally {factory.clear(row);}
    });

    test("an invalid inner count reports source, record number, projection path and bytes",()=>{
        const wrong=Uint8Array.from(bytes);wrong[2]=0xff;
        const factory=createProjection(cobolParser,details,undefined,projection);
        const row=factory.create(),p=record(wrong,createCobolRecordState(),93);
        factory.bind(row,p,p);
        try {
            expect(row.final()).toBe("31/32/e9"); // right anchored; no count decoding
            let message="";
            try {row.outers[1];}catch(e){message=e instanceof Error?e.message:String(e);}
            expect(message).toMatch(/three-level-odo\.fb: record 93:/);
            expect(message).toMatch(/projection ROW\.OUTERS/);
            expect(message).toMatch(/Invalid unsigned DISPLAY ODO controller digit/);
            expect(message).toMatch(/f2 f2 ff/);
        }finally {factory.clear(row);}
    });
});

describe("nested ODO allocation and diagnostic regression",()=>{
    test("reuses the array provider, selected child and occurrence index array across leases",()=>{
        const outerPath=cobolParser.compileProjectionPath(details,undefined,["ROW","OUTERS"]);
        const state=createCobolRecordState(),first=record(bytes,state,101);
        const provider=cobolParser.array!(first,details,outerPath);
        const selection=provider.element(1);
        if(!("originBits" in selection)) throw new Error("Expected symbolic view");
        const indices=selection.enclosingIndices;
        expect(selection.originBits).toBe(17*8);
        cleanCobolRecordState(state);
        const second=record(bytes,state,102);
        const rebound=cobolParser.array!(second,details,outerPath,provider);
        expect(rebound).toBe(provider);
        const same=rebound.element(1,selection);
        expect(same).toBe(selection);
        if(!("originBits" in same)) throw new Error("Expected symbolic view");
        expect(same.enclosingIndices).toBe(indices);
        expect(same.enclosingIndices).toEqual([1]);
        expect(same.originBits).toBe(17*8);
    });

    test("reports the fully indexed access path and controller on nested count errors",()=>{
        const changed=Uint8Array.from(bytes);
        const factory=createProjection(cobolParser,details,undefined,projection);
        const row=factory.create(),p=record(changed,createCobolRecordState(),113);
        factory.bind(row,p,p);
        try {
            const inner=row.outers[1].middles[1].inners;
            // After geometry was selected, invalidate the count field solely to
            // exercise deferred length diagnostics. Production bytes stay stable.
            changed[2]=0xff;
            let message="";
            try {void inner.length;}catch(e){message=e instanceof Error?e.message:String(e);}
            expect(message).toMatch(/three-level-odo\.fb: record 113/);
            expect(message).toMatch(/outers\[1\]\.middles\[1\]\.inners/);
            expect(message).toMatch(/ROW\.I-COUNT/);
            expect(message).toMatch(/f2 f2 ff/);
        } finally {factory.clear(row);}
    });

    test("fully qualified scalar diagnostic retains all three occurrence indexes",()=>{
        const factory=createProjection(cobolParser,details,undefined,projection);
        const row=factory.create(),p=record(bytes,createCobolRecordState(),114);
        factory.bind(row,p,p);
        try {
            const inner=row.outers[1].middles[1].inners[1];
            (p as {readonly endByte:number} as {endByte:number}).endByte=28; // Test-only truncated frame after selection.
            let message="";
            try {inner.code();}catch(e){message=e instanceof Error?e.message:String(e);}
            expect(message).toMatch(/three-level-odo\.fb: record 114/);
            expect(message).toMatch(/outers\[1\]\.middles\[1\]\.inners\[1\]\.code/);
            expect(message).toMatch(/extends beyond the completed record/);
            expect(message).toMatch(/f2 f2 f2/);
        }finally {factory.clear(row);}
    });
});
