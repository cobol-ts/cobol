# @cobol-ts/trees

## Purpose

Format-independent functional traversals over tree structures. The COBOL [layout compiler](../../cursor-loader/layout/README.md) uses these operations to transform storage declarations and perform ordered geometry passes. This package knows nothing about COBOL syntax, byte buffers or projection lifetimes.

## Tree contracts

`Tree<Leaf, Child>` provides `isLeaf(node)` and `children(child)`. `MutableTree` extends that with `setChildren`. Callers supply these operations rather than inheriting from a fixed tree-node class.

## Traversals

`transformTree(roots, tree, transform)` visits children before transforming their parent and returns `ErrorsOr`, allowing independent errors to accumulate through the [errors module](../errors/README.md). The transform callback can return multiple output nodes, so the operation also supports expansions and removals. `foldTreeLeft` walks in left-to-right depth-first order; its optional `exit` callback runs after the children of a branch. `foldTreeRight` walks in the complementary order used by suffix calculations.

For geometry passes, traversal order is part of the algorithm: prefix placement and suffix sizing cannot be interchanged. See [`src/tree.ts`](src/tree.ts) and its tests for exact callback arguments and accumulation semantics.
