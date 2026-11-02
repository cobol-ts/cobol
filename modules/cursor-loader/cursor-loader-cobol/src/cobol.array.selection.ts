import {type IPutMetrics,NULL_METRICS,METRIC} from "@cobol-ts/metrics";
import type {ProjectionPhysicalRecord} from "@cobol-ts/cursor-loader-types";
import type {ProjectedArraySource} from "@cobol-ts/arrays";
import type {ResolvePath} from "@cobol-ts/size";
import {findOccursClause,hasOccursClause} from "./cobol.occurs.clause";
import {activeCount,selectSymbolicInto,singleDepthOccurrenceInto,type CobolSymbolicPath,type MutableSymbolicView} from "./cobol.projection.symbolic";
import type {CobolFixedProjectionPath,CobolProjectionPath} from "./cobol.projection.path";
import {physical,displacement,symbolicView,countResolver} from "./cobol.representation";
import type {CobolProjectionDetails,CobolRepresentation} from "./cobol.parser";

/** One retained provider per projected-array runtime. The path is compiled
 * once, and provider selection happens only when that runtime is created.
 * A subsequent record lease rebinds just the record-dependent state. */
interface CobolArrayProvider extends ProjectedArraySource<CobolRepresentation> {
    bind(parent:CobolRepresentation,details:CobolProjectionDetails):void;
}

export class FixedCobolArraySelection implements CobolArrayProvider {
    private record?:ProjectionPhysicalRecord;
    private base=0;
    private metrics:IPutMetrics=NULL_METRICS;
    private readonly count:number;
    private readonly strideBits:number;

    constructor(readonly path:CobolFixedProjectionPath) {
        if(path.node.kind!=="group" || path.runtimeDimensions.length!==1)
            throw new Error("COBOL projected array requires one fixed OCCURS group");
        const dimension=path.runtimeDimensions[0];
        this.count=dimension.count;
        this.strideBits=dimension.strideBits;
    }

    bind(parent:CobolRepresentation,details:CobolProjectionDetails):void {
        this.metrics=details.metrics??NULL_METRICS;
        this.metrics.put(METRIC.COBOL_ARRAY_PROVIDER_BIND);
        this.record=physical(parent);
        this.base=displacement(parent);
    }

    length():number {
        this.metrics.put(METRIC.COBOL_ARRAY_PROVIDER_LENGTH);
        if(!this.record) throw new Error("COBOL projected array is not bound");
        return this.count;
    }

    /** Experimental: create a permanent occurrence descriptor, not a copied record. */
    sharedElement(index:number, lease:{record:ProjectionPhysicalRecord|undefined}):CobolRepresentation {
        if(!Number.isSafeInteger(index)||index<0||index>=this.count)
            throw new RangeError(`OCCURS index ${index} outside 0..${this.count-1}`);
        const provider=this;
        return {
            get physical() {
                if(!lease.record) throw new Error("Projected array is not bound");
                return lease.record;
            },
            get displacementBits() {return provider.base+index*provider.strideBits;}
        };
    }

    element(index:number,reusable?:CobolRepresentation):CobolRepresentation {
        this.metrics.put(METRIC.COBOL_ARRAY_PROVIDER_ELEMENT);
        const record=this.record;
        if(!record) throw new Error("COBOL projected array is not bound");
        if(!Number.isSafeInteger(index)||index<0||index>=this.count)
            throw new RangeError(`OCCURS index ${index} outside 0..${this.count-1}`);
        const selected=reusable && "physical" in reusable && "displacementBits" in reusable
            ? reusable as {physical:ProjectionPhysicalRecord;displacementBits:number}
            : {physical:record,displacementBits:0};
        selected.physical=record;
        selected.displacementBits=this.base+index*this.strideBits;
        return selected;
    }
}

/** Symbolic arrays retain the original ODO resolution machinery and its
 * record-scoped scratch and position cache. No geometry logic is changed. */
export class SymbolicCobolArraySelection implements CobolArrayProvider {
    private record?:ProjectionPhysicalRecord;
    private resolver?:ResolvePath;
    private table?:MutableSymbolicView;
    private metrics:IPutMetrics=NULL_METRICS;
    private sharedCapacity=0;
    private sharedStrideBits=0;
    private sharedActiveCount=0;

    constructor(readonly path:CobolSymbolicPath) {
        if(path.node.kind!=="group" || !hasOccursClause(path.node.source.clauses))
            throw new Error("COBOL projected array requires an OCCURS group");
    }

    bind(parent:CobolRepresentation,details:CobolProjectionDetails):void {
        this.metrics=details.metrics??NULL_METRICS;
        this.metrics.put(METRIC.COBOL_ARRAY_PROVIDER_BIND);
        const record=physical(parent);
        const table=this.table ?? (this.table={physical:record,originBits:0,enclosingIndices:[]});
        const resolver=countResolver(details,record);
        selectSymbolicInto(symbolicView(parent),this.path,resolver,[],table);
        this.resolver=resolver;
        this.record=record;
        // Opt-in only for a root-level ODO with fixed element size and a
        // statically positioned table. Nested/symbolic layouts stay lazy.
        this.sharedCapacity=0;
        if(details.experimentalSharedOdoArrays) {
            const occurs=findOccursClause(this.path.node.source.clauses);
            const size=this.path.node.size;
            if(occurs?.kind==="occurs" && !("count" in occurs) &&
               occurs.max<=8 && occurs.max>0 &&
               typeof size!=="number" && size.kind==="depending-on" &&
               typeof size.expression==="number" &&
               this.path.relativeSteps.length===this.path.steps.length &&
               this.path.steps.every((step,index)=>
                   typeof step.node.leftOffset==="number" && step.index===undefined &&
                   (index===this.path.steps.length-1 || !hasOccursClause(step.node.source.clauses))) &&
               table.enclosingIndices.length===0) {
                this.sharedCapacity=occurs.max;
                this.sharedStrideBits=size.expression;
                this.sharedActiveCount=activeCount(this.path.node,resolver,table.enclosingIndices);
            }
        }
    }

    length():number {
        this.metrics.put(METRIC.COBOL_ARRAY_PROVIDER_LENGTH);
        if(!this.record) throw new Error("COBOL projected array is not bound");
        if(this.sharedCapacity>0) return this.sharedActiveCount;
        return activeCount(this.path.node,this.resolver!,this.table!.enclosingIndices);
    }

    /** Capability discovery is checked once at runtime construction. */
    sharedOdoCapacity():number {return this.sharedCapacity;}

    /** Stable symbolic occurrence: its location and borrowed record are
     * resolved through the current table/lease without per-child rebinding. */
    sharedOdoElement(index:number,lease:{record:ProjectionPhysicalRecord|undefined;activeCount?:number}):CobolRepresentation {
        if(!this.sharedCapacity || !Number.isSafeInteger(index) || index<0 || index>=this.sharedCapacity)
            throw new RangeError(`ODO occurrence index ${index} outside retained capacity`);
        const provider=this;
        const indices:readonly number[]=[index];
        const requireActive=()=>{
            if(!lease.record) throw new Error("Projected array is not bound");
            if(index>=(lease.activeCount??0))
                throw new RangeError(`ODO occurrence ${index} is not active (count ${lease.activeCount})`);
        };
        return {
            get physical() {requireActive();return lease.record!;},
            get originBits() {requireActive();return provider.table!.originBits+index*provider.sharedStrideBits;},
            get endBits() {requireActive();return provider.table!.originBits+(index+1)*provider.sharedStrideBits;},
            enclosingIndices:indices
        };
    }

    element(index:number,reusable?:CobolRepresentation):CobolRepresentation {
        this.metrics.put(METRIC.COBOL_ARRAY_PROVIDER_ELEMENT);
        const record=this.record;
        if(!record) throw new Error("COBOL projected array is not bound");
        const selected=reusable && "originBits" in reusable
            ? reusable as MutableSymbolicView
            : {physical:record,originBits:0,enclosingIndices:[]};
        singleDepthOccurrenceInto(this.table!,this.path.node,index,this.resolver!,selected);
        return selected;
    }
}

/** A retained source is reusable only for exactly the same compiled path.
 * This prevents mixing fixed and symbolic providers or reusing a provider
 * for unrelated array members if a caller passes the wrong reusable source. */
export function bindCobolArraySelection(
    parent:CobolRepresentation,details:CobolProjectionDetails,path:CobolProjectionPath,
    reusable?:ProjectedArraySource<CobolRepresentation>
):ProjectedArraySource<CobolRepresentation> {
    let provider:CobolArrayProvider;
    if("symbolic" in path) {
        provider=reusable instanceof SymbolicCobolArraySelection && reusable.path===path
            ? reusable : new SymbolicCobolArraySelection(path);
    } else {
        provider=reusable instanceof FixedCobolArraySelection && reusable.path===path
            ? reusable : new FixedCobolArraySelection(path);
    }
    if(provider!==reusable) details.metrics?.put(METRIC.COBOL_ARRAY_PROVIDER_CREATE);
    provider.bind(parent,details);
    return provider;
}
