import {type ProjectedArray} from "@cobol-ts/arrays";
import {type ProjectionPhysicalRecord} from "@cobol-ts/cursor-loader-types";
import {parseCopybook} from "@cobol-ts/copybook";
import {compileCobolLayout} from "@cobol-ts/layout";
import {valueOrThrow} from "@cobol-ts/errors";
import {createProjection,defineProjection} from "@cobol-ts/cursor-projection";
import {cobolParser,createCobolProjectionDetails,createCobolRecordState,cleanCobolRecordState} from "./cobol.parser";
import {resolveDependingOnCount} from "@cobol-ts/size";

const layout=valueOrThrow(compileCobolLayout(valueOrThrow(parseCopybook([
    "01 ROW.",
    "  05 COUNT PIC 9.",
    "  05 ITEMS OCCURS 0 TO 3 TIMES DEPENDING ON COUNT.",
    "    10 GROUP-DETAILS.",
    "      15 CODE PIC X(2).",
    "  05 FINAL PIC X."
].join("\n"))),"allocation.cpy"));
const details=valueOrThrow(createCobolProjectionDetails(layout));
const definition=defineProjection<{readonly items:ProjectedArray<{readonly details:{code():string}}>;final():string}>({
    items:{type:"array",path:["ROW","ITEMS"],element:{
        details:{type:"object",path:["GROUP-DETAILS"],fields:{code:{type:"string",path:["CODE"]}}}
    }},
    final:{type:"string",path:["ROW","FINAL"]}
});
const holder=(data:Uint8Array,number=5):ProjectionPhysicalRecord=>({
    buffers:[data],startByte:0,endByte:data.length,lastValidByte:data.length,
    source:"allocation.fb",recordNumber:number,recordState:createCobolRecordState()
});

describe("COBOL symbolic hot-path reuse",()=>{
    test("repeated scalar reads reuse numeric selection scratch and controller location",()=>{
        const factory=createProjection(cobolParser,details,undefined,definition),row=factory.create();
        const physical=holder(Uint8Array.of(0xf2,0xc1,0xc2,0xd1,0xd2,0xe9));
        factory.bind(row,physical,physical);
        const selected=row.items[1].details;
        expect(selected.code()).toBe("3/5/d1 d2");
        const state=physical.recordState as ReturnType<typeof createCobolRecordState>;
        const scratch=state.scalarScratch,range=state.rangeScratch,root=state.rootScratch;
        expect(scratch).toBeDefined();
        expect(range).toBeDefined();
        expect(root).toBeDefined();
        expect(selected.code()).toBe("3/5/d1 d2");
        expect(row.items[1].details).toBe(selected);
        expect(state.scalarScratch).toBe(scratch);
        expect(state.rangeScratch).toBe(range);
        expect(state.rootScratch).toBe(root);
        const declaration=layout[0].kind==="group" ? layout[0].children.find(n=>n.kind==="group") : undefined;
        if(!declaration || declaration.kind!=="group")throw new Error("missing ITEMS");
        if(typeof declaration.size==="number" || declaration.size.kind!=="depending-on")throw new Error("missing dependent count");
        const controller=declaration.size.path;
        const position=details.controllerLocations.get(controller);
        expect(position).toBeDefined();
        expect(row.items.length).toBe(2);
        expect(details.controllerLocations.get(controller)).toBe(position);
        factory.clear(row);
        cleanCobolRecordState(state);
        expect(state.countContext.record).toBeUndefined();
        expect(state.countContext.details).toBeUndefined();
    });

    test("controller values are reread from bytes; only immutable coordinates are cached",()=>{
        const factory=createProjection(cobolParser,details,undefined,definition),row=factory.create();
        const bytes=Uint8Array.of(0xf1,0xc1,0xc2,0xe9),physical=holder(bytes,49);
        factory.bind(row,physical,physical);
        expect(row.items.length).toBe(1);
        bytes[0]=0xf0;
        expect(row.items.length).toBe(0);
        // The structural position cache requires stable counts during a lease,
        // but scalar controller reads themselves must not memoise values.
        factory.clear(row);
    });

    test("literal dependency paths retain compiled identity without constructing arrays",()=>{
        const literal=["ROW","COUNT"] as const;
        expect(resolveDependingOnCount(literal,path=>{
            expect(path).toBe(literal);
            return 2;
        })).toBe(2);
        const variable=["ROW",0] as const;
        expect(resolveDependingOnCount(variable,path=>{
            expect(path).toEqual(["ROW",3]);
            return 1;
        },[3])).toBe(1);
    });
});
