
/**
 * Published COBOL copybook integration tests.
 *
 * Real COBOL declarations -> AST -> compiled layout ->
 * evaluated sizes -> physical byte coordinates.
 *
 * Expected coordinates are independent, hand-calculated
 * oracles, not values derived from the layout compiler.
 *
 * Fixtures are checked-in published examples.
 */
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {parseCopybook} from '@cobol-ts/copybook';
import {valueOrThrow} from '@cobol-ts/errors';
import {evaluateStorageSize} from '@cobol-ts/size';
import {
  compileCobolLayout,
  type CompiledCobolEntry,
} from './cobol.layout';
import {locateCobolEntry} from './cobol.layout.location';

type FieldPath = readonly (string | number)[];

type GoldenField = Readonly<{
  path: FieldPath;
  start: number;
  length: number;
}>;

const noController = (path: FieldPath): never => {
  throw new Error(
    `Unexpected ODO controller: ${path.join('.')}`
  );
};

const fixture = (file: string): string =>
  readFileSync(
    join(__dirname, '..', 'fixtures', file),
    'utf8'
  );

/**
 * Use the real parser and default production compiler.
 * No replacement primitive sizer or test-only options.
 */
const compile = (
  file: string
): readonly CompiledCobolEntry[] =>
  valueOrThrow(
    compileCobolLayout(
      valueOrThrow(parseCopybook(fixture(file))),
      file
    )
  );

const sizeBits = (node: CompiledCobolEntry): number =>
  evaluateStorageSize(node.size, noController);

const rootBytes = (
  roots: readonly CompiledCobolEntry[]
): number => {
  expect(roots).toHaveLength(1);
  const bits = sizeBits(roots[0]);
  expect(bits % 8).toBe(0);
  return bits / 8;
};

/**
 * Locator returns bits. Golden coordinates are bytes.
 */
const checkCoordinates = (
  roots: readonly CompiledCobolEntry[],
  entries: readonly GoldenField[]
): void => {
  for (const {path, start, length} of entries) {
    const located = valueOrThrow(
      locateCobolEntry(roots, path, noController)
    );

    expect({
      field: path.join('.'),
      start: located.offsetBits / 8,
      length: located.sizeBits / 8,
    }).toEqual({
      field: path.join('.'),
      start,
      length,
    });
  }
};

// IBM REDEFINES example.
// The fixture adds a containing 01 EXAMPLE-RECORD.
const IBM_OVERLAY: readonly GoldenField[] = [
  {path: ['EXAMPLE-RECORD', 'A'], start: 0, length: 6},
  {path: ['EXAMPLE-RECORD', 'B'], start: 0, length: 6},
  {path: ['EXAMPLE-RECORD', 'B', 'B-1'], start: 0, length: 2},
  {path: ['EXAMPLE-RECORD', 'B', 'B-2'], start: 2, length: 4},
  {path: ['EXAMPLE-RECORD', 'C'], start: 6, length: 4},
];

// AWS published REC-OUTFILE record.
// Total: 150 bytes, including a 19-byte edited DISPLAY field.
const R = 'REC-OUTFILE';

const AWS_FIELDS: readonly GoldenField[] = [
  {path: [R, 'OUTFILE-TEXT'], start: 0, length: 19},
  {path: [R, 'OUTFILE-UNPACKED'], start: 19, length: 18},
  {path: [R, 'OUTFILE-UNPACKED-S'], start: 37, length: 18},

  {path: [R, 'BINARY-FIELDS'], start: 55, length: 28},
  {path: [R, 'BINARY-FIELDS', 'OUTFILE-COMP-04'], start: 55, length: 2},
  {path: [R, 'BINARY-FIELDS', 'OUTFILE-COMP-04-S'], start: 57, length: 2},
  {path: [R, 'BINARY-FIELDS', 'OUTFILE-COMP-09'], start: 59, length: 4},
  {path: [R, 'BINARY-FIELDS', 'OUTFILE-COMP-09-S'], start: 63, length: 4},
  {path: [R, 'BINARY-FIELDS', 'OUTFILE-COMP-18'], start: 67, length: 8},
  {path: [R, 'BINARY-FIELDS', 'OUTFILE-COMP-18-S'], start: 75, length: 8},

  {path: [R, 'PACKED-DECIMAL-FIELDS'], start: 83, length: 36},
  {path: [R, 'PACKED-DECIMAL-FIELDS', 'OUTFILE-COMP3-04'], start: 83, length: 3},
  {path: [R, 'PACKED-DECIMAL-FIELDS', 'OUTFILE-COMP3-04-S'], start: 86, length: 3},
  {path: [R, 'PACKED-DECIMAL-FIELDS', 'OUTFILE-COMP3-09'], start: 89, length: 5},
  {path: [R, 'PACKED-DECIMAL-FIELDS', 'OUTFILE-COMP3-09-S'], start: 94, length: 5},
  {path: [R, 'PACKED-DECIMAL-FIELDS', 'OUTFILE-COMP3-18'], start: 99, length: 10},
  {path: [R, 'PACKED-DECIMAL-FIELDS', 'OUTFILE-COMP3-18-S'], start: 109, length: 10},

  {path: [R, 'GROUP1'], start: 119, length: 2},
  {path: [R, 'GROUP1', 'GROUP1-1', 0], start: 119, length: 1},
  {path: [R, 'GROUP1', 'GROUP1-1', 0, 'TEXT1'], start: 119, length: 1},
  {path: [R, 'GROUP1', 'GROUP1-1', 1], start: 120, length: 1},
  {path: [R, 'GROUP1', 'GROUP1-1', 1, 'TEXT1'], start: 120, length: 1},

  {path: [R, 'GROUP2'], start: 119, length: 2},
  {path: [R, 'GROUP2', 'TEXT2'], start: 119, length: 2},
];

describe('IBM published REDEFINES example', () => {
  test('overlapping declarations allocate 10 bytes', () => {
    expect(
      rootBytes(compile('ibm-redefinition-example.cpy'))
    ).toBe(10);
  });

  test('fields occupy the expected byte coordinates', () => {
    checkCoordinates(
      compile('ibm-redefinition-example.cpy'),
      IBM_OVERLAY
    );
  });

  test('both branches address the same physical bytes', () => {
    const roots = compile('ibm-redefinition-example.cpy');
    const bytes = Buffer.from('AB12349876', 'ascii');

    const slice = (path: FieldPath): string => {
      const {offsetBits, sizeBits} = valueOrThrow(
        locateCobolEntry(roots, path, noController)
      );
      expect(offsetBits % 8).toBe(0);
      expect(sizeBits % 8).toBe(0);

      return bytes.subarray(
        offsetBits / 8,
        (offsetBits + sizeBits) / 8
      ).toString('ascii');
    };

    expect(slice(['EXAMPLE-RECORD', 'A'])).toBe('AB1234');
    expect(slice(['EXAMPLE-RECORD', 'B', 'B-1'])).toBe('AB');
    expect(slice(['EXAMPLE-RECORD', 'B', 'B-2'])).toBe('1234');
    expect(slice(['EXAMPLE-RECORD', 'C'])).toBe('9876');
  });
});

describe('IBM published ERROR-MESSAGE-TABLE', () => {
  test('eight 25-byte entries allocate 200 bytes', () => {
    expect(
      rootBytes(compile('ibm-zos-error-messages.cpy'))
    ).toBe(200);
  });

  test('all eight entries have their known byte offsets', () => {
    const roots = compile('ibm-zos-error-messages.cpy');
    const root = roots[0];

    if (root.kind !== 'group') {
      throw new Error('Expected record group');
    }

    expect(root.children).toHaveLength(8);

    expect(
      root.children.map(
        child =>
          evaluateStorageSize(child.leftOffset, noController) / 8
      )
    ).toEqual([0, 25, 50, 75, 100, 125, 150, 175]);

    expect(
      root.children.map(child => sizeBits(child) / 8)
    ).toEqual(Array(8).fill(25));
  });
});

describe('AWS REC-OUTFILE published example', () => {
  /**
   * This integration test is expected to fail until the
   * real default primitive sizer understands PIC -9(18).
   *
   * It uses the unmodified production compiler.
   * Do not replace the primitive sizer or skip this test.
   */
  test('compiles and locates fields in the 150-byte record', () => {
    const roots = compile('aws-rec-outfile.cpy');

    expect(rootBytes(roots)).toBe(150);

    // Independent oracle: DISPLAY, COMP, COMP-3,
    // OCCURS and REDEFINES.
    checkCoordinates(roots, AWS_FIELDS);

    // The final unnamed FILLER covers bytes [121, 150).
    const root = roots[0];
    if (root.kind !== 'group') {
      throw new Error('Expected record group');
    }

    const last = root.children[root.children.length - 1];

    expect(last.kind).toBe('elementary');
    expect(
      evaluateStorageSize(last.leftOffset, noController) / 8
    ).toBe(121);
    expect(sizeBits(last) / 8).toBe(29);

    expect(
      (evaluateStorageSize(last.leftOffset, noController)
        + sizeBits(last)) / 8
    ).toBe(150);
  });
});
