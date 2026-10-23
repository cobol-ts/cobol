import type {ProjectedArray} from "@cobol-ts/arrays";
import {type ProjectionPhysicalRecord, type ProjectionSupport, utf8RangeToString} from "@cobol-ts/cursor-loader-types";
import {createProjection,defineProjection} from "./create.projection";

type Data = {values:string[]};
type Selection = {row:Data; group:boolean};
type Path = readonly (string|number)[];
type Domain = {readonly group:{readonly items:ProjectedArray<{value():string}>}};
const schema=defineProjection<Domain>({group:{type:"object",fields:{items:{type:"array",element:{value:{type:"string"}}}}}});
const tracker={objects:0,arrays:0,elements:0};
const parser={
    compileProjectionPath(_d:undefined,_c:undefined,path:Path,_parent?:Path){return path;},
    object(value:Selection){tracker.objects++;return {row:value.row,group:true};}, // Fresh representation each call.
    array(value:Selection){tracker.arrays++;return {length:()=>value.row.values.length,element(index:number){tracker.elements++;return {row:{values:[value.row.values[index]]},group:false};}};},
    string(value:Selection){return value.row.values[0];},
    character(_v:Selection){throw new Error("unused");},integer(_v:Selection){throw new Error("unused");},float(_v:Selection){throw new Error("unused");},
    toDebugString:utf8RangeToString
} satisfies ProjectionSupport<Selection,undefined,Path> & {toDebugString:typeof utf8RangeToString};
const record=():ProjectionPhysicalRecord=>({buffers:[new TextEncoder().encode("TEST")],startByte:0,endByte:4,lastValidByte:4,source:"repeat.dat",recordNumber:8,recordState:{projectionViews:new Map()}});

describe("projection lazy selection reuse",()=>{
    test("repeated getters do not reselect or invalidate previously retained nested arrays",()=>{
        tracker.objects=tracker.arrays=tracker.elements=0;
        const factory=createProjection(parser,undefined,undefined,schema),projection=factory.create(),holder=record();
        factory.bind(projection,{row:{values:["A","B"]},group:false},holder);
        const group=projection.group,items=group.items,first=items[0];
        expect(first.value()).toBe("A");
        expect(projection.group).toBe(group);
        expect(projection.group.items).toBe(items);
        expect(items.length).toBe(2);
        expect(items[0]).toBe(first);
        expect(first.value()).toBe("A");
        expect(tracker.objects).toBe(1);
        expect(tracker.arrays).toBe(1);
        expect(tracker.elements).toBe(1);
        factory.clear(projection);
        factory.bind(projection,{row:{values:["Z"]},group:false},holder);
        expect(projection.group).toBe(group);
        expect(projection.group.items).toBe(items);
        expect(items[0]).toBe(first);
        expect(first.value()).toBe("Z");
        expect(tracker.objects).toBe(2);
        expect(tracker.arrays).toBe(2);
        expect(tracker.elements).toBe(2);
        factory.clear(projection);
    });
    test("a failed array selection remains retryable and retains diagnostic provenance",()=>{
        let attempts=0;
        const failing={...parser,array(v:Selection){attempts++;if(attempts===1)throw new Error("temporary failure");return parser.array(v);}};
        const factory=createProjection(failing,undefined,undefined,schema),projection=factory.create(),holder=record();
        factory.bind(projection,{row:{values:["OK"]},group:false},holder);
        expect(()=>projection.group.items).toThrow(/repeat\.dat: record 8: projection items: temporary failure\nTEST/);
        expect(projection.group.items[0].value()).toBe("OK");
        expect(attempts).toBe(2);
        factory.clear(projection);
    });
});

describe("array cleanup retains sparse capacity without revisiting historical slots",()=>{
    test("high-water slots not touched this lease are not scanned on clear",()=>{
        const values=Array.from({length:3001},(_,i)=>String(i));
        const factory=createProjection(parser,undefined,undefined,schema);
        const projection=factory.create(),holder=record();
        factory.bind(projection,{row:{values},group:false},holder);
        const large=projection.group.items;
        const old=large[3000];
        expect(old.value()).toBe("3000");
        factory.clear(projection);
        factory.bind(projection,{row:{values:["small"]},group:false},holder);
        const small=projection.group.items;
        expect(small[0].value()).toBe("small");
        // A cached array runtime exposes retained slots to inspection, but the
        // application-facing projected array remains unchanged.
        const group=projection.group as unknown as {[k:symbol]:unknown};
        const maps=Object.getOwnPropertySymbols(group).map(symbol=>group[symbol]).filter(v=>v instanceof Map);
        const runtime=[...maps.flatMap(v=>[...(v as Map<unknown,unknown>).values()])]
            .find(v=>v && typeof v==="object" && "elements" in v) as {elements:unknown[]};
        expect(runtime.elements.length).toBeGreaterThan(3000);
        Object.defineProperty(runtime.elements,2000,{configurable:true,get(){throw new Error("stale array slot scanned");}});
        try {factory.clear(projection);}finally {delete runtime.elements[2000];}
    });
});
