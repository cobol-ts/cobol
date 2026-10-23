/**
 * External FB/150 byte-level integration oracle, sourced from AWS Samples.
 * Real published raw EBCDIC bytes + original copybook + published CSV result.
 * No test-side encoding or generated source records are involved.
 * See ../fixtures/aws-employee/README.md for provenance.
 */
import {readFileSync} from 'node:fs';
import {open} from 'node:fs/promises';
import {join} from 'node:path';
import type {ProjectedArray} from '@cobol-ts/arrays';
import {parseCopybook} from '@cobol-ts/copybook';
import {createFileCursor} from '@cobol-ts/cursor-file';
import {
    cobolParser,
    createCobolDecodedFixedDetails,
    createCobolRecordState,
    cleanCobolRecordState
} from '@cobol-ts/cursor-loader-cobol';
import {defineProjection} from '@cobol-ts/cursor-projection';
import {valueOrThrow} from '@cobol-ts/errors';
import {compileCobolLayout} from '@cobol-ts/layout';

const fixtures = join(__dirname, '..', 'fixtures', 'aws-employee');
const binaryFile = join(fixtures, 'TEST.EMP.RECORD.FILE.dat');
const sourceCopybook = join(fixtures, 'EMPREC01.cpy');
const expectedCsv = join(fixtures, 'TEST.EMP.RECORD.FILE.csv');
const recordLength = 150;

type Address = {line(): string};
type Employee = {
    id(): number;
    idAsText(): string;
    name(): string;
    dateOfBirth(): string;
    readonly addresses: ProjectedArray<Address>;
    yearsCurrent(): number;
    yearsTotal(): number;
    salary(): number;
    salaryDifference(): number;
    dependents(): number;
};

const employeeProjection = defineProjection<Employee>({
    id: {type: 'integer', path: ['EMP-RECORD', 'EMP-ID']},
    idAsText: {type: 'string', path: ['EMP-RECORD', 'EMP-ID-X']},
    name: {type: 'string', path: ['EMP-RECORD', 'EMP-NAME']},
    dateOfBirth: {type: 'string', path: ['EMP-RECORD', 'EMP-DOB']},
    addresses: {type: 'array', path: ['EMP-RECORD', 'EMP-ADDRESS'], element: {
        line: {type: 'string', path: ['EMP-ADDR-LINE']}
    }},
    yearsCurrent: {type: 'integer', path: ['EMP-RECORD', 'EMP-YOE-CUR']},
    yearsTotal: {type: 'float', path: ['EMP-RECORD', 'EMP-YOE-TOTAL']},
    salary: {type: 'float', path: ['EMP-RECORD', 'EMP-SALARY']},
    salaryDifference: {type: 'float', path: ['EMP-RECORD', 'EMP-SALARY-DIFF']},
    dependents: {type: 'integer', path: ['EMP-RECORD', 'EMP-DEPENDENTS-NUM']}
});

type EmployeeValues = Readonly<{
    id: number;
    idAsText: string;
    name: string;
    dateOfBirth: string;
    addresses: readonly string[];
    yearsCurrent: number;
    yearsTotal: number;
    salary: number;
    salaryDifference: number;
    dependents: number;
}>;

function readEmployee(employee: Employee): EmployeeValues {
    // Materialising here is intentional: the test owns these assertions, not
    // the production reader. The record and projection remain borrowed views.
    return {
        id: employee.id(),
        idAsText: employee.idAsText(),
        name: employee.name(),
        dateOfBirth: employee.dateOfBirth(),
        addresses: Array.from(employee.addresses, address => address.line()),
        yearsCurrent: employee.yearsCurrent(),
        yearsTotal: employee.yearsTotal(),
        salary: employee.salary(),
        salaryDifference: employee.salaryDifference(),
        dependents: employee.dependents()
    };
}

function expectedEmployees(): EmployeeValues[] {
    const lines = readFileSync(expectedCsv, 'utf8').trimEnd().split(/\r?\n/);
    // These particular published CSV rows consist entirely of quoted strings,
    // with no quoted quotes or newlines: each row is also a valid JSON array
    // after wrapping it in brackets. Commas in address fields remain intact.
    return lines.slice(1).map(line => {
        const columns = JSON.parse(`[${line}]`) as string[];
        if (columns.length !== 13) throw new Error('Unexpected AWS CSV oracle width');
        return {
            id: Number(columns[0]),
            idAsText: columns[1],
            name: columns[2],
            dateOfBirth: columns[3],
            addresses: [columns[4], columns[5], columns[6]],
            yearsCurrent: Number(columns[7]),
            yearsTotal: Number(columns[8]),
            salary: Number(columns[9]),
            salaryDifference: Number(columns[10]),
            dependents: Number(columns[11])
        };
    });
}

function createDetails() {
    const ast = valueOrThrow(parseCopybook(readFileSync(sourceCopybook, 'utf8')));
    const compiled = valueOrThrow(compileCobolLayout(ast, 'EMPREC01.cpy'));
    return valueOrThrow(createCobolDecodedFixedDetails(compiled));
}

type MemorySource = {bytes: Uint8Array; offset: number};
function memorySource(): MemorySource {
    const bytes = readFileSync(binaryFile);
    return {bytes, offset: 0};
}

function memoryCursor(bufferSize: number) {
    const details = createDetails();
    return createFileCursor(
        {filename: binaryFile, fileType: 'cobol' as const, projection: employeeProjection},
        memorySource(), {
            parsers: {cobol: {
                parser: cobolParser,
                parserConfig: () => details,
                createRecordState: createCobolRecordState,
                cleanRecordState: cleanCobolRecordState
            }},
            bufferSize,
            fillFileBuffer: async (source: MemorySource, destination: Uint8Array) => {
                const count = Math.min(destination.length, source.bytes.length - source.offset);
                destination.set(source.bytes.subarray(source.offset, source.offset + count));
                source.offset += count;
                return count;
            }
        }
    );
}

async function collectEmployees(bufferSize: number): Promise<EmployeeValues[]> {
    const cursor = memoryCursor(bufferSize);
    const values: EmployeeValues[] = [];
    for await (const record of cursor) {
        if (Array.isArray(record)) throw new Error(`Unexpected COBOL row error: ${record.join(', ')}`);
        try {
            values.push(readEmployee(record.result));
        } finally {
            record.close();
        }
    }
    return values;
}

describe('AWS-published EMPREC01 fixed-record file (five genuine EBCDIC examples)', () => {
    test('fixture is five FB/150 records, not generated by our codec', () => {
        const raw = readFileSync(binaryFile);
        expect(raw.length).toBe(5 * recordLength);
        expect(Array.from(raw.subarray(0, 5))).toEqual([0xf0, 0xf0, 0xf0, 0xf0, 0xf1]);
        expect(createDetails().recordLengthBytes).toBe(recordLength);
        expect(expectedEmployees()).toHaveLength(5);
    });

    for (const bufferSize of [3, 7, 149, 150, 4096]) {
        test(`decodes ALL published CSV fields across FB records with ${bufferSize}-byte physical reads`, async () => {
            expect(await collectEmployees(bufferSize)).toEqual(expectedEmployees());
        });
    }

    test('two simultaneously live FB records retain independent bytes and projected views', async () => {
        const cursor = memoryCursor(7);
        const first = await cursor.next();
        const second = await cursor.next();
        if (first.done || second.done || !first.value || !second.value ||
            Array.isArray(first.value) || Array.isArray(second.value)) {
            throw new Error('Expected two independently live AWS employee projections');
        }
        const a = first.value, b = second.value;
        try {
            // Read second record before first: same physical source, two live leases.
            expect(readEmployee(b.result)).toEqual(expectedEmployees()[1]);
            expect(readEmployee(a.result)).toEqual(expectedEmployees()[0]);
        } finally {
            a.close();
        }
        try {
            // Closing first must not invalidate second, including borrowed arrays.
            expect(readEmployee(b.result)).toEqual(expectedEmployees()[1]);
        } finally {
            b.close();
        }
        const remaining: EmployeeValues[] = [];
        for await (const record of cursor) {
            if (Array.isArray(record)) throw new Error(record.join(', '));
            try { remaining.push(readEmployee(record.result)); }
            finally { record.close(); }
        }
        expect(remaining).toEqual(expectedEmployees().slice(2));
    });

    test('opens original FB fixture through actual filesystem I/O (not only a memory source)', async () => {
        const handle = await open(binaryFile, 'r');
        try {
            const details = createDetails();
            const cursor = createFileCursor(
                {filename: binaryFile, fileType: 'cobol' as const, projection: employeeProjection},
                {handle}, {
                    parsers: {cobol: {
                        parser: cobolParser,
                        parserConfig: () => details,
                        createRecordState: createCobolRecordState,
                        cleanRecordState: cleanCobolRecordState
                    }},
                    bufferSize: 11,
                    fillFileBuffer: async (source, target: Uint8Array) =>
                        (await source.handle.read(target, 0, target.length, null)).bytesRead
                }
            );
            const values: EmployeeValues[] = [];
            for await (const record of cursor) {
                if (Array.isArray(record)) throw new Error(record.join(', '));
                try { values.push(readEmployee(record.result)); }
                finally { record.close(); }
            }
            expect(values).toEqual(expectedEmployees());
        } finally {
            await handle.close();
        }
    });
});
