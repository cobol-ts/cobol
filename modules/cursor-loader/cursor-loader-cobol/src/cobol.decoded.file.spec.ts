import {mkdtemp, open, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createFileCursor} from '@cobol-ts/cursor-file';
import {defineProjection} from '@cobol-ts/cursor-projection';
import {valueOrThrow} from '@cobol-ts/errors';
import {cobolParser,createCobolDecodedFixedDetails,createCobolRecordState,cleanCobolRecordState} from './cobol.parser';
import {customerSimple} from './customer.fixtures';

test('opens a genuine fixed-block binary file and reads all rows from the filesystem',async()=>{
    const directory=await mkdtemp(join(tmpdir(),'cobol-decoder-'));
    const filename=join(directory,'customers.fb');
    const fixture=Uint8Array.from(customerSimple.records.flatMap(r=>[...r.bytes]));
    await writeFile(filename,fixture);
    const handle=await open(filename,'r');
    try {
        const projection=defineProjection<{id():number;name():string}>({
            id:{type:'integer',path:['CUSTOMER','CUSTOMER-ID']},
            name:{type:'string',path:['CUSTOMER','CUSTOMER-NAME']}
        });
        const details=valueOrThrow(createCobolDecodedFixedDetails(customerSimple.layout));
        const cursor=createFileCursor(
            {filename,fileType:'cobol',projection},{handle},
            {parsers:{cobol:{parser:cobolParser,parserConfig:()=>details,
                createRecordState:createCobolRecordState,cleanRecordState:cleanCobolRecordState}},
                bufferSize:4,fillFileBuffer:async(source,destination)=>
                    (await source.handle.read(destination,0,destination.length,null)).bytesRead
            });
        const values:{id:number;name:string}[]=[];
        for await(const record of cursor){
            if(Array.isArray(record)) throw new Error(`COBOL row failure: ${record.join(', ')}`);
            values.push({id:record.result.id(),name:record.result.name()});
            record.close();
        }
        expect(values).toEqual([{id:1,name:'ALICE     '},{id:42,name:'BOB       '}]);
    } finally {
        await handle.close();
        await rm(directory,{recursive:true,force:true});
    }
});
