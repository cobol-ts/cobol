/**
 * Published AWS EMPREC01 copybook -> real parser -> layout compiler -> locator.
 *
 * The fixture is transcribed from the publicly documented example, not a
 * synthetic AST.  The AWS documentation independently specifies FB/150 and
 * publishes a raw EBCDIC hexdump with which the offsets can be cross-checked.
 *
 * No injected sizers, no fake layouts and no primitive byte decoding.
 */
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {parseCopybook} from '@cobol-ts/copybook';
import {valueOrThrow} from '@cobol-ts/errors';
import {evaluateStorageSize} from '@cobol-ts/size';
import {compileCobolLayout} from './cobol.layout';
import {locateCobolEntry} from './cobol.layout.location';

type Path = readonly (string | number)[];
const noController = (path: Path): never => {
    throw new Error(`Unexpected ODO controller in fixed record: ${path.join('.')}`);
};
const compile = () => valueOrThrow(compileCobolLayout(
    valueOrThrow(parseCopybook(readFileSync(
        join(__dirname, '..', 'fixtures', 'public', 'aws-emprec01.cpy'), 'utf8'
    ))), 'aws-emprec01.cpy'
));

/** Zero-based byte coordinates, determined independently of our compiler. */
const expected = [
    {path: ['EMP-RECORD', 'EMP-ID'],                        start:   0, length:  5},
    {path: ['EMP-RECORD', 'EMP-ID-X'],                      start:   0, length:  5},
    {path: ['EMP-RECORD', 'EMP-NAME'],                      start:   5, length: 25},
    {path: ['EMP-RECORD', 'EMP-DOB'],                       start:  30, length: 10},
    {path: ['EMP-RECORD', 'EMP-ADDRESS', 0, 'EMP-ADDR-LINE'], start: 40, length: 25},
    {path: ['EMP-RECORD', 'EMP-ADDRESS', 1, 'EMP-ADDR-LINE'], start: 65, length: 25},
    {path: ['EMP-RECORD', 'EMP-ADDRESS', 2, 'EMP-ADDR-LINE'], start: 90, length: 25},
    {path: ['EMP-RECORD', 'EMP-YOE-CUR'],                   start: 115, length:  2},
    {path: ['EMP-RECORD', 'EMP-YOE-TOTAL'],                 start: 117, length:  4},
    {path: ['EMP-RECORD', 'EMP-SALARY'],                    start: 121, length:  6},
    {path: ['EMP-RECORD', 'EMP-SALARY-DIFF'],               start: 127, length:  4},
    {path: ['EMP-RECORD', 'EMP-DEPENDENTS-NUM'],            start: 131, length:  2},
] as const;

describe('Published AWS EMPREC01 (FB/150)', () => {
    test('the independently documented complete record is 150 bytes', () => {
        const roots = compile();
        expect(roots).toHaveLength(1);
        expect(evaluateStorageSize(roots[0].size, noController)).toBe(150 * 8);
    });

    test.each(expected)('locates $path at byte $start for $length bytes', ({path, start, length}) => {
        const roots = compile();
        const result = valueOrThrow(locateCobolEntry(roots, path, noController));
        expect(result.offsetBits).toBe(start * 8);
        expect(result.sizeBits).toBe(length * 8);
    });

    test('both identifier REDEFINES views agree; OCCURS body is not expanded', () => {
        const roots = compile();
        const a = valueOrThrow(locateCobolEntry(roots, ['EMP-RECORD', 'EMP-ID'], noController));
        const b = valueOrThrow(locateCobolEntry(roots, ['EMP-RECORD', 'EMP-ID-X'], noController));
        expect(a.offsetBits).toBe(b.offsetBits);
        expect(a.sizeBits).toBe(b.sizeBits);

        const root = roots[0];
        if (root.kind !== 'group') throw new Error('Expected record group');
        const address = root.children.find(child => child.kind === 'group' &&
            child.source.name.kind === 'named' && child.source.name.name === 'EMP-ADDRESS');
        if (!address || address.kind !== 'group') throw new Error('Expected address group');
        expect(address.children.filter(child => child.kind !== 'padding')).toHaveLength(1);
        expect(evaluateStorageSize(address.leftOffset, noController)).toBe(40 * 8);
        expect(evaluateStorageSize(address.size, noController)).toBe(75 * 8);
        expect(evaluateStorageSize(address.rightOffset, noController)).toBe(35 * 8);
    });

    test('field locations align with AWS-published raw EBCDIC bytes, without decoding', () => {
        const hex = readFileSync(join(__dirname, '..', 'fixtures', 'public',
            'aws-emprec01.first-record.hex'), 'utf8')
            .replace(/^#.*$/gm, '').replace(/\s+/g, '');
        const bytes = Buffer.from(hex, 'hex');
        expect(bytes).toHaveLength(150);
        const roots = compile();

        // Independent signatures copied from the published raw hex dump.
        const signatures = [
            {path: ['EMP-RECORD', 'EMP-ID'],             hex: 'f0f0f0f0f1'},
            {path: ['EMP-RECORD', 'EMP-YOE-CUR'],        hex: '0008'},
            {path: ['EMP-RECORD', 'EMP-YOE-TOTAL'],      hex: '0001700f'},
            {path: ['EMP-RECORD', 'EMP-SALARY'],         hex: 'f7f3f5f4f0c4'},
            {path: ['EMP-RECORD', 'EMP-SALARY-DIFF'],    hex: '0061283c'},
            {path: ['EMP-RECORD', 'EMP-DEPENDENTS-NUM'], hex: 'f0c2'},
        ] as const;
        for (const {path, hex: expectedHex} of signatures) {
            const {offsetBits, sizeBits} = valueOrThrow(locateCobolEntry(roots, path, noController));
            expect(offsetBits % 8).toBe(0);
            expect(sizeBits % 8).toBe(0);
            expect(bytes.subarray(offsetBits / 8, (offsetBits + sizeBits) / 8).toString('hex'))
                .toBe(expectedHex);
        }
    });

    test('right offsets independently partition the containing record', () => {
        const roots = compile();
        for (const {path, start, length} of expected) {
            // For direct children, rightOffset is measured from the end of the record.
            if (path.length !== 2) continue;
            const {node} = valueOrThrow(locateCobolEntry(roots, path, noController));
            expect(evaluateStorageSize(node.rightOffset, noController)).toBe((150 - start - length) * 8);
        }
    });
});
