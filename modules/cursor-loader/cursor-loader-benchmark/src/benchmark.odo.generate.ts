import {constants as bufferConstants} from 'node:buffer';
import {closeSync,mkdirSync,openSync,statSync,writeSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {performance} from 'node:perf_hooks';
import {checkedNonNegativeInteger,RECORD_BYTES} from './benchmark.fixture';
import {ODO_CYCLE,ODO_PATTERN,expectedOdoCounters} from './benchmark.odo.fixture';
import type {GenerateOptions} from './benchmark.generate';

export function makeOdoChunk(chunkRecords:number):Buffer {
    checkedNonNegativeInteger(chunkRecords,'chunkRecords');
    if(!chunkRecords || chunkRecords%ODO_CYCLE!==0)
        throw new RangeError(`chunkRecords must be a positive multiple of ${ODO_CYCLE}`);
    const length=chunkRecords*RECORD_BYTES;
    if(!Number.isSafeInteger(length) || length>bufferConstants.MAX_LENGTH)
        throw new RangeError('chunkRecords is too large for a Buffer');
    const chunk=Buffer.allocUnsafe(length);
    ODO_PATTERN.copy(chunk);
    for(let offset=ODO_PATTERN.length;offset<chunk.length;) {
        const n=Math.min(offset,chunk.length-offset);
        chunk.copy(chunk,offset,0,n);
        offset+=n;
    }
    return chunk;
}

export function generateOdoFile(options:GenerateOptions):Readonly<{file:string;records:number;fileBytes:number;seconds:number}> {
    checkedNonNegativeInteger(options.records,'records');
    const expectedBytes=options.records*RECORD_BYTES;
    if(!Number.isSafeInteger(expectedBytes)) throw new RangeError('Total bytes exceeds safe integer range');
    expectedOdoCounters(options.records);
    const chunk=makeOdoChunk(options.chunkRecords);
    const output=resolve(options.output);
    mkdirSync(dirname(output),{recursive:true});
    const start=performance.now();
    const fd=openSync(output,options.force?'w':'wx');
    try {
        for(let remaining=options.records;remaining>0;) {
            const records=Math.min(remaining,options.chunkRecords);
            const bytes=records*RECORD_BYTES;
            for(let offset=0;offset<bytes;) {
                const count=writeSync(fd,chunk,offset,bytes-offset);
                if(count<=0) throw new Error('Zero-byte write');
                offset+=count;
            }
            remaining-=records;
        }
    } finally {closeSync(fd);}
    const fileBytes=statSync(output).size;
    if(fileBytes!==expectedBytes) throw new Error(`Generated ${fileBytes} bytes; expected ${expectedBytes}`);
    return {file:output,records:options.records,fileBytes,seconds:(performance.now()-start)/1000};
}
