import {MemoryMetrics,METRIC} from '@cobol-ts/metrics';
import {valueOrThrow} from '@cobol-ts/errors';
import {cobolParser,createCobolFixedDetails,createCobolRecordState} from './cobol.parser';
import type {ProjectionPhysicalRecord} from '@cobol-ts/cursor-loader-types';
import {createProjection,defineProjection} from '@cobol-ts/cursor-projection';
import {customerFixedOccurs} from './customer.fixtures';

interface View {id():number;}
const definition=defineProjection<View>({id:{type:'integer',path:['CUSTOMER','CUSTOMER-ID']}});

test('scalar reads count field range and fixed fast path without creating child views',()=>{
    const metrics=new MemoryMetrics();
    const details={...valueOrThrow(createCobolFixedDetails(customerFixedOccurs.layout)),metrics};
    const factory=createProjection(cobolParser,details,undefined,definition,metrics);
    const view=factory.create();
    const record:ProjectionPhysicalRecord={
        buffers:[customerFixedOccurs.records[0].bytes],startByte:0,endByte:17,lastValidByte:17,
        source:'scalar.fb',recordNumber:1,recordState:createCobolRecordState(metrics)
    };
    factory.bind(view,record,record);
    expect(view.id()).toBe(4);
    factory.clear(view);
    expect(metrics.get(METRIC.PROJECTION_CREATE)).toBe(1);
    expect(metrics.get(METRIC.PROJECTION_BIND)).toBe(1);
    expect(metrics.get(METRIC.PROJECTION_CLEAR)).toBe(1);
    expect(metrics.get(METRIC.COBOL_FIELD_RANGE)).toBe(1);
    expect(metrics.get(METRIC.COBOL_FIXED_FAST)).toBe(1);
    expect(metrics.get(METRIC.ARRAY_CHILD_ALLOCATE)).toBe(0);
});
