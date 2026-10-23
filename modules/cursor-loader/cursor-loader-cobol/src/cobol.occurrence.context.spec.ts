/**
 * A selected COBOL view must preserve its enclosing occurrence indexes.
 * The symbolic evaluator must receive those bindings, including when the
 * selection passes through ordinary (non-OCCURS) groups.
 */
import type {ProjectedArray} from "@cobol-ts/arrays";
import type {ProjectionPhysicalRecord} from "@cobol-ts/cursor-loader-types";
import {createProjection,defineProjection} from "@cobol-ts/cursor-projection";
import {parseCopybook} from "@cobol-ts/copybook";
import {valueOrThrow} from "@cobol-ts/errors";
import {compileCobolLayout} from "@cobol-ts/layout";
import {compileCobolMemberPath} from "./cobol.projection.path";
import {activeCount,rootSymbolicView,selectSymbolic,singleDepthOccurrence,type CobolNamedNode,
    type CobolSymbolicPath,type CobolSymbolicView} from "./cobol.projection.symbolic";
import {cobolParser,createCobolProjectionDetails,createCobolRecordState} from "./cobol.parser";
import {customerHexBytes} from "./customer.fixtures";

const layoutFor=(copybook:string)=>valueOrThrow(compileCobolLayout(valueOrThrow(parseCopybook(copybook)),"context.cpy"));
const record=(bytes:Uint8Array,number=7):ProjectionPhysicalRecord=>({
    buffers:[bytes],startByte:0,endByte:bytes.length,lastValidByte:bytes.length,
    source:"nested-odo.fb",recordNumber:number,recordState:createCobolRecordState()
});
const errorMessage=(action:()=>unknown):string=>{
    try{action();return "<no error>";}catch(e){return e instanceof Error?e.message:String(e);}
};

const nestedFixedAfterOdo=[
    "01 ROW.",
    "  05 COUNT PIC 9.",
    "  05 PRE OCCURS 0 TO 2 TIMES DEPENDING ON COUNT.",
    "    10 PRE-BYTE PIC X.",
    "  05 OUTERS OCCURS 2 TIMES.",
    "    10 DETAILS.",
    "      15 INNERS OCCURS 2 TIMES.",
    "        20 VALUE PIC X."
].join("\n");

describe("COBOL enclosing occurrence context",()=>{
    test("the root, outer element, ordinary group and inner element carry their selected indexes",()=>{
        const details=valueOrThrow(createCobolProjectionDetails(layoutFor(nestedFixedAfterOdo)));
        const r=record(customerHexBytes("F1 C1 C2 C3 C4 C5"));
        const root=rootSymbolicView(r);
        expect(root.enclosingIndices).toEqual([]);
        const outerPath=compileCobolMemberPath(details.names,["ROW","OUTERS"]);
        if(!("symbolic" in outerPath)) throw new Error("Expected symbolic array after ODO");
        const outers=cobolParser.array(root,details,outerPath);
        const second=outers.element(1) as CobolSymbolicView;
        expect(second.enclosingIndices).toEqual([1]);
        expect(second.originBits).toBe(32);
        const detailsPath=compileCobolMemberPath(details.names,["DETAILS"],outerPath);
        if(!("symbolic" in detailsPath)) throw new Error("Expected symbolic child path");
        const ordinary=cobolParser.object(second,details,detailsPath) as CobolSymbolicView;
        expect(ordinary.enclosingIndices).toEqual([1]);
        const innerPath=compileCobolMemberPath(details.names,["INNERS"],detailsPath);
        if(!("symbolic" in innerPath)) throw new Error("Expected symbolic inner path");
        const inner=cobolParser.array(ordinary,details,innerPath).element(1) as CobolSymbolicView;
        expect(inner.enclosingIndices).toEqual([1,1]);
        expect(inner.originBits).toBe(40);
    });

    test("a symbolic left offset substitutes the enclosing selection into its dependency path",()=>{
        const parent: CobolSymbolicView={...rootSymbolicView(record(customerHexBytes("00 00 00 00"))),
            originBits:0,enclosingIndices:[2]};
        const fake: CobolNamedNode={
            kind:"elementary", size:8,
            leftOffset:{kind:"depending-on",path:["COUNT",0],expression:8,min:0,max:3},
            rightOffset:{kind:"sum",terms:[0,8]},
            source:{name:{kind:"named",name:"FIELD"},clauses:[]} as unknown as CobolNamedNode["source"]
        } as CobolNamedNode;
        const path:CobolSymbolicPath={symbolic:true,node:fake,fullPath:["FIELD"],
            steps:[{node:fake},{node:fake}],relativeSteps:[{node:fake}]};
        const calls:(readonly (string|number)[])[]=[];
        const selected=selectSymbolic(parent,path,concrete=>{
            calls.push(concrete);return concrete[1]===2?3:0;
        });
        expect(calls).toEqual([["COUNT",2]]);
        expect(selected.originBits).toBe(24);
        expect(selected.enclosingIndices).toEqual([2]);
    });

    test("dynamic counts can be resolved using an enclosing occurrence binding",()=>{
        const r=record(customerHexBytes("00 00 00 00"));
        const node={
            kind:"group",size:{kind:"depending-on",path:["COUNT",0],expression:8,min:0,max:3},
            leftOffset:0,rightOffset:0,
            source:{name:{kind:"named",name:"INNER"},clauses:[{kind:"occurs",min:0,max:3,dependingOn:"COUNT"}]}
        } as unknown as CobolNamedNode;
        const calls:(readonly (string|number)[])[]=[];
        const resolve=(path:readonly (string|number)[])=>{calls.push(path);return 2;};
        const outer: CobolSymbolicView={...rootSymbolicView(r),enclosingIndices:[1]};
        expect(activeCount(node,resolve,outer.enclosingIndices)).toBe(2);
        const child=singleDepthOccurrence(outer,node,1,resolve);
        expect(child.enclosingIndices).toEqual([1,1]);
        expect(calls).toEqual([["COUNT",1],["COUNT",1]]);
    });

    test("diagnostics dump only the current record even when its bytes span input buffers",()=>{
        const layout=layoutFor([
            "01 ROW.",
            "  05 COUNT PIC 9.",
            "  05 ITEMS OCCURS 0 TO 2 TIMES DEPENDING ON COUNT.",
            "    10 CODE PIC X."
        ].join("\n"));
        const details=valueOrThrow(createCobolProjectionDetails(layout));
        const schema=defineProjection<{readonly items:ProjectedArray<{code():string}>}>({
            items:{type:"array",path:["ROW","ITEMS"],element:{code:{type:"string",path:["CODE"]}}}
        });
        const factory=createProjection(cobolParser,details,undefined,schema),row=factory.create();
        const r:ProjectionPhysicalRecord={
            buffers:[customerHexBytes("00 00 FF"),customerHexBytes("C1 C2 00")],
            startByte:2,endByte:5,lastValidByte:6,
            source:"split-odo.fb",recordNumber:88,recordState:createCobolRecordState()
        };
        factory.bind(row,r,r);
        expect(errorMessage(()=>row.items.length)).toBe(
            "split-odo.fb: record 88: projection ROW.ITEMS: " +
            "Invalid unsigned DISPLAY ODO controller digit at ROW.COUNT\nff c1 c2"
        );
        factory.clear(row);
    });

    test("selecting a nested-ODO outer occurrence now resolves its variable body",()=>{
        const layout=layoutFor([
            "01 ROW.",
            "  05 ORDER-COUNT PIC 9.",
            "  05 ITEM-COUNT PIC 9.",
            "  05 ORDERS OCCURS 0 TO 3 TIMES DEPENDING ON ORDER-COUNT.",
            "    10 ORDER-ID PIC X(2).",
            "    10 ITEMS OCCURS 0 TO 4 TIMES DEPENDING ON ITEM-COUNT.",
            "      15 SKU PIC X(3).",
            "    10 ORDER-STATUS PIC X.",
            "  05 CUSTOMER-STATUS PIC X."
        ].join("\n"));
        const d=valueOrThrow(createCobolProjectionDetails(layout));
        const schema=defineProjection<{readonly orders:ProjectedArray<{
            id():string;readonly items:ProjectedArray<{sku():string}>}>}>({
            orders:{type:"array",path:["ROW","ORDERS"],element:{
                id:{type:"string",path:["ORDER-ID"]},
                items:{type:"array",path:["ITEMS"],element:{sku:{type:"string",path:["SKU"]}}}
            }}
        });
        const factory=createProjection(cobolParser,d,undefined,schema),row=factory.create();
        const bytes=customerHexBytes("F2 F2 C1 F1 C1 C2 C3 C4 C5 C6 E8 C2 F2 C7 C8 C9 D1 D2 D3 D5 E9");
        const r=record(bytes,42);
        factory.bind(row,r,r);
        expect(row.orders.length).toBe(2);
        expect(row.orders[1].id()).toBe("11/13/c2 f2");
        expect(row.orders[1].items[1].sku()).toBe("16/19/d1 d2 d3");
        factory.clear(row);
    });

    test("nested array controller failures include source, record number, path and physical bytes",()=>{
        const layout=layoutFor([
            "01 ROW.",
            "  05 PREFIX PIC X.",
            "  05 CONTAINER.",
            "    10 ITEM-COUNT PIC 9.",
            "    10 ITEMS OCCURS 0 TO 2 TIMES DEPENDING ON ITEM-COUNT.",
            "      15 CODE PIC X(2).",
            "    10 SUFFIX PIC X."
        ].join("\n"));
        const d=valueOrThrow(createCobolProjectionDetails(layout));
        const schema=defineProjection<{readonly container:{readonly items:ProjectedArray<{code():string}>}}>({
            container:{type:"object",path:["ROW","CONTAINER"],fields:{
                items:{type:"array",path:["ITEMS"],element:{code:{type:"string",path:["CODE"]}}}
            }}
        });
        const factory=createProjection(cobolParser,d,undefined,schema);
        const row=factory.create();
        const physical=record(customerHexBytes("C1 FF C2 C3 C4"),29);
        factory.bind(row,physical,physical);
        const items=row.container.items;
        const message=errorMessage(()=>items.length);
        expect(message).toBe("nested-odo.fb: record 29: projection ITEMS: Invalid unsigned DISPLAY ODO controller digit at ROW.CONTAINER.ITEM-COUNT\nc1 ff c2 c3 c4");
        factory.clear(row);
    });
});
