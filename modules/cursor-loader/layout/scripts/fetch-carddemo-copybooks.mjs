/** Fetch and pin upstream files without modifying COBOL source. Node 18+. */
import {mkdir, writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {dirname, resolve} from 'node:path';

const base = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures', 'carddemo');
const repo = 'aws-samples/aws-mainframe-modernization-carddemo';
const names = [
    'CSUSR01Y.cpy', 'CVACT01Y.cpy', 'CVACT02Y.cpy', 'CVCUS01Y.cpy',
    'CVACT03Y.cpy', 'CVTRA06Y.cpy', 'CVTRA05Y.cpy', 'CVTRA02Y.cpy'
];
const get = async url => {
    const response = await fetch(url, {headers: {'User-Agent': 'cobol-layout-corpus-tests'}});
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}: ${url}`);
    return response;
};
const revision = process.argv[2] ?? (await (await get(
    `https://api.github.com/repos/${repo}/commits/main`
)).json()).sha;
if (!/^[0-9a-f]{40}$/.test(revision)) throw Error('Revision must be a 40-character commit SHA');
await mkdir(base, {recursive: true});
for (const name of names) {
    const url = `https://raw.githubusercontent.com/${repo}/${revision}/app/cpy/${name}`;
    const bytes = new Uint8Array(await (await get(url)).arrayBuffer());
    await writeFile(resolve(base, name), bytes);
    console.log(`${name}  ${bytes.length} bytes`);
}
await writeFile(resolve(base, 'SOURCE.json'), JSON.stringify({repo, revision, names,
    source: `https://github.com/${repo}/tree/${revision}/app/cpy`}, null, 2) + '\n');
console.log(`Pinned ${names.length} original copybooks at ${revision}`);
