import {
    type CanonicalProjection, type PhysicalRecordContext,
    type PhysicalRecordDebugRenderer, type ProjectionDefinition,
    type ProjectionFactory, type ProjectionField, type ProjectionPhysicalRecord,
    type ProjectionSupport, type ProjectionAuthoring, type ProjectionRecordState
} from "@cobol-ts/cursor-loader-types";
import {createProjectedArray,createArrayWithSize,appendArrayWithSize,resetArrayWithSize, type ProjectedArray, type ProjectedArraySource} from "@cobol-ts/arrays";
import {canonicalProjection} from "./projection.definition";

const REPRESENTATION = Symbol("projectionRepresentation");
const PHYSICAL_RECORD = Symbol("projectionPhysicalRecord");
const ARRAYS = Symbol("projectionArrays");
const OBJECTS = Symbol("projectionObjects");
const ROOT = Symbol("rootProjection");
const SAVED = Symbol("projectionRetainedSelection");
const PARENT = Symbol("projectionParent");
const VIA = Symbol("projectionVia");
const INDEX = Symbol("projectionIndex");

type Parser<R,D,P> = ProjectionSupport<R,D,P> & PhysicalRecordDebugRenderer;
type BoundView<R> = {
    [REPRESENTATION]: R | undefined;
    [PHYSICAL_RECORD]: ProjectionPhysicalRecord | undefined;
    [ARRAYS]: Map<object, ArrayRuntime<R>>;
    [OBJECTS]: Map<object, BoundView<R>>;
    [ROOT]: boolean;
    [SAVED]: R | undefined;
    [PARENT]: BoundView<R> | undefined;
    [VIA]: string | undefined;
    [INDEX]: number | undefined;
};
type ScalarMember<R> = {kind:"scalar";name:string; accessor:(this:BoundView<R>,...indices:number[])=>number|string};
type ObjectMember<R,D,P> = {kind:"object"; name:string;path:P; schema: Compiled<R,D,P>; original: ProjectionField};
type ArrayMember<R,D,P> = {kind:"array"; name:string; label:string;path:P; schema: Compiled<R,D,P>; original: ProjectionField};
type CompiledMember<R,D,P> = ScalarMember<R> | ObjectMember<R,D,P> | ArrayMember<R,D,P>;
type Compiled<R,D,P> = readonly CompiledMember<R,D,P>[];

type ArrayRuntime<R> = {
    /** Stable compiled site name for inspecting pooled record state. */
    readonly name: string;
    readonly view: ProjectedArray<unknown>;
    readonly elements: BoundView<R>[];
    isBoundTo(record: ProjectionPhysicalRecord, owner: R): boolean;
    source(): ProjectedArraySource<R> | undefined;
    bind(items: ProjectedArraySource<R>, record: ProjectionPhysicalRecord, owner: R, ownerView: BoundView<R>): void;
    clear(): void;
};

/** Definition time: validate and canonicalise the full nested schema. */
export function defineProjection<T>(definition: ProjectionDefinition<T>):
    CanonicalProjection<ProjectionDefinition<T>> {
    return canonicalProjection(definition);
}

/** Compile every member once; row binding only changes representation and record. */
export function createProjection<T,R,D,P>(
    parser: Parser<R,D,P>, details:D, context:PhysicalRecordContext | undefined,
    definition:CanonicalProjection<ProjectionDefinition<T>>
):ProjectionFactory<T,R> {
    const schema = compileTree(parser,details,context,definition as unknown as ProjectionAuthoring);
    return {
        create: () => createView(schema,true) as T,
        bind(projection:T, representation:R, record:ProjectionPhysicalRecord) {
            const view = projection as BoundView<R>;
            if (view[PHYSICAL_RECORD] !== undefined) throw new Error("Projection is already bound");
            bindView(view,representation,record);
        },
        clear(projection:T) { clearView(projection as BoundView<R>); }
    };

    function createView(nodes:Compiled<R,D,P>, root:boolean):BoundView<R> {
        const view: BoundView<R> = {
            [REPRESENTATION]:undefined,
            [PHYSICAL_RECORD]:undefined,
            [ARRAYS]:new Map(),
            [OBJECTS]:new Map(),
            [ROOT]:root,
            [SAVED]:undefined, [PARENT]:undefined, [VIA]:undefined, [INDEX]:undefined
        };
        for (const node of nodes) {
            if (node.kind === "scalar") {
                Object.defineProperty(view,node.name,{value:node.accessor,enumerable:true});
            } else if (node.kind === "object") {
                Object.defineProperty(view,node.name,{enumerable:true,get() {
                    const record = requireRecord(view);
                    try {
                        if (!parser.object) throw new Error("Parser does not support nested object projections");
                        let child = view[OBJECTS].get(node);
                        // A child remains valid until its parent is cleared; reselecting
                        // can create a fresh representation of the *same* occurrence.
                        if (child?.[PHYSICAL_RECORD] === record) return child;
                        const selected = parser.object(view[REPRESENTATION] as R,details,node.path,child?.[SAVED]);
                        if (!child) {child = createView(node.schema,false);view[OBJECTS].set(node,child);}
                        bindView(child,selected,record,view,node.name);
                        return child;
                    } catch (e) {throw diagnostic(parser,record,node.original,e,view,node.name);}
                }});
            } else {
                Object.defineProperty(view,node.name,{enumerable:true,get() {
                    const record = requireRecord(view);
                    try {
                        if (!parser.array) throw new Error("Parser does not support projected arrays");
                        const cache = view[ROOT] ? rootArrayCache(record) : view[ARRAYS];
                        let runtime = cache.get(node) as ArrayRuntime<R> | undefined;
                        const owner = view[REPRESENTATION] as R;
                        if (!runtime?.isBoundTo(record,owner)) {
                            const selected = parser.array(view[REPRESENTATION] as R,details,node.path,runtime?.source());
                            if (!runtime) {runtime=makeArray(node);cache.set(node,runtime);}
                            runtime.bind(selected,record,owner,view);
                        }
                        return runtime.view;
                    } catch(e) {throw diagnostic(parser,record,node.original,e,view,node.name);}
                }});
            }
        }
        return view;
    }

    function makeArray(node:ArrayMember<R,D,P>):ArrayRuntime<R> {
        const elements:BoundView<R>[] = [];
        let items:ProjectedArraySource<R> | undefined;
        let retainedSource:ProjectedArraySource<R> | undefined;
        const active=createArrayWithSize<BoundView<R>>();
        let ownerView:BoundView<R> | undefined;
        let owner:R | undefined;
        let physical:ProjectionPhysicalRecord | undefined;
        const view = createProjectedArray({
            length: () => {
                if (!items) return 0;
                try {return items.length();}
                catch(e) {if (!physical) throw e;throw diagnostic(parser,physical,node.original,e,ownerView,node.name);}
            },
            element(index) {
                if (!items || !physical) throw new Error("Projected array is not bound");
                try {
                    let child=elements[index];
                    if (!child) {child=createView(node.schema,false);elements[index]=child;}
                    if (child[PHYSICAL_RECORD] !== physical || child[REPRESENTATION] === undefined) {
                        clearView(child);
                        bindView(child,items.element(index,child[SAVED]),physical,ownerView,node.name,index);
                        appendArrayWithSize(active,child);
                    }
                    return child;
                } catch(e) {throw diagnostic(parser,physical,node.original,e,ownerView,node.name,index);}
            }
        });
        return {
            name:node.label, view,elements,
            source() {return retainedSource;},
            isBoundTo(record,nextOwner) {return physical===record && owner===nextOwner && items!==undefined;},
            bind(next,record,nextOwner,nextOwnerView) {
                if (physical === record && owner === nextOwner) return;
                // The retained slots survive re-binding; their borrowed values do not.
                for(let i=0;i<active.size;i++) clearView(active.values[i]);
                resetArrayWithSize(active);
                retainedSource=next;items=next;physical=record;owner=nextOwner;ownerView=nextOwnerView;
            },
            clear() {
                items=undefined;physical=undefined;owner=undefined;ownerView=undefined;
                for(let i=0;i<active.size;i++) clearView(active.values[i]);
                resetArrayWithSize(active);
            }
        };
    }

    function bindView(view:BoundView<R>, representation:R,record:ProjectionPhysicalRecord,
                      parent?:BoundView<R>,via?:string,index?:number) {
        view[REPRESENTATION]=representation;
        view[SAVED]=representation;
        view[PARENT]=parent;view[VIA]=via;view[INDEX]=index;
        view[PHYSICAL_RECORD]=record;
    }

    function clearView(view:BoundView<R>) {
        if (view[ROOT] && view[PHYSICAL_RECORD]) {
            const state=optionalRootArrayCache(view[PHYSICAL_RECORD]);
            if (state) for (const array of state.values()) (array as ArrayRuntime<R>).clear();
        }
        for (const array of view[ARRAYS].values()) array.clear();
        for (const object of view[OBJECTS].values()) clearView(object);
        view[REPRESENTATION]=undefined;
        view[PHYSICAL_RECORD]=undefined;
    }
}

function optionalRootArrayCache(record:ProjectionPhysicalRecord): Map<object,unknown> | undefined {
    const state=record.recordState as Partial<ProjectionRecordState> | undefined;
    return state?.projectionViews instanceof Map ? state.projectionViews : undefined;
}
function rootArrayCache(record:ProjectionPhysicalRecord):Map<object,unknown> {
    const cache=optionalRootArrayCache(record);
    if (!cache) throw new Error("Projected arrays require a recordState with projectionViews");
    return cache;
}
function requireRecord<R>(view:BoundView<R>):ProjectionPhysicalRecord {
    if (!view[PHYSICAL_RECORD]) throw new Error("Projection is not bound to a record");
    return view[PHYSICAL_RECORD];
}
function compileTree<R,D,P>(parser:Parser<R,D,P>, details:D, context:PhysicalRecordContext|undefined,
                          definition:ProjectionAuthoring, parentName="root", parentPath?:P):Compiled<R,D,P> {
    return Object.entries(definition).map(([name,node]):CompiledMember<R,D,P> => {
        const field = {type:node.type,path:node.path ?? [name]} as ProjectionField;
        const path=parser.compileProjectionPath(details,context,field.path,parentPath);
        if (node.type === "array") return {kind:"array",name,label:`${parentName}.${name}`,path,original:field,
            schema:compileTree(parser,details,context,node.element,`${parentName}.${name}`,path)};
        if (node.type === "object") return {kind:"object",name,path,original:field,
            schema:compileTree(parser,details,context,node.fields,`${parentName}.${name}`,path)};
        const kind=node.type;
        return {kind:"scalar",name,accessor:function(this:BoundView<R>,...indices:number[]) {
            const record=requireRecord(this);
            try {return parser[kind](this[REPRESENTATION] as R,details,path,...indices);}
            catch(e) {throw diagnostic(parser,record,field,e,this,name);}
        }};
    });
}
function indexedPath<R>(owner:BoundView<R> | undefined,member?:string,index?:number):string | undefined {
    const parts:string[]=[];
    let selected=false;
    if(member!==undefined) {parts.push(member+(index===undefined?"":`[${index}]`));selected=index!==undefined;}
    for(let view=owner;view && view[PARENT];view=view[PARENT]) {
        const suffix=view[INDEX]===undefined?"":`[${view[INDEX]}]`;
        if(suffix) selected=true;
        parts.unshift((view[VIA] ?? "<unknown>")+suffix);
    }
    return selected?parts.join("."):undefined;
}
function diagnostic<R>(parser:PhysicalRecordDebugRenderer,record:ProjectionPhysicalRecord,
                    field:ProjectionField,error:unknown,owner?:BoundView<R>,member?:string,index?:number):Error {
    const reason=error instanceof Error ? error.message:String(error);
    const path=field.path.length ? field.path.join("."):"<root>";
    const location=indexedPath(owner,member,index);
    return new Error(`${record.source}: record ${record.recordNumber}: projection ${path}${location?` [access ${location}]`:""}: ${reason}\n`
        +parser.toDebugString(record,record.startByte,record.endByte));
}
