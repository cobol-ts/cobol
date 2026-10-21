/**
 * Public AWS CardDemo copybooks: externally sourced byte-coordinate oracles
 * and internal geometry-consistency properties.
 *
 * The GOLDEN coordinates below were transcribed from the FIELD DECLARATIONS
 * in the named upstream files, independently of compileCobolLayout and
 * locateCobolEntry. They are zero-based byte offsets and exclusive lengths.
 *
 * The additional geometry-consistency tests apply to all eight pinned source
 * files, including those for which we do not yet have independently reviewed
 * coordinates. They are deliberately NOT described as external oracles.
 *
 * Run alongside, not instead of, cobol.layout.carddemo.spec.ts.
 */
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {parseCopybook} from '@cobol-ts/copybook';
import {valueOrThrow} from '@cobol-ts/errors';
import {evaluateStorageSize, type StorageSizeExpression} from '@cobol-ts/size';
import {compileCobolLayout, type CompiledCobolEntry, type CompiledCobolGroup} from './cobol.layout';
import {locateCobolEntry} from './cobol.layout.location';

type Path = readonly (string | number)[];
type Oracle = Readonly<{path: Path; at: number; bytes: number}>;
type Case = Readonly<{
    filename: string;
    record: string;
    bytes: number;
    fields: readonly Oracle[];
}>;

const noOdo = (path: Path): never => {
    throw new Error(`A fixed CardDemo fixture unexpectedly requires an ODO count at ${path.join('.')}`);
};
const bits = (expression: StorageSizeExpression): number =>
    evaluateStorageSize(expression, noOdo);
const load = (filename: string): readonly CompiledCobolEntry[] => {
    const source = readFileSync(join(__dirname, '..', 'fixtures', 'carddemo', filename), 'utf8');
    return valueOrThrow(compileCobolLayout(valueOrThrow(parseCopybook(source)), filename));
};

const oracle = (
    record: string,
    rows: readonly (readonly [string, number, number])[]
): readonly Oracle[] => rows.map(([field, at, bytes]) => ({path: [record, field], at, bytes}));

/**
 * Verified against original field declarations at:
 * https://github.com/aws-samples/aws-mainframe-modernization-carddemo/tree/main/app/cpy
 *
 * Explicit literals matter: expected positions MUST NOT be computed by the
 * layout compiler or locator, nor read out of its generated geometry.
 */
const golden: readonly Case[] = [
    {
        filename: 'CSUSR01Y.cpy', record: 'SEC-USER-DATA', bytes: 80,
        fields: oracle('SEC-USER-DATA', [
            ['SEC-USR-ID', 0, 8],
            ['SEC-USR-FNAME', 8, 20],
            ['SEC-USR-LNAME', 28, 20],
            ['SEC-USR-PWD', 48, 8],
            ['SEC-USR-TYPE', 56, 1],
            ['SEC-USR-FILLER', 57, 23],
        ])
    },
    {
        filename: 'CVACT03Y.cpy', record: 'CARD-XREF-RECORD', bytes: 50,
        fields: oracle('CARD-XREF-RECORD', [
            ['XREF-CARD-NUM', 0, 16],
            ['XREF-CUST-ID', 16, 9],
            ['XREF-ACCT-ID', 25, 11],
        ])
        // The last 14 bytes are an unnamed FILLER: checked via the
        // structural tail assertion below, not a name-based locator.
    },
    {
        filename: 'CVTRA05Y.cpy', record: 'TRAN-RECORD', bytes: 350,
        fields: oracle('TRAN-RECORD', [
            ['TRAN-ID', 0, 16],
            ['TRAN-TYPE-CD', 16, 2],
            ['TRAN-CAT-CD', 18, 4],
            ['TRAN-SOURCE', 22, 10],
            ['TRAN-DESC', 32, 100],
            ['TRAN-AMT', 132, 11],
            ['TRAN-MERCHANT-ID', 143, 9],
            ['TRAN-MERCHANT-NAME', 152, 50],
            ['TRAN-MERCHANT-CITY', 202, 50],
            ['TRAN-MERCHANT-ZIP', 252, 10],
            ['TRAN-CARD-NUM', 262, 16],
            ['TRAN-ORIG-TS', 278, 26],
            ['TRAN-PROC-TS', 304, 26],
        ])
        // Trailing FILLER occupies [330,350), verified separately.
    }
] as const;

const all = [
    ['CSUSR01Y.cpy', 80],
    ['CVACT01Y.cpy', 300],
    ['CVACT02Y.cpy', 150],
    ['CVCUS01Y.cpy', 500],
    ['CVACT03Y.cpy', 50],
    ['CVTRA06Y.cpy', 350],
    ['CVTRA05Y.cpy', 350],
    ['CVTRA02Y.cpy', 50],
] as const;

const group = (node: CompiledCobolEntry): CompiledCobolGroup => {
    if (node.kind !== 'group') throw new Error('Expected compiled COBOL group');
    return node;
};

const fixedCount = (node: CompiledCobolGroup): number => {
    const clause = node.source.clauses.find(c => c.kind === 'occurs');
    if (clause?.kind !== 'occurs') return 1;
    if ('count' in clause) return clause.count;
    throw new Error('This fixed-record geometry invariant needs a separate ODO count oracle');
};

/** One group occurrence owns its children; a repeated group owns many bodies. */
const oneBodySize = (node: CompiledCobolGroup): number => {
    const count = fixedCount(node);
    if (count <= 0) throw new Error('Unexpected non-positive fixed OCCURS count');
    const total = bits(node.size);
    if (total % count !== 0) throw new Error('Fixed table extent is not divisible by occurrence count');
    return total / count;
};

/**
 * These checks compare the independently implemented left and right folds,
 * and check that every allocated byte belongs to at least one child,
 * including generated padding. They are useful consistency properties,
 * NOT external proof that the compiler selected the correct field sizes.
 */
const verifyTree = (node: CompiledCobolGroup, path: string): number => {
    const body = oneBodySize(node);
    const occupied: Array<readonly [number, number]> = [];

    for (const [index, child] of node.children.entries()) {
        const left = bits(child.leftOffset);
        const width = bits(child.size);
        const right = bits(child.rightOffset);
        expect({path, index, left, width, right}).toEqual({
            path, index, left, width, right: body - left - width
        });
        expect(left).toBeGreaterThanOrEqual(0);
        expect(width).toBeGreaterThanOrEqual(0);
        expect(right).toBeGreaterThanOrEqual(0);
        expect(left + width).toBeLessThanOrEqual(body);
        if (width) occupied.push([left, left + width]);
        if (child.kind === 'group') {
            const name = child.source.name.kind === 'named' ? child.source.name.name : `#${index}`;
            verifyTree(child, `${path}.${name}`);
        }
    }

    // All storage must be accounted for. Overlays may overlap; padding
    // must occupy any alignment gaps. Sort independent of source order.
    occupied.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    let end = 0;
    for (const [start, after] of occupied) {
        expect(start).toBeLessThanOrEqual(end);
        end = Math.max(end, after);
    }
    expect(end).toBe(body);
    return body;
};

describe('CardDemo: independent published-field byte coordinates', () => {
    for (const {filename, record, bytes, fields} of golden) {
        describe(filename, () => {
            test(`the root is ${bytes} bytes`, () => {
                const roots = load(filename);
                expect(roots).toHaveLength(1);
                expect(bits(roots[0].size)).toBe(bytes * 8);
            });
            test.each(fields)('$path starts at byte $at and occupies $bytes bytes', ({path, at, bytes: width}) => {
                const found = valueOrThrow(locateCobolEntry(load(filename), path, noOdo));
                expect(found.offsetBits).toBe(at * 8);
                expect(found.sizeBits).toBe(width * 8);
                // Independently folded suffix must agree with record end
                // for each *direct* child of the record.
                expect(bits(found.node.rightOffset)).toBe((bytes - at - width) * 8);
            });
            test('the root children cover the full expected extent', () => {
                const top = group(load(filename)[0]);
                expect(top.source.name.kind === 'named' && top.source.name.name).toBe(record);
                expect(verifyTree(top, filename)).toBe(bytes * 8);
            });
        });
    }

    test('the unnamed trailing FILLER of CVACT03Y occupies bytes 36..49', () => {
        const root = group(load('CVACT03Y.cpy')[0]);
        const tail = root.children[root.children.length - 1];
        expect(tail.kind).toBe('elementary');
        expect(bits(tail.leftOffset)).toBe(36 * 8);
        expect(bits(tail.size)).toBe(14 * 8);
        expect(bits(tail.rightOffset)).toBe(0);
    });

    test('the unnamed trailing FILLER of CVTRA05Y occupies bytes 330..349', () => {
        const root = group(load('CVTRA05Y.cpy')[0]);
        const tail = root.children[root.children.length - 1];
        expect(tail.kind).toBe('elementary');
        expect(bits(tail.leftOffset)).toBe(330 * 8);
        expect(bits(tail.size)).toBe(20 * 8);
        expect(bits(tail.rightOffset)).toBe(0);
    });
});

describe('CardDemo: geometry consistency across every original record', () => {
    test.each(all)('%s has coherent left/right and full child coverage in %i bytes', (filename, expected) => {
        const roots = load(filename);
        expect(roots).toHaveLength(1);
        expect(verifyTree(group(roots[0]), filename)).toBe(expected * 8);
    });
});
