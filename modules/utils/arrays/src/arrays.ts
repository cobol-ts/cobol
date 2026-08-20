export type FindIdFn<T> = (t: T) => string;

export function interleave<T>(arrays: T[][]): T[] {
    const result: T[] = [];
    const maxLength = Math.max(...arrays.map((a) => a.length));
    for (let i = 0; i < maxLength; i++) {
        for (const a of arrays) {
            if (i < a.length) {
                result.push(a[i]);
            }
        }
    }
    return result;
}

export function removeDuplicates<T>(findIdFn: FindIdFn<T>) {
    return (rawResult: T[]) => {
        const result: T[] = [];
        const ids = new Set<string>();
        for (const t of rawResult) {
            const id = findIdFn(t);
            if (!ids.has(id)) {
                result.push(t);
                ids.add(id);
            }
        }
        return result;
    };
}

export function countByKey<T>(array: T[], key: keyof T): { [key: string]: number } {
    return array.reduce((acc: { [key: string]: number }, item: T) => {
        const keyValue = item[key];
        if (keyValue !== undefined && keyValue !== null) {
            const keyString = String(keyValue);
            acc[keyString] = (acc[keyString] || 0) + 1;
        }
        return acc;
    }, {});
}

export function collect<T, Child extends T>(ts: T[], guard: (ta: T) => ta is Child): Child[] {
    return ts.filter(guard);
}

export function toArray<T>(ts: T | T[] | undefined): T[] {
    if (ts === undefined) return [];
    return Array.isArray(ts) ? ts : [ts];
}

export function chunkArray<T>(items: T[], chunkSize: number): T[][] {
    const result: T[][] = [];
    for (let i = 0; i < items.length; i += chunkSize) {
        result.push(items.slice(i, i + chunkSize));
    }
    return result;
}

export function chunkAndMapArrays<T, T1>(chunkSize: number, processFn: (chunk: T[]) => Promise<T1[]>): ((ts: T[]) => Promise<T1[]>) {
    return async ts => {
        const result: T1[] = [];
        const chunks = chunkArray(ts, chunkSize);
        for (const chunk of chunks) {
            const processedChunk = await processFn(chunk);
            result.push(...processedChunk);
        }
        return result
    }
}
