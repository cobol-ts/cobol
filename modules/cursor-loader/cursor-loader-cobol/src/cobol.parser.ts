import type {
    Parser, ParserPhysicalRecordContent, ProjectionPhysicalRecord,
    PhysicalRecordContext, ProjectionRecordState
} from "@cobol-ts/cursor-loader-types";
import {bytesToDebugString} from "@cobol-ts/cursor-loader-types";
import type {CompiledCobolEntry, CompiledCobolElementary} from "@cobol-ts/layout";
import {FragmentedByteCursor, compileCobolFieldDecoder, type CobolDecodeOptions, type CobolFieldDecoder} from "@cobol-ts/codec";
import {type ErrorsOr, errors, value, flatMapErrorsOr} from "@cobol-ts/errors";
import {evaluateStorageSize} from "@cobol-ts/size";
import type {ProjectedArraySource} from "@cobol-ts/arrays";
import type {ResolvePath} from "@cobol-ts/size";
import {cleanOdoPositions,type OdoPositionCache} from "./cobol.odo.positions";
import {hasOccursClause} from "./cobol.occurs.clause";
import {createCobolNameIndex, type CobolNameIndex} from "./cobol.layout.index";
import {cobolDebugRangeFromBits, cobolDebugRangeNumber, cobolDebugRangeString} from "./cobol.debug.range";
import {compileCobolMemberPath, locateCompiledCobolPath, type CobolProjectionPath} from "./cobol.projection.path";
import {activeCount,resolveCobolCount,rootSymbolicView,selectSymbolic,selectSymbolicInto,singleDepthOccurrenceInto,
    type CobolSymbolicView,type MutableSymbolicView} from "./cobol.projection.symbolic";

export type CobolProjectionDetails = Readonly<{
    layout: readonly CompiledCobolEntry[];
    names: CobolNameIndex;
    recordLengthBytes?:number;
    /** RDW is physical framing, never part of the copybook layout. */
    framing?:'rdw';
    dataOffsetBytes?:number;
    controllerLocations:WeakMap<readonly (string|number)[],import("./cobol.projection.symbolic").CobolControllerLocation>;
}>;
export type CobolFixedDetails = CobolProjectionDetails & Readonly<{recordLengthBytes:number}>;
/** Fixed capacity is independent of the number of active ODO occurrences. */
export type CobolFraming = Readonly<{kind:'fixed';recordLength?:number}> | Readonly<{kind:'rdw'}>;
/** Opt-in decoded-value details. Existing diagnostic fixture helpers continue
 * to use createCobolProjectionDetails / createCobolFixedDetails unchanged. */
export type CobolDecodedDetails = CobolProjectionDetails & Readonly<{
    decodeOptions:CobolDecodeOptions;
    decoderCache:WeakMap<CompiledCobolElementary,CobolFieldDecoder>;
}>;

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
    /** Start of copybook data relative to the physical record start. */
    dataOffsetBytes?:number;
    rootScratch?:MutableSymbolicView;
    scalarScratch?:MutableSymbolicView;
    rangeScratch?:{from:number;to:number};
    fixedScratch?:{offsetBits:number;sizeBits:number};
    byteCursor?:FragmentedByteCursor;
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
    root.originBits=(state.dataOffsetBytes ?? 0)*8;
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

/** Production setup: the same compiled storage layout, with scalar decoders
 * compiled for selected elementary projections during opened-source setup. */
export function createCobolDecodedProjectionDetails(layout:readonly CompiledCobolEntry[],
    decodeOptions:CobolDecodeOptions = {}):ErrorsOr<CobolDecodedDetails> {
    return flatMapErrorsOr(createCobolProjectionDetails(layout), details =>
        value({...details, decodeOptions, decoderCache:new WeakMap()}));
}

/** One source-scoped decoder setup for FB (compiled or declared physical length)
 * and RDW-prefixed records. Record framing is independent of active ODO count.
 * In particular, an FB file may reserve unused table capacity. */
export function createCobolDecodedFramedDetails(layout:readonly CompiledCobolEntry[],
    framing:CobolFraming|undefined,
    decodeOptions:CobolDecodeOptions = {}):ErrorsOr<CobolDecodedDetails> {
    if(!framing || (framing.kind==='fixed' && framing.recordLength===undefined))
        return createCobolDecodedFixedDetails(layout,decodeOptions);
    if(framing.kind==='fixed') {
        const length=framing.recordLength;
        if(!Number.isSafeInteger(length) || length===undefined || length<=0)
            return errors('Fixed COBOL record length must be a positive whole number of bytes');
        return flatMapErrorsOr(createCobolDecodedProjectionDetails(layout,decodeOptions),details=>
            value({...details,recordLengthBytes:length}));
    }
    return flatMapErrorsOr(createCobolDecodedProjectionDetails(layout,decodeOptions),details=>
        value({...details,framing:'rdw' as const,dataOffsetBytes:4}));
}

export function createCobolDecodedFixedDetails(layout:readonly CompiledCobolEntry[],
    decodeOptions:CobolDecodeOptions = {}):ErrorsOr<CobolFixedDetails & CobolDecodedDetails> {
    return flatMapErrorsOr(createCobolFixedDetails(layout), details =>
        value({...details, decodeOptions, decoderCache:new WeakMap()}));
}

function isDecoded(details:CobolProjectionDetails):details is CobolDecodedDetails {
    return 'decoderCache' in details;
}

/** Construct selected-field plans before record iteration, never per record. */
function ensureDecoder(details:CobolDecodedDetails,path:CobolProjectionPath):void {
    if(path.node.kind!=='elementary' || details.decoderCache.has(path.node)) return;
    const bits=path.node.size;
    if(typeof bits!=='number' || bits%8!==0)
        throw new Error(`Cannot compile primitive with non-constant storage width: ${path.fullPath.join('.')}`);
    // Honour group-inherited USAGE, as the layout compiler does. Only stable
    // declaration metadata is walked, once, during projection compilation.
    let inheritedUsage:string|undefined;
    let current:readonly CompiledCobolEntry[]=details.layout;
    for(const part of path.fullPath) {
        if(typeof part !== 'string') continue;
        let found:CompiledCobolEntry|undefined;
        for(const entry of current) {
            if(entry.kind==='padding') continue;
            if(entry.source.name.kind==='named' && entry.source.name.name.toUpperCase()===part.toUpperCase()) {
                found=entry;break;
            }
        }
        if(!found) break;
        if(found.kind==='group') {
            for(const clause of found.source.clauses)
                if(clause.kind==='usage') inheritedUsage=clause.usage;
            current=found.children;
        }
    }
    const source=path.node.source;
    const explicit=source.clauses.some(c=>c.kind==='usage');
    const declaration=explicit || !inheritedUsage ? source
        : {...source,clauses:[...source.clauses,{kind:'usage' as const,usage:inheritedUsage}]};
    try {
        details.decoderCache.set(path.node,compileCobolFieldDecoder(declaration,bits/8,details.decodeOptions));
    } catch(error) {
        throw new Error(`COBOL decoder for ${path.fullPath.join('.')}: ${error instanceof Error?error.message:String(error)}`);
    }
}

function decodedField(representation:CobolRepresentation,details:CobolDecodedDetails,
    path:CobolProjectionPath,occurrenceIndices:readonly number[]):string|number {
    const decoder=path.node.kind==='elementary'?details.decoderCache.get(path.node):undefined;
    if(!decoder) throw new Error(`No compiled COBOL decoder for ${path.fullPath.join('.')}`);
    const range=fieldRange(representation,details,path,occurrenceIndices);
    const record=physical(representation);
    const state=record.recordState as CobolRecordState;
    const cursor=state.byteCursor??(state.byteCursor=new FragmentedByteCursor());
    cursor.bind(record,record.startByte+range.from,record.startByte+range.to);
    return decoder.decode(cursor);
}

/** The parser owns COBOL record boundaries. The physical cursor supplies only
 * reusable buffers and readMore(); neither a payload nor field is assembled.
 * The RDW's 16-bit big-endian length includes its four header bytes. */
/** The same synchronous framing routine serves both delivery models.
 * Ordinary iteration retains its Promise API, but buffered parsing itself
 * never suspends. Only an actual need for more input awaits readMore().
 */
async function parse(
    record: ParserPhysicalRecordContent<CobolRecordState>,
    details: CobolProjectionDetails
): Promise<CobolRepresentation | {errors:string[]}> {
    let result = parseBuffered(record, details);
    while (result === undefined) {
        await record.readMore();
        result = parseBuffered(record, details);
    }
    return result;
}

/**
 * Synchronous counterpart for the callback cursor. undefined means that the
 * caller must read another byte buffer and retry with the SAME record.
 * No physical byte array is copied, and RDW/FB rules match parse().
 */
function parseBuffered(
    record: ParserPhysicalRecordContent<CobolRecordState>,
    details: CobolProjectionDetails
): CobolRepresentation | {errors:string[]} | undefined {
    const start = record.startByte;
    if (details.framing === 'rdw') {
        const headerEnd = start + 4;
        if (record.lastValidByte < headerEnd) {
            if (!record.fileFinished) return undefined;
            if (record.lastValidByte === start) {
                record.endByte = start;
                return record;
            }
            record.endByte = record.lastValidByte;
            return {errors:[`Truncated COBOL RDW: expected 4 bytes, got ${record.lastValidByte-start}`]};
        }

        const state = record.recordState;
        const cursor = state.byteCursor ?? (state.byteCursor = new FragmentedByteCursor());
        cursor.bind(record,start,headerEnd);
        const hi = cursor.next(),lo = cursor.next(),control1 = cursor.next(),control2 = cursor.next();
        if (control1 !== 0 || control2 !== 0)
            throw new Error('Unsupported COBOL RDW control bytes (spanned records are not supported)');
        const length = hi * 256 + lo;
        if (length < 4)
            throw new Error(`Invalid COBOL RDW length ${length}: must include four header bytes`);
        const endByte = start + length;
        if (record.lastValidByte < endByte) {
            if (!record.fileFinished) return undefined;
            record.endByte = record.lastValidByte;
            return {errors:[`Truncated COBOL RDW record: expected ${length} bytes, got ${record.lastValidByte-start}`]};
        }
        state.dataOffsetBytes = 4;
        record.endByte = endByte;
        return record;
    }

    if (details.recordLengthBytes === undefined)
        throw new Error('COBOL source framing is required for an ODO layout');
    const endByte = start + details.recordLengthBytes;
    if (record.lastValidByte < endByte) {
        if (!record.fileFinished) return undefined;
        record.endByte = record.lastValidByte;
        return {errors:[`Truncated COBOL fixed record: expected ${details.recordLengthBytes} bytes, got ${record.lastValidByte-start}`]};
    }
    record.recordState.dataOffsetBytes = 0;
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
        offsetBits=located.offsetBits+displacement(representation)+(state.dataOffsetBytes??0)*8;
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
            if(path.node.kind!=="group" || !hasOccursClause(path.node.source.clauses))
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
    parseBuffered,
    compileProjectionPath(details: CobolProjectionDetails, _context: PhysicalRecordContext | undefined, path: readonly (string | number)[], parent?:CobolProjectionPath) {
        const compiled=compileCobolMemberPath(details.names, path, parent);
        if(isDecoded(details)) ensureDecoder(details,compiled);
        return compiled;
    },
    object(view: CobolRepresentation, details: CobolProjectionDetails, path: CobolProjectionPath,
           reusable?:CobolRepresentation): CobolRepresentation {
        if("symbolic" in path) {
            if(path.node.kind!=="group" || hasOccursClause(path.node.source.clauses))
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
    integer(record: CobolRepresentation, details: CobolProjectionDetails, path: CobolProjectionPath, ...indices: number[]): number {
        if(isDecoded(details)) {
            const decoded=decodedField(record,details,path,indices);
            if(typeof decoded!=='number' || !Number.isInteger(decoded))
                throw new TypeError(`Expected integral COBOL value at ${path.fullPath.join('.')}`);
            return decoded;
        }
        return cobolDebugRangeNumber(fieldRange(record, details, path, indices));
    },
    float(record: CobolRepresentation, details: CobolProjectionDetails, path: CobolProjectionPath, ...indices: number[]): number {
        if(isDecoded(details)) {
            const decoded=decodedField(record,details,path,indices);
            if(typeof decoded!=='number')
                throw new TypeError(`Expected numeric COBOL value at ${path.fullPath.join('.')}`);
            return decoded;
        }
        return cobolDebugRangeNumber(fieldRange(record, details, path, indices));
    },
    character(record: CobolRepresentation, details: CobolProjectionDetails, path: CobolProjectionPath, ...indices: number[]): string {
        if(isDecoded(details)) {
            const decoded=decodedField(record,details,path,indices);
            if(typeof decoded!=='string' || decoded.length!==1)
                throw new TypeError(`Expected one COBOL character at ${path.fullPath.join('.')}`);
            return decoded;
        }
        return cobolDebugRangeString(physical(record), fieldRange(record, details, path, indices));
    },
    string(record: CobolRepresentation, details: CobolProjectionDetails, path: CobolProjectionPath, ...indices: number[]): string {
        if(isDecoded(details)) {
            const decoded=decodedField(record,details,path,indices);
            if(typeof decoded!=='string')
                throw new TypeError(`Expected text COBOL value at ${path.fullPath.join('.')}`);
            return decoded;
        }
        return cobolDebugRangeString(physical(record), fieldRange(record, details, path, indices));
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
    state.dataOffsetBytes=undefined;
    if(state.rootScratch) state.rootScratch.endBits=undefined;
    if(state.scalarScratch) state.scalarScratch.endBits=undefined;
}
