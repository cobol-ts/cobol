import {scanThrowingFileCursor} from './cursor.file';
import {createTestFile,createTestInfrastructure,customerFileDefinition} from './cursor.file.fixture';

test('callback receives borrowed projections, and the cursor releases them automatically',async()=>{
    const data=createTestFile('ABA');
    const names:string[]=[];
    let retained:{name():string}|undefined;
    await scanThrowingFileCursor(customerFileDefinition,data,createTestInfrastructure(),row=>{
        names.push(row.name());
        retained=row;
    });
    expect(names).toEqual(['Alice','Bob','Alice']);
    expect(()=>retained!.name()).toThrow(/not bound/i);
});

test('callback can stop without visiting the remaining records',async()=>{
    const data=createTestFile('ABABA');
    const names:string[]=[];
    await scanThrowingFileCursor(customerFileDefinition,data,createTestInfrastructure(),row=>{
        names.push(row.name());
        return false;
    });
    expect(names).toEqual(['Alice']);
});

test('callback errors terminate scan and release the borrowed row',async()=>{
    const data=createTestFile('!AB');
    await expect(scanThrowingFileCursor(customerFileDefinition,data,createTestInfrastructure(),
        ()=>{throw new Error('callback should not run');})).rejects.toMatchObject({
        name:'ErrorsException', errors:['bad row']
    });
});

test('accepts an injected record pool on the callback path', async () => {
    const {createSimpleRecordPool} = require('@cobol-ts/cursor-record') as typeof import('@cobol-ts/cursor-record');
    const pool = createSimpleRecordPool<any>();
    const infrastructure = {...createTestInfrastructure(), recordPool: pool};
    const names: string[] = [];
    await scanThrowingFileCursor(customerFileDefinition, createTestFile('ABA'), infrastructure, row => {
        names.push(row.name());
    });
    expect(names).toEqual(['Alice','Bob','Alice']);
});
