import {createProjectedArray, type ProjectedArray} from "./projected.array";

test("native arrays satisfy the projected array interface", () => {
    const native: ProjectedArray<number> = [10, 20];
    expect(native[1]).toBe(20);
    expect([...native]).toEqual([10, 20]);
});

test("logical length is separate from cached element capacity", () => {
    const allocated = ["a", "b", "c", "d"];
    let active = 2;
    const view = createProjectedArray({length: () => active, element: i => allocated[i]});
    expect(view.length).toBe(2);
    expect([...view]).toEqual(["a", "b"]);
    expect(view.map(x=>x.toUpperCase())).toEqual(["A", "B"]);
    expect(view.slice(1)).toEqual(["b"]);
    expect(Object.keys(view)).toEqual(["0", "1"]);
    active = 1;
    expect(view[3]).toBeUndefined();
    expect([...view]).toEqual(["a"]);
    active = 4;
    expect(view[3]).toBe("d");
});
