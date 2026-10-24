/**
 * RED acceptance specifications for ODO framing. These are intentionally
 * constructed, explicitly documented cp037 byte fixtures (NOT externally
 * produced mainframe files). Unlike the external CardDemo tests they exist
 * to drive the next implementation step.
 *
 * Jest test.failing marks currently missing functionality without breaking
 * the rest of the integration suite. When the reader begins passing one,
 * Jest will report that test as a failure until `.failing` is removed.
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
async function read(filename:string,bufferSize:number) {
    const values:{count:number;codes:string[];trailer:string}[]=[];
    for await(const record of readCobolFile({
        filename:join(fixtures,filename),copybook:join(fixtures,'ODO.cpy'),projection,bufferSize
    })) {
        try {
            const row=record.result;
            values.push({count:row.count(),codes:Array.from(row.items,item=>item.code()),trailer:row.trailer()});
        } finally {record.close();}
    }
    return values;
}

describe('future ODO file-framing contracts (expected RED)',()=>{
    test.failing('variable active extent: use each count to find the next record start',async()=>{
        // Three records of 2, 6, 4 bytes. No RDWs: this scenario requires
        // determining each record extent from the data and chosen ODO policy.
        expect(await read('active-shift.fb',3)).toEqual([
            {count:0,codes:[],trailer:'Z'},
            {count:2,codes:['AA','BB'],trailer:'Y'},
            {count:1,codes:['CC'],trailer:'X'}
        ]);
    });
    test.failing('fixed-length maximum capacity: active ODO count excludes unused slots',async()=>{
        // Two FB/8 records. The suffix is anchored after the reserved
        // 3x2-byte table capacity, not directly after active occurrences.
        // This will need a distinct storage/framing choice when implemented.
        expect(await read('reserved-max.fb',3)).toEqual([
            {count:0,codes:[],trailer:'Z'},
            {count:2,codes:['AA','BB'],trailer:'Y'}
        ]);
    });
});
