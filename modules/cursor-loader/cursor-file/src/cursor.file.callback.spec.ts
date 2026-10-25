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
