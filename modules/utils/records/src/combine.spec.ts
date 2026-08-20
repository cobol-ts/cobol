import {deepCombineObjects, DeepCombineOptions, deepCombineTwoObject} from "./combine";

describe("deepCombineTwoObject", () => {
  test("merges flat objects (t2 wins where defined)", () => {
    const obj1 = { a: 1, b: 2 };
    const obj2 = { b: 3, c: 4 };
    expect(deepCombineTwoObject(obj1, obj2)).toEqual({ a: 1, b: 3, c: 4 });
  });

  test("deep merges nested objects", () => {
    const obj1 = { a: { x: 1, y: 2 }, b: 2 };
    const obj2 = { a: { y: 3, z: 4 } };
    expect(deepCombineTwoObject(obj1, obj2)).toEqual({ a: { x: 1, y: 3, z: 4 }, b: 2 });
  });

  test("t2 primitive overwrites t1 object/primitive (t2 wins)", () => {
    expect(deepCombineTwoObject({ a: { x: 1 } }, { a: 5 })).toEqual({ a: 5 });
    expect(deepCombineTwoObject({ a: 1 }, { a: { x: 2 } })).toEqual({ a: { x: 2 } });
  });

  test("t2 undefined is treated as missing at property level (does not overwrite)", () => {
    const obj1 = { a: 1, b: 2 };
    const obj2 = { a: undefined, b: 3 };
    expect(deepCombineTwoObject(obj1, obj2)).toEqual({ a: 1, b: 3 });
  });

  test("default null behavior: nulls are missing at property level (do not overwrite / do not add)", () => {
    const obj1 = { a: 1, b: 2 };
    const obj2 = { a: null, c: null };

    // default: nulls === "missing" => a stays 1, c not added
    expect(deepCombineTwoObject(obj1, obj2)).toEqual({ a: 1, b: 2 });
  });

  test('null overwrites and can be added when nulls="overwrite"', () => {
    const obj1 = { a: 1, b: 2 };
    const obj2 = { a: null, c: null };

    expect(deepCombineTwoObject(obj1, obj2, { nulls: "overwrite" })).toEqual({ a: null, b: 2, c: null });
  });

  test("default array behavior: concatenates arrays (root-level)", () => {
    const obj1 = [1, 2];
    const obj2 = [3, 4];
    expect(deepCombineTwoObject(obj1, obj2)).toEqual([1, 2, 3, 4]);
  });

  test("array behavior when concatenateArrays=false: replaces arrays (root-level)", () => {
    const obj1 = [1, 2];
    const obj2 = [3, 4];
    expect(deepCombineTwoObject(obj1, obj2, { concatenateArrays: false })).toEqual([3, 4]);
  });

  test("default array behavior: concatenates arrays (property-level)", () => {
    const obj1 = { a: [1, 2], b: 1 };
    const obj2 = { a: [3], b: 2 };
    expect(deepCombineTwoObject(obj1, obj2)).toEqual({ a: [1, 2, 3], b: 2 });
  });

  test("array behavior when concatenateArrays=false: replaces arrays (property-level)", () => {
    const obj1 = { a: [1, 2], b: 1 };
    const obj2 = { a: [3], b: 2 };
    expect(deepCombineTwoObject(obj1, obj2, { concatenateArrays: false })).toEqual({ a: [3], b: 2 });
  });

  test("if either side is an array and the other is not, t2 wins", () => {
    expect(deepCombineTwoObject({ a: [1, 2] }, { a: 5 })).toEqual({ a: 5 });
    expect(deepCombineTwoObject({ a: 5 }, { a: [1, 2] })).toEqual({ a: [1, 2] });
  });

  test("forbidden keys are ignored (prototype pollution protection)", () => {
    const obj1: any = { safe: 1 };
    const obj2: any = {
      safe: 2,
      __proto__: { polluted: "yes" },
      constructor: { polluted2: "yes" },
      prototype: { polluted3: "yes" },
    };

    const result = deepCombineTwoObject(obj1, obj2);

    expect(result).toEqual({ safe: 2 });
    expect(({} as any).polluted).toBeUndefined();
    expect(({} as any).polluted2).toBeUndefined();
    expect(({} as any).polluted3).toBeUndefined();
  });

  test("deepCombineObjects reduces left-to-right using deepCombineTwoObject defaults", () => {
    const a = { x: 1, arr: [1] };
    const b = { y: 2, arr: [2] };
    const c = { z: 3, arr: [3] };

    expect(deepCombineObjects(a, b, c)).toEqual({ x: 1, y: 2, z: 3, arr: [1, 2, 3] });
  });

  /* -------------------- Explicit ROOT null semantics tests -------------------- */

  test("ROOT: when t2 is null, default nulls='missing' returns t1", () => {
    const t1 = { a: 1 };
    const t2 = null;

    // Explicitly tests the root early-return behavior.
    expect(deepCombineTwoObject(t1, t2)).toEqual({ a: 1 });
  });

  test("ROOT: when t1 is null, default nulls='missing' returns t2", () => {
    const t1 = null;
    const t2 = { a: 1 };

    expect(deepCombineTwoObject(t1, t2)).toEqual({ a: 1 });
  });

  test("ROOT: both null => default nulls='missing' returns null", () => {
    expect(deepCombineTwoObject(null, null)).toBeNull();
  });

  test('ROOT: when t2 is null and nulls="overwrite", result is null (t2 wins)', () => {
    const t1 = { a: 1 };
    const t2 = null;

    // Under overwrite semantics, root-level null should NOT be treated as missing.
    expect(deepCombineTwoObject(t1, t2, { nulls: "overwrite" })).toBeNull();
  });

  test('ROOT: when t1 is null and nulls="overwrite", result is t2 (t2 wins)', () => {
    const t1 = null;
    const t2 = { a: 1 };

    // Still t2, because t1 is null and we're merging into t2.
    expect(deepCombineTwoObject(t1, t2, { nulls: "overwrite" })).toEqual({ a: 1 });
  });

  test('ROOT: both null and nulls="overwrite" => still null', () => {
    expect(deepCombineTwoObject(null, null, { nulls: "overwrite" })).toBeNull();
  });

  /* -------------------- Nested null semantics tests -------------------- */

  test("NESTED: default nulls='missing' does not overwrite nested objects with null", () => {
    const obj1 = { user: { profile: { region: "UK", flags: ["a"] } } };
    const obj2 = { user: { profile: null } };

    expect(deepCombineTwoObject(obj1, obj2)).toEqual({
      user: { profile: { region: "UK", flags: ["a"] } },
    });
  });

  test('NESTED: nulls="overwrite" overwrites nested objects with null', () => {
    const obj1 = { user: { profile: { region: "UK", flags: ["a"] } } };
    const obj2 = { user: { profile: null } };

    expect(deepCombineTwoObject(obj1, obj2, { nulls: "overwrite" })).toEqual({
      user: { profile: null },
    });
  });

  /* -------------------- Options are forwarded recursively -------------------- */

  test("options propagate recursively (concatenateArrays=false)", () => {
    const obj1 = { a: { arr: [1, 2] } };
    const obj2 = { a: { arr: [3] } };

    const options: DeepCombineOptions = { concatenateArrays: false };
    expect(deepCombineTwoObject(obj1, obj2, options)).toEqual({ a: { arr: [3] } });
  });

  test('options propagate recursively (nulls="overwrite")', () => {
    const obj1 = { a: { x: 1 } };
    const obj2 = { a: { x: null } };

    expect(deepCombineTwoObject(obj1, obj2, { nulls: "overwrite" })).toEqual({ a: { x: null } });
  });
});
