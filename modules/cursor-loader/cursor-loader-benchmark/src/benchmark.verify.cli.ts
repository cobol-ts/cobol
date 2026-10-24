import {resolve} from 'node:path';
import {verifyFile} from './benchmark.verify';

function main(): void {
    const args = process.argv.slice(2);
    if (args.length === 1 && (args[0] === '--help' || args[0] === '-h')) {
        console.log('npm run verify -- [FILE] [EXPECTED_RECORD_COUNT]');return;
    }
    if (args.length>2) throw new Error('Expected at most two arguments');
    const filename = resolve(args[0] ?? 'data/benchmark.dat');
    const records = args[1] === undefined ? undefined : Number(args[1]);
    console.log(`verified records=${verifyFile(filename,records)} file=${filename}`);
}
try {main();} catch(error) {console.error(error);process.exitCode=1;}
