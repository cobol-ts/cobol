import {join} from 'node:path';
import {MemoryMetrics,METRIC} from '@cobol-ts/metrics';
import {scanCobolFile,readCobolFile} from '@cobol-ts/cursor-loader-cobol/node';
import {defineProjection} from '@cobol-ts/cursor-projection';
import {scanCallback,runCallbackBenchmark} from './benchmark.callback';
import {expectedCounters} from './benchmark.fixture';
import {
    BENCHMARK_PROJECTION,BENCHMARK_COMPLEX_PROJECTION,
    parseBenchmarkArgs,type BenchmarkRow,type BenchmarkArrayRow,type BenchmarkScenario
} from './benchmark.scan';

const data=join(__dirname,'../data/sample-100k.dat');
const baselineCopybook=join(__dirname,'../copybooks/benchmark.cbl');
const complexCopybook=join(__dirname,'../copybooks/benchmark-complex.cbl');

async function measured(scenario:BenchmarkScenario,count:number,metrics?:MemoryMetrics){
    const options={filename:data,copybook:scenario==='baseline'?baselineCopybook:complexCopybook,
        bufferSize:8192,decodeOptions:{encoding:'ascii' as const},metrics};
    if(scenario==='baseline') {
        const projection=defineProjection<BenchmarkRow>(BENCHMARK_PROJECTION);
        return scanCallback(visitor=>scanCobolFile({...options,projection},visitor),count,scenario);
    }
    const projection=defineProjection<BenchmarkArrayRow>(BENCHMARK_COMPLEX_PROJECTION);
    return scanCallback(visitor=>scanCobolFile({...options,projection},visitor),count,scenario);
}

test('single top-level metrics object sees record, projection, array and COBOL operations',async()=>{
    const metrics=new MemoryMetrics();
    expect(await measured('array',100,metrics)).toEqual(expectedCounters(100));
    expect(metrics.get(METRIC.FILE_SCAN_RECORD)).toBe(100);
    expect(metrics.get(METRIC.RECORD_BORROW)).toBe(100);
    expect(metrics.get(METRIC.RECORD_RETURN)).toBe(100);
    expect(metrics.get(METRIC.RECORD_STATE_CLEAN)).toBe(100);
    expect(metrics.get(METRIC.ARRAY_PROPERTY)).toBe(100);
    expect(metrics.get(METRIC.ARRAY_PROXY_INDEX)).toBe(200);
    expect(metrics.get(METRIC.ARRAY_ELEMENT)).toBe(200);
    expect(metrics.get(METRIC.ARRAY_CHILD_BIND)).toBe(200);
    expect(metrics.get(METRIC.ARRAY_CHILD_CLEAR_VISIT)).toBe(200);
    // Root + two active children once each. No pre-bind clear of unbound children.
    expect(metrics.get(METRIC.PROJECTION_CLEAR)).toBe(300);
    expect(metrics.get(METRIC.ARRAY_RUNTIME_CREATE)).toBe(1);
    expect(metrics.get(METRIC.ARRAY_CHILD_ALLOCATE)).toBe(2);
    expect(metrics.get(METRIC.ARRAY_CHILD_REUSE)).toBe(198);
    expect(metrics.get(METRIC.PROJECTION_CREATE)).toBe(3);
    expect(metrics.get(METRIC.COBOL_FIELD_RANGE)).toBe(600);
    expect(metrics.get(METRIC.COBOL_FIXED_FAST)).toBe(600);
    expect(metrics.get(METRIC.COBOL_DECODER_INVOKE)).toBe(600);
    expect(metrics.get(METRIC.COBOL_DECODER_COMPILE)).toBe(7);
    expect(metrics.get(METRIC.COBOL_PATH_COMPILE)).toBe(8);
});

test('fixed-array child cache and cleanup visits scale linearly across 100, 1000 and 10000 records',async()=>{
    for(const records of [100,1000,10000]){
        const metrics=new MemoryMetrics();
        expect(await measured('array',records,metrics)).toEqual(expectedCounters(records));
        expect(metrics.get(METRIC.ARRAY_CHILD_ALLOCATE)).toBe(2);
        expect(metrics.get(METRIC.ARRAY_RUNTIME_CREATE)).toBe(1);
        expect(metrics.get(METRIC.ARRAY_CHILD_BIND)).toBe(2*records);
        expect(metrics.get(METRIC.ARRAY_CHILD_CLEAR_VISIT)).toBe(2*records);
        expect(metrics.get(METRIC.PROJECTION_CLEAR_ROOT_ARRAY_VISIT)).toBe(records);
        expect(metrics.get(METRIC.PROJECTION_CREATE)).toBe(3);
    }
});

test('baseline and REDEFINES produce the same verified checksums without array activity',async()=>{
    for(const scenario of ['baseline','redefines'] as const){
        const metrics=new MemoryMetrics();
        expect(await measured(scenario,100,metrics)).toEqual(expectedCounters(100));
        expect(metrics.get(METRIC.COBOL_FIXED_FAST)).toBe(600);
        expect(metrics.get(METRIC.ARRAY_PROXY_INDEX)).toBe(0);
        expect(metrics.get(METRIC.ARRAY_CHILD_ALLOCATE)).toBe(0);
    }
});

test('no metrics option leaves behaviour and checksums unchanged',async()=>{
    expect(await measured('array',100)).toEqual(expectedCounters(100));
    expect(await measured('baseline',100)).toEqual(expectedCounters(100));
});

test('the CLI accepts --metrics and warm-up counters are excluded from measured output',async()=>{
    expect(parseBenchmarkArgs(['--metrics'])?.metrics).toBe(true);
    expect(parseBenchmarkArgs(['--sample','--scenario','array'])?.metrics).toBeUndefined();
    const metrics=new MemoryMetrics();
    const options={...parseBenchmarkArgs(['--metrics','--scenario','array','--sample',
        '--warmup','10','--limit','20'])!,data};
    const projection=defineProjection<BenchmarkArrayRow>(BENCHMARK_COMPLEX_PROJECTION);
    const messages:string[]=[];
    const result=await runCallbackBenchmark(options,
        visitor=>scanCobolFile({filename:data,copybook:complexCopybook,projection,
            bufferSize:8192,decodeOptions:{encoding:'ascii'},metrics},visitor),
        message=>messages.push(message),metrics);
    expect(result.records).toBe(20);
    expect(metrics.get(METRIC.FILE_SCAN_RECORD)).toBe(20);
    expect(metrics.get(METRIC.ARRAY_CHILD_BIND)).toBe(40);
    expect(messages).toContain('METRICS measured pass (warm-up excluded):');
    expect(messages).toContain('  array.child.bind=40');
    const counters=messages.filter(message=>message.startsWith('  '));
    expect(counters.map(message=>message.slice(2,message.indexOf("="))))
        .toEqual(counters.map(message=>message.slice(2,message.indexOf("="))).sort());
});


test('async file reader receives the same metrics through reader options',async()=>{
    const metrics=new MemoryMetrics();
    const projection=defineProjection<BenchmarkRow>(BENCHMARK_PROJECTION);
    const reader=readCobolFile({filename:data,copybook:baselineCopybook,projection,
        bufferSize:4096,decodeOptions:{encoding:'ascii'},metrics});
    let rows=0;
    for await(const lease of reader){
        try {expect(lease.result.amountA()).toBeGreaterThan(0);}
        finally {lease.close();}
        if(++rows===2) break;
    }
    expect(rows).toBe(2);
    expect(metrics.get(METRIC.COBOL_FIELD_RANGE)).toBe(2);
    expect(metrics.get(METRIC.PROJECTION_CREATE)).toBeGreaterThan(0);
    expect(metrics.get(METRIC.RECORD_RETURN)).toBeGreaterThan(0);
});


test('repeated metrics output resets warm-up and each measured pass',async()=>{
    const metrics=new MemoryMetrics();
    const options={...parseBenchmarkArgs(['--metrics','--sample','--scenario','array','--warmup','10','--limit','20','--runs','3'])!,data};
    const projection=defineProjection<BenchmarkArrayRow>(BENCHMARK_COMPLEX_PROJECTION);
    const messages:string[]=[];
    await runCallbackBenchmark(options,
        visitor=>scanCobolFile({filename:data,copybook:complexCopybook,projection,
            bufferSize:8192,decodeOptions:{encoding:'ascii'},metrics},visitor),
        message=>messages.push(message),metrics);
    expect(metrics.get(METRIC.FILE_SCAN_RECORD)).toBe(20);
    expect(messages.filter(message=>message==='  array.child.bind=40')).toHaveLength(3);
    expect(messages.filter(message=>message.includes('warm-up excluded'))).toHaveLength(3);
});
