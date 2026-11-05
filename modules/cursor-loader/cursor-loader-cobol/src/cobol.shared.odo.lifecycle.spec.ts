import type {ProjectedArray} from '@cobol-ts/arrays';
import type {ProjectionPhysicalRecord} from '@cobol-ts/cursor-loader-types';
import {createProjection,defineProjection} from '@cobol-ts/cursor-projection';
import {parseCopybook} from '@cobol-ts/copybook';
import {valueOrThrow} from '@cobol-ts/errors';
import {compileCobolLayout} from '@cobol-ts/layout';
import {MemoryMetrics,METRIC} from '@cobol-ts/metrics';
import {cobolParser,createCobolDecodedProjectionDetails,createCobolRecordState} from './cobol.parser';

const compile=(max=8)=>valueOrThrow(compileCobolLayout(valueOrThrow(parseCopybook([
    '01 ROW.',
    '  05 ITEM-COUNT PIC 9.',
    `  05 ITEMS OCCURS 0 TO ${max} TIMES DEPENDING ON ITEM-COUNT.`,
    '    10 ITEM-VALUE PIC 9(3).'
].join('\n'))),'shared-odo.cbl'));

type Row={readonly items:ProjectedArray<{value():number}>};
const projection=defineProjection<Row>({
    items:{type:'array',path:['ROW','ITEMS'],element:{value:{type:'integer',path:['ITEM-VALUE']}}}
});

const record=(count:number,recordNumber=1,state=createCobolRecordState()):ProjectionPhysicalRecord=>{
    // Keep physical framing fixed. Only the active COBOL group length varies.
    const bytes=Buffer.alloc(32,0x20);
    bytes.write(String(count),0,'ascii');
    for(let index=0;index<8;index++)
        bytes.write(String(100+recordNumber*10+index).padStart(3,'0'),1+index*3,'ascii');
    return {buffers:[bytes],startByte:0,endByte:bytes.length,lastValidByte:bytes.length,
        source:'shared-odo.fb',recordNumber,recordState:state};
};

function setup(enabled:boolean,max=8,metrics=new MemoryMetrics()) {
    const details={...valueOrThrow(createCobolDecodedProjectionDetails(compile(max),{encoding:'ascii'})),
        experimentalSharedOdoArrays:enabled,metrics};
    return {factory:createProjection(cobolParser,details,undefined,projection,metrics),metrics};
}

test('shared ODO retains its child views across 8 -> 0 -> 8 and invalidates old leases',()=>{
    const {factory,metrics}=setup(true);
    const row=factory.create(),state=createCobolRecordState(metrics);
    const first=record(8,1,state);
    factory.bind(row,first,first);
    const array=row.items;
    expect(Array.isArray(array)).toBe(true);
    expect(array.length).toBe(8);
    const firstChild=array[0],lastChild=array[7];
    expect(firstChild.value()).toBe(110);
    expect(lastChild.value()).toBe(117);
    first.buffers[0][1]=0x32; // modify underlying ASCII byte, no data copy
    expect(firstChild.value()).toBe(210);
    factory.clear(row);
    expect(()=>firstChild.value()).toThrow(/not bound/);
    expect(()=>lastChild.value()).toThrow(/not bound/);

    const empty=record(0,2,state);
    factory.bind(row,empty,empty);
    expect(row.items).toBe(array);
    expect(array.length).toBe(0);
    expect(array[0]).toBeUndefined();
    expect(()=>lastChild.value()).toThrow(/not active/);
    factory.clear(row);

    const third=record(8,3,state);
    factory.bind(row,third,third);
    expect(row.items).toBe(array);
    expect(array.length).toBe(8);
    expect(array[0]).toBe(firstChild);
    expect(array[7]).toBe(lastChild);
    expect(firstChild.value()).toBe(130);
    expect(lastChild.value()).toBe(137);
    factory.clear(row);
    expect(()=>lastChild.value()).toThrow(/not bound/);
    expect(metrics.get(METRIC.ARRAY_PROXY_INDEX)).toBe(0);
    expect(metrics.get(METRIC.ARRAY_CHILD_BIND)).toBe(0);
    expect(metrics.get(METRIC.PROJECTION_BIND)).toBe(3);
});

test('concurrent ODO leases do not share a physical binding or active count',()=>{
    const {factory}=setup(true);
    const a=record(1,1),b=record(8,2);
    const rowA=factory.create(),rowB=factory.create();
    factory.bind(rowA,a,a);factory.bind(rowB,b,b);
    const arrayA=rowA.items,arrayB=rowB.items;
    expect(arrayA.length).toBe(1);
    expect(arrayB.length).toBe(8);
    const aFirst=arrayA[0],bLast=arrayB[7];
    expect(aFirst.value()).toBe(110);
    expect(bLast.value()).toBe(127);
    factory.clear(rowA);
    expect(()=>aFirst.value()).toThrow(/not bound/);
    expect(bLast.value()).toBe(127);
    factory.clear(rowB);
});

test('the default and unsupported large-ODO layouts keep lazy Proxy selection',()=>{
    for(const [enabled,max] of [[false,8],[true,9]] as const){
        const {factory,metrics}=setup(enabled,max);
        const row=factory.create(),r=record(2);
        factory.bind(row,r,r);
        expect(row.items.length).toBe(2);
        expect(row.items[0].value()).toBe(110);
        expect(row.items[1].value()).toBe(111);
        expect(metrics.get(METRIC.ARRAY_PROXY_INDEX)).toBe(2);
        expect(metrics.get(METRIC.ARRAY_CHILD_BIND)).toBe(2);
        factory.clear(row);
    }
});

test('the active count is read once per ODO binding in the fast path',()=>{
    const {factory,metrics}=setup(true);
    const row=factory.create(),state=createCobolRecordState(metrics);
    for(const count of [0,1,8,2,0,8]) {
        const current=record(count,count+1,state);
        factory.bind(row,current,current);
        expect(row.items.length).toBe(count);
        if(count>0) expect(row.items[0].value()).toBe(110+10*count);
        factory.clear(row);
    }
    expect(metrics.get(METRIC.COBOL_CONTROLLER_READ)).toBe(6);
    expect(metrics.get(METRIC.PROJECTION_BIND)).toBe(6);
});

test('nested symbolic arrays retain Proxy selection with ODO fast path enabled',()=>{
    const layout=valueOrThrow(compileCobolLayout(valueOrThrow(parseCopybook([
        '01 ROW.',
        '  05 ITEM-COUNT PIC 9.',
        '  05 ORDERS OCCURS 2 TIMES.',
        '    10 ITEMS OCCURS 0 TO 8 TIMES DEPENDING ON ITEM-COUNT.',
        '      15 ITEM-VALUE PIC 9(3).'
    ].join('\n'))),'nested-odo.cbl'));
    type NestedRow={readonly orders:ProjectedArray<{
        readonly items:ProjectedArray<{value():number}>;
    }>};
    const nested=defineProjection<NestedRow>({orders:{type:'array',path:['ROW','ORDERS'],element:{
        items:{type:'array',path:['ITEMS'],element:{value:{type:'integer',path:['ITEM-VALUE']}}}
    }}});
    const metrics=new MemoryMetrics();
    const details={...valueOrThrow(createCobolDecodedProjectionDetails(layout,{encoding:'ascii'})),
        experimentalSharedOdoArrays:true,metrics};
    const factory=createProjection(cobolParser,details,undefined,nested,metrics);
    const bytes=Buffer.alloc(32,0x20);
    bytes.write('2'+'110111'+'120121',0,'ascii');
    const current:ProjectionPhysicalRecord={buffers:[bytes],startByte:0,endByte:bytes.length,lastValidByte:bytes.length,
        source:'nested-odo.fb',recordNumber:1,recordState:createCobolRecordState(metrics)};
    const row=factory.create();
    factory.bind(row,current,current);
    expect(row.orders[0].items[0].value()).toBe(110);
    expect(row.orders[1].items[1].value()).toBe(121);
    expect(metrics.get(METRIC.ARRAY_PROXY_INDEX)).toBe(4);
    factory.clear(row);
});

test('the fast ODO binding rejects invalid and out-of-range controller values',()=>{
    const {factory}=setup(true);
    const row=factory.create();
    const tooMany=record(9);
    factory.bind(row,tooMany,tooMany);
    expect(()=>row.items).toThrow(/outside declared bounds/);
    factory.clear(row);
    const invalid=record(1);
    invalid.buffers[0][0]=0x58; // 'X' is not an ASCII DISPLAY digit
    factory.bind(row,invalid,invalid);
    expect(()=>row.items).toThrow(/Invalid unsigned DISPLAY ODO controller digit/);
    factory.clear(row);
});
