import type {
    Parser, ParserPhysicalRecordContent, ProjectionPhysicalRecord,
    PhysicalRecordContext, ProjectionRecordState
} from "@cobol-ts/cursor-loader-types";
import {bytesToDebugString} from "@cobol-ts/cursor-loader-types";
import type {CompiledCobolEntry} from "@cobol-ts/layout";
import {type ErrorsOr, errors, value, flatMapErrorsOr} from "@cobol-ts/errors";
import {evaluateStorageSize} from "@cobol-ts/size";
import type {ProjectedArraySource} from "@cobol-ts/arrays";
import type {ResolvePath} from "@cobol-ts/size";
import {cleanOdoPositions,type OdoPositionCache} from "./cobol.odo.positions";
import {createCobolNameIndex, type CobolNameIndex} from "./cobol.layout.index";
import {cobolDebugRangeFromBits, cobolDebugRangeNumber, cobolDebugRangeString} from "./cobol.debug.range";
import {compileCobolMemberPath, locateCompiledCobolPath, type CobolProjectionPath} from "./cobol.projection.path";
import {activeCount,resolveCobolCount,rootSymbolicView,selectSymbolic,selectSymbolicInto,singleDepthOccurrenceInto,
    type CobolSymbolicView,type MutableSymbolicView} from "./cobol.projection.symbolic";

export type CobolProjectionDetails = Readonly<{
    layout: readonly CompiledCobolEntry[];
    names: CobolNameIndex;
    recordLengthBytes?:number;
    controllerLocations:WeakMap<readonly (string|number)[],import("./cobol.projection.symbolic").CobolControllerLocation>;
}>;
export type CobolFixedDetails = CobolProjectionDetails & Readonly<{recordLengthBytes:number}>;
/**
 * Selected occurrences borrow the same physical record. Fixed layouts retain
 * their numeric displacement, while symbolic selections carry the resolved
 * group origin and, when independently known, its right boundary.
 */
export type CobolRepresentation = ProjectionPhysicalRecord | Readonly<{
    physical: ProjectionPhysicalRecord;
    displacementBits: number;
}> | CobolSymbolicView;
type CountContext = {
    record?:ProjectionPhysicalRecord;
    details?:CobolProjectionDetails;
    readonly resolve:ResolvePath;
};
export type CobolRecordState = ProjectionRecordState & {
    readonly odoPositions:OdoPositionCache;
    readonly countContext:CountContext;
    rootScratch?:MutableSymbolicView;
    scalarScratch?:MutableSymbolicView;
    rangeScratch?:{from:number;to:number};
    fixedScratch?:{offsetBits:number;sizeBits:number};
};
export type CobolParser = Parser<CobolRepresentation, CobolProjectionDetails, CobolProjectionDetails, CobolRecordState, CobolProjectionPath>;

const physical = (view:CobolRepresentation):ProjectionPhysicalRecord =>
    "physical" in view ? view.physical : view;
const displacement = (view:CobolRepresentation):number =>
    "physical" in view && "displacementBits" in view ? view.displacementBits : 0;
/** Keep the root's record-specific boundary in reusable record-state scratch. */
function symbolicView(view:CobolRepresentation):CobolSymbolicView {
    if("originBits" in view) return view;
    const record=physical(view),state=record.recordState as CobolRecordState;
    const root=state.rootScratch ?? (state.rootScratch=rootSymbolicView(record) as MutableSymbolicView);
    root.physical=record;
    root.originBits=0;
    root.endBits=(record.endByte-record.startByte)*8;
    return root;
}
/** A stable resolver closure per pooled physical holder, rebound on each lease. */
function countResolver(details:CobolProjectionDetails,record:ProjectionPhysicalRecord):ResolvePath {
    const context=(record.recordState as CobolRecordState).countContext;
    context.details=details;
    context.record=record;
    return context.resolve;
}


/** Compile the source-scoped index and validate the initially supported FB record size. */
export function createCobolProjectionDetails(layout:readonly CompiledCobolEntry[]):ErrorsOr<CobolProjectionDetails> {
    if(layout.length!==1) return errors("COBOL projection requires exactly one 01 record layout");
    return flatMapErrorsOr(createCobolNameIndex(layout),names=>value({layout,names,controllerLocations:new WeakMap()}));
}

export function createCobolFixedDetails(layout: readonly CompiledCobolEntry[]): ErrorsOr<CobolFixedDetails> {
    if (layout.length !== 1) return errors("Fixed COBOL parser requires exactly one 01 record layout");
    return flatMapErrorsOr(createCobolNameIndex(layout), names => {
        try {
            const bits = evaluateStorageSize(layout[0].size, () => {
                throw new Error("variable-length ODO storage");
            });
            if (!Number.isSafeInteger(bits) || bits <= 0 || bits % 8 !== 0) {
                return errors("Fixed COBOL record length must be a positive whole number of bytes");
            }
            return value({layout, names, recordLengthBytes: bits / 8,controllerLocations:new WeakMap()});
        } catch (e) {
            return errors(`COBOL fixed-record framing cannot determine record size: ${e instanceof Error ? e.message : String(e)}`);
        }
    });
}

async function parse(
    record: ParserPhysicalRecordContent<CobolRecordState>,
    details: CobolProjectionDetails
): Promise<CobolRepresentation | {errors: string[]}> {
    if(details.recordLengthBytes===undefined) throw new Error("COBOL source framing is required for an ODO layout");
    const endByte = record.startByte + details.recordLengthBytes;
    while (record.lastValidByte < endByte && !record.fileFinished) {
        await record.readMore();
    }
    if (record.lastValidByte < endByte) {
        record.endByte = record.lastValidByte;
        return {errors: [`Truncated COBOL fixed record: expected ${details.recordLengthBytes} bytes, got ${record.lastValidByte - record.startByte}`]};
    }
    record.endByte = endByte;
    return record;
}

function fieldRange(representation: CobolRepresentation, details:CobolProjectionDetails, path: CobolProjectionPath, occurrenceIndices: readonly number[]) {
    if (path.node.kind !== "elementary") throw new Error("COBOL scalar projection must select an elementary field");
    const record=physical(representation);
    let offsetBits:number,sizeBits:number;
    if("symbolic" in path) {
        const state=record.recordState as CobolRecordState;
        const scratch=state.scalarScratch ?? (state.scalarScratch={physical:record,originBits:0,enclosingIndices:[]});
        selectSymbolicInto(symbolicView(representation),path,countResolver(details,record),occurrenceIndices,scratch);
        offsetBits=scratch.originBits;
        sizeBits=typeof path.node.size==="number"?path.node.size:NaN;
    } else {
        const state=record.recordState as CobolRecordState;
        const located=locateCompiledCobolPath(path,occurrenceIndices,state.fixedScratch ?? (state.fixedScratch={offsetBits:0,sizeBits:0}));
        offsetBits=located.offsetBits+displacement(representation);
        sizeBits=located.sizeBits;
    }
    const state=record.recordState as CobolRecordState;
    const range=cobolDebugRangeFromBits(offsetBits,sizeBits,state.rangeScratch ?? (state.rangeScratch={from:0,to:0}));
    if (record.startByte + range.to > record.endByte) {
        throw new RangeError("COBOL projection extends beyond the completed record");
    }
    return range;
}

/** One provider per retained projected-array runtime. Methods live on the
 * prototype; rebinding does not create a source object or closures. */
class CobolArraySelection implements ProjectedArraySource<CobolRepresentation> {
    private record?:ProjectionPhysicalRecord;
    private path?:CobolProjectionPath;
    private resolver?:ResolvePath;
    private table?:MutableSymbolicView;
    private base=0;

    bind(parent:CobolRepresentation,details:CobolProjectionDetails,path:CobolProjectionPath):void {
        const record=physical(parent);
        if("symbolic" in path) {
            if(path.node.kind!=="group" || !path.node.source.clauses.some(c=>c.kind==="occurs"))
                throw new Error("COBOL projected array requires an OCCURS group");
            const table=this.table ?? (this.table={physical:record,originBits:0,enclosingIndices:[]});
            const resolver=countResolver(details,record);
            selectSymbolicInto(symbolicView(parent),path,resolver,[],table);
            this.resolver=resolver;
        } else {
            if(path.node.kind!=="group" || path.runtimeDimensions.length!==1)
                throw new Error("COBOL projected array requires one fixed OCCURS group");
            this.base=displacement(parent);
        }
        this.record=record;
        this.path=path;
    }
    length():number {
        const path=this.path;
        if(!path) throw new Error("COBOL projected array is not bound");
        if("symbolic" in path) return activeCount(path.node,this.resolver!,this.table!.enclosingIndices);
        return path.runtimeDimensions[0].count;
    }
    element(index:number,reusable?:CobolRepresentation):CobolRepresentation {
        const path=this.path,record=this.record;
        if(!path||!record) throw new Error("COBOL projected array is not bound");
        if("symbolic" in path) {
            const selected=reusable && "originBits" in reusable
                ? reusable as MutableSymbolicView
                : {physical:record,originBits:0,enclosingIndices:[]};
            singleDepthOccurrenceInto(this.table!,path.node,index,this.resolver!,selected);
            return selected;
        }
        const dimension=path.runtimeDimensions[0];
        if(!Number.isSafeInteger(index)||index<0||index>=dimension.count)
            throw new RangeError(`OCCURS index ${index} outside 0..${dimension.count-1}`);
        const selected=reusable && "physical" in reusable && "displacementBits" in reusable
            ? reusable as {physical:ProjectionPhysicalRecord;displacementBits:number}
            : {physical:record,displacementBits:0};
        selected.physical=record;
        selected.displacementBits=this.base+index*dimension.strideBits;
        return selected;
    }
}

export const cobolParser = {
    parse,
    compileProjectionPath(details: CobolProjectionDetails, _context: PhysicalRecordContext | undefined, path: readonly (string | number)[], parent?:CobolProjectionPath) {
        return compileCobolMemberPath(details.names, path, parent);
    },
    object(view: CobolRepresentation, details: CobolProjectionDetails, path: CobolProjectionPath,
           reusable?:CobolRepresentation): CobolRepresentation {
        if("symbolic" in path) {
            if(path.node.kind!=="group" || path.node.source.clauses.some(c=>c.kind==="occurs"))
                throw new Error("COBOL object selection requires a non-repeated group");
            const record=physical(view);
            const selected="originBits" in (reusable ?? {})
                ? reusable as MutableSymbolicView
                : {physical:record,originBits:0,enclosingIndices:[]};
            selectSymbolicInto(symbolicView(view),path,countResolver(details,record),[],selected);
            return selected;
        }
        if (path.node.kind !== "group" || path.runtimeDimensions.length !== 0) {
            throw new Error("COBOL object selection requires a non-repeated group");
        }
        return view;
    },
    array(view:CobolRepresentation, details:CobolProjectionDetails, path:CobolProjectionPath,
          reusable?:ProjectedArraySource<CobolRepresentation>):ProjectedArraySource<CobolRepresentation> {
        const selected=reusable instanceof CobolArraySelection?reusable:new CobolArraySelection();
        selected.bind(view,details,path);
        return selected;
    },
    integer(record: CobolRepresentation, _details: CobolProjectionDetails, path: CobolProjectionPath, ...occurrenceIndices: number[]): number {
        return cobolDebugRangeNumber(fieldRange(record, _details, path, occurrenceIndices));
    },
    float(record: CobolRepresentation, _details: CobolProjectionDetails, path: CobolProjectionPath, ...occurrenceIndices: number[]): number {
        return cobolDebugRangeNumber(fieldRange(record, _details, path, occurrenceIndices));
    },
    character(record: CobolRepresentation, _details: CobolProjectionDetails, path: CobolProjectionPath, ...occurrenceIndices: number[]): string {
        return cobolDebugRangeString(physical(record), fieldRange(record, _details, path, occurrenceIndices));
    },
    string(record: CobolRepresentation, _details: CobolProjectionDetails, path: CobolProjectionPath, ...occurrenceIndices: number[]): string {
        return cobolDebugRangeString(physical(record), fieldRange(record, _details, path, occurrenceIndices));
    },
    toDebugString: bytesToDebugString
} satisfies CobolParser;

export function createCobolRecordState():CobolRecordState {
    const context:CountContext={resolve:path=>{
        if(!context.details || !context.record) throw new Error("COBOL count resolver is not bound to a record");
        return resolveCobolCount(context.details,context.record,path);
    }};
    return {projectionViews:new Map(),odoPositions:new Map(),countContext:context};
}
export function cleanCobolRecordState(state:CobolRecordState):void {
    cleanOdoPositions(state.odoPositions);
    // The function and allocated scratch buffers survive; the old record
    // and source-specific details do not remain bound after final release.
    state.countContext.record=undefined;
    state.countContext.details=undefined;
    if(state.rootScratch) state.rootScratch.endBits=undefined;
    if(state.scalarScratch) state.scalarScratch.endBits=undefined;
}
