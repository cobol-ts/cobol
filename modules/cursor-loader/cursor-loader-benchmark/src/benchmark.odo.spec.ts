import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {makeOdoRecord,ODO_CYCLE,ODO_PATTERN,expectedOdoCounters,odoValue} from './benchmark.odo.fixture';
import {makeOdoChunk,generateOdoFile} from './benchmark.odo.generate';
import {assertTotals,parseBenchmarkArgs,processRow,type BenchmarkOdoRow} from './benchmark.scan';
import {emptyCounters,RECORD_BYTES} from './benchmark.fixture';

test('ODO fixture has nine distinct fixed-frame records with counts 0 through 8',()=>{
    expect(ODO_PATTERN.length).toBe(ODO_CYCLE*RECORD_BYTES);
    expect(new Set(Array.from({length:ODO_CYCLE},(_,i)=>makeOdoRecord(i).toString('hex'))).size).toBe(9);
    for(let i=0;i<ODO_CYCLE;i++) {
        const record=makeOdoRecord(i);
        expect(record.length).toBe(200);
        expect(record.toString('ascii',0,1)).toBe(String(i));
        expect(record.toString('ascii',5,14)).toBe(String(odoValue(i,0)).padStart(9,'0'));
        expect(record.toString('ascii',68,77)).toBe(String(odoValue(i,7)).padStart(9,'0'));
    }
});

test('ODO generator repeats nine records, handles a partial cycle, and refuses overwrite',()=>{
    const dir=mkdtempSync(join(tmpdir(),'cobol-odo-'));
    try {
        const path=join(dir,'odo.dat');
        const result=generateOdoFile({output:path,records:20,chunkRecords:18,force:false});
        expect(result.fileBytes).toBe(4000);
        expect(readFileSync(path)).toEqual(Buffer.concat([ODO_PATTERN,ODO_PATTERN,ODO_PATTERN.subarray(0,400)]));
        expect(()=>generateOdoFile({output:path,records:20,chunkRecords:18,force:false})).toThrow();
        expect(makeOdoChunk(18)).toEqual(Buffer.concat([ODO_PATTERN,ODO_PATTERN]));
        expect(()=>makeOdoChunk(10)).toThrow(/multiple of 9/);
    } finally {rmSync(dir,{recursive:true,force:true});}
});

test('ODO scenario picks its own copybook and independent checksums',()=>{
    const parsed=parseBenchmarkArgs(['--scenario','odo','--limit','20']);
    expect(parsed?.copybook).toBe('copybooks/benchmark-odo.cbl');
    expect(parsed?.scenario).toBe('odo');
    expect(expectedOdoCounters(0).records).toBe(0);
    expect(expectedOdoCounters(9).totalSum).toBe(0+101000+2*102000+37+2*103000+37+2*104000+37+2*105000+37+2*106000+37+2*107000+37+2*108000+37);
    expect(()=>assertTotals('odo',emptyCounters(),'odo')).not.toThrow();
});

test('ODO processing reads no absent items and reads the first two present items',()=>{
    for(const count of [0,1,2,8]) {
        let accessCount=0;
        const row={
            items:Array.from({length:count},(_,index)=>({value:()=>{accessCount++;return 1000+index;}})),
            status:()=> 'A',region:()=> 'N',category:()=> 'P',approved:()=> 'Y'
        } as unknown as BenchmarkOdoRow;
        const counters=emptyCounters();
        processRow(row,counters,'odo');
        expect(accessCount).toBe(Math.min(2,count));
        expect(counters.totalSum).toBe(count===0?0:count===1?1000:2001);
        expect(counters.records).toBe(1);
    }
});

 test('bundled ODO sample repeats the canonical cycle',()=>{
    const bytes=readFileSync(join(__dirname,'../data/odo-sample-100k.dat'));
    expect(bytes.length).toBe(100_000*RECORD_BYTES);
    expect(bytes.subarray(0,ODO_PATTERN.length)).toEqual(ODO_PATTERN);
    expect(bytes.subarray(bytes.length-RECORD_BYTES)).toEqual(makeOdoRecord((100_000-1)%ODO_CYCLE));
 });
