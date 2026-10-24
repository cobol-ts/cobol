import {constants as bufferConstants} from 'node:buffer';
import {closeSync, mkdirSync, openSync, statSync, writeSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {performance} from 'node:perf_hooks';
import {CYCLE,checkedNonNegativeInteger,expectedCounters,PATTERN_COUNT,RECORD_BYTES} from './benchmark.fixture';

export type GenerateOptions = Readonly<{
    output: string;
    records: number;
    chunkRecords: number;
    force: boolean;
}>;

/** Create one reusable chunk; no allocation on the per-record write path. */
export function makeChunk(chunkRecords: number): Buffer {
    checkedNonNegativeInteger(chunkRecords,'chunkRecords');
    if (!chunkRecords || chunkRecords % PATTERN_COUNT !== 0)
        throw new RangeError('chunkRecords must be a positive multiple of ten');
    const length = chunkRecords * RECORD_BYTES;
    if (!Number.isSafeInteger(length) || length > bufferConstants.MAX_LENGTH)
        throw new RangeError('chunkRecords is too large for a Buffer');
    const chunk = Buffer.allocUnsafe(length);
    CYCLE.copy(chunk);
    for (let filled = CYCLE.length; filled < chunk.length;) {
        const copied = Math.min(filled,chunk.length - filled);
        chunk.copy(chunk,filled,0,copied);
        filled += copied;
    }
    return chunk;
}

function writeFully(fd: number, chunk: Buffer, length: number): void {
    for (let written = 0; written < length;) {
        const count = writeSync(fd,chunk,written,length-written);
        if (count <= 0) throw new Error('Zero-byte write');
        written += count;
    }
}

export function generateFile(options: GenerateOptions): Readonly<{
    file:string;records:number;fileBytes:number;seconds:number
}> {
    checkedNonNegativeInteger(options.records,'records');
    const bytes = options.records * RECORD_BYTES;
    if (!Number.isSafeInteger(bytes)) throw new RangeError('Total bytes exceeds safe integer range');
    const chunk = makeChunk(options.chunkRecords);
    const output = resolve(options.output);
    mkdirSync(dirname(output),{recursive:true});
    const started = performance.now();
    const fd = openSync(output,options.force ? 'w' : 'wx');
    try {
        for (let remaining=options.records; remaining>0;) {
            const count = Math.min(remaining,options.chunkRecords);
            writeFully(fd,chunk,count*RECORD_BYTES);
            remaining -= count;
        }
    } finally {
        closeSync(fd);
    }
    const fileBytes = statSync(output).size;
    if (fileBytes !== bytes) throw new Error(`Generated ${fileBytes} bytes; expected ${bytes}`);
    // Ensure expectation can be represented accurately before accepting fixture.
    expectedCounters(options.records);
    return {file:output,records:options.records,fileBytes,seconds:(performance.now()-started)/1000};
}

export function parseGenerateArgs(args: readonly string[]): GenerateOptions | undefined {
    const options: {output:string;records:number;chunkRecords:number;force:boolean} = {
        output:'data/benchmark.dat',records:100_000_000,chunkRecords:50_000,force:false
    };
    for (let i=0;i<args.length;i++) {
        const arg = args[i];
        if (arg === '--help' || arg === '-h') return undefined;
        if (arg === '--force') {options.force=true;continue;}
        if (arg !== '--output' && arg !== '--records' && arg !== '--chunk-records')
            throw new Error(`Unknown argument: ${arg}`);
        const value = args[++i];
        if (value === undefined) throw new Error(`Missing value for ${arg}`);
        if (arg === '--output') options.output=value;
        else {
            if (!/^\d+$/.test(value)) throw new Error(`${arg} requires a nonnegative integer`);
            const count = checkedNonNegativeInteger(Number(value),arg);
            if (arg === '--records') options.records = count;
            else options.chunkRecords = count;
        }
    }
    return options;
}
