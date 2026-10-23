import type {CompiledCobolElementary,CompiledCobolGroup} from "@cobol-ts/layout";
import type {ProjectionPhysicalRecord} from "@cobol-ts/cursor-loader-types";
import {evaluateStorageSize, resolveDependingOnCount, type ResolvePath, type StorageSizeExpression} from "@cobol-ts/size";
import {valueOrThrow} from "@cobol-ts/errors";
import {locateCobolEntry} from "@cobol-ts/layout";
import {findCobolName,type CobolNameIndex} from "./cobol.layout.index";
import {occurrenceBoundary,positionBranch,type OdoPositionCache} from "./cobol.odo.positions";
import {findOccursClause} from "./cobol.occurs.clause";

export type CobolNamedNode=CompiledCobolElementary|CompiledCobolGroup;
export type CobolSymbolicStep=Readonly<{node:CobolNamedNode; index?:number}>;
export type CobolSymbolicPath=Readonly<{
    symbolic:true;
    node:CobolNamedNode;
    fullPath:readonly (string|number)[];
    steps:readonly CobolSymbolicStep[];
    /** Entries remaining after an enclosing projected group has been selected. */
    relativeSteps:readonly CobolSymbolicStep[];
}>;

export type CobolSymbolicView=Readonly<{
    physical:ProjectionPhysicalRecord;
    /** Absolute bit coordinates within the current logical record. */
    originBits:number;
    endBits?:number;
    /** Selected enclosing OCCURS indexes, from outermost to innermost. */
    enclosingIndices:readonly number[];
}>;

export type CobolControllerLocation = Readonly<{offsetBits:number;sizeBits:number}>;
export type CobolGeometryDetails=Readonly<{
    layout:readonly import("@cobol-ts/layout").CompiledCobolEntry[];
    /** Immutable controller geometry, memoised by compiled literal path identity. */
    controllerLocations?:WeakMap<readonly (string|number)[],CobolControllerLocation>;
}>;

export function compileCobolSymbolicPath(
    names:CobolNameIndex, fullPath:readonly (string|number)[],
    parent?:{fullPath:readonly (string|number)[];steps?:readonly CobolSymbolicStep[]}
):CobolSymbolicPath {
    let scope=names;
    const steps:CobolSymbolicStep[]=[];
    for(let i=0;i<fullPath.length;i++) {
        const name=fullPath[i];
        if(typeof name!=="string") throw new Error(`Unexpected OCCURS index ${name} in ${fullPath.join(".")}`);
        const named=findCobolName(scope,name);
        if(!named) throw new Error(`Unknown COBOL declaration '${name}' in ${fullPath.join(".")}`);
        const occurs=findOccursClause(named.node.source.clauses);
        const next=fullPath[i+1];
        if(typeof next==="number" && !occurs) throw new Error(`Unexpected index after '${name}'`);
        if(occurs?.kind==="occurs" && typeof next==="number") {
            if(!Number.isSafeInteger(next)||next<0) throw new RangeError(`Invalid OCCURS index ${next}`);
            if("count" in occurs && next>=occurs.count) throw new RangeError(`OCCURS index ${next} outside 0..${occurs.count-1}`);
            steps.push({node:named.node,index:next});i++;
        } else steps.push({node:named.node});
        scope=named.children;
    }
    if(!steps.length) throw new Error("COBOL projection path cannot be empty");
    const prefix=parent?.fullPath ?? [];
    for(let i=0;i<prefix.length;i++)
        if(prefix[i]!==fullPath[i]) throw new Error("Invalid enclosing COBOL projection path");
    let inherited=0;
    if(parent) for(const part of parent.fullPath) if(typeof part==="string") inherited++;
    return {symbolic:true,node:steps[steps.length-1].node,fullPath,steps,relativeSteps:steps.slice(inherited)};
}

const rangeEnd=(record:ProjectionPhysicalRecord):number=>(record.endByte-record.startByte)*8;
export const rootSymbolicView=(physical:ProjectionPhysicalRecord):CobolSymbolicView=>({
    physical,originBits:0,endBits:rangeEnd(physical),enclosingIndices:[]
});

/** Only the controller codec needed by the first ODO milestone: unsigned DISPLAY digits. */
export function resolveCobolCount(details:CobolGeometryDetails,record:ProjectionPhysicalRecord,path:readonly (string|number)[]):number {
        // Controller *position* is immutable for this source. Its value is
        // still read from the current physical record on every request.
        let location=details.controllerLocations?.get(path);
        if(!location){
            const located=valueOrThrow(locateCobolEntry(details.layout,path,()=>{
                throw new Error(`Nested or variably located ODO controller is not supported: ${path.join(".")}`);
            }));
            if(located.node.kind!=="elementary" || located.offsetBits%8!==0 || located.sizeBits%8!==0 || located.sizeBits===0)
                throw new Error(`Unsupported ODO controller storage at ${path.join(".")}`);
            location={offsetBits:located.offsetBits,sizeBits:located.sizeBits};
            details.controllerLocations?.set(path,location);
        }
        const start=record.startByte+location.offsetBits/8;
        const end=start+location.sizeBits/8;
        if(end>record.endByte) throw new RangeError(`ODO controller ${path.join(".")} exceeds record boundary`);
        let result=0;
        for(let byte=start;byte<end;byte++){
            let cursor=byte;
            let digit:number|undefined;
            for(const buffer of record.buffers){
                if(cursor<buffer.length){digit=buffer[cursor];break;}
                cursor-=buffer.length;
            }
            if(digit===undefined || digit<0xf0 || digit>0xf9)
                throw new Error(`Invalid unsigned DISPLAY ODO controller digit at ${path.join(".")}`);
            result=result*10+(digit-0xf0);
            if(!Number.isSafeInteger(result)) throw new Error(`ODO controller value overflows safe integer at ${path.join(".")}`);
        }
        return result;
}

export function cobolCountResolver(details:CobolGeometryDetails,record:ProjectionPhysicalRecord):ResolvePath {
    return path=>resolveCobolCount(details,record,path);
}

function evalBits(expression:StorageSizeExpression,resolve:ResolvePath,enclosingIndices:readonly number[]):number {
    return evaluateStorageSize(expression,resolve,enclosingIndices);
}
function repeatedBody(node:CobolNamedNode):StorageSizeExpression {
    const occurs=findOccursClause(node.source.clauses);
    if(occurs?.kind!=="occurs") return node.size;
    if(typeof node.size==="number") {
        if(!("count" in occurs) || occurs.count===0) throw new Error("Invalid OCCURS constant body extent");
        return node.size/occurs.count;
    }
    if(node.size.kind==="occurs" || node.size.kind==="depending-on") return node.size.expression;
    throw new Error("Unsupported OCCURS size expression");
}

export function activeCount(node:CobolNamedNode,resolve:ResolvePath,enclosingIndices:readonly number[]=[]):number {
    const occurs=findOccursClause(node.source.clauses);
    if(occurs?.kind!=="occurs") throw new Error("Selected COBOL array has no OCCURS clause");
    if("count" in occurs) return occurs.count;
    if(typeof node.size==="number"||node.size.kind!=="depending-on") throw new Error("Expected ODO expression");
    const count=resolveDependingOnCount(node.size.path,resolve,enclosingIndices);
    if(count<occurs.min||count>occurs.max)
        throw new RangeError(`ODO count ${count} outside declared bounds ${occurs.min}..${occurs.max}`);
    return count;
}

/** Scratch storage belongs to one pooled COBOL record. No intermediate view is
 * needed to walk a compiled path; only selected children retain a view. */
export type MutableSymbolicView = {
    physical:ProjectionPhysicalRecord;
    originBits:number;
    endBits?:number;
    enclosingIndices:number[];
};

/** Locate an occurrence without constructing a selected representation. */
function setOccurrencePosition(
    result:MutableSymbolicView,physical:ProjectionPhysicalRecord,tableOriginBits:number,
    enclosingIndices:readonly number[],node:CobolNamedNode,index:number,resolve:ResolvePath,
    validated=false
):void {
    if(!validated){
        const count=activeCount(node,resolve,enclosingIndices);
        if(!Number.isSafeInteger(index)||index<0||index>=count)
            throw new RangeError(`OCCURS index ${index} outside 0..${count-1}`);
    }
    const body=repeatedBody(node);
    if(typeof body==="number"){
        result.originBits=tableOriginBits+index*body;
        result.endBits=result.originBits+body;
        return;
    }
    const state=physical.recordState as {odoPositions?:OdoPositionCache}|undefined;
    if(!state?.odoPositions) throw new Error("COBOL ODO position cache missing from physical record state");
    const cache=positionBranch(state.odoPositions,node,enclosingIndices);
    // Crucially, on an established prefix *no callback or working index array*
    // is constructed. Only extending the prefix needs the expression evaluator.
    if(cache.starts.size>index+1) {
        if(cache.starts.values[0]!==tableOriginBits)
            throw new Error("ODO boundary cache used with a different table origin in the same record");
    } else {
        const indices=[...enclosingIndices,0];
        const coordinate=indices.length-1;
        occurrenceBoundary(cache,tableOriginBits,index+1,previous=>{
            indices[coordinate]=previous;
            return evalBits(body,resolve,indices);
        });
    }
    result.originBits=cache.starts.values[index];
    result.endBits=cache.starts.values[index+1];
}

/** Traverse compiled geometry using numeric working variables, not a chain
 * of ephemeral CobolSymbolicView objects. The destination is caller-owned:
 * persistent for a projected child, or reusable scratch for a scalar read. */
export function selectSymbolicInto(
    parent:CobolSymbolicView,path:CobolSymbolicPath,resolve:ResolvePath,
    occurrenceIndices:readonly number[],result:MutableSymbolicView
):void {
    if(result===parent) throw new Error("Cannot overwrite an enclosing COBOL selection");
    let origin=parent.originBits;
    let end=parent.endBits;
    let usedIndices=0;
    const indices=result.enclosingIndices;
    indices.length=0;
    for(const index of parent.enclosingIndices) indices.push(index);
    for(let position=0;position<path.relativeSteps.length;position++){
        const step=path.relativeSteps[position];
        const node=step.node;
        if(position===0 && path.steps[0]===step){
            if(node.leftOffset!==0) throw new Error("COBOL root must begin at record origin");
            continue;
        }
        const size=node.size;
        let start:number;
        if(typeof node.leftOffset==="number") start=origin+node.leftOffset;
        else if(typeof node.rightOffset==="number" && end!==undefined)
            start=end-node.rightOffset-evalBits(size,resolve,indices);
        else start=origin+evalBits(node.leftOffset,resolve,indices);

        let bodySize:number|undefined=typeof size==="number"?size:undefined;
        const occurs=findOccursClause(node.source.clauses);
        const index=step.index ?? (occurs && usedIndices<occurrenceIndices.length
            ? occurrenceIndices[usedIndices++] : undefined);
        if(occurs?.kind==="occurs" && index===undefined && position<path.relativeSteps.length-1)
            throw new Error("Missing COBOL occurrence index before a child field");
        if(occurs?.kind==="occurs" && index!==undefined){
            const count=activeCount(node,resolve,indices);
            if(!Number.isSafeInteger(index)||index<0||index>=count)
                throw new RangeError(`OCCURS index ${index} outside 0..${count-1}`);
            setOccurrencePosition(result,parent.physical,start,indices,node,index,resolve,true);
            start=result.originBits;
            bodySize=result.endBits===undefined?undefined:result.endBits-start;
        }
        const rightEnd=typeof node.rightOffset==="number" && end!==undefined
            ? end-node.rightOffset : undefined;
        const nextEnd=occurs?.kind==="occurs" && index!==undefined
            ? (bodySize===undefined?undefined:start+bodySize)
            : (rightEnd ?? (bodySize===undefined?undefined:start+bodySize));
        origin=start;
        end=nextEnd;
        if(index!==undefined) indices.push(index);
    }
    if(usedIndices!==occurrenceIndices.length)
        throw new Error(`Expected ${usedIndices} COBOL occurrence indexes, got ${occurrenceIndices.length}`);
    result.physical=parent.physical;
    result.originBits=origin;
    result.endBits=end;
}

export function selectSymbolic(
    parent:CobolSymbolicView,path:CobolSymbolicPath,resolve:ResolvePath,
    occurrenceIndices:readonly number[]=[]
):CobolSymbolicView {
    const selected:MutableSymbolicView={physical:parent.physical,originBits:0,enclosingIndices:[]};
    selectSymbolicInto(parent,path,resolve,occurrenceIndices,selected);
    return selected;
}

/** A selected projected-array child legitimately retains its own view.
 * No temporary working views are needed to locate its occurrence. */
/** Rebind a retained occurrence selection, without allocating an index array. */
export function singleDepthOccurrenceInto(
    view:CobolSymbolicView,node:CobolNamedNode,index:number,resolve:ResolvePath,
    result:MutableSymbolicView
):void {
    if(result===view) throw new Error("Cannot overwrite an enclosing COBOL occurrence");
    const indices=result.enclosingIndices;
    indices.length=0;
    for(const outer of view.enclosingIndices) indices.push(outer);
    indices.push(index);
    setOccurrencePosition(result,view.physical,view.originBits,view.enclosingIndices,node,index,resolve);
    result.physical=view.physical;
}

export function singleDepthOccurrence(
    view:CobolSymbolicView,node:CobolNamedNode,index:number,resolve:ResolvePath
):CobolSymbolicView {
    const selected:MutableSymbolicView={physical:view.physical,originBits:0,enclosingIndices:[]};
    singleDepthOccurrenceInto(view,node,index,resolve,selected);
    return selected;
}
