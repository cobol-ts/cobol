import { firstSegment } from "@cobol-ts/string_utils";

/**
 * Safely look up a nested value in an object by a dot-delimited path.
 * If any step is `null`/`undefined` or the key isn’t present, returns `undefined`.
 * Each segment ignores everything after the first “:”.
 *
 * @param dic   The object (or array) to traverse.
 * @param ref   A dot-delimited path, e.g. `"foo.bar:baz.qux"`.
 *              If `null`/`undefined` → `undefined`.
 *              If `""` → returns `dic` itself.
 */
export function findPart(dic: any, ref: string | null | undefined): any {
  if (ref == null) return undefined;
  if (ref === "") return dic;

  // split & ignore any accidental empty segments
  const parts = ref.split(".").filter(p => p.length > 0);

  // walk step by step, bail out early if acc is nullish
  let acc: any = dic;
  for (const part of parts) {
    if (acc == null) return undefined;
    const key = firstSegment(part, ":");
    if (key == null) return undefined;
    acc = acc[key];
  }
  return acc;
}
