/**
 * Fetch original, unmodified CardDemo sample bytes and copybooks from a pinned
 * AWS Samples revision. Run explicitly once; Jest never needs the network.
 *
 *   node scripts/fetch-carddemo-fixtures.mjs
 */
import {createHash} from 'node:crypto';
import {mkdir, writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {dirname, join} from 'node:path';

const revision = '59cc6c2fd7ebd7ef7925cad552a01a4b8b6e4d5e';
const repo = 'aws-samples/aws-mainframe-modernization-carddemo';
const destination = join(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures', 'carddemo');
const datasets = [
    {name:'card-xref', stem:'cardxref', ascii:'cardxref.txt', copybook:'CVACT03Y.cpy', length:50},
    {name:'card', stem:'carddata', ascii:'carddata.txt', copybook:'CVACT02Y.cpy', length:150},
    {name:'customer', stem:'custdata', ascii:'custdata.txt', copybook:'CVCUS01Y.cpy', length:500},
    {name:'account', stem:'acctdata', ascii:'acctdata.txt', copybook:'CVACT01Y.cpy', length:300}
];

async function githubDirectory(path) {
    const url = `https://api.github.com/repos/${repo}/contents/${path}?ref=${revision}`;
    const response = await fetch(url, {headers:{'Accept':'application/vnd.github+json','User-Agent':'cobol-ts-test-fixture-fetcher'}});
    if(!response.ok) throw new Error(`${url}: HTTP ${response.status} ${await response.text()}`);
    const entries = await response.json();
    if(!Array.isArray(entries)) throw new Error(`Expected directory listing at ${url}`);
    return entries;
}
function required(entries, filename) {
    const entry = entries.find(e=>e.type==='file' && e.name.toLowerCase()===filename.toLowerCase());
    if(!entry?.download_url) throw new Error(`Missing ${filename}; available: ${entries.map(e=>e.name).join(', ')}`);
    return entry;
}
function dataByStem(entries, stem) {
    const matches = entries.filter(e=>e.type==='file' && e.name.replace(/[^a-z0-9]/gi,'').toLowerCase().includes(stem));
    // If there are multiple candidates, select none instead of guessing.
    if(matches.length!==1) throw new Error(`Expected one EBCDIC data file starting with ${stem}; found ${matches.map(e=>e.name).join(', ')}`);
    if(!matches[0].download_url) throw new Error(`No download URL for ${matches[0].name}`);
    return matches[0];
}
async function retrieve(entry) {
    const response = await fetch(entry.download_url, {headers:{'User-Agent':'cobol-ts-test-fixture-fetcher'}});
    if(!response.ok) throw new Error(`${entry.download_url}: HTTP ${response.status}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    if(bytes.subarray(0, 40).toString('ascii').startsWith('version https://git-lfs.github.com'))
        throw new Error(`${entry.name} is a Git LFS pointer, not the original data`);
    return bytes;
}
function sha256(bytes) { return createHash('sha256').update(bytes).digest('hex'); }

const [ebcdic, ascii, copybooks] = await Promise.all([
    githubDirectory('app/data/EBCDIC'),
    githubDirectory('app/data/ASCII'),
    githubDirectory('app/cpy')
]);
// Validate the entire fetch before leaving a manifest that would activate Jest.
const collected=[];
for(const dataset of datasets) {
    const originals = [dataByStem(ebcdic,dataset.stem),required(ascii,dataset.ascii),required(copybooks,dataset.copybook)];
    const [binary, text, copybook] = await Promise.all(originals.map(retrieve));
    if(binary.length===0 || binary.length%dataset.length!==0)
        throw new Error(`${dataset.name}: ${binary.length} source bytes not a multiple of RECLEN ${dataset.length}`);
    if(!text.length || !copybook.length) throw new Error(`${dataset.name}: empty upstream ASCII or copybook`);
    collected.push({dataset,originals,bytes:[binary,text,copybook]});
}
await mkdir(destination,{recursive:true});
const manifest={repo,revision,datasets:[]};
for(const {dataset,originals,bytes} of collected) {
    const files=[`${dataset.name}.ebcdic`,`${dataset.name}.ascii`,dataset.copybook];
    for(let i=0;i<files.length;i++) await writeFile(join(destination,files[i]),bytes[i]);
    manifest.datasets.push({
        name:dataset.name, length:dataset.length,records:bytes[0].length/dataset.length,
        binary:files[0],ascii:files[1],copybook:files[2],
        sources:originals.map((entry,i)=>({path:entry.path,url:entry.html_url,sha256:sha256(bytes[i])}))
    });
    process.stdout.write(`${dataset.name}: ${bytes[0].length/dataset.length} original FB/${dataset.length} records\n`);
}
await writeFile(join(destination,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
