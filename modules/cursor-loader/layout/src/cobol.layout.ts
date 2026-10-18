import type {CopybookAst, CopybookEntry, GroupEntry, ElementaryEntry} from "@cobol-ts/copybook";
import {type StorageSizeExpression, type DependsOnPath, canonicaliseStorageSize} from "@cobol-ts/size";
import {type ErrorsOr, errors, value, mapErrorsOr, flatMapErrorsOr} from "@cobol-ts/errors";
import {chainOfResponsibility, type PartialFunction} from "@cobol-ts/partial_functions";
import {transformTree, foldTreeLeft, foldTreeRight, type Tree} from "@cobol-ts/trees";
import {type CobolPrimitiveSizer, type CobolPrimitiveDescription, defaultCobolPrimitiveSizer} from "./cobol.primitive.size";
import {type CobolPaddingPolicy, type CobolPaddingContext, ibmCobolPadding} from "./cobol.padding";
import {type CobolOverlayAlignmentPolicy, ibmOverlayAlignment} from "./cobol.overlay.alignment";

// Public geometry remains unchanged. Compilation-only fields are removed
// from mutable nodes before returning the compiled tree.
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

// An undecorated 1 means no OCCURS clause. An explicit OCCURS 1 is a
// fixed binder, and must not be reduced to the undecorated case when a
// descendant refers to its occurrence index.
export type OccurrenceCount = number | Readonly<{kind: "fixed"; count: number}> | Readonly<{
    kind: "dependent";
    min: number;
    max: number;
    path: DependsOnPath;
}>;

// An alignment-intent node has no size until the left fold knows its symbolic
// position. This is not a placeholder for a numerical position.
type PendingGeometry = {
    size?: StorageSizeExpression;
    leftOffset?: StorageSizeExpression;
    rightOffset?: StorageSizeExpression;
};
export type PendingElementary = PendingGeometry & {
    kind: "elementary";
    source: ElementaryEntry;
    count: OccurrenceCount;
};
export type PendingGroup = PendingGeometry & {
    kind: "group";
    source: GroupEntry;
    count: OccurrenceCount;
    children: PendingEntry[];
};
export type PendingPadding = PendingGeometry & {
    kind: "padding";
    role: "before" | "after-occurrence";
    source: Source;
};
export type PendingEntry = PendingElementary | PendingGroup | PendingPadding;

export type Build = Readonly<{
    source: CopybookEntry;
    children: readonly PendingEntry[];
}>;
export type Repetition = Readonly<{
    node: PendingElementary | PendingGroup;
    body: StorageSizeExpression;
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

type Canonicalise = (expression: StorageSizeExpression) => StorageSizeExpression;
type Combine = (...terms: StorageSizeExpression[]) => StorageSizeExpression;
type Diagnostic = (source: Source, context: Context, message: string) => ErrorsOr<never>;
type ContextOf = (source: Source) => Context;
type CheckedSize = (source: Source, size: StorageSizeExpression, message?: string) => ErrorsOr<StorageSizeExpression>;
type CountOf = (source: Source) => ErrorsOr<OccurrenceCount>;
type ResolveCountPath = (source: Source, controllingField: string) => ErrorsOr<DependsOnPath>;
type PrimitiveSize = (source: ElementaryEntry) => ErrorsOr<StorageSizeExpression>;
type Before = (source: Source, offset: StorageSizeExpression) => ErrorsOr<StorageSizeExpression>;
type AfterOccurrence = (source: Source, size: StorageSizeExpression) => ErrorsOr<StorageSizeExpression>;
type Repeat = (input: Repetition) => ErrorsOr<StorageSizeExpression>;

const adding = (canonicalise: Canonicalise): Combine =>
    (...terms) => canonicalise({kind: "sum", terms});
const maximising = (canonicalise: Canonicalise): Combine =>
    (...terms) => canonicalise({kind: "max", terms});
const diagnosing = (copybook: string): Diagnostic =>
    (source, context, message) =>
        errors(`Copybook ${copybook}, line ${source.line}, ${context.path.join(".")}: ${message}`);

function enteredContext(source: Source, parent: Context, diagnostic: Diagnostic): ErrorsOr<Context> {
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

function indexContexts(entries: readonly CopybookEntry[], diagnostic: Diagnostic): ErrorsOr<ContextOf> {
    const contexts = new WeakMap<Source, Context>();
    const messages: string[] = [];
    const initial: Context = {path: [], inheritedSynchronized: false};
    const visit = (sources: readonly CopybookEntry[], parent: Context): void => {
        for (const source of sources) {
            if (!isSource(source)) continue;
            const entered = enteredContext(source, parent, diagnostic);
            if ("errors" in entered) {
                messages.push(...entered.errors);
                continue;
            }
            contexts.set(source, entered.value);
            if (source.kind === "group") visit(source.children, entered.value);
        }
    };
    visit(entries, initial);
    if (messages.length) return errors(...messages);
    return value(source => {
        const context = contexts.get(source);
        if (!context) throw new Error(`Missing indexed context for ${nameOf(source)}`);
        return context;
    });
}

const policyContextFor = (copybook: string, contextOf: ContextOf) =>
    (source: Source): CobolPaddingContext => {
        const context = contextOf(source);
        return {
            copybook, line: source.line, path: context.path,
            inheritedUsage: context.inheritedUsage,
            inheritedSynchronized: context.inheritedSynchronized
        };
    };

const checkingSize = (canonicalise: Canonicalise, diagnostic: Diagnostic, contextOf: ContextOf): CheckedSize =>
    (source, size, message = "Expected a nonnegative constant storage size") => {
        const result = canonicalise(size);
        return typeof result === "number" && (!Number.isSafeInteger(result) || result < 0)
            ? diagnostic(source, contextOf(source), message)
            : value(result);
    };

const sizingPrimitive = (
    primitiveSizer: CobolPrimitiveSizer,
    checkedSize: CheckedSize,
    contextOf: ContextOf,
    copybook: string
): PrimitiveSize => source => {
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
};

function firstElementary(source: Source): ElementaryEntry | undefined {
    if (source.kind === "elementary") return source;
    for (const child of source.children) {
        if (!isSource(child)) continue;
        const found = firstElementary(child);
        if (found) return found;
    }
    return undefined;
}

const beforePadding = (
    policy: CobolPaddingPolicy,
    policyContext: (source: Source) => CobolPaddingContext,
    checkedSize: CheckedSize
): Before => (source, offset) => {
    const first = firstElementary(source);
    return first
        ? flatMapErrorsOr(policy.before(first, offset, policyContext(first)), size => checkedSize(source, size))
        : value(0);
};

const afterPadding = (
    policy: CobolPaddingPolicy,
    policyContext: (source: Source) => CobolPaddingContext,
    checkedSize: CheckedSize
): AfterOccurrence => (source, size) =>
    flatMapErrorsOr(policy.afterOccurrence(source, size, policyContext(source)), tail => checkedSize(source, tail));

/**
 * Resolve a controller within the table's containing group.
 * A repeated ancestor introduces one occurrence-index binding, numbered
 * from the innermost repeated ancestor (0). The evaluator already uses
 * this convention for numeric components of DependsOnPath.
 *
 * No traversal changes are required: the enclosing OCCURS expression binds
 * its index while evaluating the group's one-occurrence body.
 */
const resolvingScopedController = (
    ast: CopybookAst,
    contextOf: ContextOf,
    diagnostic: Diagnostic
): ResolveCountPath => {
    const ancestors = new WeakMap<Source, readonly GroupEntry[]>();
    const index = (entries: readonly CopybookEntry[], parents: readonly GroupEntry[]): void => {
        for (const entry of entries) {
            if (!isSource(entry)) continue;
            ancestors.set(entry, parents);
            if (entry.kind === "group") index(entry.children, [...parents, entry]);
        }
    };
    index(ast.entries, []);

    return (source, controllingField) => {
        const lineage = ancestors.get(source);
        const fail = (message: string) => diagnostic(source, contextOf(source), message);
        const owner = lineage?.at(-1);
        if (!lineage || !owner) return fail(`ODO controlling field '${controllingField}' has no containing group`);

        const matches = owner.children.filter(entry =>
            isSource(entry) && entry.name.kind === "named" &&
            entry.name.name.toUpperCase() === controllingField.toUpperCase());
        if (!matches.length)
            return fail(`ODO controlling field '${controllingField}' was not found in the containing group`);
        if (matches.length > 1)
            return fail(`ODO controlling field '${controllingField}' is ambiguous`);

        const controller = matches[0];
        if (controller.kind !== "elementary" || controller === source)
            return fail(`ODO controlling field '${controllingField}' must be a distinct elementary field`);

        const repeating = lineage.filter(parent =>
            parent.clauses.some(clause => clause.kind === "occurs"));
        const path: (string | number)[] = [];
        for (const parent of lineage) {
            path.push(nameOf(parent));
            const ordinal = repeating.indexOf(parent);
            if (ordinal >= 0) path.push(repeating.length - 1 - ordinal);
        }
        path.push(nameOf(controller));
        return value(path);
    };
};

const countingOccurrences = (
    diagnostic: Diagnostic,
    contextOf: ContextOf,
    resolveCountPath: ResolveCountPath
): CountOf => source => {
    const clauses = source.clauses.filter(c => c.kind === "occurs");
    if (!clauses.length) return value(1);
    if (clauses.length > 1) return diagnostic(source, contextOf(source), "Multiple OCCURS clauses");
    const clause = clauses[0];
    if ("count" in clause)
        return Number.isSafeInteger(clause.count) && clause.count >= 1
            ? value({kind: "fixed" as const, count: clause.count})
            : diagnostic(source, contextOf(source), "Invalid fixed OCCURS count");
    if (!Number.isSafeInteger(clause.min) || !Number.isSafeInteger(clause.max) ||
        clause.min < 0 || clause.max < clause.min)
        return diagnostic(source, contextOf(source), "Invalid ODO bounds");
    return mapErrorsOr(resolveCountPath(source, clause.dependingOn), path => ({
        kind: "dependent" as const, min: clause.min, max: clause.max, path
    }));
};

// ---- Independently constructible, composable partial functions ----
// Each factory captures only its real dependencies; input arrives at apply().

export const singleOccurrenceStrategy = (checkedSize: CheckedSize): PartialFunction<Repetition, ErrorsOr<StorageSizeExpression>> => ({
    isDefinedAt: ({node}) => node.count === 1,
    apply: ({node, body}) => checkedSize(node.source, body)
});

export const fixedOccursStrategy = (
    afterOccurrence: AfterOccurrence,
    add: Combine,
    checkedSize: CheckedSize
): PartialFunction<Repetition, ErrorsOr<StorageSizeExpression>> => ({
    isDefinedAt: ({node}) => typeof node.count === "number"
        ? node.count > 1 : node.count.kind === "fixed",
    apply: ({node, body}) => {
        // A declared OCCURS 1 still binds index 0 for a nested controller.
        const occurrence = node.count;
        if (typeof occurrence !== "number" && occurrence.kind !== "fixed")
            throw new Error("Fixed repetition strategy mismatch");
        const count = typeof occurrence === "number" ? occurrence : occurrence.count;
        const stride = node.kind === "group"
            ? value(body)
            : mapErrorsOr(afterOccurrence(node.source, body), tail => add(body, tail));
        return flatMapErrorsOr(stride, occurrence => checkedSize(node.source,
            {kind: "occurs", count, expression: occurrence},
            "Fixed OCCURS extent exceeds safe integer range"));
    }
});

/** ODO is an additional repetition strategy, not a special tree traversal. */
export const dependentOccursStrategy = (
    afterOccurrence: AfterOccurrence,
    add: Combine,
    checkedSize: CheckedSize
): PartialFunction<Repetition, ErrorsOr<StorageSizeExpression>> => ({
    isDefinedAt: ({node}) => typeof node.count !== "number" && node.count.kind === "dependent",
    apply: ({node, body}) => {
        const occurrence = node.count;
        if (typeof occurrence === "number" || occurrence.kind !== "dependent")
            throw new Error("Dependent repetition strategy mismatch");
        const path = occurrence.path;
        const stride = node.kind === "group" || occurrence.max <= 1
            ? value(body)
            : mapErrorsOr(afterOccurrence(node.source, body), tail => add(body, tail));
        return flatMapErrorsOr(stride, expression => checkedSize(node.source, {
            kind: "depending-on", path, expression
        }));
    }
});

function paddingIntents(children: readonly PendingEntry[], group: PendingGroup): PendingEntry[] {
    const result: PendingEntry[] = [];
    for (const child of children) {
        if (child.kind !== "padding" && targetOf(child.source) === undefined)
            result.push({kind: "padding", role: "before", source: child.source});
        result.push(child);
    }
    if (typeof group.count === "number" ? group.count > 1 :
        group.count.kind === "fixed" ? group.count.count > 1 : group.count.max > 1)
        result.push({kind: "padding", role: "after-occurrence", source: group.source});
    return result;
}

export const elementaryStrategy = (
    primitiveSize: PrimitiveSize,
    countOf: CountOf
): PartialFunction<Build, ErrorsOr<readonly PendingEntry[]>> => ({
    isDefinedAt: ({source}) => source.kind === "elementary",
    apply: ({source}) => {
        if (source.kind !== "elementary") throw new Error("Elementary strategy mismatch");
        return flatMapErrorsOr(primitiveSize(source), size =>
            mapErrorsOr(countOf(source), count => [
                {kind: "elementary", source, size, count} satisfies PendingElementary
            ]));
    }
});

export const groupStrategy = (countOf: CountOf): PartialFunction<Build, ErrorsOr<readonly PendingEntry[]>> => ({
    isDefinedAt: ({source}) => source.kind === "group",
    apply: ({source, children}) => {
        if (source.kind !== "group") throw new Error("Group strategy mismatch");
        return mapErrorsOr(countOf(source), count => {
            const node: PendingGroup = {kind: "group", source, count, children: []};
            node.children = paddingIntents(children, node);
            return [node];
        });
    }
});

export const ignoredStrategy: PartialFunction<Build, ErrorsOr<readonly PendingEntry[]>> = {
    isDefinedAt: ({source}) => source.kind === "constant" || source.kind === "renames",
    apply: () => value([])
};

// ---- Physical placement strategies (same chain, state supplied as input) ----

type Run = {members: PendingEntry[]; sources: Map<string, Source>};
export type Frame = {
    group: PendingGroup;
    absoluteOrigin: StorageSizeExpression;
    position: StorageSizeExpression;
    children: PendingEntry[];
    alignedAtStart: boolean;
    run?: Run;
};
export type Place = Readonly<{node: PendingEntry; frame: Frame}>;
type CloseRun = (frame: Frame) => void;

const closingRuns = (add: Combine, maximum: Combine): CloseRun => frame => {
    if (!frame.run) return;
    const sizes = frame.run.members.map(node => {
        if (node.size === undefined) throw new Error("Run contains an unsized node");
        return node.size;
    });
    frame.position = add(frame.position, maximum(...sizes));
    frame.run = undefined;
};

export const sequentialStrategy = (closeRun: CloseRun): PartialFunction<Place, ErrorsOr<StorageSizeExpression>> => ({
    isDefinedAt: ({node}) => node.kind !== "padding" && targetOf(node.source) === undefined,
    apply: ({node, frame}) => {
        if (node.kind === "padding") throw new Error("Sequential strategy mismatch");
        closeRun(frame);
        const start = frame.position;
        frame.children.push(node);
        frame.run = {members: [node], sources: new Map([[nameOf(node.source).toUpperCase(), node.source]])};
        return value(start);
    }
});

export const overlayStrategy = (services: {
    before: Before;
    add: Combine;
    alignment: CobolOverlayAlignmentPolicy;
    diagnostic: Diagnostic;
    contextOf: ContextOf;
}): PartialFunction<Place, ErrorsOr<StorageSizeExpression>> => ({
    isDefinedAt: ({node}) => node.kind !== "padding" && targetOf(node.source) !== undefined,
    apply: ({node, frame}) => {
        if (node.kind === "padding") throw new Error("Overlay strategy mismatch");
        const targetName = targetOf(node.source)!;
        const run = frame.run;
        const fail = (message: string) => services.diagnostic(node.source, services.contextOf(node.source), message);
        if (!run) return fail(`REDEFINES target '${targetName}' has no active overlay region`);
        const target = run.sources.get(targetName.toUpperCase());
        if (!target) return fail(`REDEFINES target '${targetName}' is not a preceding member of the current overlay region`);
        const start = frame.position;
        return flatMapErrorsOr(services.before(node.source, services.add(frame.absoluteOrigin, start)), required => {
            const decision = required === 0
                ? value("inside-overlay" as const)
                : services.alignment({
                    overlay: node.source, target,
                    offset: services.add(frame.absoluteOrigin, start), requiredPadding: required
                });
            return flatMapErrorsOr(decision, action => {
                if (action === "reject") return fail("SYNCHRONIZED overlay requires alignment not provided by its target");
                if (action !== "inside-overlay") return fail("Unsupported overlay alignment decision");
                if (required !== 0 && node.kind === "elementary")
                    return fail("Leading padding inside an elementary REDEFINES alternative is not supported");
                frame.children.push(node);
                run.members.push(node);
                run.sources.set(nameOf(node.source).toUpperCase(), node.source);
                return value(start);
            });
        });
    }
});

// ---- Geometry walkers. No strategies or hidden compilation state live here. ----

type FoldState = {frames: Frame[]; failure?: string[]};
type PlaceFn = (input: Place) => ErrorsOr<StorageSizeExpression>;

const placingPadding = (
    closeRun: CloseRun,
    before: Before,
    afterOccurrence: AfterOccurrence,
    add: Combine
) => (node: PendingPadding, frame: Frame): ErrorsOr<void> => {
    // The parent already aligned an ordinary group's first descendant.
    if (node.role === "before" && frame.alignedAtStart &&
        frame.children.length === 0 && frame.run === undefined)
        return value(undefined);
    closeRun(frame);
    const sized = node.role === "before"
        ? before(node.source, add(frame.absoluteOrigin, frame.position))
        : afterOccurrence(node.source, frame.position);
    return mapErrorsOr(sized, size => {
        if (size !== 0) {
            node.size = size;
            node.leftOffset = frame.position;
            frame.children.push(node);
            frame.position = add(frame.position, size);
        }
    });
};

const visitingLeft = (
    place: PlaceFn,
    placePadding: (node: PendingPadding, frame: Frame) => ErrorsOr<void>,
    repeat: Repeat,
    add: Combine
) => (state: FoldState, node: PendingEntry): FoldState => {
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
        absoluteOrigin = add(frame.absoluteOrigin, placed.value);
    } else {
        node.leftOffset = 0;
    }
    if (node.kind === "elementary") {
        if (node.size === undefined) throw new Error("Elementary node has no size");
        const sized = repeat({node, body: node.size});
        if ("errors" in sized) state.failure = sized.errors;
        else node.size = sized.value;
    } else {
        state.frames.push({
            group: node, absoluteOrigin, position: 0, children: [],
            alignedAtStart: frame !== undefined && targetOf(node.source) === undefined
        });
    }
    return state;
};

const exitingLeft = (closeRun: CloseRun, repeat: Repeat) =>
    (state: FoldState, node: PendingGroup): FoldState => {
        if (state.failure) return state;
        const frame = state.frames.pop();
        if (!frame || frame.group !== node) throw new Error("Unbalanced tree traversal");
        closeRun(frame);
        node.children = frame.children;
        const sized = repeat({node, body: frame.position});
        if ("errors" in sized) state.failure = sized.errors;
        else node.size = sized.value;
        return state;
    };

function runsOf(children: readonly PendingEntry[]): PendingEntry[][] {
    const runs: PendingEntry[][] = [];
    for (const child of children) {
        if (child.kind !== "padding" && targetOf(child.source) !== undefined && runs.length)
            runs[runs.length - 1].push(child);
        else runs.push([child]);
    }
    return runs;
}

const assigningRight = (add: Combine, maximum: Combine, canonicalise: Canonicalise) =>
    (acc: void, node: PendingEntry): void => {
        if (node.kind === "group") {
            let suffix: StorageSizeExpression = 0;
            const runs = runsOf(node.children);
            for (let i = runs.length - 1; i >= 0; i--) {
                const run = runs[i];
                const sizes = run.map(member => {
                    if (member.size === undefined) throw new Error("Unsized member in right fold");
                    return member.size;
                });
                const size = maximum(...sizes);
                for (const member of run) {
                    if (member.size === undefined) throw new Error("Unsized member in right fold");
                    member.rightOffset = add(suffix, canonicalise({
                        kind: "difference", left: size, right: member.size
                    }));
                }
                suffix = add(suffix, size);
            }
        }
        // Remove only compilation metadata. Public node fields are unchanged.
        if (node.kind === "padding") {
            delete (node as {role?: PendingPadding["role"]}).role;
            delete (node as {source?: Source}).source;
        } else {
            delete (node as {count?: OccurrenceCount}).count;
        }
        return acc;
    };

// Assembly only: dependencies -> chains -> transform -> two folds.
export function compileCobolLayout(
    ast: CopybookAst,
    copybook: string,
    options: CobolLayoutOptions = {}
): ErrorsOr<readonly CompiledCobolEntry[]> {
    const canonicalise = options.canonicalise ?? canonicaliseStorageSize;
    const add = adding(canonicalise);
    const maximum = maximising(canonicalise);
    const diagnostic = diagnosing(copybook);

    const indexed = indexContexts(ast.entries, diagnostic);
    if ("errors" in indexed) return indexed;
    const contextOf = indexed.value;
    const checkedSize = checkingSize(canonicalise, diagnostic, contextOf);
    const policy = options.padding ?? ibmCobolPadding;
    const policyContext = policyContextFor(copybook, contextOf);
    const before = beforePadding(policy, policyContext, checkedSize);
    const afterOccurrence = afterPadding(policy, policyContext, checkedSize);
    const countOf = countingOccurrences(diagnostic, contextOf, resolvingScopedController(ast, contextOf, diagnostic));
    const primitiveSize = sizingPrimitive(options.primitiveSizer ?? defaultCobolPrimitiveSizer,
        checkedSize, contextOf, copybook);

    const build = chainOfResponsibility<Build, ErrorsOr<readonly PendingEntry[]>>(
        ({source}) => {throw new Error(`Missing declaration strategy for ${source.kind}`);},
        elementaryStrategy(primitiveSize, countOf), groupStrategy(countOf), ignoredStrategy
    );
    const repeat = chainOfResponsibility<Repetition, ErrorsOr<StorageSizeExpression>>(
        ({node}) => {throw new Error(`Missing repetition strategy for ${node.count}`);},
        dependentOccursStrategy(afterOccurrence, add, checkedSize),
        fixedOccursStrategy(afterOccurrence, add, checkedSize), singleOccurrenceStrategy(checkedSize)
    );
    const closeRun = closingRuns(add, maximum);
    const place = chainOfResponsibility<Place, ErrorsOr<StorageSizeExpression>>(
        ({node}) => {throw new Error(`Missing placement strategy for ${node.kind}`);},
        overlayStrategy({before, add, alignment: options.overlayAlignment ?? ibmOverlayAlignment,
            diagnostic, contextOf}),
        sequentialStrategy(closeRun)
    );

    // 1. Structural transformation produces mutable nodes and padding intents.
    const transformed = transformTree<
        Exclude<CopybookEntry, GroupEntry>, GroupEntry,
        PendingElementary | PendingPadding, PendingGroup
    >(ast.entries, astTree, (source, children) => build({source, children}));
    if ("errors" in transformed) return transformed;
    const roots = transformed.value;
    for (const root of roots) {
        if (root.kind !== "padding" && targetOf(root.source) !== undefined)
            return diagnostic(root.source, {path: [], inheritedSynchronized: false},
                "REDEFINES between record roots is not implemented yet");
    }

    // 2. Left fold resolves padding intents and produces all left geometry/sizes.
    const enter = visitingLeft(place, placingPadding(closeRun, before, afterOccurrence, add), repeat, add);
    const exit = exitingLeft(closeRun, repeat);
    const messages: string[] = [];
    for (const root of roots) {
        const placed = foldTreeLeft([root], pendingTree, {frames: []} as FoldState, enter, exit);
        if (placed.failure) messages.push(...placed.failure);
    }
    if (messages.length) return errors(...messages);

    // 3. Right fold independently computes right-relative geometry.
    foldTreeRight(roots, pendingTree, undefined, assigningRight(add, maximum, canonicalise));
    for (const root of roots) root.rightOffset = 0;
    return value(roots as CompiledCobolEntry[]);
}
