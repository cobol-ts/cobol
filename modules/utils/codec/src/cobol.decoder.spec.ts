import {FragmentedByteCursor} from './fragmented.bytes';
import {compileCobolFieldDecoder} from './cobol.decoder';

const decode = (picture: string, bytes: number[], usage='DISPLAY', signed=false,
    split=2): string|number => {
    const data=Uint8Array.from(bytes);
    const fragments={buffers:[data.subarray(0,split),data.subarray(split,split+1),data.subarray(split+1)]};
    const decoder=compileCobolFieldDecoder({picture,clauses:usage==='DISPLAY'?[]:[{kind:'usage',usage}]},bytes.length);
    return decoder.decode(new FragmentedByteCursor().bind(fragments,0,bytes.length));
};

describe('COBOL primitive decoding over borrowed fragmented bytes',()=>{
    test('CP037 preserves spaces, punctuation and non-ASCII Unicode output without joining bytes',()=>{
        expect(decode('X(5)',[0xc1,0x40,0xd6,0x4b,0xc2])).toBe('A O.B');
    });
    test('reads numeric EBCDIC DISPLAY and implicit decimals',()=>{
        expect(decode('9(4)',[0xf0,0xf0,0xf4,0xf2])).toBe(42);
        expect(decode('S9(3)V99',[0xf1,0xf2,0xf3,0xf4,0xd5])).toBe(-123.45);
    });
    test('packed decimal positive and negative, leading padding and sign nibble',()=>{
        expect(decode('S9(3)V99',[0x12,0x34,0x5d],'COMP-3')).toBe(-123.45);
        expect(decode('S9(4)',[0x01,0x23,0x4c],'COMP-3')).toBe(1234);
        expect(()=>decode('9(3)',[0x12,0x3d],'COMP-3')).toThrow(/Unsigned/);
    });
    test('signed big endian binary with no BigInt or materialised arrays',()=>{
        expect(decode('S9(9)',[0xff,0xff,0xff,0xff],'COMP')).toBe(-1);
        expect(decode('9(4)',[0x00,0x2a],'COMP')).toBe(42);
    });
    test('text remains live byte-backed, scratch cursor can be rebound',()=>{
        const data=Uint8Array.of(0xc1,0xc2,0xc3);
        const cursor=new FragmentedByteCursor();
        const decoder=compileCobolFieldDecoder({picture:'X(2)',clauses:[]},2);
        cursor.bind({buffers:[data.subarray(0,1),data.subarray(1)]},0,2);
        expect(decoder.decode(cursor)).toBe('AB');
        data[0]=0xc4;
        cursor.bind({buffers:[data]},0,2);
        expect(decoder.decode(cursor)).toBe('DB');
    });
    test('rejects unsupported usages and precision loss instead of guessing',()=>{
        expect(()=>compileCobolFieldDecoder({picture:'S9(6)',clauses:[{kind:'usage',usage:'COMP-5'}]},4)).toThrow(/COMP-5/);
        expect(()=>decode('9(16)',Array(16).fill(0xf9))).toThrow(/safe integer/);
        expect(()=>decode('9(3)',[0xf1,0xff,0xf3])).toThrow(/Invalid/);
    });
    test('supports ASCII without assuming CP037',()=>{
        const decoder=compileCobolFieldDecoder({picture:'X(3)',clauses:[]},3,{encoding:'ascii'});
        expect(decoder.decode(new FragmentedByteCursor().bind({buffers:[Uint8Array.of(65),Uint8Array.of(66,67)]},0,3))).toBe('ABC');
    });
});
