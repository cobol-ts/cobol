
import {type ErrorsOr, errors, value} from "@cobol-ts/errors";
import {
    type CobolPrimitiveDescription,
    type CobolPrimitiveSizeContext
} from "./cobol.primitive.size";

/**
 * Required storage alignment boundary, in bits.
 *
 * A boundary of 8 means that no additional alignment beyond
 * the normal byte boundary is required.
 */
export type CobolAlignment = number;

export type CobolAlignmentResolver = (
    description: CobolPrimitiveDescription,
    synchronized: boolean,
    context: CobolPrimitiveSizeContext
) => ErrorsOr<CobolAlignment>;

function diagnostic(
    context: CobolPrimitiveSizeContext,
    message: string
): ErrorsOr<never> {
    return errors(
        `Copybook ${context.copybook}, line ${context.line}, ` +
        `${context.path.join(".")}: ${message}`
    );
}

function normaliseUsage(usage: string): string {
    return usage.toUpperCase().trim().replace(/\s+/g, "-")
        .replace(/^COMPUTATIONAL(?=-|$)/, "COMP");
}

/**
 * Count numeric PICTURE digits, including repetition.
 *
 * This is deliberately limited to extracting numeric precision.
 * Full PICTURE validation remains the primitive sizer's responsibility.
 */
function numericDigits(picture: string): number | undefined {
    const source = picture.toUpperCase().replace(/\s/g, "");

    if (!/^S?(?:9(?:\(\d+\))?|V|P(?:\(\d+\))?)+$/.test(source))
        return undefined;

    let digits = 0;
    const parts = source.matchAll(/9(?:\((\d+)\))?/g);

    for (const part of parts) {
        const count = part[1] === undefined ? 1 : Number(part[1]);
        if (!Number.isSafeInteger(count) || count < 1)
            return undefined;

        digits += count;
        if (!Number.isSafeInteger(digits))
            return undefined;
    }

    return digits > 0 ? digits : undefined;
}

function binaryAlignment(
    description: CobolPrimitiveDescription,
    context: CobolPrimitiveSizeContext
): ErrorsOr<CobolAlignment> {
    if (!description.picture)
        return diagnostic(context, "Binary alignment requires a PICTURE");

    const digits = numericDigits(description.picture);
    if (digits === undefined)
        return diagnostic(
            context,
            `Unsupported binary PICTURE '${description.picture}'`
        );

    if (digits <= 4) return value(16);
    if (digits <= 18) return value(32);

    return diagnostic(
        context,
        `Binary PICTURE exceeds 18 digits: '${description.picture}'`
    );
}

/**
 * IBM Enterprise COBOL for z/OS alignment rules.
 *
 * SYNCHRONIZED affects positioning, not the intrinsic size
 * of an elementary field.
 *
 * DISPLAY, packed decimal and national storage are not moved
 * by SYNCHRONIZED.
 *
 * Binary and floating-point fields are aligned on their
 * natural halfword, fullword or doubleword boundaries.
 *
 * The caller handles:
 * - Inherited SYNCHRONIZED from enclosing groups
 * - SYNCHRONIZED LEFT / RIGHT qualifiers
 * - Insertion of padding
 * - Alignment within OCCURS groups
 * - REDEFINES alignment constraints
 */
export const ibmCobolAlignment: CobolAlignmentResolver = (
    description,
    synchronized,
    context
): ErrorsOr<CobolAlignment> => {
    if (!synchronized) return value(8);

    const usage = normaliseUsage(description.usage ?? "DISPLAY");

    switch (usage) {
        case "DISPLAY":
        case "DISPLAY-1":
        case "NATIONAL":
        case "COMP-3":
        case "PACKED-DECIMAL":
            return value(8);

        case "COMP":
        case "COMP-4":
        case "COMP-5":
        case "BINARY":
            return binaryAlignment(description, context);

        case "COMP-1":
            return value(32);

        case "COMP-2":
            return value(64);

        default:
            return diagnostic(context, `Unsupported USAGE '${usage}'`);
    }
};
