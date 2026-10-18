import type {
    GroupEntry,
    ElementaryEntry
} from "@cobol-ts/copybook";
import type {StorageSizeExpression} from "@cobol-ts/size";
import {type ErrorsOr, value} from "@cobol-ts/errors";

export type CobolOverlayAlignmentDecision =
    | "reject"
    | "inside-overlay";

export type CobolOverlayAlignmentRequest = Readonly<{
    overlay: GroupEntry | ElementaryEntry;
    target: GroupEntry | ElementaryEntry;

    /**
     * Physical start of the overlay, in bits.
     *
     * This position is fixed by REDEFINES.
     * The policy must not relocate the overlay.
     */
    offset: StorageSizeExpression;

    /**
     * Padding that would ordinarily be inserted before
     * the overlay's first synchronized elementary field.
     *
     * Measured in bits.
     */
    requiredPadding: StorageSizeExpression;
}>;

export type CobolOverlayAlignmentPolicy = (
    request: CobolOverlayAlignmentRequest
) => ErrorsOr<CobolOverlayAlignmentDecision>;

/**
 * Conservative IBM-targeted default.
 *
 * An overlay may not introduce leading padding merely
 * to move its first synchronized elementary field.
 */
export const ibmOverlayAlignment: CobolOverlayAlignmentPolicy =
    ({requiredPadding}) => value(
        requiredPadding === 0
            ? "inside-overlay"
            : "reject"
    );

/**
 * Permits initial padding to become part of the overlay's
 * own physical extent, without changing its start.
 *
 * Use only when the source's storage convention supports
 * this physical interpretation.
 */
export const permissiveOverlayAlignment:
    CobolOverlayAlignmentPolicy =
    () => value("inside-overlay");