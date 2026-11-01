import {type IPutMetrics,METRIC} from "@cobol-ts/metrics";
import {createArrayWithSize, resetArrayWithSize, appendArrayWithSize, type ArrayWithSize} from "@cobol-ts/arrays";
import type {CompiledCobolElementary, CompiledCobolGroup} from "@cobol-ts/layout";

/** Physical bit boundaries. One table declaration may occur within many enclosing indexes. */
export type OdoPositionBranch = {
    readonly starts: ArrayWithSize<number>;
    readonly children: (OdoPositionBranch | undefined)[];
    /** Dense prefix of child branches used this lease; indexed slots stay sparse. */
    readonly activeChildren:ArrayWithSize<OdoPositionBranch>;
    active:boolean;
};
export type OdoPositionCache = Map<CompiledCobolElementary | CompiledCobolGroup, OdoPositionBranch>;
const branch = ():OdoPositionBranch => ({starts:createArrayWithSize<number>(),children:[],activeChildren:createArrayWithSize<OdoPositionBranch>(),active:false});

/** Lazy jagged array: a distinct prefix cache for each enclosing occurrence selection. */
export function positionBranch(cache:OdoPositionCache, node:CompiledCobolElementary | CompiledCobolGroup,
                               enclosing:readonly number[],metrics?:IPutMetrics):OdoPositionBranch {
    metrics?.put(METRIC.COBOL_ODO_BRANCH);
    let current:OdoPositionBranch=cache.get(node) ?? branch();
    if(!cache.has(node)) cache.set(node,current);
    for(const index of enclosing){
        metrics?.put(METRIC.COBOL_ODO_BRANCH_STEP);
        if(!Number.isSafeInteger(index)||index<0) throw new RangeError(`Invalid enclosing OCCURS index ${index}`);
        let child:OdoPositionBranch|undefined=current.children[index];
        if(!child){child=branch();current.children[index]=child;}
        if(!child.active) {appendArrayWithSize(current.activeChildren,child);child.active=true;}
        current=child;
    }
    return current;
}

/** Discover only the boundaries through `index`, reusing earlier results. */
export function occurrenceBoundary(branch:OdoPositionBranch, originBits:number, index:number,
                                   sizeOf:(index:number)=>number,metrics?:IPutMetrics):number {
    if(!Number.isSafeInteger(index)||index<0) throw new RangeError(`Invalid occurrence boundary index ${index}`);
    const starts=branch.starts;
    if(starts.size===0) appendArrayWithSize(starts,originBits);
    else if(starts.values[0]!==originBits) throw new Error("ODO boundary cache used with a different table origin in the same record");
    while(starts.size<=index){
        metrics?.put(METRIC.COBOL_ODO_BOUNDARY_CALCULATE);
        const previous=starts.size-1;
        const extent=sizeOf(previous);
        if(!Number.isSafeInteger(extent)||extent<0) throw new RangeError(`Invalid ODO occurrence extent ${extent}`);
        appendArrayWithSize(starts,starts.values[previous]+extent);
    }
    return starts.values[index];
}

/** Invalidate the active boundaries on close but retain arrays and nested cache objects. */
function cleanBranch(current:OdoPositionBranch,metrics?:IPutMetrics):void {
    metrics?.put(METRIC.COBOL_ODO_CLEAN_BRANCH);
    // Reset is O(1); no cached start is visited by cleanup.
    metrics?.put(METRIC.COBOL_ODO_CLEAN_START_RESET);
    resetArrayWithSize(current.starts);
    for(let i=0;i<current.activeChildren.size;i++){metrics?.put(METRIC.COBOL_ODO_CLEAN_CHILD_VISIT);cleanBranch(current.activeChildren.values[i],metrics); }
    resetArrayWithSize(current.activeChildren);
    current.active=false;
}

export function cleanOdoPositions(cache:OdoPositionCache,metrics?:IPutMetrics):void {
    for(const current of cache.values()){metrics?.put(METRIC.COBOL_ODO_CLEAN_ROOT);cleanBranch(current,metrics);}
}
