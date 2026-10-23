import type {CompiledCobolElementary,CompiledCobolGroup} from "@cobol-ts/layout";
import type {ProjectionPhysicalRecord} from "@cobol-ts/cursor-loader-types";
import {evaluateStorageSize, resolveDependingOnCount, type ResolvePath, type StorageSizeExpression} from "@cobol-ts/size";
import {valueOrThrow} from "@cobol-ts/errors";
import {locateCobolEntry} from "@cobol-ts/layout";
import {findCobolName,type CobolNameIndex} from "./cobol.layout.index";

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

export type CobolGeometryDetails=Readonly<{layout:readonly import("@cobol-ts/layout").CompiledCobolEntry[]}>;

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
        const occurs=named.node.source.clauses.find(c=>c.kind==="occurs");
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
    if(prefix.some((x,i)=>x!==fullPath[i])) throw new Error("Invalid enclosing COBOL projection path");
    const inherited=parent ? parent.fullPath.filter(part=>typeof part==="string").length : 0;
    return {symbolic:true,node:steps[steps.length-1].node,fullPath,steps,relativeSteps:steps.slice(inherited)};
}

const rangeEnd=(record:ProjectionPhysicalRecord):number=>(record.endByte-record.startByte)*8;
export const rootSymbolicView=(physical:ProjectionPhysicalRecord):CobolSymbolicView=>({
    physical,originBits:0,endBits:rangeEnd(physical),enclosingIndices:[]
});

/** Only the controller codec needed by the first ODO milestone: unsigned DISPLAY digits. */
export function cobolCountResolver(details:CobolGeometryDetails,record:ProjectionPhysicalRecord):ResolvePath {
    return path=>{
        // Controllers for this first milestone have independently fixed locations.
        const located=valueOrThrow(locateCobolEntry(details.layout,path,()=>{
            throw new Error(`Nested or variably located ODO controller is not supported: ${path.join(".")}`);
        }));
        if(located.node.kind!=="elementary" || located.offsetBits%8!==0 || located.sizeBits%8!==0 || located.sizeBits===0) {
            throw new Error(`Unsupported ODO controller storage at ${path.join(".")}`);
        }
        const start=record.startByte+located.offsetBits/8;
        const end=start+located.sizeBits/8;
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
    };
}

function evalBits(expression:StorageSizeExpression,resolve:ResolvePath,enclosingIndices:readonly number[]):number {
    return evaluateStorageSize(expression,resolve,enclosingIndices);
}
function repeatedBody(node:CobolNamedNode):StorageSizeExpression {
    const occurs=node.source.clauses.find(c=>c.kind==="occurs");
    if(occurs?.kind!=="occurs") return node.size;
    if(typeof node.size==="number") {
        if(!("count" in occurs) || occurs.count===0) throw new Error("Invalid OCCURS constant body extent");
        return node.size/occurs.count;
    }
    if(node.size.kind==="occurs" || node.size.kind==="depending-on") return node.size.expression;
    throw new Error("Unsupported OCCURS size expression");
}

export function activeCount(node:CobolNamedNode,resolve:ResolvePath,enclosingIndices:readonly number[]=[]):number {
    const occurs=node.source.clauses.find(c=>c.kind==="occurs");
    if(occurs?.kind!=="occurs") throw new Error("Selected COBOL array has no OCCURS clause");
    if("count" in occurs) return occurs.count;
    if(typeof node.size==="number"||node.size.kind!=="depending-on") throw new Error("Expected ODO expression");
    const count=resolveDependingOnCount(node.size.path,resolve,enclosingIndices);
    if(count<occurs.min||count>occurs.max)
        throw new RangeError(`ODO count ${count} outside declared bounds ${occurs.min}..${occurs.max}`);
    return count;
}

export function selectSymbolic(
    parent:CobolSymbolicView,path:CobolSymbolicPath,resolve:ResolvePath,
    occurrenceIndices:readonly number[]=[]
):CobolSymbolicView {
    let position=0;
    let usedIndices=0;
    let view=parent;
    for(const step of path.relativeSteps){
        const node=step.node;
        // The root 01 declaration identifies the already-framed record. Its
        // symbolic size must not be evaluated simply to select a child.
        if(position===0 && path.steps[0]===step) {
            if(node.leftOffset!==0) throw new Error("COBOL root must begin at record origin");
            position++;continue;
        }
        const size= node.size;
        let start:number;
        if(typeof node.leftOffset==="number") {
            start=view.originBits+node.leftOffset;
        } else if(typeof node.rightOffset==="number" && view.endBits!==undefined) {
            // Prefer right anchoring when the left needs an ODO count.
            start=view.endBits-node.rightOffset-evalBits(size,resolve,view.enclosingIndices);
        } else {
            start=view.originBits+evalBits(node.leftOffset,resolve,view.enclosingIndices);
        }
        let bodySize: number|undefined=typeof size==="number"?size:undefined;
        const occurs=node.source.clauses.find(c=>c.kind==="occurs");
        const index=step.index ?? (occurs && usedIndices<occurrenceIndices.length
            ? occurrenceIndices[usedIndices++] : undefined);
        if(occurs?.kind==="occurs" && index===undefined && position<path.relativeSteps.length-1)
            throw new Error("Missing COBOL occurrence index before a child field");
        if(occurs?.kind==="occurs" && index!==undefined) {
            const count=activeCount(node,resolve,view.enclosingIndices);
            if(!Number.isSafeInteger(index)||index<0||index>=count) throw new RangeError(`OCCURS index ${index} outside 0..${count-1}`);
            const body=repeatedBody(node);
            if(typeof body!=="number") throw new Error("Variable occurrence body requires nested ODO boundary resolution");
            start+=index*body;
            bodySize=body;
        }
        // An independently known right suffix also supplies the *end* of a
        // variable-sized group, even when its left start was selected first.
        const rightEnd = typeof node.rightOffset==="number" && view.endBits!==undefined
            ? view.endBits-node.rightOffset : undefined;
        const end = occurs?.kind==="occurs" && index!==undefined
            ? (bodySize===undefined?undefined:start+bodySize)
            : (rightEnd ?? (bodySize===undefined?undefined:start+bodySize));
        view={physical:parent.physical,originBits:start,endBits:end,
            enclosingIndices:index===undefined?view.enclosingIndices:[...view.enclosingIndices,index]};
        position++;
    }
    if(usedIndices!==occurrenceIndices.length)
        throw new Error(`Expected ${usedIndices} COBOL occurrence indexes, got ${occurrenceIndices.length}`);
    return view;
}

export function singleDepthOccurrence(
    view:CobolSymbolicView,node:CobolNamedNode,index:number,resolve:ResolvePath
):CobolSymbolicView {
    const count=activeCount(node,resolve,view.enclosingIndices);
    if(!Number.isSafeInteger(index)||index<0||index>=count) throw new RangeError(`OCCURS index ${index} outside 0..${count-1}`);
    const body=repeatedBody(node);
    if(typeof body!=="number") throw new Error("Variable occurrence body requires nested ODO boundary resolution");
    const originBits=view.originBits+index*body;
    return {physical:view.physical,originBits,endBits:originBits+body,
        enclosingIndices:[...view.enclosingIndices,index]};
}
