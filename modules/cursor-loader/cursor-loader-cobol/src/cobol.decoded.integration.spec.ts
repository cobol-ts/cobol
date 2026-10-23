import type {ProjectedArray} from '@cobol-ts/arrays';
import {createFileCursor} from '@cobol-ts/cursor-file';
import {createProjection, defineProjection} from '@cobol-ts/cursor-projection';
import {valueOrThrow} from '@cobol-ts/errors';
import {parseCopybook} from '@cobol-ts/copybook';
import {compileCobolLayout} from '@cobol-ts/layout';
import {
    cobolParser, createCobolDecodedFixedDetails, createCobolDecodedProjectionDetails,
    createCobolRecordState, cleanCobolRecordState
} from './cobol.parser';
import {customerSimple, customerAligned, customerFixedOccurs} from './customer.fixtures';

type Person = { id(): number; name(): string; status(): string };
const personProjection = defineProjection<Person>({
    id: {type: 'integer', path: ['CUSTOMER', 'CUSTOMER-ID']},
    name: {type: 'string', path: ['CUSTOMER', 'CUSTOMER-NAME']},
    status: {type: 'character', path: ['CUSTOMER', 'STATUS']}
});

test('real FB file cursor decodes two EBCDIC records across 3-byte physical buffers', async () => {
    const details = valueOrThrow(createCobolDecodedFixedDetails(customerSimple.layout));
    const content = Uint8Array.from([...customerSimple.records[0].bytes, ...customerSimple.records[1].bytes]);
    const source = {bytes: content, offset: 0};
    const cursor = createFileCursor(
        {filename: 'customers.fb', fileType: 'cobol' as const, projection: personProjection}, source,
        {
            parsers: {
                cobol: {
                    parser: cobolParser, parserConfig: () => details,
                    createRecordState: createCobolRecordState, cleanRecordState: cleanCobolRecordState
                }
            },
            bufferSize: 3,
            fillFileBuffer: async (s: typeof source, destination: Uint8Array) => {
                const size = Math.min(destination.length, s.bytes.length - s.offset);
                destination.set(s.bytes.subarray(s.offset, s.offset + size));
                s.offset += size;
                return size;
            }
        });
    const a = await cursor.next(), b = await cursor.next();
    if (a.done || b.done || !a.value || !b.value || Array.isArray(a.value) || Array.isArray(b.value)) throw new Error('Expected projected records');
    expect([a.value.result.id(), a.value.result.name(), a.value.result.status()]).toEqual([1, 'ALICE     ', 'A']);
    expect([b.value.result.id(), b.value.result.name(), b.value.result.status()]).toEqual([42, 'BOB       ', 'I']);
    a.value.close();
    b.value.close();
    expect((await cursor.next()).done).toBe(true);
});

test('decodes signed COMP after SYNCHRONIZED padding using real compiled layout', () => {
    const details = valueOrThrow(createCobolDecodedFixedDetails(customerAligned.layout));
    const projection = defineProjection<{ balance(): number }>({
        balance: {
            type: 'integer',
            path: ['CUSTOMER', 'BALANCE']
        }
    });
    const factory = createProjection(cobolParser, details, undefined, projection), data = factory.create();
    const original = customerAligned.records[1].bytes;
    const physical = {
        buffers: [original.subarray(0, 5), original.subarray(5, 7), original.subarray(7)],
        startByte: 0, endByte: original.length, lastValidByte: original.length,
        source: 'aligned.fb', recordNumber: 1, recordState: createCobolRecordState()
    };
    factory.bind(data, physical, physical);
    expect(data.balance()).toBe(-1);
    factory.clear(data);
});

test('decoded fixed OCCURS projections select the proper byte range for each element', () => {
    interface Phone {
        raw(): string;

        kind(): string
    }

    interface Customer {
        id(): number;

        readonly phones: ProjectedArray<Phone>
    }

    const definition = defineProjection<Customer>({
        id: {type: 'integer', path: ['CUSTOMER', 'CUSTOMER-ID']},
        phones: {
            type: 'array', path: ['CUSTOMER', 'TELEPHONES'], element: {
                raw: {type: 'string', path: ['PHONE-RAW']},
                kind: {type: 'character', path: ['PHONE-PARTS', 'PHONE-KIND']}
            }
        }
    });
    const details = valueOrThrow(createCobolDecodedFixedDetails(customerFixedOccurs.layout));
    const factory = createProjection(cobolParser, details, undefined, definition), row = factory.create();
    const bytes = customerFixedOccurs.records[0].bytes;
    const physical = {
        buffers: [bytes.subarray(0, 6), bytes.subarray(6, 12), bytes.subarray(12)],
        startByte: 0, endByte: bytes.length, lastValidByte: bytes.length,
        source: 'phones.fb', recordNumber: 1, recordState: createCobolRecordState()
    };
    factory.bind(row, physical, physical);
    expect(row.id()).toBe(1001);
    expect(row.phones[0].raw()).toBe('H12345');
    expect(row.phones[1].raw()).toBe('M67890');
    expect(row.phones[0].kind()).toBe('H');
    factory.clear(row);
});

test('three-level ODO uses the same decoded-value scalar accessors', () => {
    const copybook = [
        '01 ROW.', '05 O-COUNT PIC 9.', '05 M-COUNT PIC 9.', '05 I-COUNT PIC 9.',
        '05 OUTERS OCCURS 0 TO 3 TIMES DEPENDING ON O-COUNT.',
        '10 O-HEAD PIC X.',
        '10 MIDDLES OCCURS 0 TO 3 TIMES DEPENDING ON M-COUNT.',
        '15 M-HEAD PIC X.',
        '15 INNERS OCCURS 0 TO 3 TIMES DEPENDING ON I-COUNT.',
        '20 CODE PIC X(2).', '15 M-TAIL PIC X.',
        '10 O-TAIL PIC X.', '05 FINAL PIC X.'
    ].join('\n');
    type I = { code(): string };
    type M = { readonly inners: ProjectedArray<I> };
    type O = { readonly middles: ProjectedArray<M> };
    type R = { readonly outers: ProjectedArray<O>; final(): string };
    const projection = defineProjection<R>({
        outers: {
            type: 'array', path: ['ROW', 'OUTERS'], element: {
                middles: {
                    type: 'array', path: ['MIDDLES'], element: {
                        inners: {type: 'array', path: ['INNERS'], element: {code: {type: 'string', path: ['CODE']}}}
                    }
                }
            }
        }, final: {type: 'character', path: ['ROW', 'FINAL']}
    });
    const details = valueOrThrow(createCobolDecodedProjectionDetails(valueOrThrow(
        compileCobolLayout(valueOrThrow(parseCopybook(copybook)), 'odo.cpy'))));
    const factory = createProjection(cobolParser, details, undefined, projection), row = factory.create();
    const bytes = Uint8Array.from([0xf2, 0xf2, 0xf2,
        0xc1, 0xc2, 0xc3, 0xc4, 0xc5, 0xc6, 0xc7, 0xc8, 0xc9, 0xca, 0xcb, 0xcc, 0xcd, 0xce,
        0xd1, 0xd2, 0xd3, 0xd4, 0xd5, 0xd6, 0xd7, 0xd8, 0xd9, 0xda, 0xdb, 0xdc, 0xdd, 0xde, 0xe9]);
    const physical = {
        buffers: [bytes.subarray(0, 28), bytes.subarray(28)], startByte: 0,
        endByte: bytes.length, lastValidByte: bytes.length, source: 'nested-odo.fb', recordNumber: 1,
        recordState: createCobolRecordState()
    };
    factory.bind(row, physical, physical);
    expect(row.outers[1].middles[1].inners[1].code()).toBe('ûü'); // CP037 DB/DC
    expect(row.final()).toBe('Z'); // E9 is Z
    factory.clear(row);
});
