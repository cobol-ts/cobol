/** One operation is recorded per call; no parameters/labels or implicit aggregation. */
export interface IPutMetrics { put(name:string):void; }

export class NullMetrics implements IPutMetrics {
    put(_name:string):void {}
}
/** Safe to share across readers: counters are local to this instance. */
export const NULL_METRICS:IPutMetrics = new NullMetrics();

export class MemoryMetrics implements IPutMetrics {
    private readonly counters=new Map<string,number>();
    put(name:string):void {this.counters.set(name,(this.counters.get(name)??0)+1);}
    get(name:string):number {return this.counters.get(name)??0;}
    /** A detached snapshot, so resetting a run does not change past reports. */
    snapshot():ReadonlyMap<string,number> {return new Map(this.counters);}
    reset():void {this.counters.clear();}
}

/** Static strings; hot paths must not format names or construct dynamic labels. */
export const METRIC = {
    FILE_SCAN_RECORD:'file.scan.record',
    FILE_SCAN_BUFFERED_PARSE:'file.scan.parse_buffered',
    RECORD_BORROW:'record.borrow',
    RECORD_ALLOCATE:'record.allocate',
    RECORD_RETURN:'record.return',
    RECORD_STATE_CLEAN:'record.state.clean',
    PROJECTION_CREATE:'projection.view.create',
    PROJECTION_BIND:'projection.view.bind',
    PROJECTION_CLEAR:'projection.view.clear',
    PROJECTION_CLEAR_ROOT_ARRAY_VISIT:'projection.clear.root_array_visit',
    PROJECTION_CLEAR_NESTED_ARRAY_VISIT:'projection.clear.nested_array_visit',
    PROJECTION_CLEAR_OBJECT_VISIT:'projection.clear.object_visit',
    ARRAY_PROPERTY:'array.property.access',
    ARRAY_RUNTIME_CREATE:'array.runtime.create',
    ARRAY_RUNTIME_BIND:'array.runtime.bind',
    ARRAY_RUNTIME_ALREADY_BOUND:'array.runtime.already_bound',
    ARRAY_PROXY_LENGTH:'array.proxy.length',
    ARRAY_PROXY_INDEX:'array.proxy.index',
    ARRAY_PROXY_INDEX_VALID:'array.proxy.index_valid',
    ARRAY_LENGTH:'array.length.resolve',
    ARRAY_ELEMENT:'array.element.select',
    ARRAY_CHILD_ALLOCATE:'array.child.allocate',
    ARRAY_CHILD_REUSE:'array.child.reuse',
    ARRAY_CHILD_BIND:'array.child.bind',
    ARRAY_CHILD_ALREADY_BOUND:'array.child.already_bound',
    ARRAY_CHILD_CLEAR_VISIT:'array.child.clear_visit',
    ARRAY_RUNTIME_CLEAR:'array.runtime.clear',
    COBOL_FIELD_RANGE:'cobol.field_range',
    COBOL_FIXED_FAST:'cobol.field_range.fixed_fast',
    COBOL_FIXED_LOCATE:'cobol.field_range.fixed_locate',
    COBOL_SYMBOLIC_LOCATE:'cobol.field_range.symbolic_locate',
    COBOL_FIXED_DIMENSION:'cobol.fixed.dimension_visited',
    COBOL_ARRAY_PROVIDER_CREATE:'cobol.array.provider.create',
    COBOL_ARRAY_PROVIDER_BIND:'cobol.array.provider.bind',
    COBOL_ARRAY_PROVIDER_ELEMENT:'cobol.array.provider.element',
    COBOL_ARRAY_PROVIDER_LENGTH:'cobol.array.provider.length',
    COBOL_CONTROLLER_READ:'cobol.odo.controller_read',
    COBOL_CONTROLLER_BYTE:'cobol.odo.controller_byte',
    COBOL_ODO_BRANCH:'cobol.odo.branch',
    COBOL_ODO_BRANCH_STEP:'cobol.odo.branch_step',
    COBOL_ODO_CACHE_HIT:'cobol.odo.cache_hit',
    COBOL_ODO_CACHE_EXTEND:'cobol.odo.cache_extend',
    COBOL_ODO_BOUNDARY_CALCULATE:'cobol.odo.boundary_calculate',
    COBOL_ODO_CLEAN_ROOT:'cobol.odo.clean_root',
    COBOL_ODO_CLEAN_BRANCH:'cobol.odo.clean_branch',
    COBOL_ODO_CLEAN_CHILD_VISIT:'cobol.odo.clean_child_visit',
    COBOL_ODO_CLEAN_START_RESET:'cobol.odo.clean_start_reset',
    COBOL_PATH_COMPILE:'cobol.path.compile',
    PROJECTION_PATH_COMPILE:'projection.path.compile',
    COBOL_DECODER_COMPILE:'cobol.decoder.compile',
    COBOL_DECODER_INVOKE:'cobol.decoder.invoke',
    COBOL_SYMBOLIC_STEP:'cobol.symbolic.step',
    COBOL_FIXED_OCCURRENCE:'cobol.fixed.occurrence',
    COBOL_ODO_OCCURRENCE:'cobol.odo.occurrence'
} as const;
