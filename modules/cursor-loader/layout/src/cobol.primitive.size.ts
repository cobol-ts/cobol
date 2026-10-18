
import {type SignClause} from "@cobol-ts/copybook";
import {type StorageSizeExpression} from "@cobol-ts/size";
import {type ErrorsOr, errors, value} from "@cobol-ts/errors";

export type CobolPrimitiveDescription = {
    readonly picture?: string;
    readonly usage?: string;
    readonly sign?: SignClause;
};

export type CobolPrimitiveSizeContext = {
    readonly copybook: string;
    readonly line: number;
    readonly path: readonly string[];
};

export type CobolPrimitiveSizer = (
    description: CobolPrimitiveDescription,
    context: CobolPrimitiveSizeContext
) => ErrorsOr<StorageSizeExpression>;

type PictureCategory = "numeric" | "alphanumeric" | "national" | "edited";
type PictureInfo = {
    readonly category: PictureCategory;
    readonly digits: number;
    readonly positions: number;
    readonly signed: boolean;
};

type PrimitiveSizeHandler = CobolPrimitiveSizer;

function diagnostic(
    context: CobolPrimitiveSizeContext,
    message: string
): ErrorsOr<never> {
    return errors(`Copybook ${context.copybook}, line ${context.line}, ${context.path.join(".")}: ${message}`);
}

function normaliseUsage(usage: string): string {
    return usage.toUpperCase().trim().replace(/\s+/g, "-")
        .replace(/^COMPUTATIONAL(?=-|$)/, "COMP");
}

function parsePicture(source: string): PictureInfo | undefined {
    const picture = source.toUpperCase().replace(/\s/g, "");
    let index = 0, digits = 0, positions = 0;
    let signed = false, decimal = false;
    let hasNumeric = false, hasEdited = false;
    let hasAlphanumeric = false, hasNational = false;

    while (index < picture.length) {
        const symbol = picture[index++];
        if (!"XAN9SVPZ.".includes(symbol)) return undefined;

        let count = 1;
        if (picture[index] === "(") {
            const match = /^\((\d+)\)/.exec(picture.slice(index));
            if (!match) return undefined;
            count = Number(match[1]);
            if (!Number.isSafeInteger(count) || count < 1) return undefined;
            index += match[0].length;
        }

        if (symbol === "S") {
            if (index - 1 !== 0 || count !== 1 || signed) return undefined;
            signed = true;
            continue;
        }
        if (symbol === "V") {
            if (decimal || count !== 1) return undefined;
            decimal = true;
            continue;
        }
        if (symbol === "P") continue;

        if (symbol === "X" || symbol === "A") hasAlphanumeric = true;
        if (symbol === "N") hasNational = true;
        if (symbol === "9") {
            hasNumeric = true;
            digits += count;
        }
        if (symbol === "Z" || symbol === ".") hasEdited = true;

        positions += count;
        if (!Number.isSafeInteger(digits) || !Number.isSafeInteger(positions))
            return undefined;
    }

    if (hasNational && (hasAlphanumeric || hasNumeric || hasEdited)) return undefined;
    if (hasAlphanumeric && (hasNational || hasNumeric || hasEdited)) return undefined;
    if (!positions) return undefined;

    const category: PictureCategory = hasNational ? "national"
        : hasAlphanumeric ? "alphanumeric"
            : hasEdited ? "edited" : "numeric";

    if (signed && category !== "numeric") return undefined;
    if (decimal && category !== "numeric") return undefined;
    if (category === "numeric" && !digits) return undefined;

    return {category, digits, positions, signed};
}

function pictureOrError(
    description: CobolPrimitiveDescription,
    context: CobolPrimitiveSizeContext
): ErrorsOr<PictureInfo> {
    if (!description.picture) return diagnostic(context, "Missing PICTURE clause");
    const picture = parsePicture(description.picture);
    return picture ? value(picture)
        : diagnostic(context, `Unsupported PICTURE '${description.picture}'`);
}

function displaySize(
    description: CobolPrimitiveDescription,
    context: CobolPrimitiveSizeContext
): ErrorsOr<StorageSizeExpression> {
    const result = pictureOrError(description, context);
    if ("errors" in result) return result;
    const picture = result.value;

    if (picture.category === "national")
        return diagnostic(context, "National picture requires NATIONAL or DISPLAY-1");
    if (description.sign && (picture.category !== "numeric" || !picture.signed))
        return diagnostic(context, "SIGN clause requires a signed numeric picture");

    const separate = description.sign?.separate === true;
    return value((picture.positions + (separate ? 1 : 0)) * 8);
}

function packedDecimalSize(
    description: CobolPrimitiveDescription,
    context: CobolPrimitiveSizeContext
): ErrorsOr<StorageSizeExpression> {
    if (description.sign)
        return diagnostic(context, "Packed decimal does not support a SIGN clause");

    const result = pictureOrError(description, context);
    if ("errors" in result) return result;
    if (result.value.category !== "numeric")
        return diagnostic(context, "Packed decimal requires an unedited numeric picture");

    return value(Math.ceil((result.value.digits + 1) / 2) * 8);
}

function binarySize(
    description: CobolPrimitiveDescription,
    context: CobolPrimitiveSizeContext
): ErrorsOr<StorageSizeExpression> {
    if (description.sign)
        return diagnostic(context, "Binary storage does not support a SIGN clause");

    const result = pictureOrError(description, context);
    if ("errors" in result) return result;
    if (result.value.category !== "numeric")
        return diagnostic(context, "Binary storage requires an unedited numeric picture");

    const digits = result.value.digits;
    if (digits <= 4) return value(16);
    if (digits <= 9) return value(32);
    if (digits <= 18) return value(64);
    return diagnostic(context, `Binary PICTURE exceeds 18 digits: '${description.picture}'`);
}

function floatingSize(bits: number): PrimitiveSizeHandler {
    return (description, context) => {
        if (description.picture)
            return diagnostic(context, "Floating-point storage must not have PICTURE");
        if (description.sign)
            return diagnostic(context, "Floating-point storage must not have SIGN");
        return value(bits);
    };
}

function nationalSize(
    description: CobolPrimitiveDescription,
    context: CobolPrimitiveSizeContext
): ErrorsOr<StorageSizeExpression> {
    if (description.sign)
        return diagnostic(context, "National storage does not support SIGN");

    const result = pictureOrError(description, context);
    if ("errors" in result) return result;
    if (result.value.category !== "national")
        return diagnostic(context, "National storage requires a national picture");

    return value(result.value.positions * 16);
}

const primitiveSizeHandlers = {
    DISPLAY: displaySize,
    COMP: binarySize,
    "COMP-4": binarySize,
    "COMP-5": binarySize,
    BINARY: binarySize,
    "COMP-3": packedDecimalSize,
    "PACKED-DECIMAL": packedDecimalSize,
    "COMP-1": floatingSize(32),
    "COMP-2": floatingSize(64),
    NATIONAL: nationalSize,
    "DISPLAY-1": nationalSize
} satisfies Record<string, PrimitiveSizeHandler>;

export function defaultCobolPrimitiveSizer(
    description: CobolPrimitiveDescription,
    context: CobolPrimitiveSizeContext
): ErrorsOr<StorageSizeExpression> {
    const usage = normaliseUsage(description.usage ?? "DISPLAY");
    const handler = Object.hasOwn(primitiveSizeHandlers, usage)
        ? primitiveSizeHandlers[usage as keyof typeof primitiveSizeHandlers]
        : undefined;

    return handler
        ? handler(description, context)
        : diagnostic(context, `Unsupported USAGE '${usage}'`);
}
