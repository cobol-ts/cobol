import {MemoryMetrics,METRIC} from '@cobol-ts/metrics';
import type {ProjectionPhysicalRecord} from '@cobol-ts/cursor-loader-types';
import {valueOrThrow} from '@cobol-ts/errors';
import {cobolParser,createCobolFixedDetails,createCobolProjectionDetails,createCobolRecordState} from './cobol.parser';
import {FixedCobolArraySelection,SymbolicCobolArraySelection} from './cobol.array.selection';
import {customerFixedOccurs,customerOdoRedefines} from './customer.fixtures';

function record(bytes:Uint8Array,recordNumber:number):ProjectionPhysicalRecord {
    return {buffers:[bytes],startByte:0,endByte:bytes.length,lastValidByte:bytes.length,
        source:'array-selection.fb',recordNumber,recordState:createCobolRecordState()};
}

describe('specialised COBOL projected-array providers',()=>{
    test('fixed provider caches the compiled path and reuses the child representation across records',()=>{
        const metrics=new MemoryMetrics();
        const details={...valueOrThrow(createCobolFixedDetails(customerFixedOccurs.layout)),metrics};
        const arrayPath=cobolParser.compileProjectionPath(details,undefined,['CUSTOMER','TELEPHONES']);
        const scalarPath=cobolParser.compileProjectionPath(details,undefined,['PHONE-RAW'],arrayPath);
        const first=record(customerFixedOccurs.records[0].bytes,1);
        const second=record(customerFixedOccurs.records[1].bytes,2);
        const provider=cobolParser.array(first,details,arrayPath);
        expect(provider).toBeInstanceOf(FixedCobolArraySelection);
        expect(provider.length()).toBe(2);
        const child=provider.element(1);
        expect(cobolParser.string(child,details,scalarPath)).toBe('10/16/d4 f6 f7 f8 f9 f0');
        expect(()=>provider.element(2)).toThrow(/OCCURS index/);
        const rebound=cobolParser.array(second,details,arrayPath,provider);
        expect(rebound).toBe(provider);
        expect(rebound.element(1,child)).toBe(child);
        expect(cobolParser.string(child,details,scalarPath)).toBe('10/16/c2 f1 f1 f2 f2 f3');
        expect(metrics.get(METRIC.COBOL_ARRAY_PROVIDER_CREATE)).toBe(1);
        expect(metrics.get(METRIC.COBOL_ARRAY_PROVIDER_BIND)).toBe(2);
    });

    test('a different compiled path cannot accidentally inherit another fixed provider',()=>{
        const metrics=new MemoryMetrics();
        const details={...valueOrThrow(createCobolFixedDetails(customerFixedOccurs.layout)),metrics};
        const firstPath=cobolParser.compileProjectionPath(details,undefined,['CUSTOMER','TELEPHONES']);
        const otherPath=cobolParser.compileProjectionPath(details,undefined,['CUSTOMER','TELEPHONES']);
        const bytes=record(customerFixedOccurs.records[0].bytes,1);
        const first=cobolParser.array(bytes,details,firstPath);
        const other=cobolParser.array(bytes,details,otherPath,first);
        expect(other).toBeInstanceOf(FixedCobolArraySelection);
        expect(other).not.toBe(first);
        expect(metrics.get(METRIC.COBOL_ARRAY_PROVIDER_CREATE)).toBe(2);
    });

    test('symbolic provider reuses its table and resolves changing ODO counts on rebinding',()=>{
        const metrics=new MemoryMetrics();
        const details={...valueOrThrow(createCobolProjectionDetails(customerOdoRedefines.layout)),metrics};
        const path=cobolParser.compileProjectionPath(details,undefined,['CUSTOMER','PURCHASES']);
        const empty=record(customerOdoRedefines.records[0].bytes,1);
        const populated=record(customerOdoRedefines.records[1].bytes,2);
        const provider=cobolParser.array(empty,details,path);
        expect(provider).toBeInstanceOf(SymbolicCobolArraySelection);
        expect(provider.length()).toBe(0);
        expect(()=>provider.element(0)).toThrow(/OCCURS index/);
        const rebound=cobolParser.array(populated,details,path,provider);
        expect(rebound).toBe(provider);
        expect(rebound.length()).toBe(3);
        const item=rebound.element(2);
        expect('originBits' in item ? item.originBits : -1).toBe(19*8);
        expect(metrics.get(METRIC.COBOL_ARRAY_PROVIDER_CREATE)).toBe(1);
        expect(metrics.get(METRIC.COBOL_ARRAY_PROVIDER_BIND)).toBe(2);
    });
});
