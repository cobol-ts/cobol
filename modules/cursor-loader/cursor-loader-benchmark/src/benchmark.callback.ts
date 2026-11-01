import {MemoryMetrics} from '@cobol-ts/metrics';
import {runMeasuredPasses} from './benchmark.measurement';
import {statSync} from 'node:fs';
import {resolve} from 'node:path';
import {
    checkedNonNegativeInteger,emptyCounters,RECORD_BYTES,
    type Counters
} from './benchmark.fixture';
import {
    type BenchmarkOptions,type BenchmarkResult,type BenchmarkRow,
    assertTotals,formatTotals,processRow,type BenchmarkScenario
} from './benchmark.scan';

/** A fresh file is opened for each scan; record objects are borrowed. */
export type CallbackRecordSource = (visitor:(row:BenchmarkRow)=>void|boolean)=>Promise<void>;

/** Process all available records synchronously in each file-buffer batch. */
export async function scanCallback(source:CallbackRecordSource,maxRecords:number,scenario:BenchmarkScenario='baseline'):Promise<Counters> {
    checkedNonNegativeInteger(maxRecords,'maxRecords');
    const totals=emptyCounters();
    if(maxRecords===0) return totals;
    await source(row=>{
        processRow(row,totals,scenario);
        return totals.records < maxRecords;
    });
    return totals;
}

/** Identical warm-up and checksum verification to the existing async iterator benchmark. */
export async function runCallbackBenchmark(
    options:BenchmarkOptions,
    open:CallbackRecordSource,
    log:(message:string)=>void=console.log,
    metrics?:MemoryMetrics
):Promise<BenchmarkResult> {
    checkedNonNegativeInteger(options.warmup,'warmup');
    const file=resolve(options.data);
    const fileBytes=statSync(file).size;
    if(fileBytes%RECORD_BYTES!==0) throw new Error(`File size ${fileBytes} is not divisible by 200`);
    const availableRecords=fileBytes/RECORD_BYTES;
    const count=options.limit==='all'?availableRecords:Math.min(availableRecords,checkedNonNegativeInteger(options.limit,'limit'));
    log(`Node COBOL callback benchmark / scenario=${options.scenario} / fixed ${RECORD_BYTES} bytes / same JRecord record rules`);
    log(`file=${file} fileBytes=${fileBytes} availableRecords=${availableRecords} measuredRecords=${count}`);
    const warmCount=Math.min(options.warmup,availableRecords);
    log(`Warmup: first ${warmCount} records`);
    const warmed=await scanCallback(open,warmCount,options.scenario);
    if(warmed.records!==warmCount) throw new Error(`Warmup ended early: ${warmed.records}/${warmCount}`);
    assertTotals('warmup',warmed);
    log(`warmup verified: ${formatTotals(warmed)}`);
    return runMeasuredPasses({
        options,scan:()=>scanCallback(open,count,options.scenario),
        resultName:'cursor-loader-callback',expectedRecords:count,assertTotals,formatTotals,log,metrics
    });
}
