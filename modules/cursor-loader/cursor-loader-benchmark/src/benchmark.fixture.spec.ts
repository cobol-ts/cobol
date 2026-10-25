import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {CYCLE,makeRecord,RECORD_BYTES,PATTERN_COUNT,expectedCounters} from './benchmark.fixture';
import {generateFile,makeChunk,parseGenerateArgs} from './benchmark.generate';
import {verifyFile} from './benchmark.verify';

function tempFile(action:(filename:string)=>void):void {
    const dir=mkdtempSync(join(tmpdir(),'cobol-benchmark-'));
    try {action(join(dir,'benchmark.dat'));} finally {rmSync(dir,{force:true,recursive:true});}
}

test('the ten COBOL patterns are distinct 200-byte records',()=>{
    expect(CYCLE.length).toBe(RECORD_BYTES*PATTERN_COUNT);
    expect(new Set(Array.from({length:10},(_v,i)=>makeRecord(i).toString('hex'))).size).toBe(10);
    expect(makeChunk(100)).toEqual(Buffer.concat(Array.from({length:10},()=>CYCLE)));
    expect(()=>makeChunk(11)).toThrow(/multiple of ten/);
});

test('fixed sample totals match the JRecord benchmark',()=>{
    expect(expectedCounters(100_000)).toEqual({records:100_000,totalSum:18_610_500_000,
        activeNorthCount:20_000,activeNorthSum:4_015_900_000,
        approvedPremiumCount:30_000,approvedPremiumSum:5_509_700_000});
    expect(expectedCounters(100_000_000)).toEqual({records:100_000_000,totalSum:18_610_500_000_000,
        activeNorthCount:20_000_000,activeNorthSum:4_015_900_000_000,
        approvedPremiumCount:30_000_000,approvedPremiumSum:5_509_700_000_000});
});

test('generation and verification handle incomplete ten-record final cycle',()=>tempFile(file=>{
    const result=generateFile({output:file,records:23,chunkRecords:10,force:false});
    expect(result.fileBytes).toBe(23*RECORD_BYTES);
    expect(readFileSync(file)).toEqual(Buffer.concat([CYCLE,CYCLE,CYCLE.subarray(0,3*RECORD_BYTES)]));
    expect(verifyFile(file,23)).toBe(23);
    expect(()=>generateFile({output:file,records:23,chunkRecords:10,force:false})).toThrow();
}));

test('CLI generator arguments validate numeric sizes',()=>{
    expect(parseGenerateArgs([])?.records).toBe(100_000_000);
    expect(parseGenerateArgs(['--records','20','--force'])?.force).toBe(true);
    expect(()=>parseGenerateArgs(['--records','oops'])).toThrow(/nonnegative integer/);
});

test('bundled sample is identical to the JRecord fixture',()=>{
    const data=readFileSync(join(__dirname,'../data/sample-100k.dat'));
    expect(data.length).toBe(20_000_000);
    expect(data.subarray(0,CYCLE.length)).toEqual(CYCLE);
    expect(data.subarray(-CYCLE.length)).toEqual(CYCLE);
});
