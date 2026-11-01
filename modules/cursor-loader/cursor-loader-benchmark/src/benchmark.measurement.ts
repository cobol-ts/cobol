import type {MemoryMetrics} from '@cobol-ts/metrics';
import {PerformanceObserver,performance} from 'node:perf_hooks';
import {RECORD_BYTES,type Counters} from './benchmark.fixture';
import type {BenchmarkOptions,BenchmarkResult} from './benchmark.scan';

export type BenchmarkPassSummary = Readonly<{
    runs:number;
    medianSeconds:number;
    minSeconds:number;
    maxSeconds:number;
    spreadPercent:number;
    medianRecordsPerSecond:number;
}>;

/** Summarise elapsed times, not an arithmetic mean of throughputs. */
export function summarisePasses(passes:readonly BenchmarkResult[]):BenchmarkPassSummary {
    if(passes.length===0) throw new Error('Cannot summarise zero benchmark passes');
    const times=passes.map(pass=>pass.seconds).sort((a,b)=>a-b);
    const middle=Math.floor(times.length/2);
    const medianSeconds=times.length%2 ? times[middle] : (times[middle-1]+times[middle])/2;
    if(!(medianSeconds>0)) throw new Error('Benchmark elapsed time must be positive');
    const firstCount=passes[0].records;
    if(passes.some(pass=>pass.records!==firstCount))
        throw new Error('Benchmark passes must process the same record count');
    const minSeconds=times[0];
    const maxSeconds=times[times.length-1];
    return {
        runs:passes.length,medianSeconds,minSeconds,maxSeconds,
        spreadPercent:(maxSeconds-minSeconds)/medianSeconds*100,
        medianRecordsPerSecond:firstCount/medianSeconds
    };
}

/** Optional, pass-scoped diagnostics; never samples in the per-record callback. */
class RuntimeCapture {
    private readonly startCpu=process.cpuUsage();
    private readonly startMemory=process.memoryUsage();
    private readonly events:{startTime:number;duration:number}[]=[];
    private readonly observer=new PerformanceObserver(list=>{
        for(const entry of list.getEntries()) {
            if(entry.entryType==='gc') this.events.push({startTime:entry.startTime,duration:entry.duration});
        }
    });

    constructor() {this.observer.observe({entryTypes:['gc']});}

    async finish(start:number,end:number):Promise<string> {
        const cpu=process.cpuUsage(this.startCpu);
        const memory=process.memoryUsage();
        // GC PerformanceObserver callbacks are asynchronous. Drain them after the timed pass.
        await new Promise<void>(resolve=>setImmediate(resolve));
        this.observer.disconnect();
        let gcCount=0;
        let gcMs=0;
        for(const entry of this.events) {
            if(entry.startTime>=start && entry.startTime<=end) {
                gcCount++;
                gcMs+=entry.duration;
            }
        }
        const mib=(bytes:number)=>(bytes/(1024*1024)).toFixed(2);
        return `cpuUserMs=${(cpu.user/1000).toFixed(2)} cpuSystemMs=${(cpu.system/1000).toFixed(2)}`+
            ` gcObserved=${gcCount} gcObservedMs=${gcMs.toFixed(2)}`+
            ` heapBeforeMiB=${mib(this.startMemory.heapUsed)} heapAfterMiB=${mib(memory.heapUsed)}`+
            ` rssBeforeMiB=${mib(this.startMemory.rss)} rssAfterMiB=${mib(memory.rss)}`;
    }

    dispose():void {this.observer.disconnect();}
}

/** Each measured pass reopens the source and verifies independently. */
export async function runMeasuredPasses(args:Readonly<{
    options:BenchmarkOptions;
    scan:()=>Promise<Counters>;
    resultName:'cursor-loader'|'cursor-loader-callback';
    expectedRecords:number;
    assertTotals:(stage:string,counters:Counters)=>void;
    formatTotals:(counters:Counters)=>string;
    log:(message:string)=>void;
    metrics?:MemoryMetrics;
}>):Promise<BenchmarkResult> {
    const {options,scan,resultName,expectedRecords,assertTotals,formatTotals,log,metrics}=args;
    const runs=options.runs??1;
    if(!Number.isSafeInteger(runs) || runs<1) throw new RangeError('runs must be a positive safe integer');
    const passes:BenchmarkResult[]=[];
    if(options.runtimeStats) {
        log(`RUNTIME node=${process.versions.node} v8=${process.versions.v8} platform=${process.platform} arch=${process.arch}`);
    }
    for(let pass=1;pass<=runs;pass++) {
        if(metrics) metrics.reset();
        log(runs===1 ? 'Measured pass: reopen file and start at byte 0' :
            `Measured pass ${pass}/${runs}: reopen file and start at byte 0`);
        const runtime=options.runtimeStats ? new RuntimeCapture() : undefined;
        let actual:Counters;
        let started:number;
        let ended:number;
        try {
            started=performance.now();
            actual=await scan();
            ended=performance.now();
        } catch(error) {
            runtime?.dispose();
            throw error;
        }
        const runtimeReport=runtime ? await runtime.finish(started,ended) : undefined;
        const seconds=(ended-started)/1000;
        const stage=runs===1 ? 'measured' : `measured pass ${pass}`;
        if(actual.records!==expectedRecords)
            throw new Error(`${stage} ended early: ${actual.records}/${expectedRecords}`);
        assertTotals(stage,actual);
        log(`${stage} verified: ${formatTotals(actual)}`);
        const bytes=actual.records*RECORD_BYTES;
        const result:BenchmarkResult={...actual,seconds,recordsPerSecond:actual.records/seconds,
            mibPerSecond:bytes/(1024*1024)/seconds};
        passes.push(result);
        log(`BENCHMARK result=${resultName} scenario=${options.scenario} records=${actual.records} bytes=${bytes}`+
            ` seconds=${seconds.toFixed(6)} recordsPerSecond=${Math.round(result.recordsPerSecond)}`+
            ` mibPerSecond=${result.mibPerSecond.toFixed(2)}`+
            (runs===1 ? '' : ` pass=${pass}/${runs}`));
        if(runtimeReport) log(`RUNTIME pass=${pass}/${runs} ${runtimeReport}`);
        if(metrics) {
            log(runs===1 ? 'METRICS measured pass (warm-up excluded):' :
                `METRICS measured pass ${pass}/${runs} (warm-up excluded):`);
            const snapshot=metrics.snapshot();
            for(const name of [...snapshot.keys()].sort()) log(`  ${name}=${snapshot.get(name)}`);
        }
    }
    if(runs===1) return passes[0];
    const summary=summarisePasses(passes);
    log(`BENCHMARK SUMMARY result=${resultName} scenario=${options.scenario} runs=${runs}`+
        ` recordsPerPass=${passes[0].records} medianSeconds=${summary.medianSeconds.toFixed(6)}`+
        ` minSeconds=${summary.minSeconds.toFixed(6)} maxSeconds=${summary.maxSeconds.toFixed(6)}`+
        ` spreadPercent=${summary.spreadPercent.toFixed(2)}`+
        ` medianRecordsPerSecond=${Math.round(summary.medianRecordsPerSecond)}`);
    // Preserve the original return type: the median representative result.
    const representative=passes.slice().sort((a,b)=>a.seconds-b.seconds)[Math.floor((passes.length-1)/2)];
    return {...representative,seconds:summary.medianSeconds,
        recordsPerSecond:summary.medianRecordsPerSecond,
        mibPerSecond:passes[0].records*RECORD_BYTES/(1024*1024)/summary.medianSeconds};
}
