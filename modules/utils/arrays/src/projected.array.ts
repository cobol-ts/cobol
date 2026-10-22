/**
 * A readonly array of borrowed elements. Native arrays satisfy this type.
 *
 * The consumer has the familiar ReadonlyArray operations. A projected array may
 * implement them lazily, without materialising its elements beforehand.
 * Methods such as map/slice intentionally materialise their *result*, not the
 * backing projected collection.
 */
export interface ProjectedArray<T> extends ReadonlyArray<T> {}

/** Internal provider: the count is active length, not retained capacity. */
export type ProjectedArraySource<T> = Readonly<{
    length(): number;
    element(index: number): T;
}>;

const numericIndex = (property: PropertyKey): number | undefined => {
    if (typeof property !== "string") return undefined;
    const n = Number(property);
    return Number.isSafeInteger(n) && n >= 0 && String(n) === property ? n : undefined;
};

/**
 * A native-array-backed, readonly view of lazy projected elements.
 * The target array holds no values; cached child projections are owned by the
 * caller's record state. Native Array.prototype methods operate via the proxy.
 */
export function createProjectedArray<T>(source: ProjectedArraySource<T>): ProjectedArray<T> {
    const target: T[] = [];
    const view = new Proxy(target, {
        get(t, property, receiver) {
            if (property === "length") return source.length();
            const index = numericIndex(property);
            if (index !== undefined) return index < source.length() ? source.element(index) : undefined;
            return Reflect.get(t, property, receiver);
        },
        has(t, property) {
            const index = numericIndex(property);
            return index !== undefined ? index < source.length() : Reflect.has(t, property);
        },
        ownKeys() {
            // Preserve the native array's non-configurable 'length' property.
            return [...Array.from({length: source.length()}, (_, i) => String(i)), "length"];
        },
        getOwnPropertyDescriptor(t, property) {
            const index = numericIndex(property);
            if (index !== undefined) return index < source.length()
                ? {value: source.element(index), enumerable: true, configurable: true, writable: false}
                : undefined;
            return Reflect.getOwnPropertyDescriptor(t, property);
        },
        set() {throw new TypeError("ProjectedArray is readonly");},
        defineProperty() {throw new TypeError("ProjectedArray is readonly");},
        deleteProperty() {throw new TypeError("ProjectedArray is readonly");}
    });
    return view;
}
