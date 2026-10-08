import {
    type CanonicalProjection,
    type ProjectionAuthoring,
    type ProjectionField
} from "@cobol-ts/cursor-loader-types";
/**
 * Convert the ergonomic authoring form into the canonical runtime form.
 *
 * This is configuration-time work, not record-processing work.
 */
export function canonicalProjection<
    TProjection extends ProjectionAuthoring
>(
    projection:
    TProjection
): CanonicalProjection<
    TProjection
> {

    const canonical =
        {} as {
            -readonly [
            K in keyof CanonicalProjection<
                TProjection
            >
            ]:
            CanonicalProjection<
                TProjection
            >[K];
        };


    for (
        const name
        in projection
        ) {
        const field =
            projection[
                name
                ];


        canonical[
            name
            ] = {
            type:
            field.type,

            path:
                field.path
                ?? [
                    name
                ]
        };
    }


    return canonical;
}