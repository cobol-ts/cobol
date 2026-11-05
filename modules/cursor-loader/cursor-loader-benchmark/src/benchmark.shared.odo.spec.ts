import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {scanCobolFile} from '@cobol-ts/cursor-loader-cobol/node';
import {defineProjection} from '@cobol-ts/cursor-projection';
import {MemoryMetrics,METRIC} from '@cobol-ts/metrics';
import {ODO_PATTERN,expectedOdoCounters} from './benchmark.odo.fixture';
import {scanCallback} from './benchmark.callback';
import {BENCHMARK_ODO_PROJECTION,parseBenchmarkArgs,type BenchmarkOdoRow} from './benchmark.scan';

test('ODO shared-array switch is opt-in and rejects non-ODO scenarios',()=>{
    expect(parseBenchmarkArgs(['--scenario','odo','--sample'])?.sharedOdoArrays).toBeUndefined();
    expect(parseBenchmarkArgs(['--scenario','odo','--shared-odo-arrays'])?.sharedOdoArrays).toBe(true);
    expect(()=>parseBenchmarkArgs(['--scenario','array','--shared-odo-arrays']))
        .toThrow(/requires --scenario odo/);
});

test('callback scanner verifies the real ODO projection with shared arrays enabled',async()=>{
    const directory=mkdtempSync(join(tmpdir(),'cobol-odo-shared-'));
    const filename=join(directory,'odo.fb');
    try {
        writeFileSync(filename,ODO_PATTERN);
        const copybook=resolve(__dirname,'../copybooks/benchmark-odo.cbl');
        const projection=defineProjection<BenchmarkOdoRow>(BENCHMARK_ODO_PROJECTION);
        const metrics=new MemoryMetrics();
        const totals=await scanCallback(visitor=>scanCobolFile({
            filename,copybook,projection,decodeOptions:{encoding:'ascii'},
            framing:{kind:'fixed',recordLength:200},
            experimentalSharedOdoArrays:true,metrics
        },visitor),9,'odo');
        expect(totals).toEqual(expectedOdoCounters(9));
        expect(metrics.get(METRIC.COBOL_CONTROLLER_READ)).toBe(9);
        expect(metrics.get(METRIC.ARRAY_PROXY_INDEX)).toBe(0);
        expect(metrics.get(METRIC.ARRAY_CHILD_BIND)).toBe(0);
        expect(metrics.get(METRIC.PROJECTION_BIND)).toBe(9);
        expect(metrics.get(METRIC.RECORD_ALLOCATE)).toBe(1);
    } finally {
        rmSync(directory,{recursive:true,force:true});
    }
});
