
/**
 * Symbolic COBOL storage sizes, measured in bits.
 *
 * A variable refers to an enclosing indexed repetition by relative depth:
 * depth 0 is the innermost enclosing repetition; depth 1 is its parent.
 * Variable depths in paths are validated when metadata is built.
 */
export type StorageSizeExpression =
    | ConstantSizeExpression
    | SumSizeExpression
    | OccursSizeExpression
    | MaxSizeExpression
    | DependingOnSizeExpression
    | AlignSizeExpression
    | DifferenceSizeExpression;

/**
 * A symbolic count-field path:
 * - string: a literal COBOL field name;
 * - number: relative depth of an enclosing OCCURS repetition
 *   (0 = nearest, 1 = its parent, and so on).
 *
 * Unlike ResolvedPath, numbers here are NOT literal array indices.
 */
export type DependsOnPathItem = string | number;

export type DependsOnPath = readonly DependsOnPathItem[];

/** Fixed non-negative storage size in bits. */
export type ConstantSizeExpression = number;

export function isConstantSizeExpression(
    value: unknown,
): value is ConstantSizeExpression {
    return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

/** Adjacent fields occupy the sum of their sizes. */
export interface SumSizeExpression {
    readonly kind: "sum";
    readonly terms: readonly StorageSizeExpression[];
}

/** Fixed OCCURS: sum the size of each occurrence with its index bound. */
export interface OccursSizeExpression {
    readonly kind: "occurs";
    readonly count: number;
    readonly expression: StorageSizeExpression;
}

/** REDEFINES storage is the maximum size of its alternative views. */
export interface MaxSizeExpression {
    readonly kind: "max";
    readonly terms: readonly StorageSizeExpression[];
}

/**
 * OCCURS DEPENDING ON: read count at path, then evaluate expression once
 * for every occurrence and sum the sizes. The expression is an implicit lambda:
 * its current zero-based occurrence index is pushed onto the variable stack.
 * The path itself is resolved before this new index is pushed.
 */
export interface DependingOnSizeExpression {
    readonly kind: "depending-on";
    readonly path: DependsOnPath;
    readonly expression: StorageSizeExpression;
}

/**
 * Additional storage required to align a position or extent to a boundary.
 *
 * Both size and boundary are measured in bits. The boundary must be a
 * positive integer.
 *
 * Evaluates to:
 *
 *     (boundary - (size % boundary)) % boundary
 *
 * The result is zero when size is already aligned.
 *
 * When size is symbolic, alignment is evaluated using its resolved value.
 * This allows padding after variable-length OCCURS DEPENDING ON tables
 * to depend on the actual occurrence count.
 */
export interface AlignSizeExpression {
    readonly kind: "align";
    readonly size: StorageSizeExpression;
    readonly boundary: number;
}

/** Nonnegative distance between two storage extents (left >= right). */
export interface DifferenceSizeExpression {
    readonly kind: "difference";
    readonly left: StorageSizeExpression;
    readonly right: StorageSizeExpression;
}
