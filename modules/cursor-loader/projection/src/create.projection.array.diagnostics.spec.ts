/**
 * Regression tests for errors raised *after* an array property has been selected.
 *
 * The array getter can succeed while its deferred source.length()/element()
 * fails later. Those failures must have the same physical-record provenance as
 * scalar accessors and eager object/array selection failures.
 */
import {type ProjectedArray} from "@cobol-ts/arrays";
import {
    type ProjectionPhysicalRecord,
    type ProjectionSupport,
    utf8RangeToString
} from "@cobol-ts/cursor-loader-types";
import {createProjection, defineProjection} from "./create.projection";

type Item = Readonly<{kind:"item"; name:string}>;
type Row = {
    readonly kind:"row";
    readonly items:readonly Item[];
    failLength?:boolean;
    failElement?:number;
    lengthReads:number;
    elementReads:number[];
};
type Representation = Row | Item;
type Path = readonly (string | number)[];

interface ProjectedItem { name():string }
interface ProjectedRow { readonly items:ProjectedArray<ProjectedItem> }
interface ProjectedNestedRow { readonly group:{readonly items:ProjectedArray<ProjectedItem>} }

const flat = defineProjection<ProjectedRow>({
    items:{type:"array",element:{name:{type:"string"}}}
});
const nested = defineProjection<ProjectedNestedRow>({
    group:{type:"object",fields:{
        items:{type:"array",path:["group","items"],element:{name:{type:"string"}}}
    }}
});

const parser = {
    compileProjectionPath(_details:undefined,_context:undefined,path:Path,_parent?:Path):Path {
        return path;
    },
    object(value:Representation):Representation {return value;},
    array(value:Representation) {
        if(value.kind !== "row") throw new Error("Array selection requires a row");
        return {
            length() {
                value.lengthReads++;
                if(value.failLength) throw new Error("Invalid ODO count");
                return value.items.length;
            },
            element(index:number) {
                value.elementReads.push(index);
                if(value.failElement===index) throw new Error(`Unable to locate occurrence ${index}`);
                return value.items[index];
            }
        };
    },
    string(value:Representation):string {
        if(value.kind!=="item") throw new Error("String selection requires an item");
        return value.name;
    },
    character(_value:Representation):string {throw new Error("Not used");},
    integer(_value:Representation):number {throw new Error("Not used");},
    float(_value:Representation):number {throw new Error("Not used");},
    toDebugString:utf8RangeToString
} satisfies ProjectionSupport<Representation,undefined,Path> & {toDebugString:typeof utf8RangeToString};

function row(names:readonly string[], failure:Partial<Pick<Row,"failLength"|"failElement">>={}):Row {
    return {kind:"row",items:names.map(name=>({kind:"item",name})),
        lengthReads:0,elementReads:[],...failure};
}
function errorMessage(action:()=>unknown):string {
    try {action();return "<no error thrown>";}
    catch(error) {return error instanceof Error ? error.message : String(error);}
}
function physical(recordNumber=7):ProjectionPhysicalRecord {
    return {
        buffers:[new TextEncoder().encode("TEST")],
        startByte:0,endByte:4,lastValidByte:4,
        source:"rows.dat",recordNumber,
        recordState:{projectionViews:new Map<object,unknown>()}
    };
}

describe("createProjection deferred array diagnostics",()=>{
    test("a failing source.length is lazy and adds the logical path, record and debug bytes",()=>{
        const factory=createProjection(parser,undefined,undefined,flat);
        const projected=factory.create();
        const data=row(["A"],{failLength:true});
        factory.bind(projected,data,physical(17));
        const items=projected.items; // No count read during array selection.
        expect(data.lengthReads).toBe(0);
        expect(errorMessage(()=>items.length)).toBe(
            "rows.dat: record 17: projection items: Invalid ODO count\nTEST"
        );
        expect(data.lengthReads).toBe(1);
        expect(data.elementReads).toEqual([]);
        factory.clear(projected);
    });

    test("index, membership and enumeration also enrich failures from deferred length",()=>{
        const factory=createProjection(parser,undefined,undefined,flat);
        const projected=factory.create();
        factory.bind(projected,row(["A"],{failLength:true}),physical());
        const items=projected.items;
        const diagnostic=/rows\.dat: record 7: projection items: Invalid ODO count\nTEST/;
        expect(()=>items[0]).toThrow(diagnostic);
        expect(()=>"0" in items).toThrow(diagnostic);
        expect(()=>Object.keys(items)).toThrow(diagnostic);
        expect(()=>items.map(item=>item.name())).toThrow(diagnostic);
        factory.clear(projected);
    });

    test("a failing source.element adds provenance, remains lazy and can be retried",()=>{
        const factory=createProjection(parser,undefined,undefined,flat);
        const projected=factory.create();
        const data=row(["A","B","C"],{failElement:1});
        factory.bind(projected,data,physical(23));
        const items=projected.items;
        expect(items.length).toBe(3);
        expect(data.elementReads).toEqual([]); // Neither getter nor length materialises children.
        const first=items[0];
        expect(first.name()).toBe("A");
        expect(errorMessage(()=>items[1])).toBe(
            "rows.dat: record 23: projection items: Unable to locate occurrence 1\nTEST"
        );
        expect(data.elementReads).toEqual([0,1]);
        expect(items[0]).toBe(first); // Other projections remain usable.
        expect(items[2].name()).toBe("C");
        data.failElement=undefined;
        const second=items[1]; // Failed initial bind must not poison its retained slot.
        expect(second.name()).toBe("B");
        expect(items[1]).toBe(second);
        factory.clear(projected);
    });

    test("property descriptors enrich a deferred element failure too",()=>{
        const factory=createProjection(parser,undefined,undefined,flat);
        const projected=factory.create();
        factory.bind(projected,row(["A"],{failElement:0}),physical());
        const items=projected.items;
        expect(()=>Object.getOwnPropertyDescriptor(items,"0")).toThrow(
            /rows\.dat: record 7: projection items: Unable to locate occurrence 0\nTEST/
        );
        factory.clear(projected);
    });

    test("a nested array failure is attributed to its own declared path",()=>{
        const factory=createProjection(parser,undefined,undefined,nested);
        const projected=factory.create();
        factory.bind(projected,row(["A"],{failElement:0}),physical(31));
        const items=projected.group.items;
        expect(items.length).toBe(1);
        expect(errorMessage(()=>items[0])).toBe(
            "rows.dat: record 31: projection group.items: Unable to locate occurrence 0\nTEST"
        );
        factory.clear(projected);
    });

    test("successful arrays retain element identity and active length across clear/rebind",()=>{
        const factory=createProjection(parser,undefined,undefined,flat);
        const projected=factory.create();
        const holder=physical();
        const first=row(["A","B"]);
        factory.bind(projected,first,holder);
        const items=projected.items;
        const element=items[0];
        expect(element.name()).toBe("A");
        expect([...items].map(item=>item.name())).toEqual(["A","B"]);
        expect(items[0]).toBe(element);
        factory.clear(projected);
        expect(items.length).toBe(0);
        expect(items[0]).toBeUndefined();
        expect(errorMessage(()=>projected.items)).toBe("Projection is not bound to a record");

        const second=row(["Z"]);
        factory.bind(projected,second,holder);
        expect(projected.items).toBe(items);
        expect(items.length).toBe(1);
        expect(items[1]).toBeUndefined();
        expect(items[0]).toBe(element);
        expect(element.name()).toBe("Z");
        factory.clear(projected);
    });
});
