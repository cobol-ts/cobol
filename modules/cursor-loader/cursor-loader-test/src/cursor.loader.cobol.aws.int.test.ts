/**
 * External FB/150 byte-level integration oracle, sourced from AWS Samples.
 * Real published raw EBCDIC bytes + original copybook + published CSV result.
 * No test-side encoding or generated source records are involved.
 * See ../fixtures/aws-employee/README.md for provenance.
 */
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import type {ProjectedArray} from '@cobol-ts/arrays';
import {readCobolFile} from '@cobol-ts/cursor-loader-cobol/node';
import {defineProjection} from '@cobol-ts/cursor-projection';

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

function openEmployees(bufferSize?: number) {
    return readCobolFile({
        copybook: sourceCopybook,
        filename: binaryFile,
        projection: employeeProjection,
        bufferSize
    });
}

async function collectEmployees(bufferSize?: number): Promise<EmployeeValues[]> {
    const employees: EmployeeValues[] = [];
    for await (const record of openEmployees(bufferSize)) {
        try {
            // Materialisation is for the assertion only, not part of the reader.
            employees.push(readEmployee(record.result));
        } finally {
            record.close();
        }
    }
    return employees;
}

describe('AWS EMPREC01 external EBCDIC FB/150 file', () => {
    test('uses the unchanged published 750-byte binary and five CSV oracles', () => {
        const raw = readFileSync(binaryFile);
        expect(raw.length).toBe(5 * recordLength);
        expect(Array.from(raw.subarray(0, 5))).toEqual([0xf0, 0xf0, 0xf0, 0xf0, 0xf1]);
        expect(expectedEmployees()).toHaveLength(5);
    });

    for (const bufferSize of [3, 7, 149, 150, 4096]) {
        test(`reads and decodes every published value from the real file with ${bufferSize}-byte buffers`, async () => {
            expect(await collectEmployees(bufferSize)).toEqual(expectedEmployees());
        });
    }

    test('two live records are independent, even when one is closed first', async () => {
        const cursor = openEmployees(7);
        const first = await cursor.next();
        const second = await cursor.next();
        if (first.done || second.done || !first.value || !second.value) {
            throw new Error('Expected two independently live employee records');
        }
        const a = first.value;
        const b = second.value;
        try {
            expect(readEmployee(b.result)).toEqual(expectedEmployees()[1]);
            expect(readEmployee(a.result)).toEqual(expectedEmployees()[0]);
        } finally {
            a.close();
        }
        try {
            expect(readEmployee(b.result)).toEqual(expectedEmployees()[1]);
        } finally {
            b.close();
        }
        const rest: EmployeeValues[] = [];
        for await (const record of cursor) {
            try { rest.push(readEmployee(record.result)); }
            finally { record.close(); }
        }
        expect(rest).toEqual(expectedEmployees().slice(2));
    });

    test('uses default buffers and closes successfully after early iterator return', async () => {
        const cursor = openEmployees();
        const first = await cursor.next();
        if (first.done || !first.value) throw new Error('Expected first employee');
        try {
            expect(first.value.result.id()).toBe(1);
        } finally {
            first.value.close();
            await cursor.return();
        }
        expect((await cursor.next()).done).toBe(true);
    });
});
