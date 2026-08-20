export function mapRecord<T extends Record<string, any>, U>(
    record: T,
    mapper: (value: T[keyof T], key: keyof T, index: number) => U
): { [K in keyof T]: U } {
    const result: Partial<{ [K in keyof T]: U }> = {};
    let index=0
    for (const key in record) {
        if (record.hasOwnProperty(key)) {
            result[key] = mapper(record[key], key, index++);
        }
    }
    return result as { [K in keyof T]: U };
}