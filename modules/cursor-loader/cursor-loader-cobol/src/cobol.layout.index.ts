import {type CompiledCobolEntry, type CompiledCobolElementary, type CompiledCobolGroup} from "@cobol-ts/layout";
import {foldTreeLeft, type Tree} from "@cobol-ts/trees";

/** A name lookup points back to the original compiled storage node; no geometry is copied. */
export type NamedCobolEntry = Readonly<{
    node: CompiledCobolElementary | CompiledCobolGroup;
    children: ReadonlyMap<string, NamedCobolEntry>;
}>;

export type CobolNameIndex = ReadonlyMap<string, NamedCobolEntry>;

const tree: Tree<CompiledCobolElementary | Extract<CompiledCobolEntry, {kind: "padding"}>, CompiledCobolGroup> = {
    isLeaf: node => node.kind !== "group",
    children: group => group.children
};

type Frame = {
    readonly roots: Map<string, NamedCobolEntry>;
    readonly scopes: Map<string, NamedCobolEntry>[];
};

/**
 * One setup-time traversal for case-insensitive hierarchical COBOL names.
 * Generated padding and unnamed FILLER are never projected. A FILLER group
 * is an inaccessible subtree rather than accidentally flattening its names
 * into the containing group. REDEFINES alternatives are retained separately.
 * Ambiguous duplicate names within one scope are rejected explicitly.
 *
 * The returned ReadonlyMap is source-scoped metadata, not a record-specific
 * value or a materialised view of the record.
 */
export function createCobolNameIndex(roots: readonly CompiledCobolEntry[]): CobolNameIndex {
    const root = new Map<string, NamedCobolEntry>();
    const frame: Frame = {roots: root, scopes: [root]};

    foldTreeLeft(roots, tree, frame, (state, node) => {
        if (node.kind === "padding") return state;

        const children = new Map<string, NamedCobolEntry>();
        if (node.source.name.kind === "named") {
            const name = node.source.name.name.toUpperCase();
            const siblings = state.scopes[state.scopes.length - 1];
            if (siblings.has(name)) {
                throw new Error(`Ambiguous COBOL name '${name}' in compiled layout scope`);
            }
            siblings.set(name, {node, children});
        }
        if (node.kind === "group") state.scopes.push(children);
        return state;
    }, state => {
        state.scopes.pop();
        return state;
    });

    return root;
}
