import {MemoryMetrics} from '@cobol-ts/metrics';
import {resolve} from 'node:path';
import type {CobolDecodeOptions} from '@cobol-ts/codec';
import {scanCobolFile} from '@cobol-ts/cursor-loader-cobol/node';
import {defineProjection} from '@cobol-ts/cursor-projection';
import {BENCHMARK_PROJECTION,BENCHMARK_COMPLEX_PROJECTION,BENCHMARK_ODO_PROJECTION,parseBenchmarkArgs,type BenchmarkRow,type BenchmarkArrayRow,type BenchmarkOdoRow} from './benchmark.scan';
import {runCallbackBenchmark} from './benchmark.callback';

async function main():Promise<void> {
    const options=parseBenchmarkArgs(process.argv.slice(2));
    if(!options) {
        console.log('yarn benchmark:callback --scenario baseline|array|redefines|odo --data FILE [--sample] [--warmup N] [--limit N|all] [--runs N] [--metrics] [--runtime-stats] [--shared-odo-arrays]');
        console.log('yarn benchmark:callback:sample');
        return;
    }
    const metrics=options.metrics?new MemoryMetrics():undefined;
    const filename=resolve(options.data);
    const copybook=resolve(options.copybook);
    if(options.scenario==='baseline') {
        const projection=defineProjection<BenchmarkRow>(BENCHMARK_PROJECTION);
        await runCallbackBenchmark(options,visitor=>scanCobolFile<BenchmarkRow>({
            filename,copybook,projection,bufferSize:options.bufferSize,
            decodeOptions:options.decodeOptions as CobolDecodeOptions,metrics
        },visitor),console.log,metrics);
    } else if(options.scenario==='odo') {
        const projection=defineProjection<BenchmarkOdoRow>(BENCHMARK_ODO_PROJECTION);
        await runCallbackBenchmark(options,visitor=>scanCobolFile<BenchmarkOdoRow>({
            filename,copybook,projection,bufferSize:options.bufferSize,
            framing:{kind:'fixed',recordLength:200},
            decodeOptions:options.decodeOptions as CobolDecodeOptions,metrics,
            experimentalSharedOdoArrays:options.sharedOdoArrays
        },visitor),console.log,metrics);
    } else {
        const projection=defineProjection<BenchmarkArrayRow>(BENCHMARK_COMPLEX_PROJECTION);
        await runCallbackBenchmark(options,visitor=>scanCobolFile<BenchmarkArrayRow>({
            filename,copybook,projection,bufferSize:options.bufferSize,
            decodeOptions:options.decodeOptions as CobolDecodeOptions,metrics
        },visitor),console.log,metrics);
    }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
