
import type {
    DependsOnPath,
    StorageSizeExpression,
} from "./size.expression.grammer";

export type ResolvedPath = readonly (string | number)[];
export type ResolvePath = (path: ResolvedPath) => unknown;

/** Evaluate a storage-size expression in bits. Each call owns its bindings. */
export function evaluateStorageSize(
    expression: StorageSizeExpression,
    resolve: ResolvePath,
): number {
    const variables: number[] = [];

    function resolveCount(path: DependsOnPath): number {
        const concrete: (string | number)[] = path.map(part => {
            if (typeof part === "string") {
                return part;
            }
            // Numbers in symbolic paths denote relative lambda depth.
            if (!Number.isInteger(part)
                || part < 0
                || part >= variables.length) {
                throw new Error(`Unbound OCCURS variable at relative depth ${part}`);
            }
            return variables[variables.length - 1 - part];
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
                const count = resolveCount(node.path);
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

            case "align": {
                const size = evaluate(node.size);
                const boundary = node.boundary;
                return (boundary - size % boundary) % boundary;
            }
        }
    }

    return evaluate(expression);
}
