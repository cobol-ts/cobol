import {type IPutMetrics,NULL_METRICS,METRIC} from "@cobol-ts/metrics";
import type {ProjectionPhysicalRecord} from "@cobol-ts/cursor-loader-types";
import type {ProjectedArraySource} from "@cobol-ts/arrays";
import type {ResolvePath} from "@cobol-ts/size";
import {hasOccursClause} from "./cobol.occurs.clause";
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
    }

    length():number {
        this.metrics.put(METRIC.COBOL_ARRAY_PROVIDER_LENGTH);
        if(!this.record) throw new Error("COBOL projected array is not bound");
        return activeCount(this.path.node,this.resolver!,this.table!.enclosingIndices);
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
