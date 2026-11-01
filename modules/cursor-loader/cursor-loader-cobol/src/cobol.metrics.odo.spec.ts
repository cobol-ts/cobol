import {MemoryMetrics,METRIC} from '@cobol-ts/metrics';
import {createCobolProjectionDetails,createCobolRecordState,cobolParser} from './cobol.parser';
import {customerOdoRedefines} from './customer.fixtures';
import {valueOrThrow} from '@cobol-ts/errors';
import {createProjection,defineProjection} from '@cobol-ts/cursor-projection';
import {cleanOdoPositions,occurrenceBoundary,positionBranch} from './cobol.odo.positions';
import type {OdoPositionCache} from './cobol.odo.positions';
import type {CompiledCobolGroup} from '@cobol-ts/layout';

test('ODO cache counters distinguish branch visits, prefix extension and cleanup work',()=>{
    const metrics=new MemoryMetrics(),cache:OdoPositionCache=new Map();
    // Cache indexes entries by identity; the geometry itself is irrelevant to the cache.
    const declaration={} as CompiledCobolGroup;
    const a=positionBranch(cache,declaration,[20000],metrics);
    expect(occurrenceBoundary(a,16,3,i=>8*(i+1),metrics)).toBe(64);
    expect(occurrenceBoundary(a,16,2,()=>{throw new Error('cached boundary');},metrics)).toBe(40);
    expect(metrics.get(METRIC.COBOL_ODO_BOUNDARY_CALCULATE)).toBe(3);
    expect(metrics.get(METRIC.COBOL_ODO_BRANCH_STEP)).toBe(1);
    cleanOdoPositions(cache,metrics);
    expect(metrics.get(METRIC.COBOL_ODO_CLEAN_ROOT)).toBe(1);
    expect(metrics.get(METRIC.COBOL_ODO_CLEAN_BRANCH)).toBe(2);
    expect(metrics.get(METRIC.COBOL_ODO_CLEAN_CHILD_VISIT)).toBe(1);
    expect(metrics.get(METRIC.COBOL_ODO_CLEAN_START_RESET)).toBe(2);
    const b=positionBranch(cache,declaration,[0],metrics);
    occurrenceBoundary(b,16,1,()=>8,metrics);
    metrics.reset();
    cleanOdoPositions(cache,metrics);
    // One active branch only, regardless of the 20,000 retained slots.
    expect(metrics.get(METRIC.COBOL_ODO_CLEAN_CHILD_VISIT)).toBe(1);
    expect(metrics.get(METRIC.COBOL_ODO_CLEAN_START_RESET)).toBe(2);
});

test('symbolic ODO scalar selection counts controller reads and compiled steps',()=>{
    const metrics=new MemoryMetrics();
    const details={...valueOrThrow(createCobolProjectionDetails(customerOdoRedefines.layout)),metrics};
    const projection=defineProjection<{readonly purchases:ReadonlyArray<{raw():string}>}>({
        purchases:{type:'array',path:['CUSTOMER','PURCHASES'],element:{raw:{type:'string',path:['PURCHASE-RAW']}}}
    });
    const state=createCobolRecordState(metrics);
    const bytes=customerOdoRedefines.records[1].bytes;
    const physical={buffers:[bytes],startByte:0,endByte:bytes.length,lastValidByte:bytes.length,
        source:'odo-metrics.fb',recordNumber:3,recordState:state};
    const factory=createProjection(cobolParser,details,undefined,projection,metrics);
    const row=factory.create();factory.bind(row,physical,physical);
    expect(row.purchases.length).toBe(3);
    expect(row.purchases[2].raw()).toBe('19/22/c5 c6 f3');
    factory.clear(row);
    expect(metrics.get(METRIC.COBOL_CONTROLLER_READ)).toBeGreaterThan(0);
    expect(metrics.get(METRIC.COBOL_SYMBOLIC_LOCATE)).toBeGreaterThan(0);
    expect(metrics.get(METRIC.COBOL_SYMBOLIC_STEP)).toBeGreaterThan(0);
    expect(metrics.get(METRIC.ARRAY_CHILD_ALLOCATE)).toBe(1);
});
