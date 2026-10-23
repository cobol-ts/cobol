/**
 * Reusable storage with a contiguous valid prefix.
 *
 * Only values[0..size) are valid. The backing array may retain more elements
 * across resets so high-water storage is reused without reallocating it.
 * Unlike a projected array, this is not a logical collection with sparse slots.
 */
export type ArrayWithSize<T> = {
    readonly values: T[];
    size: number;
};

export function createArrayWithSize<T>(): ArrayWithSize<T> {
    return {values: [], size: 0};
}

/** Discard the valid prefix, but retain its backing storage. */
export function resetArrayWithSize<T>(array: ArrayWithSize<T>): void {
    array.size = 0;
}

/** Append to the valid prefix, overwriting a previously retained slot if any. */
export function appendArrayWithSize<T>(array: ArrayWithSize<T>, value: T): void {
    array.values[array.size++] = value;
}
