import {
    type Tree,
    type MutableTree,
    transformTree,
    foldTreeLeft,
    foldTreeRight
} from "./tree";

import {
    type ErrorsOr,
    value,
    errors,
    valueOrThrow,
    errorsOrThrow
} from "@cobol-ts/errors";

type SourceLeaf = {kind: "leaf"; name: string};
type SourceBranch = {kind: "branch"; name: string; children: SourceNode[]};
type SourceNode = SourceLeaf | SourceBranch;

type TargetLeaf = {kind: "value"; text: string};
type TargetBranch = {kind: "container"; label: string; children: TargetNode[]};
type TargetNode = TargetLeaf | TargetBranch;

const sourceTree: Tree<SourceLeaf, SourceBranch> = {
    isLeaf: (node): node is SourceLeaf => node.kind === "leaf",
    children: node => node.children
};

const mutableSourceTree: MutableTree<SourceLeaf, SourceBranch> = {
    ...sourceTree,
    setChildren: (node, children) => {
        node.children = [...children];
    }
};

const leaf = (name: string): SourceLeaf => ({kind: "leaf", name});

const branch = (name: string, ...children: SourceNode[]): SourceBranch => ({
    kind: "branch",
    name,
    children
});

const targetLeaf = (text: string): TargetLeaf => ({kind: "value", text});

const targetBranch = (label: string, ...children: TargetNode[]): TargetBranch => ({
    kind: "container",
    label,
    children
});

const sample = (): SourceNode[] => [
    branch("root", leaf("A"), branch("nested", leaf("B"), leaf("C")), leaf("D"))
];

/** Supply both output node types explicitly to avoid `readonly unknown[]` inference. */
function transformSourceTree(
    roots: readonly SourceNode[],
    transform: (
        node: SourceNode,
        children: readonly TargetNode[]
    ) => ErrorsOr<readonly TargetNode[]>
): ErrorsOr<TargetNode[]> {
    return transformTree<SourceLeaf, SourceBranch, TargetLeaf, TargetBranch>(
        roots,
        sourceTree,
        transform
    );
}

const compileNode = (
    node: SourceNode,
    children: readonly TargetNode[]
): ErrorsOr<readonly TargetNode[]> => value(
    node.kind === "leaf"
        ? [targetLeaf(node.name.toLowerCase())]
        : [targetBranch(node.name, ...children)]
);

describe("@cobol-ts/tree", () => {
    describe("transformTree", () => {
        test("transforms a leaf into a different type", () => {
            expect(valueOrThrow(transformSourceTree([leaf("A")], compileNode)))
                .toEqual([targetLeaf("a")]);
        });

        test("preserves hierarchy while changing node types", () => {
            expect(valueOrThrow(transformSourceTree(sample(), compileNode))).toEqual([
                targetBranch(
                    "root",
                    targetLeaf("a"),
                    targetBranch("nested", targetLeaf("b"), targetLeaf("c")),
                    targetLeaf("d")
                )
            ]);
        });

        test("transforms children before their parent", () => {
            const visited: string[] = [];
            valueOrThrow(transformSourceTree(sample(), (node, children) => {
                visited.push(node.name);
                return compileNode(node, children);
            }));

            expect(visited).toEqual(["A", "B", "C", "nested", "D", "root"]);
        });

        test("preserves sibling order", () => {
            const result = valueOrThrow(transformSourceTree(
                [branch("root", leaf("C"), leaf("A"), leaf("B"))],
                compileNode
            ));
            expect(result).toEqual([
                targetBranch("root", targetLeaf("c"), targetLeaf("a"), targetLeaf("b"))
            ]);
        });

        test("handles an empty forest", () => {
            const result = valueOrThrow(transformSourceTree([], () => {
                throw new Error("Transform must not be called");
            }));
            expect(result).toEqual([]);
        });

        test("does not mutate the source tree", () => {
            const roots = sample();
            const before = JSON.parse(JSON.stringify(roots));
            valueOrThrow(transformSourceTree(roots, compileNode));
            expect(roots).toEqual(before);
        });

        test("can expand one leaf to several nodes", () => {
            const result = valueOrThrow(transformSourceTree(
                [branch("root", leaf("A"), leaf("B"))],
                (node, children) => value(node.kind === "leaf"
                    ? [targetLeaf(node.name), targetLeaf("PADDING")]
                    : [targetBranch(node.name, ...children)])
            ));
            expect(result).toEqual([
                targetBranch(
                    "root",
                    targetLeaf("A"), targetLeaf("PADDING"),
                    targetLeaf("B"), targetLeaf("PADDING")
                )
            ]);
        });

        test("can remove a node by returning no outputs", () => {
            const result = valueOrThrow(transformSourceTree(
                [branch("root", leaf("A"), leaf("REMOVE"), leaf("B"))],
                (node, children) => value(node.kind === "leaf"
                    ? (node.name === "REMOVE" ? [] : [targetLeaf(node.name)])
                    : [targetBranch(node.name, ...children)])
            ));
            expect(result).toEqual([
                targetBranch("root", targetLeaf("A"), targetLeaf("B"))
            ]);
        });

        test("can expand multiple roots", () => {
            const result = valueOrThrow(transformSourceTree(
                [leaf("A"), leaf("B")],
                node => value(node.kind === "leaf"
                    ? [targetLeaf(node.name), targetLeaf(`${node.name}-extra`)]
                    : [])
            ));
            expect(result).toEqual([
                targetLeaf("A"), targetLeaf("A-extra"),
                targetLeaf("B"), targetLeaf("B-extra")
            ]);
        });

        test("can remove a complete subtree", () => {
            const result = valueOrThrow(transformSourceTree(
                [branch("root", branch("REMOVE", leaf("A"), leaf("B")), leaf("C"))],
                (node, children) => value(node.kind === "leaf"
                    ? [targetLeaf(node.name)]
                    : node.name === "REMOVE" ? [] : [targetBranch(node.name, ...children)])
            ));
            expect(result).toEqual([targetBranch("root", targetLeaf("C"))]);
        });

        test("can expand a branch into multiple branches", () => {
            const result = valueOrThrow(transformSourceTree(
                [branch("root", leaf("A"))],
                (node, children) => value(node.kind === "leaf"
                    ? [targetLeaf(node.name)]
                    : [
                        targetBranch(`${node.name}-first`, ...children),
                        targetBranch(`${node.name}-second`, ...children)
                    ])
            ));
            expect(result).toEqual([
                targetBranch("root-first", targetLeaf("A")),
                targetBranch("root-second", targetLeaf("A"))
            ]);
        });

        describe("error aggregation", () => {
            const compileWithErrors = (
                node: SourceNode,
                children: readonly TargetNode[]
            ): ErrorsOr<readonly TargetNode[]> =>
                node.name.startsWith("BAD")
                    ? errors(`Invalid ${node.name}`)
                    : compileNode(node, children);

            test("propagates a single error", () => {
                expect(errorsOrThrow(transformSourceTree([leaf("BAD-A")], compileWithErrors)))
                    .toEqual(["Invalid BAD-A"]);
            });

            test("collects errors from all siblings", () => {
                const visited: string[] = [];
                const result = transformSourceTree(
                    [branch("root", leaf("BAD-A"), leaf("GOOD"), leaf("BAD-B"))],
                    (node, children) => {
                        visited.push(node.name);
                        return compileWithErrors(node, children);
                    }
                );
                expect(errorsOrThrow(result)).toEqual(["Invalid BAD-A", "Invalid BAD-B"]);
                expect(visited).toEqual(["BAD-A", "GOOD", "BAD-B"]);
            });

            test("collects errors from independent subtrees", () => {
                const visited: string[] = [];
                const result = transformSourceTree(
                    [branch("first", leaf("BAD-A")), branch("second", leaf("BAD-B"))],
                    (node, children) => {
                        visited.push(node.name);
                        return compileWithErrors(node, children);
                    }
                );
                expect(errorsOrThrow(result)).toEqual(["Invalid BAD-A", "Invalid BAD-B"]);
                expect(visited).toEqual(["BAD-A", "BAD-B"]);
            });

            test("collects errors from separate roots in order", () => {
                expect(errorsOrThrow(transformSourceTree(
                    [leaf("BAD-A"), leaf("BAD-B"), leaf("BAD-C")],
                    compileWithErrors
                ))).toEqual(["Invalid BAD-A", "Invalid BAD-B", "Invalid BAD-C"]);
            });

            test("collects multiple errors produced by each node", () => {
                expect(errorsOrThrow(transformSourceTree(
                    [leaf("A"), leaf("B")],
                    node => errors(
                        `${node.name}: missing PIC`,
                        `${node.name}: unsupported USAGE`
                    )
                ))).toEqual([
                    "A: missing PIC", "A: unsupported USAGE",
                    "B: missing PIC", "B: unsupported USAGE"
                ]);
            });

            test("does not transform a parent with failed children", () => {
                const visited: string[] = [];
                const result = transformSourceTree(
                    [branch("root", leaf("GOOD"), leaf("BAD-A"))],
                    (node, children) => {
                        visited.push(node.name);
                        return compileWithErrors(node, children);
                    }
                );
                expect(errorsOrThrow(result)).toEqual(["Invalid BAD-A"]);
                expect(visited).toEqual(["GOOD", "BAD-A"]);
            });

            test("continues compiling unaffected branches after failure", () => {
                const visited: string[] = [];
                const result = transformSourceTree(
                    [branch("first", leaf("BAD-A")),
                        branch("second", leaf("GOOD")), leaf("BAD-B")],
                    (node, children) => {
                        visited.push(node.name);
                        return compileWithErrors(node, children);
                    }
                );
                expect(errorsOrThrow(result)).toEqual(["Invalid BAD-A", "Invalid BAD-B"]);
                expect(visited).toEqual(["BAD-A", "GOOD", "second", "BAD-B"]);
            });

            test("returns transformed values when there are no errors", () => {
                expect(valueOrThrow(transformSourceTree(
                    [leaf("A"), leaf("B")], compileWithErrors
                ))).toEqual([targetLeaf("a"), targetLeaf("b")]);
            });
        });
    });

    describe("foldTreeLeft", () => {
        test("visits parents before children, left to right", () => {
            const names = foldTreeLeft(
                sample(), sourceTree, [] as string[],
                (acc, node) => [...acc, node.name]
            );
            expect(names).toEqual(["root", "A", "nested", "B", "C", "D"]);
        });

        test("carries its accumulator across roots", () => {
            expect(foldTreeLeft(
                [branch("first", leaf("A")), leaf("B")],
                sourceTree, "", (acc, node) => acc + node.name
            )).toBe("firstAB");
        });

        test("returns the initial value for an empty forest", () => {
            expect(foldTreeLeft([], sourceTree, 42, acc => acc + 1)).toBe(42);
        });

        test("visits a lone leaf", () => {
            expect(foldTreeLeft(
                [leaf("A")], sourceTree, [] as string[],
                (acc, node) => [...acc, node.name]
            )).toEqual(["A"]);
        });

        test("can mutate visited nodes", () => {
            const root = branch("ROOT", leaf("A"), branch("INNER", leaf("B")));
            foldTreeLeft([root], mutableSourceTree, undefined, (acc, node) => {
                node.name = node.name.toLowerCase();
                return acc;
            });
            expect(root).toEqual(branch("root", leaf("a"), branch("inner", leaf("b"))));
        });

        describe("optional exit callback", () => {
            test("runs after each branch's descendants", () => {
                const events = foldTreeLeft(
                    [branch("ROOT", leaf("A"), branch("INNER", leaf("B")))],
                    sourceTree,
                    [] as string[],
                    (acc, node) => [...acc, `enter ${node.name}`],
                    (acc, node) => [...acc, `exit ${node.name}`]
                );
                expect(events).toEqual([
                    "enter ROOT", "enter A", "enter INNER", "enter B",
                    "exit INNER", "exit ROOT"
                ]);
            });

            test("is called for branches, not leaves", () => {
                const exited: string[] = [];
                foldTreeLeft(
                    [leaf("A"), branch("ROOT", leaf("B"))],
                    sourceTree,
                    undefined,
                    acc => acc,
                    (acc, node) => {
                        exited.push(node.name);
                        return acc;
                    }
                );
                expect(exited).toEqual(["ROOT"]);
            });

            test("receives the accumulator returned by the child traversal", () => {
                const result = foldTreeLeft(
                    [branch("ROOT", leaf("A"), leaf("B"))],
                    sourceTree,
                    "",
                    (acc, node) => acc + node.name,
                    (acc, node) => `${acc}[/${node.name}]`
                );
                expect(result).toBe("ROOTAB[/ROOT]");
            });

            test("preserves the four-argument call signature", () => {
                expect(foldTreeLeft(
                    [branch("ROOT", leaf("A"), leaf("B"))],
                    sourceTree, "", (acc, node) => acc + node.name
                )).toBe("ROOTAB");
            });
        });
    });

    describe("foldTreeRight", () => {
        test("visits children before parents, right to left", () => {
            expect(foldTreeRight(
                sample(), sourceTree, [] as string[],
                (acc, node) => [...acc, node.name]
            )).toEqual(["D", "C", "B", "nested", "A", "root"]);
        });

        test("carries its accumulator across roots", () => {
            expect(foldTreeRight(
                [branch("first", leaf("A")), leaf("B")],
                sourceTree, "", (acc, node) => acc + node.name
            )).toBe("BAfirst");
        });

        test("returns the initial value for an empty forest", () => {
            expect(foldTreeRight([], sourceTree, 42, acc => acc + 1)).toBe(42);
        });

        test("visits a lone leaf", () => {
            expect(foldTreeRight(
                [leaf("A")], sourceTree, [] as string[],
                (acc, node) => [...acc, node.name]
            )).toEqual(["A"]);
        });

        test("can mutate visited nodes", () => {
            const root = branch("ROOT", leaf("A"), branch("INNER", leaf("B")));
            foldTreeRight([root], mutableSourceTree, undefined, (acc, node) => {
                node.name = node.name.toLowerCase();
                return acc;
            });
            expect(root).toEqual(branch("root", leaf("a"), branch("inner", leaf("b"))));
        });
    });

    describe("MutableTree", () => {
        test("replaces a branch's children", () => {
            const root = branch("root", leaf("A"), leaf("B"));
            mutableSourceTree.setChildren(root, [leaf("C"), branch("nested", leaf("D"))]);
            expect(root).toEqual(branch("root", leaf("C"), branch("nested", leaf("D"))));
        });

        test("also supports the read-only children interface", () => {
            const root = branch("root", leaf("A"));
            expect(mutableSourceTree.children(root)).toEqual([leaf("A")]);
        });
    });
});
