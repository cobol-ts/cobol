import {scanThrowingFileCursor} from '@cobol-ts/cursor-file';
import {defineProjection} from '@cobol-ts/cursor-projection';
import {valueOrThrow} from '@cobol-ts/errors';
import {
    createCobolDecodedFixedDetails,
    cobolParser,
    createCobolRecordState,
    cleanCobolRecordState
} from './cobol.parser';
import {customerSimple} from './customer.fixtures';

type Customer = Readonly<{id(): number;name():string;status():string}>;
const projection = defineProjection<Customer>({
    id: {type:'integer',path:['CUSTOMER','CUSTOMER-ID']},
    name: {type:'string',path:['CUSTOMER','CUSTOMER-NAME']},
    status: {type:'character',path:['CUSTOMER','STATUS']}
});

function memorySource(content:Uint8Array,bufferSize:number) {
    const file={bytes:content,offset:0,reads:0};
    return {
        file,
        infrastructure: {
            parsers: {
                cobol: {
                    parser:cobolParser,
                    parserConfig:()=>valueOrThrow(createCobolDecodedFixedDetails(customerSimple.layout)),
                    createRecordState:createCobolRecordState,
                    cleanRecordState:cleanCobolRecordState
                }
            },
            bufferSize,
            fillFileBuffer:async (source:typeof file,destination:Uint8Array)=>{
                source.reads++;
                const count=Math.min(destination.length,source.bytes.length-source.offset);
                destination.set(source.bytes.subarray(source.offset,source.offset+count));
                source.offset+=count;
                return count;
            }
        }
    };
}

test('synchronously calls back with decoded records across small physical buffers',async()=>{
    const bytes=Uint8Array.from([...customerSimple.records[0].bytes,...customerSimple.records[1].bytes]);
    const source=memorySource(bytes,3);
    const rows:(readonly [number,string,string])[]=[];
    let saved:Customer|undefined;
    await scanThrowingFileCursor(
        {filename:'customer.fb',fileType:'cobol',projection},
        source.file,source.infrastructure,
        row=>{
            saved=row;
            rows.push([row.id(),row.name(),row.status()]);
        }
    );
    expect(rows).toEqual([[1,'ALICE     ','A'],[42,'BOB       ','I']]);
    expect(source.file.reads).toBeGreaterThan(2);
    expect(()=>saved!.id()).toThrow(/not bound/i);
});

test('false stops callback scan without processing later records',async()=>{
    const bytes=Uint8Array.from([...customerSimple.records[0].bytes,...customerSimple.records[1].bytes]);
    const source=memorySource(bytes,3);
    let calls=0;
    await scanThrowingFileCursor({filename:'customer.fb',fileType:'cobol',projection},
        source.file,source.infrastructure,row=>{expect(row.id()).toBe(1);calls++;return false;});
    expect(calls).toBe(1);
});

test('rejects asynchronous callbacks because projections are borrowed',async()=>{
    const source=memorySource(customerSimple.records[0].bytes,3);
    await expect(scanThrowingFileCursor({filename:'customer.fb',fileType:'cobol',projection},
        source.file,source.infrastructure,async row=>{row.id();})).rejects.toThrow(/synchronous/);
});
