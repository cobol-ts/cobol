import {type CopybookClause, type ElementaryEntry, type GroupEntry} from "@cobol-ts/copybook";
import {type StorageSizeExpression, canonicaliseStorageSize} from "@cobol-ts/size";
import {type ErrorsOr, errors, value, valueOrThrow, errorsOrThrow} from "@cobol-ts/errors";
import {chainOfResponsibility} from "@cobol-ts/partial_functions";
import {
    elementaryStrategy,
    groupStrategy,
    ignoredStrategy,
    singleOccurrenceStrategy,
    fixedOccursStrategy,
    dependentOccursStrategy,
    sequentialStrategy,
    overlayStrategy,
    type PendingElementary,
    type PendingGroup,
    type Frame,
    type Build,
    type PendingEntry
} from "./cobol.layout";

const named = (name: string) => ({kind: "named" as const, name});
const field = (name: string, clauses: CopybookClause[] = []): ElementaryEntry => ({
    kind: "elementary", level: 5, name: named(name), picture: "X", clauses, conditions: [], line: 3
});
const group = (name: string, children: (ElementaryEntry | GroupEntry)[] = []): GroupEntry => ({
    kind: "group", level: 1, name: named(name), children, clauses: [], line: 2
});
const pendingField = (source: ElementaryEntry, count = 1): PendingElementary => ({
    kind: "elementary", source, count, size: 8
});
const pendingGroup = (source: GroupEntry, count = 1): PendingGroup => ({
    kind: "group", source, count, children: []
});
const frameFor = (source = group("REC"), position: StorageSizeExpression = 24): Frame => ({
    group: pendingGroup(source), absoluteOrigin: 0, position,
    children: [], alignedAtStart: false
});
const add = (...terms: StorageSizeExpression[]) => canonicaliseStorageSize({kind: "sum", terms});
const identitySize = (_source: ElementaryEntry | GroupEntry, size: StorageSizeExpression): ErrorsOr<StorageSizeExpression> => value(canonicaliseStorageSize(size));

describe("composable layout strategies", () => {
    test("elementary declaration strategy uses its independently injected sizer and counter", () => {
        const source = field("ITEM");
        const first = elementaryStrategy(() => value(8), () => value(1));
        const second = elementaryStrategy(() => value(16), () => value(3));
        const input: Build = {source, children: []};

        expect(first.isDefinedAt(input)).toBe(true);
        expect(valueOrThrow(first.apply(input))).toEqual([pendingField(source, 1)]);
        expect(valueOrThrow(second.apply(input))).toEqual([
            {kind: "elementary", source, count: 3, size: 16}
        ]);
    });

    test("group strategy builds padding requirements as DATA, without sizes or offsets", () => {
        const base = field("BASE");
        const alternate = field("ALT", [{kind: "redefines", target: "BASE"}]);
        const tail = field("TAIL");
        const source = group("REC", [base, alternate, tail]);
        const built = valueOrThrow(groupStrategy(() => value(2)).apply({
            source,
            children: [pendingField(base), pendingField(alternate), pendingField(tail)]
        }));
        expect(built.length).toBe(1);
        const node = built[0];
        if (node.kind !== "group") throw new Error("Expected group");
        expect(node.size).toBe(undefined);
        expect(node.leftOffset).toBe(undefined);
        expect(node.children.map(child => child.kind === "padding"
            ? `${child.role}:${child.source.name.kind === "named" ? child.source.name.name : "FILLER"}`
            : child.source.name.kind === "named" ? child.source.name.name : "FILLER"
        )).toEqual(["before:BASE", "BASE", "ALT", "before:TAIL", "TAIL", "after-occurrence:REC"]);
        expect(node.children.filter(child => child.kind === "padding").every(child => child.size === undefined)).toBe(true);
    });

    test("declaration chain composes strategies without internal compiler closures", () => {
        const build = chainOfResponsibility<Build, ErrorsOr<readonly PendingEntry[]>>(
            () => {throw new Error("No declaration strategy");},
            elementaryStrategy(() => value(8), () => value(1)),
            groupStrategy(() => value(1)),
            ignoredStrategy
        );
        const source = field("A");
        expect(valueOrThrow(build({source, children: []}))).toEqual([pendingField(source)]);
    });

    test("single-occurrence strategy does not add padding", () => {
        const source = field("A");
        const strategy = singleOccurrenceStrategy(identitySize);
        const input = {node: pendingField(source), body: 8};
        expect(strategy.isDefinedAt(input)).toBe(true);
        expect(valueOrThrow(strategy.apply(input))).toBe(8);
    });

    test("fixed-occurs strategy uses injected trailing padding for elementary fields", () => {
        const source = field("A");
        const calls: string[] = [];
        const strategy = fixedOccursStrategy((entry, body) => {
            calls.push(entry.name.kind === "named" ? entry.name.name : "FILLER");
            return value(8);
        }, add, identitySize);
        const input = {node: pendingField(source, 3), body: 8};
        expect(strategy.isDefinedAt(input)).toBe(true);
        expect(valueOrThrow(strategy.apply(input))).toBe(48);
        expect(calls).toEqual(["A"]);
    });

    test("fixed-occurs group already owns its trailing padding requirement", () => {
        const source = group("REC");
        const strategy = fixedOccursStrategy(() => {
            throw new Error("Group must not invoke elementary trailing padding");
        }, add, identitySize);
        expect(valueOrThrow(strategy.apply({node: pendingGroup(source, 3), body: 24}))).toBe(72);
    });

    test("dependent occurrence strategy composes with injected sizing operations", () => {
        const source = field("ITEMS");
        const count = {kind: "dependent" as const, min: 0, max: 3,
            path: ["RECORD", "ITEM-COUNT"]};
        const pending: PendingElementary = {kind: "elementary", source, count, size: 16};
        const strategy = dependentOccursStrategy(() => value(0), add, identitySize);
        const input = {node: pending, body: 16};
        expect(strategy.isDefinedAt(input)).toBe(true);
        expect(valueOrThrow(strategy.apply(input))).toEqual({
            kind: "depending-on", path: ["RECORD", "ITEM-COUNT"], expression: 16, min: 0, max: 3
        });
    });

    test("fixed and dependent repetition strategies are disjoint", () => {
        const source = field("ITEMS");
        const dependent: PendingElementary = {kind: "elementary", source, size: 8,
            count: {kind: "dependent", min: 0, max: 3, path: ["REC", "COUNT"]}};
        const fixed = pendingField(source, 3);
        const dependency = () => value(0);
        expect(dependentOccursStrategy(dependency, add, identitySize)
            .isDefinedAt({node: fixed, body: 8})).toBe(false);
        expect(fixedOccursStrategy(dependency, add, identitySize)
            .isDefinedAt({node: dependent, body: 8})).toBe(false);
    });

    test("sequential placement uses supplied run finalizer, not hidden state", () => {
        const source = field("BASE");
        const frame = frameFor();
        let closed = 0;
        const strategy = sequentialStrategy(current => {
            closed++;
            current.position = 40;
        });
        expect(strategy.isDefinedAt({node: pendingField(source), frame})).toBe(true);
        expect(valueOrThrow(strategy.apply({node: pendingField(source), frame}))).toBe(40);
        expect(closed).toBe(1);
        expect(frame.children.length).toBe(1);
        expect(frame.run?.sources.has("BASE")).toBe(true);
    });

    test("overlay placement composes with sequential placement and shares its start", () => {
        const base = field("BASE");
        const alt = field("ALT", [{kind: "redefines", target: "BASE"}]);
        const frame = frameFor();
        const sequential = sequentialStrategy(() => {});
        valueOrThrow(sequential.apply({node: pendingField(base), frame}));
        const overlay = overlayStrategy({
            before: () => value(0), add,
            alignment: () => {throw new Error("Zero padding must not consult the overlay policy");},
            diagnostic: (_, __, message) => errors(message),
            contextOf: () => ({path: [], inheritedSynchronized: false})
        });
        const input = {node: pendingField(alt), frame};
        expect(overlay.isDefinedAt(input)).toBe(true);
        expect(valueOrThrow(overlay.apply(input))).toBe(24);
        expect(frame.children.length).toBe(2);
        expect(frame.run?.members.length).toBe(2);
        expect(frame.run?.sources.has("ALT")).toBe(true);
    });

    test("overlay alignment policy is injected, including rejection", () => {
        const base = field("BASE");
        const alt = field("ALT", [{kind: "redefines", target: "BASE"}]);
        const frame = frameFor();
        valueOrThrow(sequentialStrategy(() => {}).apply({node: pendingField(base), frame}));
        let calls = 0;
        const strategy = overlayStrategy({
            before: () => value(8), add,
            alignment: () => { calls++; return value("reject"); },
            diagnostic: (_, __, message) => errors(message),
            contextOf: () => ({path: [], inheritedSynchronized: false})
        });
        const result = strategy.apply({node: pendingField(alt), frame});
        expect(errorsOrThrow(result)).toEqual(["SYNCHRONIZED overlay requires alignment not provided by its target"]);
        expect(calls).toBe(1);
        expect(frame.run?.members.length).toBe(1);
    });

    test("unmatched strategy uses the chain's throwing default", () => {
        const chain = chainOfResponsibility(
            () => {throw new Error("Missing repetition strategy");},
            singleOccurrenceStrategy(identitySize),
            fixedOccursStrategy(() => value(0), add, identitySize)
        );
        let message = "";
        try {
            chain({node: pendingField(field("A"), 0), body: 8});
        } catch (failure) {
            message = (failure as Error).message;
        }
        expect(message).toBe("Missing repetition strategy");
    });
});
