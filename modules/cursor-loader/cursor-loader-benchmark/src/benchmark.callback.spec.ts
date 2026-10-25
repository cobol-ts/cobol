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
