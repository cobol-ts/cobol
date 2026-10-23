import {appendArrayWithSize, createArrayWithSize, resetArrayWithSize} from "./array.with.size";

describe("ArrayWithSize", () => {
    test("starts with no valid entries", () => {
        const values = createArrayWithSize<number>();
        expect(values.size).toBe(0);
        expect(values.values).toEqual([]);
    });

    test("appends a contiguous valid prefix", () => {
        const values = createArrayWithSize<number>();
        appendArrayWithSize(values, 3);
        appendArrayWithSize(values, 8);
        expect(values.size).toBe(2);
        expect(values.values.slice(0, values.size)).toEqual([3, 8]);
    });

    test("reset invalidates values without discarding allocated slots", () => {
        const values = createArrayWithSize<object>();
        const first = {id: 1};
        const second = {id: 2};
        appendArrayWithSize(values, first);
        appendArrayWithSize(values, second);
        const backing = values.values;

        resetArrayWithSize(values);

        expect(values.size).toBe(0);
        expect(values.values).toBe(backing);
        expect(values.values.length).toBe(2);
        appendArrayWithSize(values, {id: 3});
        expect(values.size).toBe(1);
        expect(values.values[0]).toEqual({id: 3});
        expect(values.values[1]).toBe(second); // retained but outside the valid prefix
    });

    test("supports nested jagged caches without eager inner arrays", () => {
        const outer = createArrayWithSize<ReturnType<typeof createArrayWithSize<number>>>();
        const inner = createArrayWithSize<number>();
        appendArrayWithSize(inner, 16);
        appendArrayWithSize(outer, inner);
        expect(outer.values[0]).toBe(inner);
        expect(outer.size).toBe(1);
        expect(inner.size).toBe(1);
    });
});
