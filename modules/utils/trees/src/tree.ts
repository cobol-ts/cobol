import {
    type ErrorsOr,
    value,
    mapErrorsOr,
    flatMapErrorsOr,
    flattenArrayOfErrorsOr
} from "@cobol-ts/errors";

export type TreeNode<Leaf, Child> = Leaf | Child;

export interface Tree<Leaf, Child> {
    isLeaf(node: TreeNode<Leaf, Child>): node is Leaf;
    children(node: Child): readonly TreeNode<Leaf, Child>[];
}

export interface MutableTree<Leaf, Child> extends Tree<Leaf, Child> {
    setChildren(node: Child, children: readonly TreeNode<Leaf, Child>[]): void;
}

/** Transform children first; collect errors from independent subtrees. */
export function transformTree<InLeaf, InChild, OutLeaf, OutChild>(
    roots: readonly TreeNode<InLeaf, InChild>[],
    tree: Tree<InLeaf, InChild>,
    transform: (
        node: TreeNode<InLeaf, InChild>,
        children: readonly TreeNode<OutLeaf, OutChild>[]
    ) => ErrorsOr<readonly TreeNode<OutLeaf, OutChild>[]>
): ErrorsOr<TreeNode<OutLeaf, OutChild>[]> {
    type Input = TreeNode<InLeaf, InChild>;
    type Output = TreeNode<OutLeaf, OutChild>;

    const many = (nodes: readonly Input[]): ErrorsOr<Output[]> =>
        mapErrorsOr(
            flattenArrayOfErrorsOr(nodes.map(visit)),
            results => results.flatMap(result => result)
        );

    const visit = (node: Input): ErrorsOr<readonly Output[]> =>
        flatMapErrorsOr(
            tree.isLeaf(node) ? value([] as Output[]) : many(tree.children(node)),
            children => transform(node, children)
        );

    return many(roots);
}

/**
 * Left-to-right depth-first fold.
 *
 * Optional exit runs AFTER visiting a branch's children. This is useful for
 * context-dependent geometry: the parent can close its physical extent once
 * all of its children have been measured. Existing callers are unchanged.
 */
export function foldTreeLeft<Leaf, Child, Acc>(
    roots: readonly TreeNode<Leaf, Child>[],
    tree: Tree<Leaf, Child>,
    initial: Acc,
    fold: (acc: Acc, node: TreeNode<Leaf, Child>) => Acc,
    exit?: (acc: Acc, node: Child) => Acc
): Acc {
    const visit = (acc: Acc, node: TreeNode<Leaf, Child>): Acc => {
        const next = fold(acc, node);
        if (tree.isLeaf(node)) return next;
        const afterChildren = tree.children(node).reduce(visit, next);
        return exit ? exit(afterChildren, node) : afterChildren;
    };
    return roots.reduce(visit, initial);
}

/** Right-to-left depth-first fold, children before their parent. */
export function foldTreeRight<Leaf, Child, Acc>(
    roots: readonly TreeNode<Leaf, Child>[],
    tree: Tree<Leaf, Child>,
    initial: Acc,
    fold: (acc: Acc, node: TreeNode<Leaf, Child>) => Acc
): Acc {
    const visit = (acc: Acc, node: TreeNode<Leaf, Child>): Acc => {
        const next = tree.isLeaf(node)
            ? acc
            : tree.children(node).reduceRight(visit, acc);
        return fold(next, node);
    };
    return roots.reduceRight(visit, initial);
}
