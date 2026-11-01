import {join} from 'node:path';
import {scanCallback,runCallbackBenchmark} from './benchmark.callback';
import {amountA,amountB,expectedCounters,flags} from './benchmark.fixture';
import {parseBenchmarkArgs,type BenchmarkRow} from './benchmark.scan';

function row(index:number):BenchmarkRow {
    const f=flags(index);
    return {
        amountA:()=>amountA(index), amountB:()=>amountB(index),
        status:()=>f.status,region:()=>f.region,category:()=>f.category,approved:()=>f.approved
    };
}

test('callback stays synchronous and returns false at the requested limit',async()=>{
    let visited=0;
    const open=async (callback:(row:BenchmarkRow)=>void|boolean)=>{
        for(let i=0;i<50;i++) {
            visited++;
            if(callback(row(i%10))===false) break;
        }
    };
    expect(await scanCallback(open,13)).toEqual(expectedCounters(13));
    expect(visited).toBe(13);
});

test('benchmark independently opens the file for warm-up and measured passes',async()=>{
    const options={...parseBenchmarkArgs(['--sample','--warmup','10','--limit','20'])!};
    options.data=join(__dirname,'../data/sample-100k.dat');
    let opens=0;
    const open=async (callback:(row:BenchmarkRow)=>void|boolean)=>{
        opens++;
        for(let i=0;i<100;i++) if(callback(row(i%10))===false) break;
    };
    const messages:string[]=[];
    const result=await runCallbackBenchmark(options,open,m=>messages.push(m));
    expect(result.records).toBe(20);
    expect(opens).toBe(2);
    expect(messages.some(m=>m.includes('BENCHMARK result=cursor-loader-callback'))).toBe(true);
});

test('repeated callback runs reopen the source and verify every pass',async()=>{
    const options={...parseBenchmarkArgs(['--sample','--warmup','10','--limit','20','--runs','3'])!};
    options.data=join(__dirname,'../data/sample-100k.dat');
    let opens=0;
    const open=async (callback:(row:BenchmarkRow)=>void|boolean)=>{
        opens++;
        for(let i=0;i<50;i++) if(callback(row(i%10))===false) break;
    };
    const messages:string[]=[];
    const result=await runCallbackBenchmark(options,open,message=>messages.push(message));
    expect(opens).toBe(4); // One warm-up plus three independently opened measured passes.
    expect(result).toMatchObject(expectedCounters(20));
    expect(messages.filter(message=>message.startsWith('measured pass ') && message.includes('verified:'))).toHaveLength(3);
    expect(messages.filter(message=>message.startsWith('BENCHMARK result='))).toHaveLength(3);
    expect(messages.filter(message=>message.startsWith('BENCHMARK SUMMARY'))).toHaveLength(1);
    expect(messages.some(message=>message.includes('runs=3') && message.includes('medianSeconds='))).toBe(true);
});

test('each repeated pass must reach the requested record count',async()=>{
    const options={...parseBenchmarkArgs(['--sample','--warmup','10','--limit','20','--runs','2'])!};
    options.data=join(__dirname,'../data/sample-100k.dat');
    let opens=0;
    const open=async (callback:(row:BenchmarkRow)=>void|boolean)=>{
        opens++;
        const count=opens===3?10:50;
        for(let i=0;i<count;i++) if(callback(row(i%10))===false) break;
    };
    await expect(runCallbackBenchmark(options,open,()=>undefined)).rejects.toThrow(/measured pass 2 ended early/);
    expect(opens).toBe(3);
});

test('runtime diagnostics are opt-in and outside the timed processing path',async()=>{
    const options={...parseBenchmarkArgs(['--sample','--warmup','10','--limit','20','--runtime-stats'])!};
    options.data=join(__dirname,'../data/sample-100k.dat');
    const open=async (callback:(row:BenchmarkRow)=>void|boolean)=>{
        for(let i=0;i<50;i++) if(callback(row(i%10))===false) break;
    };
    const messages:string[]=[];
    await runCallbackBenchmark(options,open,message=>messages.push(message));
    expect(messages.some(message=>message.startsWith('RUNTIME node=') && message.includes('v8='))).toBe(true);
    expect(messages.some(message=>message.startsWith('RUNTIME pass=1/1') && message.includes('gcObserved='))).toBe(true);
});
