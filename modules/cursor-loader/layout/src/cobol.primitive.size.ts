import {type SignClause} from "@cobol-ts/copybook";
import {type StorageSizeExpression} from "@cobol-ts/size";
import {type ErrorsOr, errors, value} from "@cobol-ts/errors";
import {parseCobolPicture, type CobolPicture, type CobolPictureOptions} from "./cobol.picture";

export type CobolPrimitiveDescription = {
    readonly picture?: string;
    readonly usage?: string;
    readonly sign?: SignClause;
    readonly byteLength?: number;
    readonly dynamicLength?: Readonly<{limit?: number}>;
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

export type IbmCobolPrimitiveSizingOptions = CobolPictureOptions & Readonly<{
    /** IBM NSYMBOL(NATIONAL) is the default; NSYMBOL(DBCS) changes PIC N. */
    nSymbol?: "national" | "dbcs";
}>;

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

function pictureOrError(
    description: CobolPrimitiveDescription,
    context: CobolPrimitiveSizeContext,
    options: IbmCobolPrimitiveSizingOptions
): ErrorsOr<CobolPicture> {
    if (!description.picture) return diagnostic(context, "Missing PICTURE clause");
    const picture = parseCobolPicture(description.picture, options);
    return picture ? value(picture)
        : diagnostic(context, `Unsupported PICTURE '${description.picture}'`);
}

function displaySize(options: IbmCobolPrimitiveSizingOptions): PrimitiveSizeHandler {
    return (description: CobolPrimitiveDescription, context: CobolPrimitiveSizeContext): ErrorsOr<StorageSizeExpression> => {
        const result = pictureOrError(description, context, options);
        if ("errors" in result) return result;
        const picture = result.value;

        if (["national", "national-edited", "dbcs", "utf8"].includes(picture.category))
            return diagnostic(context, `PICTURE ${picture.category} requires a different USAGE`);
        if (description.sign && picture.category !== "external-floating" &&
            (picture.category !== "numeric" || !picture.signed))
            return diagnostic(context, "SIGN clause requires a signed numeric picture");

        const separate = picture.category === "numeric" && description.sign?.separate === true;
        // Configured currency symbols are DISPLAY-only editing symbols.
        return value((picture.positions + (separate ? 1 : 0)) * 8);
    }
};

function packedDecimalSize(options: IbmCobolPrimitiveSizingOptions): PrimitiveSizeHandler {
    return (description: CobolPrimitiveDescription, context: CobolPrimitiveSizeContext): ErrorsOr<StorageSizeExpression> => {
        if (description.sign)
            return diagnostic(context, "Packed decimal does not support a SIGN clause");
        const result = pictureOrError(description, context, options);
        if ("errors" in result) return result;
        if (result.value.category !== "numeric")
            return diagnostic(context, "Packed decimal requires an unedited numeric picture");
        return value(Math.ceil((result.value.digits + 1) / 2) * 8);
    }
};

function binarySize(options: IbmCobolPrimitiveSizingOptions): PrimitiveSizeHandler {
    return (description: CobolPrimitiveDescription, context: CobolPrimitiveSizeContext): ErrorsOr<StorageSizeExpression> => {
        if (description.sign)
            return diagnostic(context, "Binary storage does not support a SIGN clause");
        const result = pictureOrError(description, context, options);
        if ("errors" in result) return result;
        if (result.value.category !== "numeric")
            return diagnostic(context, "Binary storage requires an unedited numeric picture");
        const digits = result.value.digits;
        if (digits <= 4) return value(16);
        if (digits <= 9) return value(32);
        if (digits <= 18) return value(64);
        return diagnostic(context, `Binary PICTURE exceeds 18 digits: '${description.picture}'`);
    }
};

function floatingSize(bits: number): PrimitiveSizeHandler {
    return (description, context) => {
        if (description.picture)
            return diagnostic(context, "Floating-point storage must not have PICTURE");
        if (description.sign)
            return diagnostic(context, "Floating-point storage must not have SIGN");
        return value(bits);
    };
}

function nationalSize(options: IbmCobolPrimitiveSizingOptions): PrimitiveSizeHandler {
    return (description: CobolPrimitiveDescription, context: CobolPrimitiveSizeContext): ErrorsOr<StorageSizeExpression> => {
        const result = pictureOrError(description, context, options);
        if ("errors" in result) return result;
        const picture = result.value;
        if (!["national", "national-edited", "numeric", "numeric-edited", "external-floating"].includes(picture.category))
            return diagnostic(context, "National storage requires a national or numeric picture");
        if (description.sign && picture.category !== "numeric" && picture.category !== "external-floating")
            return diagnostic(context, "SIGN clause requires a signed numeric picture");
        if (picture.signed && (description.sign?.separate !== true))
            return diagnostic(context, "Signed NATIONAL numeric storage requires SIGN SEPARATE");
        const separate = picture.category === "numeric" && description.sign?.separate === true;
        return value((picture.positions + (separate ? 1 : 0)) * 16);
    }
};

function dbcsSize(options: IbmCobolPrimitiveSizingOptions): PrimitiveSizeHandler {
    return (description: CobolPrimitiveDescription, context: CobolPrimitiveSizeContext): ErrorsOr<StorageSizeExpression> => {
        const result = pictureOrError(description, context, options);
        if ("errors" in result) return result;
        if (result.value.category !== "dbcs" && result.value.category !== "national")
            return diagnostic(context, "DISPLAY-1 requires a DBCS picture");
        if (description.sign) return diagnostic(context, "DISPLAY-1 does not support SIGN");
        return value(result.value.positions * 16);
    }
};

function utf8Size(options: IbmCobolPrimitiveSizingOptions): PrimitiveSizeHandler {
    return (description: CobolPrimitiveDescription, context: CobolPrimitiveSizeContext): ErrorsOr<StorageSizeExpression> => {
        const result = pictureOrError(description, context, options);
        if ("errors" in result) return result;
        if (result.value.category !== "utf8" || description.sign)
            return diagnostic(context, "UTF-8 storage requires an unedited U picture");
        // IBM: fixed byte-length PIC U reserves exactly n bytes; the usual
        // fixed character-length PIC U(n) reserves four bytes per code point.
        return value(description.byteLength === undefined
            ? result.value.positions * 32
            : description.byteLength * 8);
    }
};

const primitiveSizeHandlers = (options: IbmCobolPrimitiveSizingOptions) => ({
    DISPLAY: displaySize(options),
    COMP: binarySize(options),
    "COMP-4": binarySize(options),
    "COMP-5": binarySize(options),
    BINARY: binarySize(options),
    "COMP-3": packedDecimalSize(options),
    "PACKED-DECIMAL": packedDecimalSize(options),
    "COMP-1": floatingSize(32),
    "COMP-2": floatingSize(64),
    NATIONAL: nationalSize(options),
    "DISPLAY-1": dbcsSize(options),
    "UTF-8": utf8Size(options)
} satisfies Record<string, PrimitiveSizeHandler>);

/** Stable, configured sizer used for an opened source and its compiler options. */
export function ibmCobolPrimitiveSizer(options: IbmCobolPrimitiveSizingOptions = {}): CobolPrimitiveSizer {
    const handlers = primitiveSizeHandlers(options);
    return (description, context) => {
        if (description.dynamicLength) {
            // IBM dynamic elementary values are runtime-managed and prohibited
            // within file records. Their LIMIT is not an inline storage extent.
            return diagnostic(context, "DYNAMIC LENGTH is runtime-managed and has no inline file-record size");
        }
        if (description.byteLength !== undefined &&
            (!Number.isSafeInteger(description.byteLength) || description.byteLength < 1 || description.byteLength > 999999999))
            return diagnostic(context, "BYTE-LENGTH requires a positive integer <= 999999999");
        if (description.byteLength !== undefined && (description.picture?.trim().toUpperCase() !== "U" || description.sign))
            return diagnostic(context, "BYTE-LENGTH requires exactly PIC U without SIGN");
        const picture = description.picture ? parseCobolPicture(description.picture, options) : undefined;
        const impliedUsage = picture?.category === "utf8" ? "UTF-8"
            : picture?.category === "national" || picture?.category === "national-edited"
                ? (options.nSymbol === "dbcs" ? "DISPLAY-1" : "NATIONAL")
                : "DISPLAY";
        const usage = normaliseUsage(description.usage ?? impliedUsage);
        if (description.byteLength !== undefined && usage !== "UTF-8")
            return diagnostic(context, "BYTE-LENGTH is only supported with USAGE UTF-8");
        const handler = Object.hasOwn(handlers, usage)
            ? handlers[usage as keyof typeof handlers]
            : undefined;
        return handler ? handler(description, context)
            : diagnostic(context, `Unsupported USAGE '${usage}'`);
    };
}

export const defaultCobolPrimitiveSizer: CobolPrimitiveSizer = ibmCobolPrimitiveSizer();
