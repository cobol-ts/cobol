import {generateFile,parseGenerateArgs} from './benchmark.generate';

function main(): void {
    const options = parseGenerateArgs(process.argv.slice(2));
    if (!options) {
        console.log('npm run generate -- [--records N] [--output FILE] [--chunk-records N] [--force]');
        return;
    }
    console.log(generateFile(options));
}
try {main();} catch(error) {console.error(error);process.exitCode=1;}
