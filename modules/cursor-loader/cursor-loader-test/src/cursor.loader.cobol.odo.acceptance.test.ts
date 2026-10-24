/**
 * RED acceptance specifications for ODO framing. These are intentionally
 * constructed, explicitly documented cp037 byte fixtures (NOT externally
 * produced mainframe files). Unlike the external CardDemo tests they exist
 * to drive the next implementation step.
 *
 * These are ordinary acceptance tests: unsupported behaviour must fail visibly.
 * Keep failures red until the production reader satisfies the assertions.
 */
import {join} from 'node:path';
import type {ProjectedArray} from '@cobol-ts/arrays';
import {defineProjection} from '@cobol-ts/cursor-projection';
import {readCobolFile} from '@cobol-ts/cursor-loader-cobol/node';

const fixtures=join(__dirname,'..','fixtures','odo-acceptance');
type Item={code():string};
type OdoRecord={count():number;readonly items:ProjectedArray<Item>;trailer():string};
const projection=defineProjection<OdoRecord>({
    count:{type:'integer',path:['ODO-RECORD','ITEM-COUNT']},
    items:{type:'array',path:['ODO-RECORD','ITEMS'],element:{
        code:{type:'string',path:['ITEM-CODE']}
    }},
    trailer:{type:'string',path:['ODO-RECORD','TRAILER']}
});
async function read(filename:string,bufferSize:number,framing?:{kind:'rdw'}|{kind:'fixed';recordLength:number}) {
    const values:{count:number;codes:string[];trailer:string}[]=[];
    for await(const record of readCobolFile({
        filename:join(fixtures,filename),copybook:join(fixtures,'ODO.cpy'),projection,bufferSize,framing
    })) {
        try {
            const row=record.result;
            values.push({count:row.count(),codes:Array.from(row.items,item=>item.code()),trailer:row.trailer()});
        } finally {record.close();}
    }
    return values;
}

describe('ODO file-framing acceptance contracts',()=>{
    for(const bufferSize of [1,2,3,4,7,4096]) {
        test(`RDW: independently framed variable ODO records, ${bufferSize}-byte buffers`,async()=>{
            // The four-byte big-endian RDW length includes its four-byte header.
            // Three CP037 payloads are 2, 6, 4 bytes; no decoder-generated input.
            expect(await read('active-shift.rdw',bufferSize,{kind:'rdw'})).toEqual([
                {count:0,codes:[],trailer:'Z'},
                {count:2,codes:['AA','BB'],trailer:'Y'},
                {count:1,codes:['CC'],trailer:'X'}
            ]);
        });
        test(`FB reserved capacity: active ODO count is not physical size, ${bufferSize}-byte buffers`,async()=>{
            expect(await read('reserved-max.fb',bufferSize,{kind:'fixed',recordLength:8})).toEqual([
                {count:0,codes:[],trailer:'Z'},
                {count:2,codes:['AA','BB'],trailer:'Y'}
            ]);
        });
    }
    test('RDW: two simultaneously live records have independent counts and borrowed bytes',async()=>{
        const cursor=readCobolFile({
            filename:join(fixtures,'active-shift.rdw'),
            copybook:join(fixtures,'ODO.cpy'),projection,
            bufferSize:1,framing:{kind:'rdw'}
        });
        const first=await cursor.next(),second=await cursor.next();
        if(first.done||second.done||!first.value||!second.value)
            throw new Error('Expected two live RDW records');
        const a=first.value,b=second.value;
        try{
            expect(a.result.count()).toBe(0);
            expect(b.result.count()).toBe(2);
            a.close();
            expect(Array.from(b.result.items,item=>item.code())).toEqual(['AA','BB']);
            expect(b.result.trailer()).toBe('Y');
        }finally{
            b.close();
            await cursor.return();
        }
    });
    test('RDW: invalid zero length is rejected',async()=>{
        await expect(read('invalid-length.rdw',3,{kind:'rdw'})).rejects.toThrow(/Invalid COBOL RDW length/);
    });
    test('RDW: incomplete header is rejected',async()=>{
        await expect(read('truncated-header.rdw',1,{kind:'rdw'})).rejects.toThrow(/Truncated COBOL RDW/);
    });
    test('RDW: incomplete payload is rejected',async()=>{
        await expect(read('truncated-payload.rdw',2,{kind:'rdw'})).rejects.toThrow(/Truncated COBOL RDW record/);
    });
    test('RDW: unsupported control bytes are rejected',async()=>{
        await expect(read('unsupported-control.rdw',2,{kind:'rdw'})).rejects.toThrow(/RDW control bytes/);
    });
});
