/**
 * External-data integration: AWS CardDemo original EBCDIC FB records, original
 * copybooks and independently maintained fixed-width ASCII counterparts.
 *
 * Prerequisite: node scripts/fetch-carddemo-fixtures.mjs
 * Fetch never occurs during Jest. No test-side EBCDIC encoding or record
 * construction is performed. See fixtures/carddemo/README.md.
 */
import {existsSync,readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {join} from 'node:path';
import {readCobolFile,type CobolFileOptions} from '@cobol-ts/cursor-loader-cobol/node';
import {defineProjection} from '@cobol-ts/cursor-projection';

const dir=join(__dirname,'..','fixtures','carddemo');
const available=existsSync(join(dir,'manifest.json'));
const integration=available ? describe : describe.skip;

type Xref = {card():string;customer():number;account():number};
const xrefProjection=defineProjection<Xref>({
    card:{type:'string',path:['CARD-XREF-RECORD','XREF-CARD-NUM']},
    customer:{type:'integer',path:['CARD-XREF-RECORD','XREF-CUST-ID']},
    account:{type:'integer',path:['CARD-XREF-RECORD','XREF-ACCT-ID']}
});
type Card = {number():string;account():number;cvv():number;name():string;expiry():string;active():string};
const cardProjection=defineProjection<Card>({
    number:{type:'string',path:['CARD-RECORD','CARD-NUM']},
    account:{type:'integer',path:['CARD-RECORD','CARD-ACCT-ID']},
    cvv:{type:'integer',path:['CARD-RECORD','CARD-CVV-CD']},
    name:{type:'string',path:['CARD-RECORD','CARD-EMBOSSED-NAME']},
    expiry:{type:'string',path:['CARD-RECORD','CARD-EXPIRAION-DATE']},
    active:{type:'string',path:['CARD-RECORD','CARD-ACTIVE-STATUS']}
});
type Customer = {id():number;first():string;middle():string;last():string};
const customerProjection=defineProjection<Customer>({
    id:{type:'integer',path:['CUSTOMER-RECORD','CUST-ID']},
    first:{type:'string',path:['CUSTOMER-RECORD','CUST-FIRST-NAME']},
    middle:{type:'string',path:['CUSTOMER-RECORD','CUST-MIDDLE-NAME']},
    last:{type:'string',path:['CUSTOMER-RECORD','CUST-LAST-NAME']}
});
type Account = {id():number;active():string;opened():string};
const accountProjection=defineProjection<Account>({
    id:{type:'integer',path:['ACCOUNT-RECORD','ACCT-ID']},
    active:{type:'string',path:['ACCOUNT-RECORD','ACCT-ACTIVE-STATUS']},
    opened:{type:'string',path:['ACCOUNT-RECORD','ACCT-OPEN-DATE']}
});

type Dataset = {name:string; length:number; records:number; binary:string; ascii:string; copybook:string; sources:{sha256:string}[]};
function manifest():{datasets:Dataset[]} {
    return JSON.parse(readFileSync(join(dir,'manifest.json'),'utf8')) as {datasets:Dataset[]};
}
function rows(file:string):string[] {
    return readFileSync(file,'utf8').split(/\r?\n/).filter(line=>line.length>0);
}
const trim=(text:string)=>text.trimEnd();
/** Reuse the public API; value materialisation is only for the Jest oracle. */
async function compare<T>(dataset:Dataset, projection:CobolFileOptions<T>['projection'],
    actual:(record:T)=>unknown,expected:(row:string)=>unknown,bufferSize:number) {
    const sourceRows=rows(join(dir,dataset.ascii));
    if(sourceRows.length===0) throw new Error(`No ASCII oracle rows for ${dataset.name}`);
    const sampleSize=Math.min(10,sourceRows.length);
    const observed:unknown[]=[];
    for await (const record of readCobolFile<T>({
        copybook:join(dir,dataset.copybook),filename:join(dir,dataset.binary),projection,bufferSize
    })) {
        try { if(observed.length<sampleSize) observed.push(actual(record.result)); }
        finally {record.close();}
        if(observed.length===sampleSize) break;
    }
    expect(observed).toHaveLength(sampleSize);
    expect(observed).toEqual(sourceRows.slice(0,sampleSize).map(expected));
}

function testDataset<T>(name:string,projection:CobolFileOptions<T>['projection'],
    actual:(record:T)=>unknown,expected:(row:string)=>unknown) {
    for(const bufferSize of [3,17,4096]) {
        test(`${name}: original binary matches independent ASCII fields (${bufferSize}-byte buffers)`,async()=>{
            const dataset=manifest().datasets.find(d=>d.name===name);
            if(!dataset) throw new Error(`Missing CardDemo dataset ${name}`);
            await compare(dataset,projection,actual,expected,bufferSize);
        });
    }
}

integration('AWS CardDemo original FB binary/copybook/ASCII corpus',()=>{
    test('original datasets have exact published record lengths',()=>{
        const entries=manifest().datasets;
        expect(entries.map(d=>[d.name,d.length])).toEqual([
            ['card-xref',50],['card',150],['customer',500],['account',300]
        ]);
        for(const d of entries) {
            const binary=readFileSync(join(dir,d.binary));
            expect(binary.length).toBe(d.length*d.records);
            expect(d.records).toBeGreaterThan(0);
            expect(createHash('sha256').update(binary).digest('hex')).toBe(d.sources[0].sha256);
        }
    });
    testDataset('card-xref',xrefProjection,
        x=>[trim(x.card()),x.customer(),x.account()],
        s=>[trim(s.slice(0,16)),Number(s.slice(16,25)),Number(s.slice(25,36))]);
    testDataset('card',cardProjection,
        x=>[trim(x.number()),x.account(),x.cvv(),trim(x.name()),trim(x.expiry()),x.active()],
        s=>[trim(s.slice(0,16)),Number(s.slice(16,27)),Number(s.slice(27,30)),trim(s.slice(30,80)),trim(s.slice(80,90)),s.slice(90,91)]);
    testDataset('customer',customerProjection,
        x=>[x.id(),trim(x.first()),trim(x.middle()),trim(x.last())],
        s=>[Number(s.slice(0,9)),trim(s.slice(9,34)),trim(s.slice(34,59)),trim(s.slice(59,84))]);
    testDataset('account',accountProjection,
        x=>[x.id(),x.active(),trim(x.opened())],
        s=>[Number(s.slice(0,11)),s.slice(11,12),trim(s.slice(48,58))]);
});
