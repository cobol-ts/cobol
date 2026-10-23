/**
 * Regression tests for variable-sized outer occurrences containing multiple ODO tables.
 * Literal byte-coordinate oracles are independent of compiled geometry.
 */
import type {ProjectedArray} from "@cobol-ts/arrays";
import type {ProjectionPhysicalRecord} from "@cobol-ts/cursor-loader-types";
import {createProjection,defineProjection} from "@cobol-ts/cursor-projection";
import {parseCopybook} from "@cobol-ts/copybook";
import {compileCobolLayout} from "@cobol-ts/layout";
import {valueOrThrow} from "@cobol-ts/errors";
import {cobolParser,createCobolProjectionDetails,createCobolRecordState} from "./cobol.parser";
import {customerHexBytes} from "./customer.fixtures";

const copybook=[
    "01 ROW.",
    "  05 OUTER-COUNT PIC 9.",
    "  05 A-COUNT PIC 9.",
    "  05 B-COUNT PIC 9.",
    "  05 OUTERS OCCURS 0 TO 3 TIMES DEPENDING ON OUTER-COUNT.",
    "    10 HEADER PIC X.",
    "    10 A-ITEMS OCCURS 0 TO 3 TIMES DEPENDING ON A-COUNT.",
    "      15 A-CODE PIC X(2).",
    "    10 MIDDLE PIC X.",
    "    10 B-ITEMS OCCURS 0 TO 2 TIMES DEPENDING ON B-COUNT.",
    "      15 B-CODE PIC X.",
    "    10 TAIL PIC X.",
    "  05 FINAL PIC X."
].join("\n");

interface AItem {code():string}
interface BItem {code():string}
interface Outer {
    header():string;
    readonly a:ProjectedArray<AItem>;
    middle():string;
    readonly b:ProjectedArray<BItem>;
    tail():string;
}
interface Row {readonly outers:ProjectedArray<Outer>; final():string}

const definition=defineProjection<Row>({
    outers:{type:"array",path:["ROW","OUTERS"],element:{
        header:{type:"string",path:["HEADER"]},
        a:{type:"array",path:["A-ITEMS"],element:{code:{type:"string",path:["A-CODE"]}}},
        middle:{type:"string",path:["MIDDLE"]},
        b:{type:"array",path:["B-ITEMS"],element:{code:{type:"string",path:["B-CODE"]}}},
        tail:{type:"string",path:["TAIL"]}
    }},
    final:{type:"string",path:["ROW","FINAL"]}
});

// 3-byte counts, then two eight-byte outer occurrences, then one final byte.
// Each outer body: HEADER 1 + A 2*2 + MIDDLE 1 + B 1*1 + TAIL 1 = 8 bytes.
const bytes=customerHexBytes(
    "F2 F2 F1 " +
    "C1 C2 C3 C4 C5 C6 C7 C8 " +
    "D1 D2 D3 D4 D5 D6 D7 D8 " +
    "E9"
);
const details=valueOrThrow(createCobolProjectionDetails(valueOrThrow(
    compileCobolLayout(valueOrThrow(parseCopybook(copybook)),"multiple-nested-odo.cpy")
)));
const physical=():ProjectionPhysicalRecord=>({
    buffers:[bytes],startByte:0,endByte:bytes.length,lastValidByte:bytes.length,
    source:"multiple-nested-odo.fb",recordNumber:17,recordState:createCobolRecordState()
});

describe("nested ODO with two independent inner ODO arrays — byte-backed projection",()=>{
    test("selects the second outer occurrence and both inner tables by byte position",()=>{
        const factory=createProjection(cobolParser,details,undefined,definition);
        const row=factory.create(),record=physical();
        factory.bind(row,record,record);
        try {
            expect(row.outers.length).toBe(2);
            // Independently specified locations: outer[1] starts at byte 11.
            const second=row.outers[1];
            expect(second.header()).toBe("11/12/d1");
            expect(second.a.length).toBe(2);
            expect(second.a[1].code()).toBe("14/16/d4 d5");
            expect(second.middle()).toBe("16/17/d6");
            expect(second.b.length).toBe(1);
            expect(second.b[0].code()).toBe("17/18/d7");
            expect(second.tail()).toBe("18/19/d8");
            expect(row.final()).toBe("19/20/e9");
        } finally {factory.clear(row);}
    });

    test("preserves each nested array's element identity and independent bindings",()=>{
        const factory=createProjection(cobolParser,details,undefined,definition);
        const row=factory.create(),record=physical();
        factory.bind(row,record,record);
        try {
            const first=row.outers[0],second=row.outers[1];
            expect(first.a[0].code()).toBe("4/6/c2 c3");
            expect(second.a[0].code()).toBe("12/14/d2 d3");
            expect(first.a[0]).toBe(first.a[0]);
            expect(second.a[0]).toBe(second.a[0]);
            expect(first.a[0]).not.toBe(second.a[0]);
        } finally {factory.clear(row);}
    });

    test("a zero-sized first nested ODO does not disturb its sibling or the following outer occurrence",()=>{
        // OUTER=2, A=0, B=2. Each outer body is five bytes, so the
        // second begins at byte 8 and FINAL is at byte 13.
        const data=customerHexBytes("F2 F0 F2 C1 C2 C3 C4 C5 D1 D2 D3 D4 D5 E9");
        const record:ProjectionPhysicalRecord={...physical(),buffers:[data],endByte:data.length,lastValidByte:data.length};
        const factory=createProjection(cobolParser,details,undefined,definition),row=factory.create();
        factory.bind(row,record,record);
        try {
            const second=row.outers[1];
            expect(second.header()).toBe("8/9/d1");
            expect(second.a.length).toBe(0);
            expect(second.a[0]).toBeUndefined();
            expect(second.middle()).toBe("9/10/d2");
            expect(second.b.length).toBe(2);
            expect(second.b[1].code()).toBe("11/12/d4");
            expect(second.tail()).toBe("12/13/d5");
            expect(row.final()).toBe("13/14/e9");
        }finally{factory.clear(row);}
    });

    test("malformed inner count gives provenance and bytes when selecting an outer occurrence",()=>{
        const data=Uint8Array.from(bytes);data[1]=0xff;
        const record:ProjectionPhysicalRecord={...physical(),buffers:[data]};
        const factory=createProjection(cobolParser,details,undefined,definition),row=factory.create();
        factory.bind(row,record,record);
        try {
            expect(row.final()).toBe("19/20/e9");
            let message="";
            try{row.outers[1];}catch(e){message=e instanceof Error?e.message:String(e);}
            expect(message).toMatch(/multiple-nested-odo\.fb: record 17: projection ROW\.OUTERS/);
            expect(message).toMatch(/Invalid unsigned DISPLAY ODO controller digit/);
            expect(message).toMatch(/f2 ff f1/);
        }finally{factory.clear(row);}
    });

});
