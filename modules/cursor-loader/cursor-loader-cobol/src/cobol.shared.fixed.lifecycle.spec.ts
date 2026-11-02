import type {ProjectedArray} from '@cobol-ts/arrays';
import type {ProjectionPhysicalRecord} from '@cobol-ts/cursor-loader-types';
import {createProjection,defineProjection} from '@cobol-ts/cursor-projection';
import {valueOrThrow} from '@cobol-ts/errors';
import {cobolParser,createCobolFixedDetails,createCobolRecordState} from './cobol.parser';
import {customerFixedOccurs} from './customer.fixtures';

type Customer={readonly telephones:ProjectedArray<{raw():string}>};
const projection=defineProjection<Customer>({
    telephones:{type:'array',path:['CUSTOMER','TELEPHONES'],element:{raw:{type:'string',path:['PHONE-RAW']}}}
});
const details=valueOrThrow(createCobolFixedDetails(customerFixedOccurs.layout));
const record=(index:number,state=createCobolRecordState()):ProjectionPhysicalRecord=>({
    buffers:[Uint8Array.from(customerFixedOccurs.records[index].bytes)],
    startByte:0,endByte:17,lastValidByte:17,
    source:'phones.fb',recordNumber:index+1,recordState:state
});

test('shared native fixed arrays read original bytes, clear once, and rebind same children',()=>{
    const factory=createProjection(cobolParser,details,undefined,projection,undefined,true);
    const row=factory.create(),a=record(0);
    factory.bind(row,a,a);
    const array=row.telephones;
    expect(Array.isArray(array)).toBe(true);
    const first=array[0],second=array[1];
    expect(first.raw()).toBe('4/10/c8 f1 f2 f3 f4 f5');
    expect(second.raw()).toBe('10/16/d4 f6 f7 f8 f9 f0');
    a.buffers[0][4]=0xC9;
    expect(first.raw()).toBe('4/10/c9 f1 f2 f3 f4 f5');
    factory.clear(row);
    expect(()=>first.raw()).toThrow(/not bound/);
    const b=record(1,a.recordState as ReturnType<typeof createCobolRecordState>);
    factory.bind(row,b,b);
    expect(row.telephones).toBe(array);
    expect(row.telephones[0]).toBe(first);
    expect(row.telephones[1]).toBe(second);
    expect(first.raw()).toBe('4/10/e6 f5 f4 f3 f2 f1');
    factory.clear(row);
});

test('two simultaneous live records have distinct shared bindings',()=>{
    const factory=createProjection(cobolParser,details,undefined,projection,undefined,true);
    const a=record(0),b=record(1),rowA=factory.create(),rowB=factory.create();
    factory.bind(rowA,a,a);factory.bind(rowB,b,b);
    const first=rowA.telephones[0],second=rowB.telephones[0];
    expect(first.raw()).toBe('4/10/c8 f1 f2 f3 f4 f5');
    expect(second.raw()).toBe('4/10/e6 f5 f4 f3 f2 f1');
    factory.clear(rowA);
    expect(()=>first.raw()).toThrow(/not bound/);
    expect(second.raw()).toBe('4/10/e6 f5 f4 f3 f2 f1');
    factory.clear(rowB);
});
