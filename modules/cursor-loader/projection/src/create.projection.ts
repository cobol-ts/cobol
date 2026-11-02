import {
    type CanonicalProjection, type PhysicalRecordContext,
    type PhysicalRecordDebugRenderer, type ProjectionDefinition,
    type ProjectionFactory, type ProjectionField, type ProjectionPhysicalRecord,
    type ProjectionSupport, type ProjectionAuthoring, type ProjectionRecordState
} from "@cobol-ts/cursor-loader-types";
import {createProjectedArray,createArrayWithSize,appendArrayWithSize,resetArrayWithSize, type ProjectedArray, type ProjectedArraySource} from "@cobol-ts/arrays";
import {type IPutMetrics,NULL_METRICS,METRIC} from "@cobol-ts/metrics";
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
const SHARED_LEASE = Symbol("projectionSharedLease");
type SharedLease={record:ProjectionPhysicalRecord|undefined; activeCount?:number};
type SharedFixedSource<R> = ProjectedArraySource<R> & {sharedElement(index:number,lease:SharedLease):R};
function isSharedFixedSource<R>(source:ProjectedArraySource<R>):source is SharedFixedSource<R> {
    return typeof (source as Partial<SharedFixedSource<R>>).sharedElement === "function";
}
/** Opt-in provider for a small variable-count array with immutable element stride. */
type SharedOdoSource<R> = ProjectedArraySource<R> & {
    sharedOdoCapacity():number;
    sharedOdoElement(index:number,lease:SharedLease):R;
};
function isSharedOdoSource<R>(source:ProjectedArraySource<R>):source is SharedOdoSource<R> {
    const candidate=source as Partial<SharedOdoSource<R>>;
    return typeof candidate.sharedOdoCapacity === "function" &&
        typeof candidate.sharedOdoElement === "function" &&
        candidate.sharedOdoCapacity()>0;
}

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
    [SHARED_LEASE]: SharedLease | undefined;
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
    definition:CanonicalProjection<ProjectionDefinition<T>>, metrics:IPutMetrics=NULL_METRICS
):ProjectionFactory<T,R> {
    const schema = compileTree(parser,details,context,definition as unknown as ProjectionAuthoring,metrics);
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
        metrics.put(METRIC.PROJECTION_CREATE);
        const view: BoundView<R> = {
            [REPRESENTATION]:undefined,
            [PHYSICAL_RECORD]:undefined,
            [ARRAYS]:new Map(),
            [OBJECTS]:new Map(),
            [ROOT]:root,
            [SAVED]:undefined, [PARENT]:undefined, [VIA]:undefined, [INDEX]:undefined, [SHARED_LEASE]:undefined
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
                        metrics.put(METRIC.ARRAY_PROPERTY);
                        const cache = view[ROOT] ? rootArrayCache(record) : view[ARRAYS];
                        let runtime = cache.get(node) as ArrayRuntime<R> | undefined;
                        const owner = view[REPRESENTATION] as R;
                        if (!runtime?.isBoundTo(record,owner)) {
                            const selected = parser.array(view[REPRESENTATION] as R,details,node.path,runtime?.source());
                            if (!runtime) {runtime=makeArray(node,selected);cache.set(node,runtime);metrics.put(METRIC.ARRAY_RUNTIME_CREATE);}
                            runtime.bind(selected,record,owner,view);
                        } else metrics.put(METRIC.ARRAY_RUNTIME_ALREADY_BOUND);
                        return runtime.view;
                    } catch(e) {throw diagnostic(parser,record,node.original,e,view,node.name);}
                }});
            }
        }
        return view;
    }

    function makeArray(node:ArrayMember<R,D,P>,initial:ProjectedArraySource<R>):ArrayRuntime<R> {
        if(node.schema.every(member=>member.kind==="scalar")
           && isSharedFixedSource(initial) && initial.length()<=8) return makeSharedFixedArray(node,initial);
        if(node.schema.every(member=>member.kind==="scalar") && isSharedOdoSource(initial))
            return makeSharedOdoArray(node,initial);
        const elements:BoundView<R>[] = [];
        let items:ProjectedArraySource<R> | undefined;
        let retainedSource:ProjectedArraySource<R> | undefined;
        const active=createArrayWithSize<BoundView<R>>();
        let ownerView:BoundView<R> | undefined;
        let owner:R | undefined;
        let physical:ProjectionPhysicalRecord | undefined;
        const view = createProjectedArray({
            length: () => {
                metrics.put(METRIC.ARRAY_LENGTH);
                if (!items) return 0;
                try {return items.length();}
                catch(e) {if (!physical) throw e;throw diagnostic(parser,physical,node.original,e,ownerView,node.name);}
            },
            element(index) {
                metrics.put(METRIC.ARRAY_ELEMENT);
                if (!items || !physical) throw new Error("Projected array is not bound");
                try {
                    let child=elements[index];
                    if (!child) {
                        metrics.put(METRIC.ARRAY_CHILD_ALLOCATE);
                        child=createView(node.schema,false);
                        // These describe the compiled array site and retained slot.
                        // Only the parent and borrowed record vary between leases.
                        child[VIA]=node.name;
                        child[INDEX]=index;
                        elements[index]=child;
                    } else metrics.put(METRIC.ARRAY_CHILD_REUSE);
                    if (child[PHYSICAL_RECORD] !== physical || child[REPRESENTATION] === undefined) {
                        // The previous lease already cleared borrowed state. Retained,
                        // unbound children need rebinding, not a second recursive clear.
                        // Still clear a child if it is bound (including to another record).
                        if (child[PHYSICAL_RECORD] !== undefined) clearView(child);
                        metrics.put(METRIC.ARRAY_CHILD_BIND);
                        bindArrayChild(child,items.element(index,child[SAVED]),physical,ownerView);
                        appendArrayWithSize(active,child);
                    } else metrics.put(METRIC.ARRAY_CHILD_ALREADY_BOUND);
                    return child;
                } catch(e) {throw diagnostic(parser,physical,node.original,e,ownerView,node.name,index);}
            }
        },metrics);
        return {
            name:node.label, view,elements,
            source() {return retainedSource;},
            isBoundTo(record,nextOwner) {return physical===record && owner===nextOwner && items!==undefined;},
            bind(next,record,nextOwner,nextOwnerView) {
                if (physical === record && owner === nextOwner) return;
                metrics.put(METRIC.ARRAY_RUNTIME_BIND);
                // The retained slots survive re-binding; their borrowed values do not.
                for(let i=0;i<active.size;i++) {metrics.put(METRIC.ARRAY_CHILD_CLEAR_VISIT);clearView(active.values[i]);}
                resetArrayWithSize(active);
                retainedSource=next;items=next;physical=record;owner=nextOwner;ownerView=nextOwnerView;
            },
            clear() {
                metrics.put(METRIC.ARRAY_RUNTIME_CLEAR);
                items=undefined;physical=undefined;owner=undefined;ownerView=undefined;
                for(let i=0;i<active.size;i++) {metrics.put(METRIC.ARRAY_CHILD_CLEAR_VISIT);clearView(active.values[i]);}
                resetArrayWithSize(active);
            }
        };
    }


    /** Small fixed-position scalar arrays use native indexing. Each child carries an immutable occurrence
     * descriptor; the only per-lease write is to the common borrowed binding. */
    function makeSharedFixedArray(node:ArrayMember<R,D,P>,source:SharedFixedSource<R>):ArrayRuntime<R> {
        const lease:SharedLease={record:undefined};
        const elements:BoundView<R>[]=[];
        const count=source.length();
        for(let index=0;index<count;index++) {
            const child=createView(node.schema,false);
            child[REPRESENTATION]=source.sharedElement(index,lease);
            child[SHARED_LEASE]=lease;
            child[VIA]=node.name;
            child[INDEX]=index;
            elements.push(child);
        }
        const view=Object.freeze(elements.slice()) as unknown as ProjectedArray<unknown>;
        let owner:R|undefined;
        let retained:ProjectedArraySource<R>=source;
        return {
            name:node.label,view,elements,
            source(){return retained;},
            isBoundTo(record,nextOwner){return lease.record===record && owner===nextOwner;},
            bind(next,record,nextOwner,_ownerView){
                if(next!==source || !isSharedFixedSource(next))
                    throw new Error("Fixed array provider identity changed");
                metrics.put(METRIC.ARRAY_RUNTIME_BIND);
                retained=next;owner=nextOwner;lease.record=record;
            },
            clear(){metrics.put(METRIC.ARRAY_RUNTIME_CLEAR);lease.record=undefined;owner=undefined;}
        };
    }

    /** ODO fast path: one borrowed binding and count, with stable child views.
     * The visible native array is resized, but its permanent children are never
     * recreated or rebound.  Truncation removes visible slots only. */
    function makeSharedOdoArray(node:ArrayMember<R,D,P>,source:SharedOdoSource<R>):ArrayRuntime<R> {
        const lease:SharedLease={record:undefined,activeCount:0};
        const elements:BoundView<R>[]=[];
        const capacity=source.sharedOdoCapacity();
        for(let index=0;index<capacity;index++) {
            const child=createView(node.schema,false);
            child[REPRESENTATION]=source.sharedOdoElement(index,lease);
            child[SHARED_LEASE]=lease;
            child[VIA]=node.name;
            child[INDEX]=index;
            elements.push(child);
        }
        const visible:BoundView<R>[]=[];
        let owner:R|undefined;
        let retained:ProjectedArraySource<R>=source;
        return {
            name:node.label,view:visible as ProjectedArray<unknown>,elements,
            source(){return retained;},
            isBoundTo(record,nextOwner){return lease.record===record && owner===nextOwner;},
            bind(next,record,nextOwner,_ownerView){
                if(next!==source || !isSharedOdoSource(next))
                    throw new Error("ODO array provider identity changed");
                // Calculate the active count exactly once per record binding.
                // Do not publish the new lease until its controller is valid.
                const active=next.length();
                if(!Number.isSafeInteger(active)||active<0||active>capacity)
                    throw new RangeError(`ODO count ${active} outside 0..${capacity}`);
                metrics.put(METRIC.ARRAY_RUNTIME_BIND);
                const current=visible.length;
                if(active<current) visible.length=active;
                else for(let index=current;index<active;index++) visible[index]=elements[index];
                retained=next;owner=nextOwner;
                lease.activeCount=active;
                lease.record=record;
            },
            clear(){
                metrics.put(METRIC.ARRAY_RUNTIME_CLEAR);
                lease.record=undefined;
                lease.activeCount=0;
                owner=undefined;
            }
        };
    }

    function bindView(view:BoundView<R>, representation:R,record:ProjectionPhysicalRecord,
                      parent?:BoundView<R>,via?:string,index?:number) {
        metrics.put(METRIC.PROJECTION_BIND);
        view[REPRESENTATION]=representation;
        view[SAVED]=representation;
        view[PARENT]=parent;view[VIA]=via;view[INDEX]=index;
        view[PHYSICAL_RECORD]=record;
    }

    /** Hot-path array rebinding: [VIA] and [INDEX] were set when the slot was allocated. */
    function bindArrayChild(view:BoundView<R>, representation:R,record:ProjectionPhysicalRecord,
                            parent:BoundView<R> | undefined) {
        metrics.put(METRIC.PROJECTION_BIND);
        view[REPRESENTATION]=representation;
        view[SAVED]=representation;
        view[PARENT]=parent;
        view[PHYSICAL_RECORD]=record;
    }

    function clearView(view:BoundView<R>) {
        metrics.put(METRIC.PROJECTION_CLEAR);
        if (view[ROOT] && view[PHYSICAL_RECORD]) {
            const state=optionalRootArrayCache(view[PHYSICAL_RECORD]);
            if (state) for (const array of state.values()) {metrics.put(METRIC.PROJECTION_CLEAR_ROOT_ARRAY_VISIT);(array as ArrayRuntime<R>).clear();}
        }
        for (const array of view[ARRAYS].values()) {metrics.put(METRIC.PROJECTION_CLEAR_NESTED_ARRAY_VISIT);array.clear();}
        for (const object of view[OBJECTS].values()) {metrics.put(METRIC.PROJECTION_CLEAR_OBJECT_VISIT);clearView(object);}
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
    const lease=view[SHARED_LEASE];
    const record=lease?.record ?? view[PHYSICAL_RECORD];
    if (!record) throw new Error("Projection is not bound to a record");
    if(lease?.activeCount!==undefined && view[INDEX]!==undefined && view[INDEX]>=lease.activeCount)
        throw new RangeError(`ODO occurrence ${view[INDEX]} is not active (count ${lease.activeCount})`);
    return record;
}
function compileTree<R,D,P>(parser:Parser<R,D,P>, details:D, context:PhysicalRecordContext|undefined,
                          definition:ProjectionAuthoring, metrics:IPutMetrics, parentName="root", parentPath?:P):Compiled<R,D,P> {
    return Object.entries(definition).map(([name,node]):CompiledMember<R,D,P> => {
        const field = {type:node.type,path:node.path ?? [name]} as ProjectionField;
        metrics.put(METRIC.PROJECTION_PATH_COMPILE);
        const path=parser.compileProjectionPath(details,context,field.path,parentPath);
        if (node.type === "array") return {kind:"array",name,label:`${parentName}.${name}`,path,original:field,
            schema:compileTree(parser,details,context,node.element,metrics,`${parentName}.${name}`,path)};
        if (node.type === "object") return {kind:"object",name,path,original:field,
            schema:compileTree(parser,details,context,node.fields,metrics,`${parentName}.${name}`,path)};
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
