import { invertObject } from "./record.utils";

describe("invertObject", () => {
    it("should invert an object with string values", () => {
        const input = { a: "1", b: "2" };
        const expectedOutput = { "1": "a", "2": "b" };
        expect(invertObject(input)).toEqual(expectedOutput);
    });

    it("should invert an object with array values", () => {
        const input = { a: ["1", "2"], b: ["3"] };
        const expectedOutput = { "1": "a", "2": "a", "3": "b" };
        expect(invertObject(input)).toEqual(expectedOutput);
    });
})