import {type CanonicalProjection, type ProjectionAuthoring, type ProjectionNodeAuthoring} from "@cobol-ts/cursor-loader-types";

/** Configuration-time, recursive canonicalisation; nested paths remain relative. */
export function canonicalProjection<T extends ProjectionAuthoring>(
    projection: T
): CanonicalProjection<T> {
    const result: Record<string, unknown> = {};
    for (const [name, field] of Object.entries(projection)) {
        const path = field.path ?? [name];
        if (field.type === "array") {
            result[name] = {type:"array",path,element:canonicalProjection(field.element)};
        } else if (field.type === "object") {
            result[name] = {type:"object",path,fields:canonicalProjection(field.fields)};
        } else {
            result[name] = {type:field.type,path};
        }
    }
    return result as CanonicalProjection<T>;
}
