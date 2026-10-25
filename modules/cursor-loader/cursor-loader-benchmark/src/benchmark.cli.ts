import {resolve} from 'node:path';
import type {CobolDecodeOptions} from '@cobol-ts/codec';
import {readCobolFile} from '@cobol-ts/cursor-loader-cobol/node';
import {defineProjection} from '@cobol-ts/cursor-projection';
import {BENCHMARK_PROJECTION,BENCHMARK_COMPLEX_PROJECTION,parseBenchmarkArgs,runBenchmark,type BenchmarkRow,type BenchmarkArrayRow} from './benchmark.scan';

async function main():Promise<void> {
    const options=parseBenchmarkArgs(process.argv.slice(2));
    if(!options) {
        console.log('yarn benchmark [-- --data FILE --warmup N --limit N|all --buffer-size N --decode-options JSON]');
        console.log('yarn benchmark:sample');
        return;
    }
    const filename=resolve(options.data);
    const copybook=resolve(options.copybook);
    if(options.scenario==='baseline') {
        const projection=defineProjection<BenchmarkRow>(BENCHMARK_PROJECTION);
        const open=()=>readCobolFile<BenchmarkRow>({
            filename,copybook,projection,bufferSize:options.bufferSize,
            decodeOptions:options.decodeOptions as CobolDecodeOptions
        });
        await runBenchmark(options,open);
    } else {
        const projection=defineProjection<BenchmarkArrayRow>(BENCHMARK_COMPLEX_PROJECTION);
        const open=()=>readCobolFile<BenchmarkArrayRow>({
            filename,copybook,projection,bufferSize:options.bufferSize,
            decodeOptions:options.decodeOptions as CobolDecodeOptions
        });
        await runBenchmark(options,open);
    }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
