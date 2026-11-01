import type {ProjectionPhysicalRecord} from "@cobol-ts/cursor-loader-types";
import type {ResolvePath} from "@cobol-ts/size";
import {rootSymbolicView,resolveCobolCount,type CobolSymbolicView,type MutableSymbolicView} from "./cobol.projection.symbolic";
import type {CobolProjectionDetails,CobolRepresentation,CobolRecordState} from "./cobol.parser";

/** Shared COBOL representation access. Only the selected record changes per lease. */
export type CountContext = {
    record?:ProjectionPhysicalRecord;
    details?:CobolProjectionDetails;
    readonly resolve:ResolvePath;
};

export const physical = (view:CobolRepresentation):ProjectionPhysicalRecord =>
    "physical" in view ? view.physical : view;
export const displacement = (view:CobolRepresentation):number =>
    "physical" in view && "displacementBits" in view ? view.displacementBits : 0;
/** Keep the root's record-specific boundary in reusable record-state scratch. */
export function symbolicView(view:CobolRepresentation):CobolSymbolicView {
    if("originBits" in view) return view;
    const record=physical(view),state=record.recordState as CobolRecordState;
    const root=state.rootScratch ?? (state.rootScratch=rootSymbolicView(record) as MutableSymbolicView);
    root.physical=record;
    root.originBits=(state.dataOffsetBytes ?? 0)*8;
    root.endBits=(record.endByte-record.startByte)*8;
    return root;
}
/** A stable resolver closure per pooled physical holder, rebound on each lease. */
export function countResolver(details:CobolProjectionDetails,record:ProjectionPhysicalRecord):ResolvePath {
    const context=(record.recordState as CobolRecordState).countContext;
    context.details=details;
    context.record=record;
    return context.resolve;
}


