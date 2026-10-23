import type {
    Parser, ParserPhysicalRecordContent, ProjectionPhysicalRecord,
    PhysicalRecordContext, ProjectionRecordState
} from "@cobol-ts/cursor-loader-types";
import {bytesToDebugString} from "@cobol-ts/cursor-loader-types";
import type {CompiledCobolEntry} from "@cobol-ts/layout";
import {type ErrorsOr, errors, value, flatMapErrorsOr} from "@cobol-ts/errors";
import {evaluateStorageSize} from "@cobol-ts/size";
import type {ProjectedArraySource} from "@cobol-ts/arrays";
import {createCobolNameIndex, type CobolNameIndex} from "./cobol.layout.index";
import {cobolDebugRangeFromBits, cobolDebugRangeNumber, cobolDebugRangeString} from "./cobol.debug.range";
import {compileCobolMemberPath, locateCompiledCobolPath, type CobolProjectionPath} from "./cobol.projection.path";
import {activeCount,cobolCountResolver,rootSymbolicView,selectSymbolic,singleDepthOccurrence,
    type CobolSymbolicView} from "./cobol.projection.symbolic";

export type CobolProjectionDetails = Readonly<{
    layout: readonly CompiledCobolEntry[];
    names: CobolNameIndex;
    recordLengthBytes?:number;
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
export type CobolRecordState = ProjectionRecordState;
export type CobolParser = Parser<CobolRepresentation, CobolProjectionDetails, CobolProjectionDetails, CobolRecordState, CobolProjectionPath>;

const physical = (view:CobolRepresentation):ProjectionPhysicalRecord =>
    "physical" in view ? view.physical : view;
const displacement = (view:CobolRepresentation):number =>
    "physical" in view && "displacementBits" in view ? view.displacementBits : 0;
const symbolicView=(view:CobolRepresentation):CobolSymbolicView=>
    "originBits" in view ? view : rootSymbolicView(physical(view));


/** Compile the source-scoped index and validate the initially supported FB record size. */
export function createCobolProjectionDetails(layout:readonly CompiledCobolEntry[]):ErrorsOr<CobolProjectionDetails> {
    if(layout.length!==1) return errors("COBOL projection requires exactly one 01 record layout");
    return flatMapErrorsOr(createCobolNameIndex(layout),names=>value({layout,names}));
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
            return value({layout, names, recordLengthBytes: bits / 8});
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
        const selected=selectSymbolic(symbolicView(representation),path,cobolCountResolver(details,record),occurrenceIndices);
        offsetBits=selected.originBits;
        sizeBits=typeof path.node.size==="number"?path.node.size:NaN;
    } else {
        const located=locateCompiledCobolPath(path,occurrenceIndices);
        offsetBits=located.offsetBits+displacement(representation);
        sizeBits=located.sizeBits;
    }
    const range = cobolDebugRangeFromBits(offsetBits, sizeBits);
    if (record.startByte + range.to > record.endByte) {
        throw new RangeError("COBOL projection extends beyond the completed record");
    }
    return range;
}

export const cobolParser = {
    parse,
    compileProjectionPath(details: CobolProjectionDetails, _context: PhysicalRecordContext | undefined, path: readonly (string | number)[], parent?:CobolProjectionPath) {
        return compileCobolMemberPath(details.names, path, parent);
    },
    object(view: CobolRepresentation, _details: CobolProjectionDetails, path: CobolProjectionPath): CobolRepresentation {
        if("symbolic" in path) {
            if(path.node.kind!=="group" || path.node.source.clauses.some(c=>c.kind==="occurs"))
                throw new Error("COBOL object selection requires a non-repeated group");
            return selectSymbolic(symbolicView(view),path,cobolCountResolver(_details,physical(view)));
        }
        if (path.node.kind !== "group" || path.runtimeDimensions.length !== 0) {
            throw new Error("COBOL object selection requires a non-repeated group");
        }
        return view; // Group offsets were resolved once when compiling its child paths.
    },
    array(view: CobolRepresentation, _details: CobolProjectionDetails, path: CobolProjectionPath): ProjectedArraySource<CobolRepresentation> {
        if("symbolic" in path) {
            if(path.node.kind!=="group" || !path.node.source.clauses.some(c=>c.kind==="occurs"))
                throw new Error("COBOL projected array requires an OCCURS group");
            const record=physical(view);
            const resolve=cobolCountResolver(_details,record);
            const selected=selectSymbolic(symbolicView(view),path,resolve);
            return {
                length:()=>activeCount(path.node,resolve,selected.enclosingIndices),
                element(index:number){return singleDepthOccurrence(selected,path.node,index,resolve);}
            };
        }
        if (path.node.kind !== "group" || path.runtimeDimensions.length !== 1) {
            throw new Error("COBOL projected array requires one fixed OCCURS group");
        }
        const dimension=path.runtimeDimensions[0];
        const record=physical(view);
        const base=displacement(view);
        return {
            length:()=>dimension.count,
            element(index:number) {
                if (!Number.isSafeInteger(index) || index < 0 || index >= dimension.count) {
                    throw new RangeError(`OCCURS index ${index} outside 0..${dimension.count-1}`);
                }
                return {physical:record, displacementBits:base+index*dimension.strideBits};
            }
        };
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

export const createCobolRecordState = (): CobolRecordState => ({projectionViews:new Map()});
