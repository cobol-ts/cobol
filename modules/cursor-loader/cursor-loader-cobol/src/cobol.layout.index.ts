import {
    type CompiledCobolEntry,
    type CompiledCobolElementary,
    type CompiledCobolGroup
} from "@cobol-ts/layout";
import {
    type ErrorsOr,
    errors,
    value,
    mapErrorsOr,
    flattenArrayOfErrorsOr
} from "@cobol-ts/errors";

/** Index entries reference the original compiled nodes; geometry is not copied. */
export type NamedCobolEntry = Readonly<{
    node: CompiledCobolElementary | CompiledCobolGroup;
    children: CobolNameIndex;
}>;

/** The keys retain their original copybook spelling. */
export type CobolNameIndex = ReadonlyMap<string, NamedCobolEntry>;

const sameCobolName = (left: string, right: string): boolean =>
    left.toUpperCase() === right.toUpperCase();

/** Find a name regardless of the casing used by the caller. */
export function findCobolName(index: CobolNameIndex, name: string): NamedCobolEntry | undefined {
    for (const [declared, entry] of index) {
        if (sameCobolName(declared, name)) return entry;
    }
    return undefined;
}

/**
 * Build one map per declarative scope, preserving source-node references.
 * Padding and unnamed FILLER (including a FILLER group's descendants) are
 * inaccessible. Duplicate-name diagnostics and independent subtree failures
 * are combined by the shared ErrorsOr aggregation utility.
 */
export function createCobolNameIndex(entries: readonly CompiledCobolEntry[]): ErrorsOr<CobolNameIndex> {
    const named = entries.flatMap(node =>
        node.kind !== "padding" && node.source.name.kind === "named"
            ? [{name: node.source.name.name, node}]
            : []
    );

    const indexed = named.map(({name, node}) =>
        mapErrorsOr(
            node.kind === "group"
                ? createCobolNameIndex(node.children)
                : value(new Map<string, NamedCobolEntry>()),
            children => [name, {node, children}] as const
        )
    );

    const duplicates = named.flatMap(({name}, i) =>
        named.slice(i + 1)
            .filter(other => sameCobolName(name, other.name))
            .map(other => errors(
                `Ambiguous COBOL names '${name}' and '${other.name}' in compiled layout scope`
            ))
    );

    return mapErrorsOr(
        flattenArrayOfErrorsOr([...indexed, ...duplicates]),
        pairs => new Map(pairs)
    );
}
