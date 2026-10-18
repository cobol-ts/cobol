
import type {StorageSizeExpression} from "./size.expression.grammer";

/**
 * Simplify a symbolic storage-size expression without consulting a record.
 * Does not mutate the input. Expressions are assumed to have been validated.
 *
 * An OCCURS binds an occurrence index. Do not remove that binding unless
 * the entire repeated expression is a constant: relative numeric references
 * in nested DEPENDING ON paths would otherwise change meaning.
 */
export function canonicaliseStorageSize(
    expression: StorageSizeExpression,
): StorageSizeExpression {
    if (typeof expression === "number") {
        return expression;
    }

    switch (expression.kind) {
        case "sum": {
            const terms: StorageSizeExpression[] = [];
            let constant = 0;
            for (const term of expression.terms) {
                const simplified = canonicaliseStorageSize(term);
                const members = typeof simplified !== "number" && simplified.kind === "sum"
                    ? simplified.terms
                    : [simplified];
                for (const member of members) {
                    if (typeof member === "number") {
                        constant += member;
                    } else {
                        terms.push(member);
                    }
                }
            }
            if (constant !== 0) terms.push(constant);
            if (terms.length === 0) return 0;
            if (terms.length === 1) return terms[0];
            return {kind: "sum", terms};
        }

        case "max": {
            const terms: StorageSizeExpression[] = [];
            let constant = 0;
            for (const term of expression.terms) {
                const simplified = canonicaliseStorageSize(term);
                const members = typeof simplified !== "number" && simplified.kind === "max"
                    ? simplified.terms
                    : [simplified];
                for (const member of members) {
                    if (typeof member === "number") {
                        constant = Math.max(constant, member);
                    } else {
                        terms.push(member);
                    }
                }
            }
            if (terms.length === 0) return constant;
            if (constant !== 0) terms.push(constant);
            if (terms.length === 1) return terms[0];
            return {kind: "max", terms};
        }

        case "occurs": {
            if (expression.count === 0) return 0;
            const child = canonicaliseStorageSize(expression.expression);
            if (typeof child === "number") {
                return expression.count * child;
            }
            // The body may use this occurrence's index. Never rewrite
            // OCCURS(1, body) to body without rebasing relative depths.
            return {kind: "occurs", count: expression.count, expression: child};
        }

        case "depending-on": {
            const child = canonicaliseStorageSize(expression.expression);
            // Zero-sized occurrences still require resolving the count for
            // full evaluation semantics; leave the dependent node in place.
            return {
                kind: "depending-on",
                path: expression.path,
                expression: child,
            };
        }

        case "align": {
            const size = canonicaliseStorageSize(expression.size);
            const boundary = expression.boundary;

            if (typeof size === "number") {
                return (boundary - size % boundary) % boundary;
            }

            return {kind: "align", size, boundary};
        }
    }
}
