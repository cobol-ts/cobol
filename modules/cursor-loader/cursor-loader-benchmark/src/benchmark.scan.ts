import {statSync} from 'node:fs';
import {resolve} from 'node:path';
import {runMeasuredPasses} from './benchmark.measurement';
import type {ProjectionDefinition} from '@cobol-ts/cursor-loader-types';
import type {ProjectedArray} from '@cobol-ts/arrays';
import {expectedOdoCounters} from './benchmark.odo.fixture';
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

export type BenchmarkScenario = 'baseline' | 'array' | 'redefines' | 'odo';
export type BenchmarkOdoRow = Readonly<{
    items:ProjectedArray<Readonly<{value():number}>>;
    status():string;region():string;category():string;approved():string;
}>;
export const BENCHMARK_ODO_PROJECTION:ProjectionDefinition<BenchmarkOdoRow>={
    items:{type:'array',path:['ODO-BENCHMARK-RECORD','ITEMS'],element:{
        value:{type:'integer',path:['ITEM-VALUE']}
    }},
    status:{type:'character',path:['ODO-BENCHMARK-RECORD','STATUS-CODE']},
    region:{type:'character',path:['ODO-BENCHMARK-RECORD','REGION-CODE']},
    category:{type:'character',path:['ODO-BENCHMARK-RECORD','CATEGORY-CODE']},
    approved:{type:'character',path:['ODO-BENCHMARK-RECORD','APPROVED-FLAG']}
};
export type BenchmarkArrayRow = BenchmarkRow & Readonly<{
    amounts:ProjectedArray<Readonly<{value():number}>>;
}>;

/** Both complex scenarios read the same physical bytes as the baseline. */
export const BENCHMARK_COMPLEX_PROJECTION:ProjectionDefinition<BenchmarkArrayRow> = {
    amountA:{type:'integer',path:['BENCHMARK-RECORD','AMOUNTS-ALIAS','AMOUNT-A']},
    amountB:{type:'integer',path:['BENCHMARK-RECORD','AMOUNTS-ALIAS','AMOUNT-B']},
    amounts:{type:'array',path:['BENCHMARK-RECORD','AMOUNT-AREA','AMOUNT-CELL'],element:{
        value:{type:'integer',path:['CELL-VALUE']}
    }},
    status:{type:'character',path:['BENCHMARK-RECORD','STATUS-CODE']},
    region:{type:'character',path:['BENCHMARK-RECORD','REGION-CODE']},
    category:{type:'character',path:['BENCHMARK-RECORD','CATEGORY-CODE']},
    approved:{type:'character',path:['BENCHMARK-RECORD','APPROVED-FLAG']}
};

export const BENCHMARK_PROJECTION: ProjectionDefinition<BenchmarkRow> = {
    amountA: {type:'integer',path:['BENCHMARK-RECORD','AMOUNT-A']},
    amountB: {type:'integer',path:['BENCHMARK-RECORD','AMOUNT-B']},
    status: {type:'character',path:['BENCHMARK-RECORD','STATUS-CODE']},
    region: {type:'character',path:['BENCHMARK-RECORD','REGION-CODE']},
    category: {type:'character',path:['BENCHMARK-RECORD','CATEGORY-CODE']},
    approved: {type:'character',path:['BENCHMARK-RECORD','APPROVED-FLAG']}
};
export type BenchmarkAnyRow=BenchmarkRow|BenchmarkOdoRow;
export type RecordLease = Readonly<{result:BenchmarkAnyRow;close():void}>;
export type RecordSource = () => AsyncIterable<RecordLease>;

export type BenchmarkOptions = Readonly<{
    data:string;
    copybook:string;
    warmup:number;
    limit:number|'all';
    bufferSize:number;
    decodeOptions:Readonly<Record<string,unknown>>;
    scenario:BenchmarkScenario;
    metrics?:boolean;
    runs?:number;
    runtimeStats?:boolean;
    sharedOdoArrays?:boolean;
}>;
export type BenchmarkResult = Counters & Readonly<{
    seconds:number;
    recordsPerSecond:number;
    mibPerSecond:number;
}>;

/** Same six decoded fields and two predicates as the Java/JRecord benchmark. */
export function processRow(row:BenchmarkAnyRow,result:Counters,scenario:BenchmarkScenario='baseline'):void {
    if(scenario==='odo') {
        const odo=row as unknown as BenchmarkOdoRow;
        const count=odo.items.length;
        const sum=(count>0?odo.items[0].value():0)+(count>1?odo.items[1].value():0);
        const status=odo.status(),region=odo.region(),category=odo.category(),approved=odo.approved();
        result.records++;result.totalSum+=sum;
        if(status==='A' && region==='N'){result.activeNorthCount++;result.activeNorthSum+=sum;}
        if(category==='P' && approved==='Y'){result.approvedPremiumCount++;result.approvedPremiumSum+=sum;}
        return;
    }
    const normal=row as BenchmarkRow;
    const amounts=scenario==='array' ? (row as BenchmarkArrayRow).amounts : undefined;
    const a=amounts ? amounts[0].value() : normal.amountA();
    const b=amounts ? amounts[1].value() : normal.amountB();
    const sum = a + b;
    const status = normal.status();
    const region = normal.region();
    const category = normal.category();
    const approved = normal.approved();
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
export async function scan(source:RecordSource,maxRecords:number,scenario:BenchmarkScenario='baseline'):Promise<Counters> {
    checkedNonNegativeInteger(maxRecords,'maxRecords');
    const result = emptyCounters();
    if(maxRecords===0) return result;
    for await(const lease of source()) {
        try {processRow(lease.result,result,scenario);}
        finally {lease.close();}
        if(result.records>=maxRecords) break;
    }
    return result;
}

export function assertTotals(stage:string,actual:Counters,scenario:BenchmarkScenario='baseline'):void {
    const expected = scenario==='odo'?expectedOdoCounters(actual.records):expectedCounters(actual.records);
    for(const name of COUNTER_NAMES) {
        if(actual[name]!==expected[name])
            throw new Error(`${stage} FAILED ${name}: actual=${actual[name]} expected=${expected[name]}. Verify COBOL decoder / ASCII DISPLAY configuration.`);
    }
}
export function formatTotals(result:Counters):string {
    return COUNTER_NAMES.map(name=>`${name}=${result[name]}`).join(' ');
}

export function parseBenchmarkArgs(args:readonly string[]):BenchmarkOptions|undefined {
    const options:{data:string;copybook:string;warmup:number;limit:number|'all';bufferSize:number;decodeOptions:Record<string,unknown>;scenario:BenchmarkScenario;metrics?:boolean;runs?:number;runtimeStats?:boolean;sharedOdoArrays?:boolean}={
        data:'data/benchmark.dat',copybook:'copybooks/benchmark.cbl',warmup:100_000,
        limit:'all',bufferSize:64*1024,decodeOptions:{encoding:'ascii'},scenario:'baseline'
    };
    let sampleRequested=false;
    for(let i=0;i<args.length;i++) {
        const arg=args[i];
        if(arg==='--help' || arg==='-h') return undefined;
        if(arg==='--metrics') {options.metrics=true;continue;}
        if(arg==='--shared-odo-arrays') {options.sharedOdoArrays=true;continue;}
        if(arg==='--runtime-stats') {options.runtimeStats=true;continue;}
        if(arg==='--sample') {sampleRequested=true;continue;}
        if(arg==='--scenario') {
            const name=args[++i];
            if(name!=='baseline' && name!=='array' && name!=='redefines' && name!=='odo')
                throw new Error('--scenario requires baseline, array, redefines or odo');
            options.scenario=name;
            if(name==='odo') options.copybook='copybooks/benchmark-odo.cbl';
            else if(name!=='baseline') options.copybook='copybooks/benchmark-complex.cbl';
            else options.copybook='copybooks/benchmark.cbl';
            continue;
        }
        if(!['--data','--copybook','--warmup','--limit','--runs','--buffer-size','--decode-options'].includes(arg))
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
            if(arg==='--runs') {
                if(number===0) throw new Error('--runs requires a positive integer');
                options.runs=number;
            }
            if(arg==='--limit') options.limit=number;
            if(arg==='--buffer-size') options.bufferSize=number;
        }
    }
    if(sampleRequested) options.data=options.scenario==='odo'?'data/odo-sample-100k.dat':'data/sample-100k.dat';
    else if(options.scenario==='odo' && options.data==='data/benchmark.dat') options.data='data/odo.dat';
    if(options.sharedOdoArrays && options.scenario!=='odo')
        throw new Error('--shared-odo-arrays requires --scenario odo');
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
    log(`Node COBOL benchmark / scenario=${options.scenario} / fixed ${RECORD_BYTES} bytes / ${options.scenario==='odo'?'variable active count':'same JRecord record rules'}`);
    log(`file=${file} fileBytes=${fileBytes} availableRecords=${availableRecords} measuredRecords=${count}`);
    const warmCount=Math.min(options.warmup,availableRecords);
    log(`Warmup: first ${warmCount} records`);
    const warmed=await scan(open,warmCount,options.scenario);
    if(warmed.records!==warmCount) throw new Error(`Warmup ended early: ${warmed.records}/${warmCount}`);
    assertTotals('warmup',warmed,options.scenario);
    log(`warmup verified: ${formatTotals(warmed)}`);
    return runMeasuredPasses({
        options,scan:()=>scan(open,count,options.scenario),
        resultName:'cursor-loader',expectedRecords:count,assertTotals:(stage,totals)=>assertTotals(stage,totals,options.scenario),formatTotals,log
    });
}
