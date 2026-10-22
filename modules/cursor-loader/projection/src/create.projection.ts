import {
    type CanonicalProjection, type PhysicalRecordContext,
    type PhysicalRecordDebugRenderer, type ProjectionDefinition,
    type ProjectionFactory, type ProjectionField, type ProjectionPhysicalRecord,
    type ProjectionSupport, type ProjectionAuthoring, type ProjectionRecordState
} from "@cobol-ts/cursor-loader-types";
import {createProjectedArray, type ProjectedArray} from "@cobol-ts/arrays";
import {canonicalProjection} from "./projection.definition";

const REPRESENTATION = Symbol("projectionRepresentation");
const PHYSICAL_RECORD = Symbol("projectionPhysicalRecord");
const ARRAYS = Symbol("projectionArrays");
const OBJECTS = Symbol("projectionObjects");
const ROOT = Symbol("rootProjection");

type Parser<R,D,P> = ProjectionSupport<R,D,P> & PhysicalRecordDebugRenderer;
type BoundView<R> = {
    [REPRESENTATION]: R | undefined;
    [PHYSICAL_RECORD]: ProjectionPhysicalRecord | undefined;
    [ARRAYS]: Map<object, ArrayRuntime<R>>;
    [OBJECTS]: Map<object, BoundView<R>>;
    [ROOT]: boolean;
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
    bind(items: readonly R[], record: ProjectionPhysicalRecord): void;
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
            [ROOT]:root
        };
        for (const node of nodes) {
            if (node.kind === "scalar") {
                Object.defineProperty(view,node.name,{value:node.accessor,enumerable:true});
            } else if (node.kind === "object") {
                Object.defineProperty(view,node.name,{enumerable:true,get() {
                    const record = requireRecord(view);
                    try {
                        if (!parser.object) throw new Error("Parser does not support nested object projections");
                        const selected = parser.object(view[REPRESENTATION] as R,details,node.path);
                        let child = view[OBJECTS].get(node);
                        if (!child) { child = createView(node.schema,false);view[OBJECTS].set(node,child); }
                        if (child[PHYSICAL_RECORD] !== record || child[REPRESENTATION] !== selected) {
                            clearView(child);
                            bindView(child,selected,record);
                        }
                        return child;
                    } catch (e) {throw diagnostic(parser,record,node.original,e);}
                }});
            } else {
                Object.defineProperty(view,node.name,{enumerable:true,get() {
                    const record = requireRecord(view);
                    try {
                        if (!parser.array) throw new Error("Parser does not support projected arrays");
                        const selected = parser.array(view[REPRESENTATION] as R,details,node.path);
                        const cache = view[ROOT] ? rootArrayCache(record) : view[ARRAYS];
                        let runtime = cache.get(node) as ArrayRuntime<R> | undefined;
                        if (!runtime) {
                            runtime = makeArray(node);
                            cache.set(node,runtime);
                        }
                        runtime.bind(selected,record);
                        return runtime.view;
                    } catch(e) {throw diagnostic(parser,record,node.original,e);}
                }});
            }
        }
        return view;
    }

    function makeArray(node:ArrayMember<R,D,P>):ArrayRuntime<R> {
        const elements:BoundView<R>[] = [];
        let items:readonly R[] | undefined;
        let physical:ProjectionPhysicalRecord | undefined;
        const view = createProjectedArray({
            length: () => items?.length ?? 0,
            element(index) {
                if (!items || !physical) throw new Error("Projected array is not bound");
                let child=elements[index];
                if (!child) {child=createView(node.schema,false);elements[index]=child;}
                if (child[PHYSICAL_RECORD] !== physical || child[REPRESENTATION] !== items[index]) {
                    clearView(child);
                    bindView(child,items[index],physical);
                }
                return child;
            }
        });
        return {
            name:node.label, view,elements,
            bind(next,record) {
                if (items === next && physical === record) return;
                // The retained slots survive re-binding; their borrowed values do not.
                for (const element of elements) if (element) clearView(element);
                items=next;physical=record;
            },
            clear() {
                items=undefined;physical=undefined;
                for (const element of elements) if (element) clearView(element);
            }
        };
    }

    function bindView(view:BoundView<R>, representation:R,record:ProjectionPhysicalRecord) {
        view[REPRESENTATION]=representation;
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
                          definition:ProjectionAuthoring, parentName="root"):Compiled<R,D,P> {
    return Object.entries(definition).map(([name,node]):CompiledMember<R,D,P> => {
        const field = {type:node.type,path:node.path ?? [name]} as ProjectionField;
        const path=parser.compileProjectionPath(details,context,field.path);
        if (node.type === "array") return {kind:"array",name,label:`${parentName}.${name}`,path,original:field,
            schema:compileTree(parser,details,context,node.element,`${parentName}.${name}`)};
        if (node.type === "object") return {kind:"object",name,path,original:field,
            schema:compileTree(parser,details,context,node.fields,`${parentName}.${name}`)};
        const kind=node.type;
        return {kind:"scalar",name,accessor:function(this:BoundView<R>,...indices:number[]) {
            const record=requireRecord(this);
            try {return parser[kind](this[REPRESENTATION] as R,details,path,...indices);}
            catch(e) {throw diagnostic(parser,record,field,e);}
        }};
    });
}
function diagnostic(parser:PhysicalRecordDebugRenderer,record:ProjectionPhysicalRecord,
                    field:ProjectionField,error:unknown):Error {
    const reason=error instanceof Error ? error.message:String(error);
    const path=field.path.length ? field.path.join("."):"<root>";
    return new Error(`${record.source}: record ${record.recordNumber}: projection ${path}: ${reason}\n`
        +parser.toDebugString(record,record.startByte,record.endByte));
}
