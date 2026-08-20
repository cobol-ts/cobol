import {collect, countByKey, FindIdFn, interleave, removeDuplicates} from "./arrays";


describe("interleave", () => {
    it("should interleave arrays", () => {
        const result = interleave([
            [1, 2, 3],
            [4, 5, 6],
            [7, 8, 9],
        ]);
        expect(result).toEqual([1, 4, 7, 2, 5, 8, 3, 6, 9]);
    });
});

describe("removeDuplicates", () => {
    it("should remove duplicates based on findIdFn", () => {
        const data = [
            { id: "1", value: 10 },
            { id: "2", value: 20 },
            { id: "1", value: 10 },
        ];
        const findIdFn: FindIdFn<{ id: string }> = (t) => t.id;
        const uniqueData = removeDuplicates(findIdFn)(data);
        expect(uniqueData).toEqual([
            { id: "1", value: 10 },
            { id: "2", value: 20 },
        ]);
    });
});


describe("countByKey", () => {
    it("should count occurrences of each key value", () => {
        const data = [
            { category: "fruit", name: "apple" },
            { category: "fruit", name: "banana" },
            { category: "vegetable", name: "carrot" },
            { category: "fruit", name: "apple" },
            { category: "vegetable", name: "broccoli" },
        ];

        const result = countByKey(data, "category");
        expect(result).toEqual({
            fruit: 3,
            vegetable: 2,
        });
    });

    it("should handle empty array", () => {
        const data: { category: string }[] = [];
        const result = countByKey(data, "category");
        expect(result).toEqual({});
    });

    it("should handle array with undefined or null key values", () => {
        const data = [
            { category: "fruit", name: "apple" },
            { category: null, name: "banana" },
            { category: "vegetable", name: "carrot" },
            { category: undefined, name: "broccoli" },
        ];

        const result = countByKey(data, "category");
        expect(result).toEqual({
            fruit: 1,
            vegetable: 1,
        });
    });
});

describe("collect", () => {
    it("should collect items that match the guard", () => {
        const data: (number | string)[] = [1, "two", 3, "four"];
        const isNumber = (item: number | string): item is number => typeof item === "number";

        const result = collect(data, isNumber);
        expect(result).toEqual([1, 3]);
    });

    it("should return an empty array if no items match the guard", () => {
        const data: (number | string)[] = ["one", "two", "three"];
        const isNumber = (item: number | string): item is number => typeof item === "number";

        const result = collect(data, isNumber);
        expect(result).toEqual([]);
    });
})