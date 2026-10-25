import {statSync} from 'node:fs';
import {resolve} from 'node:path';
import {performance} from 'node:perf_hooks';
import {
    checkedNonNegativeInteger,emptyCounters,expectedCounters,RECORD_BYTES,
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
    log:(message:string)=>void=console.log
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
    log('Measured pass: reopen file and start at byte 0');
    const start=performance.now();
    const actual=await scanCallback(open,count,options.scenario);
    const seconds=(performance.now()-start)/1000;
    if(actual.records!==count) throw new Error(`Measured pass ended early: ${actual.records}/${count}`);
    assertTotals('measured',actual);
    log(`measured verified: ${formatTotals(actual)}`);
    const bytes=actual.records*RECORD_BYTES;
    const result:BenchmarkResult={...actual,seconds,recordsPerSecond:actual.records/seconds,
        mibPerSecond:bytes/(1024*1024)/seconds};
    log(`BENCHMARK result=cursor-loader-callback scenario=${options.scenario} records=${actual.records} bytes=${bytes} seconds=${seconds.toFixed(6)} recordsPerSecond=${Math.round(result.recordsPerSecond)} mibPerSecond=${result.mibPerSecond.toFixed(2)}`);
    return result;
}
