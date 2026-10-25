import {resolve} from 'node:path';
import type {CobolDecodeOptions} from '@cobol-ts/codec';
import {scanCobolFile} from '@cobol-ts/cursor-loader-cobol/node';
import {defineProjection} from '@cobol-ts/cursor-projection';
import {createSimpleRecordPool} from '@cobol-ts/cursor-record';
import {BENCHMARK_PROJECTION, type BenchmarkRow, parseBenchmarkArgs} from './benchmark.scan';
import {runCallbackBenchmark} from './benchmark.callback';

async function main(): Promise<void> {
    const options = parseBenchmarkArgs(process.argv.slice(2));

    if (!options) {
        console.log('yarn benchmark:callback --data FILE');
        console.log('yarn benchmark:callback:sample');
        return;
    }

    const filename = resolve(options.data);
    const copybook = resolve(options.copybook);
    const projection = defineProjection<BenchmarkRow>(BENCHMARK_PROJECTION);

    await runCallbackBenchmark(
        options,
        visitor => scanCobolFile<BenchmarkRow>({
            filename,
            copybook,
            projection,
            bufferSize: options.bufferSize,
            decodeOptions: options.decodeOptions as CobolDecodeOptions,
            recordPool: createSimpleRecordPool(),
            // recordPool: createReferenceCountedRecordPool()
        }, visitor)
    );
}

main().catch(error => {
    console.error(error);
    process.exitCode = 1;
});