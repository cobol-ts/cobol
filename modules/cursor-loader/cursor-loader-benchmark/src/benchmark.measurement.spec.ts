import {summarisePasses} from './benchmark.measurement';
import {expectedCounters} from './benchmark.fixture';
import type {BenchmarkResult} from './benchmark.scan';

function pass(seconds:number,records=100):BenchmarkResult {
    return {...expectedCounters(records),seconds,
        recordsPerSecond:records/seconds,mibPerSecond:records*200/(1024*1024)/seconds};
}

test('summary calculates median elapsed time and throughput from that median',()=>{
    const summary=summarisePasses([pass(4),pass(2),pass(9)]);
    expect(summary).toEqual({runs:3,medianSeconds:4,minSeconds:2,maxSeconds:9,
        spreadPercent:175,medianRecordsPerSecond:25});
});

test('even number of passes uses the midpoint between the two central times',()=>{
    expect(summarisePasses([pass(1),pass(3),pass(2),pass(8)]).medianSeconds).toBe(2.5);
});

test('summary rejects empty and mismatched passes',()=>{
    expect(()=>summarisePasses([])).toThrow(/zero/);
    expect(()=>summarisePasses([pass(2,100),pass(3,90)])).toThrow(/same record count/);
});
