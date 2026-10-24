import {statSync} from 'node:fs';
import {resolve} from 'node:path';
import {performance} from 'node:perf_hooks';
import type {ProjectionDefinition} from '@cobol-ts/cursor-loader-types';
import {
    COUNTER_NAMES,checkedNonNegativeInteger,emptyCounters,expectedCounters,RECORD_BYTES,
    type Counters
} from './benchmark.fixture';

/** Shape projected by the production cursor, not raw byte offsets. */
export type BenchmarkRow = Readonly<{
    amountA(): number;
    amountB(): number;
    status(): string;
    region(): string;
    category(): string;
    approved(): string;
}>;

export const BENCHMARK_PROJECTION: ProjectionDefinition<BenchmarkRow> = {
    amountA: {type:'integer',path:['BENCHMARK-RECORD','AMOUNT-A']},
    amountB: {type:'integer',path:['BENCHMARK-RECORD','AMOUNT-B']},
    status: {type:'character',path:['BENCHMARK-RECORD','STATUS-CODE']},
    region: {type:'character',path:['BENCHMARK-RECORD','REGION-CODE']},
    category: {type:'character',path:['BENCHMARK-RECORD','CATEGORY-CODE']},
    approved: {type:'character',path:['BENCHMARK-RECORD','APPROVED-FLAG']}
};
export type RecordLease = Readonly<{result:BenchmarkRow;close():void}>;
export type RecordSource = () => AsyncIterable<RecordLease>;

export type BenchmarkOptions = Readonly<{
    data:string;
    copybook:string;
    warmup:number;
    limit:number|'all';
    bufferSize:number;
    decodeOptions:Readonly<Record<string,unknown>>;
}>;
export type BenchmarkResult = Counters & Readonly<{
    seconds:number;
    recordsPerSecond:number;
    mibPerSecond:number;
}>;

/** Same six decoded fields and two predicates as the Java/JRecord benchmark. */
export function processRow(row:BenchmarkRow,result:Counters):void {
    const a = row.amountA();
    const b = row.amountB();
    const sum = a + b;
    const status = row.status();
    const region = row.region();
    const category = row.category();
    const approved = row.approved();
    result.records++;
    result.totalSum += sum;
    if(status==='A' && region==='N') {
        result.activeNorthCount++;
        result.activeNorthSum+=sum;
    }
    if(category==='P' && approved==='Y') {
        result.approvedPremiumCount++;
        result.approvedPremiumSum+=sum;
    }
}

/** Always release the borrowed record, including when a getter throws. */
export async function scan(source:RecordSource,maxRecords:number):Promise<Counters> {
    checkedNonNegativeInteger(maxRecords,'maxRecords');
    const result = emptyCounters();
    if(maxRecords===0) return result;
    for await(const lease of source()) {
        try {processRow(lease.result,result);}
        finally {lease.close();}
        if(result.records>=maxRecords) break;
    }
    return result;
}

export function assertTotals(stage:string,actual:Counters):void {
    const expected = expectedCounters(actual.records);
    for(const name of COUNTER_NAMES) {
        if(actual[name]!==expected[name])
            throw new Error(`${stage} FAILED ${name}: actual=${actual[name]} expected=${expected[name]}. Verify COBOL decoder / ASCII DISPLAY configuration.`);
    }
}
export function formatTotals(result:Counters):string {
    return COUNTER_NAMES.map(name=>`${name}=${result[name]}`).join(' ');
}

export function parseBenchmarkArgs(args:readonly string[]):BenchmarkOptions|undefined {
    const options:{data:string;copybook:string;warmup:number;limit:number|'all';bufferSize:number;decodeOptions:Record<string,unknown>}={
        data:'data/benchmark.dat',copybook:'copybooks/benchmark.cbl',warmup:100_000,
        limit:'all',bufferSize:64*1024,decodeOptions:{encoding: 'ascii' }
    };
    for(let i=0;i<args.length;i++) {
        const arg=args[i];
        if(arg==='--help' || arg==='-h') return undefined;
        if(arg==='--sample') {options.data='data/sample-100k.dat';continue;}
        if(!['--data','--copybook','--warmup','--limit','--buffer-size','--decode-options'].includes(arg))
            throw new Error(`Unknown argument: ${arg}`);
        const value=args[++i];
        if(value===undefined) throw new Error(`Missing value for ${arg}`);
        if(arg==='--data') options.data=value;
        else if(arg==='--copybook') options.copybook=value;
        else if(arg==='--decode-options') {
            const parsed:unknown=JSON.parse(value);
            if(parsed===null || typeof parsed!=='object' || Array.isArray(parsed))
                throw new Error('--decode-options requires a JSON object');
            options.decodeOptions=parsed as Record<string,unknown>;
        } else if(arg==='--limit' && value==='all') options.limit='all';
        else {
            if(!/^\d+$/.test(value)) throw new Error(`${arg} requires a nonnegative integer`);
            const number=checkedNonNegativeInteger(Number(value),arg);
            if(arg==='--warmup') options.warmup=number;
            if(arg==='--limit') options.limit=number;
            if(arg==='--buffer-size') options.bufferSize=number;
        }
    }
    if(options.bufferSize<RECORD_BYTES) throw new Error('buffer-size must be at least 200');
    return options;
}

/** Reopen the source for the measured pass, as in the Java benchmark. */
export async function runBenchmark(options:BenchmarkOptions,open:RecordSource,
    log:(message:string)=>void=console.log):Promise<BenchmarkResult> {
    checkedNonNegativeInteger(options.warmup,'warmup');
    const file=resolve(options.data);
    const fileBytes=statSync(file).size;
    if(fileBytes%RECORD_BYTES!==0) throw new Error(`File size ${fileBytes} is not divisible by 200`);
    const availableRecords=fileBytes/RECORD_BYTES;
    const count=options.limit==='all'?availableRecords:Math.min(availableRecords,checkedNonNegativeInteger(options.limit,'limit'));
    log(`Node COBOL benchmark / fixed ${RECORD_BYTES} bytes / same JRecord record rules`);
    log(`file=${file} fileBytes=${fileBytes} availableRecords=${availableRecords} measuredRecords=${count}`);
    const warmCount=Math.min(options.warmup,availableRecords);
    log(`Warmup: first ${warmCount} records`);
    const warmed=await scan(open,warmCount);
    if(warmed.records!==warmCount) throw new Error(`Warmup ended early: ${warmed.records}/${warmCount}`);
    assertTotals('warmup',warmed);
    log(`warmup verified: ${formatTotals(warmed)}`);
    log('Measured pass: reopen file and start at byte 0');
    const started=performance.now();
    const actual=await scan(open,count);
    const seconds=(performance.now()-started)/1000;
    if(actual.records!==count) throw new Error(`Measured pass ended early: ${actual.records}/${count}`);
    assertTotals('measured',actual);
    log(`measured verified: ${formatTotals(actual)}`);
    const bytes=actual.records*RECORD_BYTES;
    const result:BenchmarkResult={...actual,seconds,recordsPerSecond:actual.records/seconds,
        mibPerSecond:bytes/(1024*1024)/seconds};
    log(`BENCHMARK result=cursor-loader records=${actual.records} bytes=${bytes} seconds=${seconds.toFixed(6)} recordsPerSecond=${Math.round(result.recordsPerSecond)} mibPerSecond=${result.mibPerSecond.toFixed(2)}`);
    return result;
}
