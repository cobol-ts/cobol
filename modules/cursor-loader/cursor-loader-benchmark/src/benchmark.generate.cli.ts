import {generateFile,parseGenerateArgs} from './benchmark.generate';
import {generateOdoFile} from './benchmark.odo.generate';

function main(): void {
    const args=process.argv.slice(2);
    const scenarioAt=args.indexOf('--scenario');
    const scenario=scenarioAt>=0?args[scenarioAt+1]:'baseline';
    if(scenario!=='baseline' && scenario!=='odo') throw new Error('--scenario requires baseline or odo');
    const remaining=scenarioAt>=0?args.filter((_value,i)=>i!==scenarioAt && i!==scenarioAt+1):args;
    const options = parseGenerateArgs(remaining);
    if (!options) {
        console.log('yarn generate --scenario baseline|odo [--records N] [--output FILE] [--chunk-records N] [--force]');
        return;
    }
    const selected=scenario==='odo' ? {
        ...options,
        output:options.output==='data/benchmark.dat'?'data/odo.dat':options.output,
        chunkRecords:remaining.includes('--chunk-records')?options.chunkRecords:45_000
    } : options;
    console.log(scenario==='odo'?generateOdoFile(selected):generateFile(selected));
}
try {main();} catch(error) {console.error(error);process.exitCode=1;}
