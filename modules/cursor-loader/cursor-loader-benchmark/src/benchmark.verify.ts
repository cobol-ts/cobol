import {openSync,closeSync,readSync,statSync} from 'node:fs';
import {CYCLE,PATTERN_COUNT,RECORD_BYTES,checkedNonNegativeInteger} from './benchmark.fixture';

/** Validate all bytes (not just record count), using bounded memory. */
export function verifyFile(filename: string, expectedRecords?: number): number {
    const bytes = statSync(filename).size;
    if (bytes % RECORD_BYTES !== 0) throw new Error(`File length ${bytes} is not divisible by ${RECORD_BYTES}`);
    const records = bytes / RECORD_BYTES;
    if (expectedRecords !== undefined && records !== checkedNonNegativeInteger(expectedRecords,'expectedRecords'))
        throw new Error(`Expected ${expectedRecords} records, got ${records}`);
    const chunkSize = CYCLE.length * 5_000;
    const buffer = Buffer.allocUnsafe(chunkSize);
    const expected = Buffer.allocUnsafe(chunkSize);
    for(let off=0;off<expected.length;off+=CYCLE.length) CYCLE.copy(expected,off);
    const fd = openSync(filename,'r');
    try {
        for(let offset=0;offset<bytes;) {
            let got = 0;
            const wanted = Math.min(chunkSize,bytes-offset);
            while(got<wanted) {
                const next = readSync(fd,buffer,got,wanted-got,offset+got);
                if (next === 0) throw new Error(`Unexpected EOF at ${offset+got}`);
                got+=next;
            }
            if (!buffer.subarray(0,wanted).equals(expected.subarray(0,wanted)))
                throw new Error(`Fixture mismatch in byte range ${offset}..${offset+wanted} (ten-pattern cycle)`);
            offset+=wanted;
        }
    } finally {closeSync(fd);}
    return records;
}
