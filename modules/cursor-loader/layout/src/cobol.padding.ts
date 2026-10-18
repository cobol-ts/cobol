
import {type GroupEntry, type ElementaryEntry} from "@cobol-ts/copybook";
import {type StorageSizeExpression} from "@cobol-ts/size";
import {
    type ErrorsOr, errors, value, mapErrorsOr, flatMapErrorsOr
} from "@cobol-ts/errors";
import {
    type CobolPrimitiveDescription,
    type CobolPrimitiveSizeContext
} from "./cobol.primitive.size";
import {ibmCobolAlignment} from "./cobol.alignment";

type CobolStorageEntry = GroupEntry | ElementaryEntry;

export type CobolPaddingContext = CobolPrimitiveSizeContext & {
    readonly inheritedUsage?: string;
    readonly inheritedSynchronized?: boolean;
};

/**
 * Padding required before placing an entry at the proposed offset.
 *
 * offsetBits is relative to the record's alignment origin.
 *
 * The result may be symbolic when the offset depends on ODO.
 * The layout compiler handles REDEFINES and must not call this
 * method when placing an alternative at an existing address.
 */
export type CobolInitialPaddingResolver = (
    entry: CobolStorageEntry,
    offsetBits: StorageSizeExpression,
    context: CobolPaddingContext
) => ErrorsOr<StorageSizeExpression>;

/**
 * Determine the alignment requirement of a repeated entry.
 *
 * Includes elementary descendants, nested groups and all
 * REDEFINES alternatives.
 *
 * Alignment boundaries are known at compilation.
 */
export type CobolOccurrenceAlignmentResolver = (
    entry: CobolStorageEntry,
    context: CobolPaddingContext
) => ErrorsOr<number>;

/**
 * Calculate trailing padding after one occurrence.
 *
 * occurrenceSizeBits includes internal padding, but excludes
 * the trailing padding returned by this method.
 *
 * The result may be symbolic when the occurrence has variable size.
 */
export type CobolOccurrencePaddingResolver = (
    entry: CobolStorageEntry,
    occurrenceSizeBits: StorageSizeExpression,
    context: CobolPaddingContext
) => ErrorsOr<StorageSizeExpression>;

/**
 * Injectable dialect-specific padding policy.
 *
 * This policy calculates padding expressions only.
 * The layout compiler owns traversal, placement, REDEFINES,
 * repetition and insertion of explicit padding entries.
 */
export type CobolPaddingPolicy = {
    readonly before: CobolInitialPaddingResolver;
    readonly occurrenceAlignment: CobolOccurrenceAlignmentResolver;
    readonly afterOccurrence: CobolOccurrencePaddingResolver;
};

function diagnostic(
    entry: CobolStorageEntry,
    context: CobolPaddingContext,
    message: string
): ErrorsOr<never> {
    return errors(
        `Copybook ${context.copybook}, line ${entry.line}, ` +
        `${context.path.join(".")}: ${message}`
    );
}

function nameOf(entry: CobolStorageEntry): string {
    return entry.name.kind === "named" ? entry.name.name : "FILLER";
}

function usageOf(
    entry: CobolStorageEntry,
    context: CobolPaddingContext
): ErrorsOr<string> {
    const clauses = entry.clauses.filter(c => c.kind === "usage");
    if (clauses.length > 1)
        return diagnostic(entry, context, "Multiple USAGE clauses");

    return value(clauses[0]?.usage ?? context.inheritedUsage ?? "DISPLAY");
}

function synchronizedOf(
    entry: CobolStorageEntry,
    context: CobolPaddingContext
): ErrorsOr<boolean> {
    const clauses = entry.clauses.filter(c => c.kind === "synchronized");
    if (clauses.length > 1)
        return diagnostic(entry, context, "Multiple SYNCHRONIZED clauses");

    return value(context.inheritedSynchronized === true || clauses.length > 0);
}

function descriptionOf(
    entry: ElementaryEntry,
    usage: string,
    context: CobolPaddingContext
): ErrorsOr<CobolPrimitiveDescription> {
    const signs = entry.clauses.filter(c => c.kind === "sign");
    if (signs.length > 1)
        return diagnostic(entry, context, "Multiple SIGN clauses");

    return value({
        picture: entry.picture,
        usage,
        sign: signs[0]
    });
}

function elementaryAlignment(
    entry: ElementaryEntry,
    context: CobolPaddingContext
): ErrorsOr<number> {
    return flatMapErrorsOr(usageOf(entry, context), usage =>
        flatMapErrorsOr(synchronizedOf(entry, context), synchronized =>
            flatMapErrorsOr(descriptionOf(entry, usage, context), description =>
                ibmCobolAlignment(description, synchronized, {
                    copybook: context.copybook,
                    line: entry.line,
                    path: context.path
                })
            )
        )
    );
}

function childContext(
    entry: GroupEntry,
    context: CobolPaddingContext
): ErrorsOr<CobolPaddingContext> {
    return flatMapErrorsOr(usageOf(entry, context), inheritedUsage =>
        mapErrorsOr(synchronizedOf(entry, context), inheritedSynchronized => ({
            ...context,
            inheritedUsage,
            inheritedSynchronized
        }))
    );
}

/**
 * Construct a padding expression.
 *
 * Constant offsets are calculated immediately, so our existing
 * numeric tests continue to work without canonicalisation.
 *
 * Symbolic offsets remain expressions for the projection.
 */
/**
 * Construct the size expression for the additional bits needed
 * to reach the next alignment boundary.
 *
 * Constant expressions are evaluated immediately so existing
 * fixed-layout tests continue to return numbers.
 *
 * Symbolic expressions are canonicalised by the layout compiler.
 */
function paddingBits(
    boundaryBits: number,
    offsetBits: StorageSizeExpression
): StorageSizeExpression {
    if (boundaryBits === 8) return 0;

    if (typeof offsetBits === "number")
        return (boundaryBits - offsetBits % boundaryBits) % boundaryBits;

    return {
        kind: "align",
        size: offsetBits,
        boundary: boundaryBits
    };
}

/**
 * IBM Enterprise COBOL: initial padding before an elementary entry.
 *
 * Groups receive no initial padding. Their descendants are
 * positioned recursively by the layout compiler.
 */
export const ibmInitialPadding: CobolInitialPaddingResolver = (
    entry,
    offsetBits,
    context
): ErrorsOr<StorageSizeExpression> => {
    if (entry.kind === "group") return value(0);

    return mapErrorsOr(
        elementaryAlignment(entry, context),
        boundary => paddingBits(boundary, offsetBits)
    );
};

/**
 * IBM Enterprise COBOL: alignment required by a repeated entry.
 *
 * The largest descendant alignment determines the occurrence
 * boundary. REDEFINES alternatives all contribute.
 */
export const ibmOccurrenceAlignment: CobolOccurrenceAlignmentResolver = (
    entry,
    context
): ErrorsOr<number> => {
    if (entry.kind === "elementary")
        return elementaryAlignment(entry, context);

    return flatMapErrorsOr(childContext(entry, context), inherited => {
        let boundary = 8;

        for (const child of entry.children) {
            if (child.kind !== "group" && child.kind !== "elementary")
                continue;

            const result = ibmOccurrenceAlignment(child, {
                ...inherited,
                line: child.line,
                path: [...context.path, nameOf(child)]
            });

            if ("errors" in result) return result;
            boundary = Math.max(boundary, result.value);
        }

        return value(boundary);
    });
};

/**
 * IBM Enterprise COBOL: trailing padding after one occurrence.
 *
 * The occurrence's length is rounded to a multiple of its
 * strongest alignment boundary. This preserves the alignment
 * pattern for subsequent occurrences.
 *
 * The layout compiler includes the returned padding in the
 * occurrence stride before applying fixed OCCURS or ODO.
 */
export const ibmOccurrencePadding: CobolOccurrencePaddingResolver = (
    entry,
    occurrenceSizeBits,
    context
): ErrorsOr<StorageSizeExpression> =>
    mapErrorsOr(
        ibmOccurrenceAlignment(entry, context),
        boundary => paddingBits(boundary, occurrenceSizeBits)
    );

/**
 * IBM Enterprise COBOL padding policy.
 */
export const ibmCobolPadding: CobolPaddingPolicy = {
    before: ibmInitialPadding,
    occurrenceAlignment: ibmOccurrenceAlignment,
    afterOccurrence: ibmOccurrencePadding
};
