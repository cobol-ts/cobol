import {join} from 'node:path';
import {
    BENCHMARK_PROJECTION,assertTotals,parseBenchmarkArgs,processRow,runBenchmark,scan,
    type BenchmarkRow,type RecordLease
} from './benchmark.scan';
import {amountA,amountB,emptyCounters,expectedCounters,flags} from './benchmark.fixture';

function mockRow(index:number):BenchmarkRow {
    const flag=flags(index);
    return {amountA:()=>amountA(index),amountB:()=>amountB(index),
        status:()=>flag.status,region:()=>flag.region,category:()=>flag.category,
        approved:()=>flag.approved};
}
function source(count:number,track:{opened:number;closed:number;finished:number}) {
    return async function* ():AsyncGenerator<RecordLease> {
        track.opened++;
        try {
            for(let i=0;i<count;i++) yield {result:mockRow(i%10),close:()=>{track.closed++;}};
        } finally {track.finished++;}
    };
}

test('projection has six typed getters mapped to the JRecord copybook',()=>{
    expect(Object.keys(BENCHMARK_PROJECTION)).toHaveLength(6);
    expect(BENCHMARK_PROJECTION.amountA).toEqual({type:'integer',path:['BENCHMARK-RECORD','AMOUNT-A']});
    expect(BENCHMARK_PROJECTION.approved).toEqual({type:'character',path:['BENCHMARK-RECORD','APPROVED-FLAG']});
});

test('all six decoded getters are used and rules match the independent totals',()=>{
    const totals=emptyCounters();
    for(let i=0;i<23;i++) processRow(mockRow(i%10),totals);
    expect(totals).toEqual(expectedCounters(23));
    expect(()=>assertTotals('test',{...totals,totalSum:0})).toThrow(/FAILED totalSum/);
});

test('scan closes each borrowed projection and stops via iterator.return',async()=>{
    const track={opened:0,closed:0,finished:0};
    const open=source(50,track);
    expect(await scan(open,13)).toEqual(expectedCounters(13));
    expect(track).toEqual({opened:1,closed:13,finished:1});
    expect(await scan(open,20)).toEqual(expectedCounters(20));
    expect(track).toEqual({opened:2,closed:33,finished:2});
});

test('scan closes the failing record on a getter exception',async()=>{
    let closed=0;
    const open=async function* ():AsyncGenerator<RecordLease> {
        yield {result:{...mockRow(0),amountA:()=>{throw new Error('decoder failure');}},close:()=>{closed++;}};
    };
    await expect(scan(open,10)).rejects.toThrow('decoder failure');
    expect(closed).toBe(1);
});

test('benchmark independently opens the same file for warmup and measurement',async()=>{
    const options={...parseBenchmarkArgs(['--sample','--warmup','10','--limit','20'])!};
    options.data=join(__dirname,'../data/sample-100k.dat');
    const track={opened:0,closed:0,finished:0};
    const messages:string[]=[];
    const result=await runBenchmark(options,source(50,track),message=>messages.push(message));
    expect(result.records).toBe(20);
    expect(track).toEqual({opened:2,closed:30,finished:2});
    expect(messages.some(message=>message.startsWith('BENCHMARK result=cursor-loader'))).toBe(true);
});

test('CLI defaults match the Java benchmark and reject invalid inputs',()=>{
    expect(parseBenchmarkArgs([])).toEqual({data:'data/benchmark.dat',copybook:'copybooks/benchmark.cbl',
        warmup:100000,limit:'all',bufferSize:65536,decodeOptions:{encoding:'ascii'}});
    expect(parseBenchmarkArgs(['--limit','123'])?.limit).toBe(123);
    expect(()=>parseBenchmarkArgs(['--buffer-size','50'])).toThrow(/at least 200/);
    expect(()=>parseBenchmarkArgs(['--decode-options','[]'])).toThrow(/JSON object/);
});
