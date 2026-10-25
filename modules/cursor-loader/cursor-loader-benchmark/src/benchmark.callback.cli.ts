import {resolve} from 'node:path';
import type {CobolDecodeOptions} from '@cobol-ts/codec';
import {scanCobolFile} from '@cobol-ts/cursor-loader-cobol/node';
import {defineProjection} from '@cobol-ts/cursor-projection';
import {BENCHMARK_PROJECTION,BENCHMARK_COMPLEX_PROJECTION,parseBenchmarkArgs,type BenchmarkRow,type BenchmarkArrayRow} from './benchmark.scan';
import {runCallbackBenchmark} from './benchmark.callback';

async function main():Promise<void> {
    const options=parseBenchmarkArgs(process.argv.slice(2));
    if(!options) {
        console.log('yarn benchmark:callback --scenario baseline|array|redefines --data FILE');
        console.log('yarn benchmark:callback:sample');
        return;
    }
    const filename=resolve(options.data);
    const copybook=resolve(options.copybook);
    if(options.scenario==='baseline') {
        const projection=defineProjection<BenchmarkRow>(BENCHMARK_PROJECTION);
        await runCallbackBenchmark(options,visitor=>scanCobolFile<BenchmarkRow>({
            filename,copybook,projection,bufferSize:options.bufferSize,
            decodeOptions:options.decodeOptions as CobolDecodeOptions
        },visitor));
    } else {
        const projection=defineProjection<BenchmarkArrayRow>(BENCHMARK_COMPLEX_PROJECTION);
        await runCallbackBenchmark(options,visitor=>scanCobolFile<BenchmarkArrayRow>({
            filename,copybook,projection,bufferSize:options.bufferSize,
            decodeOptions:options.decodeOptions as CobolDecodeOptions
        },visitor));
    }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
