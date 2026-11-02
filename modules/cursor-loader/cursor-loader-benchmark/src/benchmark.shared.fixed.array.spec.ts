import {join} from 'node:path';
import {MemoryMetrics,METRIC} from '@cobol-ts/metrics';
import {defineProjection} from '@cobol-ts/cursor-projection';
import {scanCobolFile} from '@cobol-ts/cursor-loader-cobol/node';
import {BENCHMARK_COMPLEX_PROJECTION,type BenchmarkArrayRow} from './benchmark.scan';

const filename=join(__dirname,'../data/sample-100k.dat');
const copybook=join(__dirname,'../copybooks/benchmark-complex.cbl');
const projection=defineProjection<BenchmarkArrayRow>(BENCHMARK_COMPLEX_PROJECTION);

test('eligible fixed arrays use native indexing and a single lease binding',async()=>{
    const metrics=new MemoryMetrics();
    let count=0;
    let previousArray:BenchmarkArrayRow['amounts']|undefined;
    let firstChild:BenchmarkArrayRow['amounts'][number]|undefined;
    await scanCobolFile({filename,copybook,projection,decodeOptions:{encoding:'ascii'},
        metrics},row=>{
        expect(Array.isArray(row.amounts)).toBe(true);
        expect(row.amounts.length).toBe(2);
        if(previousArray) {
            expect(row.amounts).toBe(previousArray);
            expect(row.amounts[0]).toBe(firstChild);
        }
        previousArray=row.amounts;
        firstChild=row.amounts[0];
        // Numeric values are decoded from the current original record only.
        expect(Number.isFinite(row.amounts[0].value())).toBe(true);
        expect(Number.isFinite(row.amounts[1].value())).toBe(true);
        count++;
        return count<100;
    });
    expect(count).toBe(100);
    expect(metrics.get(METRIC.ARRAY_PROXY_INDEX)).toBe(0);
    expect(metrics.get(METRIC.ARRAY_CHILD_BIND)).toBe(0);
    expect(metrics.get(METRIC.ARRAY_RUNTIME_BIND)).toBe(100);
    expect(metrics.get(METRIC.PROJECTION_CREATE)).toBe(3);
});

test('default shared fixed children are unbound on close and remain live for other leased records',async()=>{
    // The scan's synchronous lease means a retained view is invalid between callbacks.
    let saved:BenchmarkArrayRow['amounts'][number]|undefined;
    await scanCobolFile({filename,copybook,projection,decodeOptions:{encoding:'ascii'},
        },row=>{saved=row.amounts[0];return false;});
    expect(()=>saved!.value()).toThrow(/not bound/);
});


test('default selection does not require a benchmark-only CLI flag',()=>{
    const {parseBenchmarkArgs}=require('./benchmark.scan') as typeof import('./benchmark.scan');
    expect(parseBenchmarkArgs(['--scenario','array','--sample'])?.scenario).toBe('array');
    expect(()=>parseBenchmarkArgs(['--shared-fixed-arrays'])).toThrow(/Unknown argument/);
});
