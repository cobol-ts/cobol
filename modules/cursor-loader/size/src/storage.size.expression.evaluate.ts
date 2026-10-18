
import type {
    DependsOnPath,
    StorageSizeExpression,
} from "./size.expression.grammer";

export type ResolvedPath = readonly (string | number)[];
export type ResolvePath = (path: ResolvedPath) => unknown;

/** Resolve an ODO count using the currently bound outer occurrence indices. */
export function resolveDependingOnCount(
    path: DependsOnPath,
    resolve: ResolvePath,
    enclosingIndices: readonly number[] = []
): number {
    const concrete: (string | number)[] = path.map(part => {
        if (typeof part === "string") {
            return part;
        }
        // Numbers in symbolic paths denote relative lambda depth.
        if (!Number.isInteger(part)
            || part < 0
            || part >= enclosingIndices.length) {
            throw new Error(`Unbound OCCURS variable at relative depth ${part}`);
        }
        return enclosingIndices[enclosingIndices.length - 1 - part];
    });

    const count = resolve(concrete);
    if (typeof count !== "number"
        || !Number.isSafeInteger(count)
        || count < 0) {
        throw new Error(
            `Invalid OCCURS DEPENDING ON count ${String(count)} at ${JSON.stringify(concrete)}`,
        );
    }
    return count;
}

/** Evaluate a storage-size expression in bits. Each call owns its bindings. */
export function evaluateStorageSize(
    expression: StorageSizeExpression,
    resolve: ResolvePath,
    enclosingIndices: readonly number[] = [],
): number {
    // Outermost occurrence first, matching the indices in resolved paths.
    // Copy so nested lambdas never mutate a caller-owned context.
    for (const index of enclosingIndices) {
        if (!Number.isSafeInteger(index) || index < 0) {
            throw new Error(`Invalid enclosing occurrence index ${String(index)}`);
        }
    }
    const variables: number[] = [...enclosingIndices];

    function evaluate(node: StorageSizeExpression): number {
        if (typeof node === "number") {
            return node;
        }

        switch (node.kind) {
            case "sum":
                return node.terms.reduce<number>((total, term) => total + evaluate(term), 0);

            case "occurs": {
                const depth = variables.length;
                let total = 0;
                variables.push(0);
                try {
                    for (let index = 0; index < node.count; index++) {
                        variables[depth] = index;
                        total += evaluate(node.expression);
                    }
                } finally {
                    variables.length = depth;
                }
                return total;
            }

            case "max": {
                let result = 0;
                for (const term of node.terms) {
                    result = Math.max(result, evaluate(term));
                }
                return result;
            }

            case "depending-on": {
                const count = resolveDependingOnCount(node.path, resolve, variables);
                const depth = variables.length;
                let total = 0;
                variables.push(0);
                try {
                    for (let index = 0; index < count; index++) {
                        variables[depth] = index;
                        total += evaluate(node.expression);
                    }
                } finally {
                    variables.length = depth;
                }
                return total;
            }

            case "difference": {
                const left = evaluate(node.left);
                const right = evaluate(node.right);
                if (right > left) throw new Error("Negative storage-size difference");
                return left - right;
            }

            case "align": {
                const size = evaluate(node.size);
                const boundary = node.boundary;
                return (boundary - size % boundary) % boundary;
            }
        }
    }

    return evaluate(expression);
}
