/**
 * COBOL source -> real parser -> real IBM layout -> real indexed locator.
 *
 * These tests challenge interactions described by public IBM COBOL storage
 * rules. The sources are SMALL ADAPTED EXAMPLES, not copies of IBM compiler
 * listings or unmodified production copybooks. Expected bit coordinates are
 * literal, independently calculated from the documented rules.
 *
 * These tests complement the original CardDemo corpus (whose LRECLs are
 * externally documented) and the synthetic compiler unit tests.
 */
import {parseCopybook} from '@cobol-ts/copybook';
import {valueOrThrow} from '@cobol-ts/errors';
import {evaluateStorageSize} from '@cobol-ts/size';
import {compileCobolLayout} from './cobol.layout';
import {locateCobolEntry} from './cobol.layout.location';

type Path = readonly (string | number)[];
const fixed = (_path: Path): never => { throw new Error('Unexpected ODO controller'); };
const compile = (source: string) => valueOrThrow(
    compileCobolLayout(valueOrThrow(parseCopybook(source)), 'REFERENCE.cpy')
);
const locate = (
    roots: ReturnType<typeof compile>, path: Path, resolve: (path: Path) => number = fixed
) => {
    const entry = valueOrThrow(locateCobolEntry(roots, path, resolve));
    expect(entry.offsetBits % 8).toBe(0);
    expect(entry.sizeBits % 8).toBe(0);
    return [entry.offsetBits / 8, entry.sizeBits / 8] as const;
};
const size = (roots: ReturnType<typeof compile>, resolve: (path: Path) => number = fixed) =>
    evaluateStorageSize(roots[0].size, resolve) / 8;

/**
 * IBM REDEFINES documents unequal physical extents for alphanumeric
 * and national overlays: PIC X(6) and PIC N(4) occupy 6 and 8 bytes.
 * The trailing field here is an added sentinel to test advancing the run.
 * https://www.ibm.com/docs/en/cobol-aix/5.1.0?topic=entry-redefines-clause
 */
const ibmUnequalOverlay = `
01 RECORD.
   05 A PIC X(6).
   05 B REDEFINES A PIC N(4).
   05 TAIL PIC X(2).
`;

describe('IBM documented overlay extent (adapted)', () => {
    test('the later longer alternative wins: 8+2=10 bytes', () => {
        const roots = compile(ibmUnequalOverlay);
        expect(size(roots)).toBe(10);
        expect(locate(roots, ['RECORD', 'A'])).toEqual([0, 6]);
        expect(locate(roots, ['RECORD', 'B'])).toEqual([0, 8]);
        expect(locate(roots, ['RECORD', 'TAIL'])).toEqual([8, 2]);
    });
    test('shorter overlay has 4-byte suffix; longer has 2', () => {
        const roots = compile(ibmUnequalOverlay);
        for (const [name, expected] of [['A', 4], ['B', 2], ['TAIL', 0]] as const) {
            const node = valueOrThrow(locateCobolEntry(roots, ['RECORD', name], fixed)).node;
            expect(evaluateStorageSize(node.rightOffset, fixed)).toBe(expected * 8);
        }
    });
});

/**
 * IBM SYNCHRONIZED applies halfword alignment to <=4 digit BINARY and
 * fullword alignment to 5..18 digit BINARY. The extra fields challenge gaps.
 * https://www.ibm.com/docs/en/cobol-aix/5.1.0?topic=entry-synchronized-clause
 */
const ibmSynchronized = `
01 RECORD.
   05 PREFIX PIC X.
   05 HALF PIC S9(4) COMP SYNCHRONIZED.
   05 MIDDLE PIC X.
   05 WORD PIC S9(9) COMP SYNCHRONIZED.
   05 TRAILER PIC X(2).
`;

describe('IBM documented alignment boundaries (adapted)', () => {
    test('padding appears at physical byte 1 and bytes 5..7', () => {
        const roots = compile(ibmSynchronized);
        expect(size(roots)).toBe(14);
        expect(locate(roots, ['RECORD', 'PREFIX'])).toEqual([0, 1]);
        expect(locate(roots, ['RECORD', 'HALF'])).toEqual([2, 2]);
        expect(locate(roots, ['RECORD', 'MIDDLE'])).toEqual([4, 1]);
        expect(locate(roots, ['RECORD', 'WORD'])).toEqual([8, 4]);
        expect(locate(roots, ['RECORD', 'TRAILER'])).toEqual([12, 2]);
    });
    test('independent right offsets agree with aligned physical ends', () => {
        const roots = compile(ibmSynchronized);
        const suffixes = [['PREFIX', 13], ['HALF', 10], ['MIDDLE', 9], ['WORD', 2], ['TRAILER', 0]] as const;
        for (const [name, expected] of suffixes) {
            const node = valueOrThrow(locateCobolEntry(roots, ['RECORD', name], fixed)).node;
            expect(evaluateStorageSize(node.rightOffset, fixed)).toBe(expected * 8);
        }
    });
});

/**
 * The next two are COMPLEX IBM RULE COMBINATIONS devised as challenges;
 * they are not claimed to appear verbatim in a public copybook.
 * ODO controllers deliberately live in fixed storage before any table.
 */
const odoThenOverlay = `
01 RECORD.
   05 COUNT PIC 9.
   05 PREFIX PIC X(2).
   05 ITEMS OCCURS 0 TO 10 TIMES DEPENDING ON COUNT PIC X(3).
   05 SHORT PIC X(2).
   05 LONG REDEFINES SHORT PIC X(5).
   05 LAST PIC X(2).
`;
const resolveCount = (n: number) => (path: Path): number => {
    if (path[path.length - 1] !== 'COUNT') throw new Error(`Unknown controller ${path.join('.')}`);
    return n;
};

describe('variable table followed by unequal fixed overlay', () => {
    test.each([0, 1, 2, 5, 10])('count %i: correct record extent and overlay start', n => {
        const roots = compile(odoThenOverlay), resolve = resolveCount(n);
        expect(size(roots, resolve)).toBe(10 + 3 * n);
        expect(locate(roots, ['RECORD', 'COUNT'], resolve)).toEqual([0, 1]);
        if (n > 0) expect(locate(roots, ['RECORD', 'ITEMS', 0], resolve)).toEqual([3, 3]);
        expect(locate(roots, ['RECORD', 'SHORT'], resolve)).toEqual([3 + 3 * n, 2]);
        expect(locate(roots, ['RECORD', 'LONG'], resolve)).toEqual([3 + 3 * n, 5]);
        expect(locate(roots, ['RECORD', 'LAST'], resolve)).toEqual([8 + 3 * n, 2]);
    });
    test.each([1, 2, 5, 10])('count %i: indexed occurrences advance by exactly 3 bytes', n => {
        const roots = compile(odoThenOverlay), resolve = resolveCount(n);
        for (let i = 0; i < n; i++) {
            expect(locate(roots, ['RECORD', 'ITEMS', i], resolve)).toEqual([3 + 3 * i, 3]);
        }
    });
});

const nestedOdo = `
01 RECORD.
   05 OUTER-COUNT PIC 9.
   05 INNER-COUNT PIC 9.
   05 OUTER OCCURS 0 TO 3 TIMES DEPENDING ON OUTER-COUNT.
      10 INNER OCCURS 0 TO 4 TIMES DEPENDING ON INNER-COUNT.
         15 CODE PIC X(2).
      10 TRAILER PIC X.
   05 FINAL PIC X.
`;
const nestedCounts = (outer: number, inner: number) => (path: Path): number => {
    switch (path[path.length - 1]) {
        case 'OUTER-COUNT': return outer;
        case 'INNER-COUNT': return inner;
        default: throw new Error(`Unexpected ODO controller ${path.join('.')}`);
    }
};

describe('nested ODO physical-coordinate matrix', () => {
    test.each([
        [0, 0], [0, 4], [1, 0], [1, 4], [2, 3], [3, 4]
    ])('outer %i / inner %i', (outer, inner) => {
        const roots = compile(nestedOdo), resolve = nestedCounts(outer, inner);
        const stride = 2 * inner + 1;
        expect(size(roots, resolve)).toBe(3 + outer * stride);
        expect(locate(roots, ['RECORD', 'FINAL'], resolve)).toEqual([2 + outer * stride, 1]);
        for (let i = 0; i < outer; i++) {
            expect(locate(roots, ['RECORD', 'OUTER', i, 'TRAILER'], resolve))
                .toEqual([2 + i * stride + 2 * inner, 1]);
            for (let j = 0; j < inner; j++) {
                expect(locate(roots, ['RECORD', 'OUTER', i, 'INNER', j, 'CODE'], resolve))
                    .toEqual([2 + i * stride + j * 2, 2]);
            }
        }
    });
});
