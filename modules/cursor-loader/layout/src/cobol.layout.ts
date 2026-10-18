import type {CopybookAst, CopybookEntry, GroupEntry, ElementaryEntry} from "@cobol-ts/copybook";
import type {StorageSizeExpression} from "@cobol-ts/size";
import {canonicaliseStorageSize} from "@cobol-ts/size";
import {type ErrorsOr, errors, value, mapErrorsOr, flatMapErrorsOr} from "@cobol-ts/errors";
import {chainOfResponsibility, type PartialFunction} from "@cobol-ts/partial_functions";
import {transformTree, foldTreeLeft, foldTreeRight, type Tree} from "@cobol-ts/trees";
import {type CobolPrimitiveSizer, type CobolPrimitiveDescription, defaultCobolPrimitiveSizer} from "./cobol.primitive.size";
import {type CobolPaddingPolicy, type CobolPaddingContext, ibmCobolPadding} from "./cobol.padding";
import {type CobolOverlayAlignmentPolicy, ibmOverlayAlignment} from "./cobol.overlay.alignment";

type Geometry = Readonly<{
    size: StorageSizeExpression;
    leftOffset: StorageSizeExpression;
    rightOffset: StorageSizeExpression;
}>;
export type CompiledCobolElementary = Geometry & Readonly<{kind: "elementary"; source: ElementaryEntry}>;
export type CompiledCobolGroup = Geometry & Readonly<{
    kind: "group";
    source: GroupEntry;
    children: readonly CompiledCobolEntry[];
}>;
export type CompiledCobolPadding = Geometry & Readonly<{kind: "padding"}>;
export type CompiledCobolEntry = CompiledCobolElementary | CompiledCobolGroup | CompiledCobolPadding;

export type CobolLayoutOptions = Readonly<{
    primitiveSizer?: CobolPrimitiveSizer;
    padding?: CobolPaddingPolicy;
    overlayAlignment?: CobolOverlayAlignmentPolicy;
    canonicalise?: (size: StorageSizeExpression) => StorageSizeExpression;
}>;

type Source = GroupEntry | ElementaryEntry;
type Context = Readonly<{
    path: readonly string[];
    inheritedUsage?: string;
    inheritedSynchronized: boolean;
}>;

// A padding directive is DATA: it says what needs aligning, not how many
// bits are currently required. The left fold determines its symbolic size.
type PendingGeometry = {
    size?: StorageSizeExpression;
    leftOffset?: StorageSizeExpression;
    rightOffset?: StorageSizeExpression;
};
type PendingElementary = PendingGeometry & {
    kind: "elementary";
    source: ElementaryEntry;
    count: number;
};
type PendingGroup = PendingGeometry & {
    kind: "group";
    source: GroupEntry;
    count: number;
    children: PendingEntry[];
};
type PendingPadding = PendingGeometry & {
    kind: "padding";
    role: "before" | "after-occurrence";
    source: Source;
};
type PendingEntry = PendingElementary | PendingGroup | PendingPadding;

type Build = Readonly<{
    source: CopybookEntry;
    children: readonly PendingEntry[];
}>;

const isSource = (source: CopybookEntry): source is Source =>
    source.kind === "group" || source.kind === "elementary";
const nameOf = (source: Source): string =>
    source.name.kind === "named" ? source.name.name : "FILLER";
const targetOf = (source: Source): string | undefined => {
    const clause = source.clauses.find(c => c.kind === "redefines");
    return clause?.kind === "redefines" ? clause.target : undefined;
};

const astTree: Tree<Exclude<CopybookEntry, GroupEntry>, GroupEntry> = {
    isLeaf: (node): node is Exclude<CopybookEntry, GroupEntry> => node.kind !== "group",
    children: node => node.children
};
const pendingTree: Tree<PendingElementary | PendingPadding, PendingGroup> = {
    isLeaf: (node): node is PendingElementary | PendingPadding => node.kind !== "group",
    children: node => node.children
};

export function compileCobolLayout(
    ast: CopybookAst,
    copybook: string,
    options: CobolLayoutOptions = {}
): ErrorsOr<readonly CompiledCobolEntry[]> {
    const primitiveSizer = options.primitiveSizer ?? defaultCobolPrimitiveSizer;
    const padding = options.padding ?? ibmCobolPadding;
    const overlayAlignment = options.overlayAlignment ?? ibmOverlayAlignment;
    const canonicalise = options.canonicalise ?? canonicaliseStorageSize;
    const plus = (...terms: StorageSizeExpression[]) => canonicalise({kind: "sum", terms});
    const maximum = (...terms: StorageSizeExpression[]) => canonicalise({kind: "max", terms});
    const initial: Context = {path: [], inheritedSynchronized: false};

    const diagnostic = (source: Source, context: Context, message: string): ErrorsOr<never> =>
        errors(`Copybook ${copybook}, line ${source.line}, ${context.path.join(".")}: ${message}`);

    function enter(source: Source, parent: Context): ErrorsOr<Context> {
        const context = {...parent, path: [...parent.path, nameOf(source)]};
        const usages = source.clauses.filter(c => c.kind === "usage");
        const syncs = source.clauses.filter(c => c.kind === "synchronized");
        if (usages.length > 1) return diagnostic(source, context, "Multiple USAGE clauses");
        if (syncs.length > 1) return diagnostic(source, context, "Multiple SYNCHRONIZED clauses");
        return value({
            ...context,
            inheritedUsage: usages[0]?.usage ?? parent.inheritedUsage,
            inheritedSynchronized: parent.inheritedSynchronized || syncs.length > 0
        });
    }

    const contexts = new WeakMap<Source, Context>();
    const contextErrors: string[] = [];
    function indexContexts(entries: readonly CopybookEntry[], parent: Context): void {
        for (const source of entries) {
            if (!isSource(source)) continue;
            const result = enter(source, parent);
            if ("errors" in result) {
                contextErrors.push(...result.errors);
                continue;
            }
            contexts.set(source, result.value);
            if (source.kind === "group") indexContexts(source.children, result.value);
        }
    }
    indexContexts(ast.entries, initial);
    if (contextErrors.length) return errors(...contextErrors);
    const contextOf = (source: Source) => contexts.get(source)!;
    function policyContext(source: Source): CobolPaddingContext {
        const context = contextOf(source);
        return {
            copybook, line: source.line, path: context.path,
            inheritedUsage: context.inheritedUsage,
            inheritedSynchronized: context.inheritedSynchronized
        };
    }
    function checkedSize(
        source: Source,
        size: StorageSizeExpression,
        message = "Expected a nonnegative constant storage size"
    ): ErrorsOr<StorageSizeExpression> {
        const result = canonicalise(size);
        return typeof result === "number" &&
        (!Number.isSafeInteger(result) || result < 0)
            ? diagnostic(source, contextOf(source), message)
            : value(result);
    }
    function primitiveSize(source: ElementaryEntry): ErrorsOr<StorageSizeExpression> {
        const context = contextOf(source);
        const description: CobolPrimitiveDescription = {
            picture: source.picture,
            usage: context.inheritedUsage,
            sign: source.clauses.find(c => c.kind === "sign")
        };
        return flatMapErrorsOr(
            primitiveSizer(description, {copybook, line: source.line, path: context.path}),
            size => checkedSize(source, size)
        );
    }
    function firstElementary(source: Source): ElementaryEntry | undefined {
        if (source.kind === "elementary") return source;
        for (const child of source.children) {
            if (!isSource(child)) continue;
            const found = firstElementary(child);
            if (found) return found;
        }
        return undefined;
    }
    function before(source: Source, offset: StorageSizeExpression): ErrorsOr<StorageSizeExpression> {
        const first = firstElementary(source);
        return first
            ? flatMapErrorsOr(padding.before(first, offset, policyContext(first)),
                size => checkedSize(source, size))
            : value(0);
    }
    function afterOccurrence(source: Source, size: StorageSizeExpression): ErrorsOr<StorageSizeExpression> {
        return flatMapErrorsOr(padding.afterOccurrence(source, size, policyContext(source)),
            tail => checkedSize(source, tail));
    }
    function countOf(source: Source): ErrorsOr<number> {
        const clauses = source.clauses.filter(c => c.kind === "occurs");
        if (!clauses.length) return value(1);
        if (clauses.length > 1) return diagnostic(source, contextOf(source), "Multiple OCCURS clauses");
        const clause = clauses[0];
        if (!("count" in clause))
            return diagnostic(source, contextOf(source), "occurs depending on layout is not implemented yet");
        return Number.isSafeInteger(clause.count) && clause.count >= 1
            ? value(clause.count)
            : diagnostic(source, contextOf(source), "Invalid fixed OCCURS count");
    }

    type Repetition = {node: PendingElementary | PendingGroup; body: StorageSizeExpression};
    const singleOccurrence: PartialFunction<Repetition, ErrorsOr<StorageSizeExpression>> = {
        isDefinedAt: ({node}) => node.count === 1,
        apply: ({node, body}) => checkedSize(node.source, body)
    };
    const fixedOccurs: PartialFunction<Repetition, ErrorsOr<StorageSizeExpression>> = {
        isDefinedAt: ({node}) => node.count > 1,
        apply: ({node, body}) => {
            // A group's trailing padding has already been incorporated by
            // its alignment-intent node. Elementary entries have no children.
            const stride = node.kind === "group"
                ? value(body)
                : mapErrorsOr(afterOccurrence(node.source, body), tail => plus(body, tail));
            return flatMapErrorsOr(stride, occurrence => checkedSize(node.source,
                {kind: "occurs", count: node.count, expression: occurrence},
                "Fixed OCCURS extent exceeds safe integer range"));
        }
    };
    const repeat = chainOfResponsibility<Repetition, ErrorsOr<StorageSizeExpression>>(
        ({node}) => {throw new Error(`Missing repetition strategy for ${node.count}`);},
        fixedOccurs, singleOccurrence
    );

    // (1) Structural transformation: build real mutable nodes and padding
    // requirements. No origin variables, plans, numerical placement or offsets.
    function paddingIntents(children: readonly PendingEntry[], group: PendingGroup): PendingEntry[] {
        const result: PendingEntry[] = [];
        for (const child of children) {
            if (child.kind !== "padding" && targetOf(child.source) === undefined)
                result.push({kind: "padding", role: "before", source: child.source});
            result.push(child);
        }
        if (group.count > 1)
            result.push({kind: "padding", role: "after-occurrence", source: group.source});
        return result;
    }
    const elementary: PartialFunction<Build, ErrorsOr<readonly PendingEntry[]>> = {
        isDefinedAt: ({source}) => source.kind === "elementary",
        apply: ({source}) => {
            if (source.kind !== "elementary") throw new Error("Elementary strategy mismatch");
            return flatMapErrorsOr(primitiveSize(source), size =>
                mapErrorsOr(countOf(source), count => [
                    {kind: "elementary", source, size, count} satisfies PendingElementary
                ]));
        }
    };
    const group: PartialFunction<Build, ErrorsOr<readonly PendingEntry[]>> = {
        isDefinedAt: ({source}) => source.kind === "group",
        apply: ({source, children}) => {
            if (source.kind !== "group") throw new Error("Group strategy mismatch");
            return mapErrorsOr(countOf(source), count => {
                const node: PendingGroup = {kind: "group", source, count, children: []};
                node.children = paddingIntents(children, node);
                return [node];
            });
        }
    };
    const ignored: PartialFunction<Build, ErrorsOr<readonly PendingEntry[]>> = {
        isDefinedAt: ({source}) => source.kind === "constant" || source.kind === "renames",
        apply: () => value([])
    };
    const build = chainOfResponsibility<Build, ErrorsOr<readonly PendingEntry[]>>(
        ({source}) => {throw new Error(`Missing declaration strategy for ${source.kind}`);},
        elementary, group, ignored
    );
    const transformed = transformTree<
        Exclude<CopybookEntry, GroupEntry>, GroupEntry,
        PendingElementary | PendingPadding, PendingGroup
    >(ast.entries, astTree, (source, children) => build({source, children}));
    if ("errors" in transformed) return transformed;
    const roots = transformed.value;
    for (const root of roots) {
        if (root.kind !== "padding" && targetOf(root.source) !== undefined)
            return diagnostic(root.source, initial, "REDEFINES between record roots is not implemented yet");
    }

    // (2) Left fold: one depth-first traversal resolves alignment requirements
    // at their actual symbolic position, computes group sizes and left offsets.
    // The optional 'exit' callback closes each group after its children.
    type Run = {members: PendingEntry[]; sources: Map<string, Source>};
    type Frame = {
        group: PendingGroup;
        absoluteOrigin: StorageSizeExpression;
        position: StorageSizeExpression;
        children: PendingEntry[];
        alignedAtStart: boolean;
        run?: Run;
    };
    type FoldState = {frames: Frame[]; failure?: string[]};
    function extentOf(run: Run): StorageSizeExpression {
        return maximum(...run.members.map(node => {
            if (node.size === undefined) throw new Error("Run contains an unsized node");
            return node.size;
        }));
    }
    function closeRun(frame: Frame): void {
        if (!frame.run) return;
        frame.position = plus(frame.position, extentOf(frame.run));
        frame.run = undefined;
    }
    function placePadding(node: PendingPadding, frame: Frame): ErrorsOr<void> {
        // The parent already aligned an ordinary group's first descendant.
        // Even if that alignment is symbolic, a second internal padding
        // expression would be identically zero but not canonically reducible.
        if (node.role === "before" && frame.alignedAtStart &&
            frame.children.length === 0 && frame.run === undefined)
            return value(undefined);
        closeRun(frame);
        const sized = node.role === "before"
            ? before(node.source, plus(frame.absoluteOrigin, frame.position))
            : afterOccurrence(node.source, frame.position);
        return mapErrorsOr(sized, size => {
            // There must be no zero-length padding in the published tree.
            if (size !== 0) {
                node.size = size;
                node.leftOffset = frame.position;
                frame.children.push(node);
                frame.position = plus(frame.position, size);
            }
        });
    }
    type Place = {node: PendingEntry; frame: Frame};
    const overlay: PartialFunction<Place, ErrorsOr<StorageSizeExpression>> = {
        isDefinedAt: ({node}) => node.kind !== "padding" && targetOf(node.source) !== undefined,
        apply: ({node, frame}) => {
            if (node.kind === "padding") throw new Error("Overlay strategy mismatch");
            const targetName = targetOf(node.source)!;
            const run = frame.run;
            if (!run) return diagnostic(node.source, contextOf(node.source),
                `REDEFINES target '${targetName}' has no active overlay region`);
            const target = run.sources.get(targetName.toUpperCase());
            if (!target) return diagnostic(node.source, contextOf(node.source),
                `REDEFINES target '${targetName}' is not a preceding member of the current overlay region`);
            const start = frame.position;
            return flatMapErrorsOr(before(node.source, plus(frame.absoluteOrigin, start)), required => {
                const choice = required === 0
                    ? value("inside-overlay" as const)
                    : overlayAlignment({
                        overlay: node.source, target,
                        offset: plus(frame.absoluteOrigin, start), requiredPadding: required
                    });
                return flatMapErrorsOr(choice, action => {
                    if (action === "reject") return diagnostic(node.source, contextOf(node.source),
                        "SYNCHRONIZED overlay requires alignment not provided by its target");
                    if (action !== "inside-overlay") return diagnostic(node.source, contextOf(node.source),
                        "Unsupported overlay alignment decision");
                    if (required !== 0 && node.kind === "elementary") return diagnostic(node.source, contextOf(node.source),
                        "Leading padding inside an elementary REDEFINES alternative is not supported");
                    frame.children.push(node);
                    run.members.push(node);
                    run.sources.set(nameOf(node.source).toUpperCase(), node.source);
                    return value(start);
                });
            });
        }
    };
    const sequential: PartialFunction<Place, ErrorsOr<StorageSizeExpression>> = {
        isDefinedAt: ({node}) => node.kind !== "padding" && targetOf(node.source) === undefined,
        apply: ({node, frame}) => {
            if (node.kind === "padding") throw new Error("Sequential strategy mismatch");
            closeRun(frame);
            const start = frame.position;
            frame.children.push(node);
            frame.run = {members: [node], sources: new Map([[nameOf(node.source).toUpperCase(), node.source]])};
            return value(start);
        }
    };
    const place = chainOfResponsibility<Place, ErrorsOr<StorageSizeExpression>>(
        ({node}) => {throw new Error(`Missing placement strategy for ${node.kind}`);},
        overlay, sequential
    );

    function sizeElementary(node: PendingElementary): ErrorsOr<void> {
        if (node.size === undefined) throw new Error("Elementary node has no size");
        return mapErrorsOr(repeat({node, body: node.size}), size => { node.size = size; });
    }
    function enterNode(state: FoldState, node: PendingEntry): FoldState {
        if (state.failure) return state;
        const frame = state.frames.at(-1);
        if (node.kind === "padding") {
            if (!frame) throw new Error("Unexpected root padding");
            const result = placePadding(node, frame);
            if ("errors" in result) state.failure = result.errors;
            return state;
        }
        let absoluteOrigin: StorageSizeExpression = 0;
        if (frame) {
            const placed = place({node, frame});
            if ("errors" in placed) {
                state.failure = placed.errors;
                return state;
            }
            node.leftOffset = placed.value;
            absoluteOrigin = plus(frame.absoluteOrigin, placed.value);
        } else {
            node.leftOffset = 0;
        }
        if (node.kind === "elementary") {
            const sized = sizeElementary(node);
            if ("errors" in sized) state.failure = sized.errors;
        } else {
            state.frames.push({
                group: node, absoluteOrigin, position: 0, children: [],
                alignedAtStart: frame !== undefined && targetOf(node.source) === undefined
            });
        }
        return state;
    }
    function exitGroup(state: FoldState, node: PendingGroup): FoldState {
        if (state.failure) return state;
        const frame = state.frames.pop();
        if (!frame || frame.group !== node) throw new Error("Unbalanced tree traversal");
        closeRun(frame);
        node.children = frame.children;
        const sized = repeat({node, body: frame.position});
        if ("errors" in sized) state.failure = sized.errors;
        else node.size = sized.value;
        return state;
    }
    const leftErrors: string[] = [];
    for (const root of roots) {
        // Different 01-level records have independent physical origins.
        // One invalid record must not prevent diagnostics in another.
        const placed = foldTreeLeft([root], pendingTree, {frames: []} as FoldState, enterNode, exitGroup);
        if (placed.failure) leftErrors.push(...placed.failure);
    }
    if (leftErrors.length) return errors(...leftErrors);

    // (3) Right fold: independently accumulate physical extents from the end.
    function runsOf(children: readonly PendingEntry[]): PendingEntry[][] {
        const runs: PendingEntry[][] = [];
        for (const child of children) {
            if (child.kind !== "padding" && targetOf(child.source) !== undefined && runs.length)
                runs[runs.length - 1].push(child);
            else runs.push([child]);
        }
        return runs;
    }
    const rightErrors: string[] = [];
    foldTreeRight(roots, pendingTree, undefined, (acc, node) => {
        if (node.kind === "group") {
            let suffix: StorageSizeExpression = 0;
            const runs = runsOf(node.children);
            for (let i = runs.length - 1; i >= 0; i--) {
                const run = runs[i];
                const size = maximum(...run.map(member => member.size!));
                for (const member of run) {
                    if (member.size === undefined) throw new Error("Unsized member in right fold");
                    if (run.length === 1 || member.size === size) {
                        member.rightOffset = suffix;
                    } else if (typeof member.size === "number" && typeof size === "number") {
                        member.rightOffset = plus(suffix, size - member.size);
                    } else if (JSON.stringify(member.size) === JSON.stringify(size)) {
                        member.rightOffset = suffix;
                    } else if (member.kind !== "padding") {
                        const failure = diagnostic(member.source, contextOf(member.source),
                            "Symbolic unequal-sized REDEFINES requires a right-offset difference expression");
                        if ("errors" in failure) rightErrors.push(...failure.errors);
                    }
                }
                suffix = plus(suffix, size);
            }
        }
        // Remove compilation-only intent metadata from public tree nodes.
        // Do this after child traversal, while preserving source references.
        if (node.kind === "padding") {
            delete (node as {role?: PendingPadding["role"]}).role;
            delete (node as {source?: Source}).source;
        } else {
            delete (node as {count?: number}).count;
        }
        return acc;
    });
    if (rightErrors.length) return errors(...rightErrors);
    for (const root of roots) root.rightOffset = 0;
    return value(roots as CompiledCobolEntry[]);
}
