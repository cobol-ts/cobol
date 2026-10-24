/** Exact JRecord-compatible 200-byte, ASCII DISPLAY fixtures (10 repeating records). */
export const RECORD_BYTES = 200;
export const PATTERN_COUNT = 10;
const REGIONS = 'NSEWNSENWN';

export type Flags = Readonly<{
    status: string;
    region: string;
    category: string;
    approved: string;
}>;
export type Counters = {
    records: number;
    totalSum: number;
    activeNorthCount: number;
    activeNorthSum: number;
    approvedPremiumCount: number;
    approvedPremiumSum: number;
};
export const COUNTER_NAMES: readonly (keyof Counters)[] = [
    'records','totalSum','activeNorthCount','activeNorthSum',
    'approvedPremiumCount','approvedPremiumSum'
];

export function checkedNonNegativeInteger(value: number, label: string): number {
    if (!Number.isSafeInteger(value) || value < 0)
        throw new RangeError(`${label} must be a nonnegative safe integer`);
    return value;
}

export function amountA(index: number): number { return 100_000 + index * 12_345; }
export function amountB(index: number): number { return 20_000 + index * 2_345; }
export function flags(index: number): Flags {
    return {
        status: index % 3 === 0 ? 'I' : 'A',
        region: REGIONS[index],
        category: index === 1 || index === 2 || index === 4 || index === 7 || index === 9 ? 'P' : 'R',
        approved: index % 2 === 0 || index === 7 ? 'Y' : 'N'
    };
}
function zeroPad(value: number, length: number): string {
    const text = String(value);
    if (text.length > length) throw new RangeError(`Value ${text} exceeds ${length} bytes`);
    return text.padStart(length, '0');
}
function spacePad(value: string, length: number): string {
    if (value.length > length) throw new RangeError(`Value ${value} exceeds ${length} bytes`);
    return value.padEnd(length, ' ');
}
export function makeRecord(index: number): Buffer {
    if (!Number.isInteger(index) || index < 0 || index >= PATTERN_COUNT)
        throw new RangeError('Pattern index must be an integer from 0 to 9');
    const {status,region,category,approved} = flags(index);
    const bytes = Buffer.from([
        zeroPad(index, 10), spacePad(`ACCT${zeroPad(index, 4)}`, 8),
        zeroPad(amountA(index), 9), zeroPad(amountB(index), 9),
        status, region, category, approved,
        zeroPad(50_000 + index * 7_111, 10),
        spacePad(`CUSTOMER-${zeroPad(index, 2)}`, 30),
        spacePad(`BENCHMARK FIXTURE PATTERN ${zeroPad(index, 2)}`, 50),
        spacePad(`REF-${zeroPad(index, 2)}-STATIC`, 30),
        ' '.repeat(40)
    ].join(''), 'ascii');
    if (bytes.length !== RECORD_BYTES) throw new Error(`Expected ${RECORD_BYTES} bytes; got ${bytes.length}`);
    return bytes;
}
export const CYCLE: Buffer = Buffer.concat(Array.from({length:PATTERN_COUNT}, (_unused,index) => makeRecord(index)));

export function emptyCounters(): Counters {
    return {records:0,totalSum:0,activeNorthCount:0,activeNorthSum:0,
        approvedPremiumCount:0,approvedPremiumSum:0};
}
/** Sum by repeated ten-record cycles, including a partial final cycle. */
export function expectedCounters(records: number): Counters {
    checkedNonNegativeInteger(records,'records');
    const result = emptyCounters();
    result.records = records;
    const cycles = Math.floor(records / PATTERN_COUNT);
    const remainder = records % PATTERN_COUNT;
    for (let index = 0; index < PATTERN_COUNT; index++) {
        const occurrences = cycles + (index < remainder ? 1 : 0);
        const sum = amountA(index) + amountB(index);
        const {status, region, category, approved} = flags(index);
        result.totalSum += occurrences * sum;
        if (status === 'A' && region === 'N') {
            result.activeNorthCount += occurrences;
            result.activeNorthSum += occurrences * sum;
        }
        if (category === 'P' && approved === 'Y') {
            result.approvedPremiumCount += occurrences;
            result.approvedPremiumSum += occurrences * sum;
        }
    }
    for (const name of COUNTER_NAMES) checkedNonNegativeInteger(result[name],name);
    return result;
}
