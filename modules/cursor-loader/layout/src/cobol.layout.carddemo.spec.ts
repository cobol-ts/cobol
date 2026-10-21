/**
 * Real, unmodified AWS CardDemo copybooks, fetched by
 * scripts/fetch-carddemo-copybooks.mjs. Expected lengths are stated in
 * the application's README under "Upload Sample Data".
 *
 * These are real-world acceptance tests: a legal copybook our compiler
 * cannot lay out should FAIL, not be skipped, massaged, or adapted.
 *
 * They intentionally do not run a COBOL byte decoder.
 */
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {parseCopybook} from '@cobol-ts/copybook';
import {valueOrThrow} from '@cobol-ts/errors';
import {evaluateStorageSize} from '@cobol-ts/size';
import {compileCobolLayout} from './cobol.layout';

const documented = [
    ['CSUSR01Y.cpy', 80],
    ['CVACT01Y.cpy', 300],
    ['CVACT02Y.cpy', 150],
    ['CVCUS01Y.cpy', 500],
    ['CVACT03Y.cpy', 50],
    ['CVTRA06Y.cpy', 350],
    ['CVTRA05Y.cpy', 350],
    ['CVTRA02Y.cpy', 50],
] as const;

const noController = (path: readonly (string | number)[]): never => {
    throw new Error(`Runtime controller required by ${path.join('.')}; add count-specific oracles`);
};

describe('Unmodified AWS CardDemo copybooks versus documented FB LRECL', () => {
    test.each(documented)('%s has a physical extent of %i bytes', (filename, expectedBytes) => {
        // Missing fixture is a setup failure, not a skip or a pretend pass.
        const source = readFileSync(join(__dirname, '..', 'fixtures', 'carddemo', filename), 'utf8');
        const ast = valueOrThrow(parseCopybook(source));
        const roots = valueOrThrow(compileCobolLayout(ast, filename));
        expect(roots).toHaveLength(1);
        const bits = evaluateStorageSize(roots[0].size, noController);
        expect(bits).toBe(expectedBytes * 8);
    });
});
