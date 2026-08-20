export type DeepCombineOptions = {
  /**
   * If true, when both sides are arrays we concatenate (t1.concat(t2)).
   * If false, arrays are replaced (t2 wins).
   */
  concatenateArrays?: boolean;

  /**
   * Controls how null is treated.
   * - "missing": null behaves like undefined (does not overwrite)
   * - "overwrite": null is an explicit value and overwrites
   */
  nulls?: "missing" | "overwrite";
};

const defaultDeepCombineOptions: Required<DeepCombineOptions> = {
  concatenateArrays: true,
  nulls: "missing",
};

export function deepCombineObjects(...objects: any[]): any {
  return objects.reduce((acc, obj) => deepCombineTwoObject(acc, obj), {});
}

export function deepCombineTwoObject(t1: any, t2: any, options?: DeepCombineOptions): any {
  const opt: Required<DeepCombineOptions> = { ...defaultDeepCombineOptions, ...(options ?? {}) };

  // Root-level missing handling
  if (t1 === undefined) return t2;
  if (t2 === undefined) return t1;

  if (opt.nulls === "missing") {
    if (t1 === null) return t2;
    if (t2 === null) return t1;
  }
  // If nulls overwrite, we intentionally *do not* early return on null here.
  // We let the rules below decide (and for primitives, "t2 wins").

  // Root-level arrays
  if (Array.isArray(t1) && Array.isArray(t2)) {
    return opt.concatenateArrays ? t1.concat(t2) : t2;
  }
  // If either side is an array, "t2 wins"
  if (Array.isArray(t1) || Array.isArray(t2)) return t2;

  // Non-objects: "t2 wins"
  if (typeof t1 !== "object" || t1 === null) return t2;
  if (typeof t2 !== "object" || t2 === null) return t2;

  // SECURITY: build result without spreading t1, and filter forbidden keys from BOTH sides.
  const result: any = {};
  for (const [k, v] of Object.entries(t1)) {
    if (isForbiddenKey(k)) continue;
    result[k] = v;
  }

  for (const [k, v] of Object.entries(t2)) {
    if (isForbiddenKey(k)) continue;

    // Treat undefined as "missing" at property level, do not overwrite
    if (v === undefined) continue;

    // Make null semantics consistent at property level
    if (v === null && opt.nulls === "missing") continue;

    const left = (t1 as any)[k];

    if (left === undefined) {
      result[k] = v;
      continue;
    }

    // Property arrays
    if (Array.isArray(left) && Array.isArray(v)) {
      result[k] = opt.concatenateArrays ? left.concat(v) : v;
      continue;
    }
    if (Array.isArray(left) || Array.isArray(v)) {
      result[k] = v; // "t2 wins"
      continue;
    }

    // Deep merge only for non-null objects on both sides
    if (
        typeof v === "object" && v !== null &&
        typeof left === "object" && left !== null
    ) {
      result[k] = deepCombineTwoObject(left, v, opt);
      continue;
    }

    result[k] = v;
  }

  return result;
}

function isForbiddenKey(key: string): boolean {
  const forbiddenKeys = ["__proto__", "constructor", "prototype"];
  return forbiddenKeys.includes(key);
}
