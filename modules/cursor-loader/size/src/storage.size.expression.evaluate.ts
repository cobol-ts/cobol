
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
    // Most IBM ODO controllers have a wholly literal path. Reuse its compiled
    // identity instead of allocating a new array on every controller read.
    let hasBinding=false;
    for(const part of path) if(typeof part !== "string") {hasBinding=true;break;}
    let concrete: readonly (string | number)[] = path;
    if(hasBinding) {
        const resolved:(string|number)[]=[];
        for(const part of path){
            if(typeof part==="string") resolved.push(part);
            else {
                if(!Number.isInteger(part)||part<0||part>=enclosingIndices.length)
                    throw new Error(`Unbound OCCURS variable at relative depth ${part}`);
                resolved.push(enclosingIndices[enclosingIndices.length-1-part]);
            }
        }
        concrete=resolved;
    }

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
                let total=0;
                for(const term of node.terms) total+=evaluate(term);
                return total;

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
                if ((node.min !== undefined && count < node.min) ||
                    (node.max !== undefined && count > node.max))
                    throw new Error(`ODO count ${count} outside declared bounds ${node.min ?? 0}..${node.max ?? "unbounded"} at ${JSON.stringify(node.path)}`);
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
