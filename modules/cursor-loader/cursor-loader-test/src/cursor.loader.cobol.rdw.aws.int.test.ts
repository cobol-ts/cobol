/**
 * Regression for the RDW's four-byte *physical* prefix with a constant-layout
 * copybook. The payloads are the original AWS EBCDIC FB/150 samples: only
 * the four binary RDW length/control bytes are added by this test. This is
 * an RDW adapter test, not an independently published RDW data file.
 */
import {readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {defineProjection} from '@cobol-ts/cursor-projection';
import {readCobolFile} from '@cobol-ts/cursor-loader-cobol/node';

const fixtures=join(__dirname,'..','fixtures','aws-employee');
const copybook=join(fixtures,'EMPREC01.cpy');
type Employee={id():number;name():string;salary():number};
const projection=defineProjection<Employee>({
    id:{type:'integer',path:['EMP-RECORD','EMP-ID']},
    name:{type:'string',path:['EMP-RECORD','EMP-NAME']},
    salary:{type:'float',path:['EMP-RECORD','EMP-SALARY']}
});

test('AWS FB/150 data with RDWs uses original payload field offsets',async()=>{
    const raw=readFileSync(join(fixtures,'TEST.EMP.RECORD.FILE.dat'));
    expect(raw.length).toBe(750);
    const framed=new Uint8Array(5*(150+4));
    for(let i=0;i<5;i++){
        const pos=i*154;
        framed[pos]=0;
        framed[pos+1]=154; // 150 COBOL payload + four RDW bytes
        framed[pos+2]=0;
        framed[pos+3]=0;
        framed.set(raw.subarray(i*150,i*150+150),pos+4);
    }
    const directory=mkdtempSync(join(tmpdir(),'cobol-rdw-'));
    const filename=join(directory,'employees.rdw');
    try{
        writeFileSync(filename,framed);
        for(const bufferSize of [1,3,154,4096]){
            const values:{id:number;name:string;salary:number}[]=[];
            for await(const record of readCobolFile({filename,copybook,projection,bufferSize,framing:{kind:'rdw'}})){
                try{
                    const row=record.result;
                    values.push({id:row.id(),name:row.name(),salary:row.salary()});
                }finally{record.close();}
            }
            expect(values.length).toBe(5);
            expect(values[0]).toEqual({id:1,name:'Jennifer Cooley          ',salary:7354.04});
            expect(values[1]).toEqual({id:2,name:'Patience Hanson          ',salary:2155.33});
        }
    }finally{rmSync(directory,{recursive:true,force:true});}
});
