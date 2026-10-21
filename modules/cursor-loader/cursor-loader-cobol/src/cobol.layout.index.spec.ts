import {compileCobolLayout, type CompiledCobolEntry, type CompiledCobolElementary, type CompiledCobolGroup} from "@cobol-ts/layout";
import {parseCopybook} from "@cobol-ts/copybook";
import {errorsOrThrow, isErrors, valueOrThrow} from "@cobol-ts/errors";
import {createCobolNameIndex, findCobolName, type CobolNameIndex} from "./cobol.layout.index";

// Most tests use minimal compiled nodes: the name index must not accidentally
// depend on the layout compiler's sizing, padding or expression evaluator.
const named = (name: string) => ({kind: "named" as const, name});

function elementary(name: string, leftOffset = 0): CompiledCobolElementary {
    return {
        kind: "elementary", size: 8, leftOffset, rightOffset: 0,
        source: {kind: "elementary", level: 5, name: named(name),
            clauses: [], conditions: [], line: 1, picture: "X"}
    };
}

function group(name: string, children: readonly CompiledCobolEntry[], leftOffset = 0): CompiledCobolGroup {
    return {
        kind: "group", size: 32, leftOffset, rightOffset: 0,
        source: {kind: "group", level: 5, name: named(name),
            clauses: [], line: 1, children: []},
        children
    };
}

function fillerGroup(children: readonly CompiledCobolEntry[]): CompiledCobolGroup {
    return {
        ...group("unused", children),
        source: {kind: "group", level: 5, name: {kind: "filler" as const},
            clauses: [], line: 1, children: []}
    };
}

const padding: CompiledCobolEntry = {
    kind: "padding", size: 8, leftOffset: 8, rightOffset: 0
};

const indexOf = (entries: readonly CompiledCobolEntry[]): CobolNameIndex =>
    valueOrThrow(createCobolNameIndex(entries));

const childOf = (index: CobolNameIndex, name: string): CobolNameIndex => {
    const entry = findCobolName(index, name);
    if (!entry) throw new Error(`Missing expected fixture name ${name}`);
    return entry.children;
};

describe("createCobolNameIndex", () => {
    test("an empty layout produces a successful empty index", () => {
        expect([...indexOf([])]).toEqual([]);
    });

    test("preserves original names and original compiled node identities", () => {
        const code = elementary("Mixed-Case", 24);
        const record = group("Record", [code]);
        const index = indexOf([record]);

        expect([...index.keys()]).toEqual(["Record"]);
        expect([...childOf(index, "record").keys()]).toEqual(["Mixed-Case"]);
        expect(findCobolName(index, "RECORD")!.node).toBe(record);
        expect(findCobolName(childOf(index, "Record"), "mixed-case")!.node).toBe(code);
        expect(findCobolName(childOf(index, "Record"), "MISSING")).toBeUndefined();
        expect(code.leftOffset).toBe(24); // no geometry rewritten
    });

    test("keeps hierarchical scopes separate, allowing repeated field names in different groups", () => {
        const firstCode = elementary("CODE");
        const secondCode = elementary("code");
        const index = indexOf([group("RECORD", [
            group("LEFT", [firstCode]), group("RIGHT", [secondCode])
        ])]);

        expect(findCobolName(childOf(childOf(index, "RECORD"), "LEFT"), "code")!.node)
            .toBe(firstCode);
        expect(findCobolName(childOf(childOf(index, "RECORD"), "RIGHT"), "CODE")!.node)
            .toBe(secondCode);
    });

    test("an ancestor and a descendant may have the same name", () => {
        const index = indexOf([group("RECORD", [group("RECORD", [elementary("VALUE")])])]);
        expect([...childOf(childOf(index, "RECORD"), "RECORD").keys()]).toEqual(["VALUE"]);
    });

    test("ignores padding without flattening it into a name or changing positions", () => {
        const amount = elementary("AMOUNT", 16);
        const index = indexOf([group("RECORD", [elementary("CODE"), padding, amount])]);
        expect([...childOf(index, "RECORD").keys()]).toEqual(["CODE", "AMOUNT"]);
        expect(findCobolName(childOf(index, "RECORD"), "AMOUNT")!.node).toBe(amount);
        expect(amount.leftOffset).toBe(16);
    });

    test("omits FILLER groups and their entire subtree, including otherwise-invalid duplicate names", () => {
        const index = indexOf([group("RECORD", [
            elementary("BEFORE"),
            fillerGroup([elementary("hidden"), elementary("HIDDEN")]),
            elementary("AFTER")
        ])]);
        expect([...childOf(index, "RECORD").keys()]).toEqual(["BEFORE", "AFTER"]);
        expect(findCobolName(childOf(index, "RECORD"), "hidden")).toBeUndefined();
    });

    test("omits elementary FILLER alongside padding without hiding named siblings", () => {
        const fillerLeaf: CompiledCobolEntry = {
            ...elementary("not-a-name"),
            source: {kind: "elementary", level: 5, name: {kind: "filler"},
                clauses: [], conditions: [], line: 1, picture: "X"}
        };
        const index = indexOf([group("RECORD", [elementary("A"), fillerLeaf, padding, elementary("B")])]);
        expect([...childOf(index, "RECORD").keys()]).toEqual(["A", "B"]);
    });

    test("preserves separately named overlay alternatives, even when their offsets coincide", () => {
        const original = elementary("EMP-ID");
        const overlay = elementary("EMP-ID-X");
        const index = indexOf([group("RECORD", [original, overlay])]);
        const children = childOf(index, "RECORD");
        expect(findCobolName(children, "EMP-ID")!.node).toBe(original);
        expect(findCobolName(children, "EMP-ID-X")!.node).toBe(overlay);
        expect([...children.keys()]).toEqual(["EMP-ID", "EMP-ID-X"]);
    });

    test("retains only one compiled OCCURS body, not expanded occurrence entries", () => {
        const item = group("ITEM", [elementary("CODE")]);
        const index = indexOf([group("RECORD", [item])]);
        expect([...childOf(index, "RECORD").keys()]).toEqual(["ITEM"]);
        expect([...childOf(childOf(index, "RECORD"), "ITEM").keys()]).toEqual(["CODE"]);
    });

    test.each([
        ["exact", "NAME", "NAME"],
        ["case-insensitive", "NAME", "name"]
    ])("returns monadic errors for %s duplicates in one scope", (_description, left, right) => {
        const result = createCobolNameIndex([group("RECORD", [elementary(left), elementary(right)])]);
        expect(isErrors(result)).toBe(true);
        expect(errorsOrThrow(result).join(" ")).toMatch(/Ambiguous COBOL names/);
        expect(errorsOrThrow(result).join(" ")).toContain(left);
        expect(errorsOrThrow(result).join(" ")).toContain(right);
    });

    test("reports all independent duplicates in one scope", () => {
        const result = createCobolNameIndex([group("RECORD", [
            elementary("A"), elementary("a"), elementary("B"), elementary("b")
        ])]);
        const messages = errorsOrThrow(result);
        expect(messages).toHaveLength(2);
        expect(messages.join(" ")).toMatch(/'A' and 'a'/);
        expect(messages.join(" ")).toMatch(/'B' and 'b'/);
    });

    test("aggregates nested errors from independent sibling groups", () => {
        const result = createCobolNameIndex([
            group("FIRST", [elementary("A"), elementary("a")]),
            group("SECOND", [elementary("B"), elementary("b")])
        ]);
        const messages = errorsOrThrow(result);
        expect(messages).toHaveLength(2);
        expect(messages.join(" ")).toMatch(/'A' and 'a'/);
        expect(messages.join(" ")).toMatch(/'B' and 'b'/);
    });

    test("aggregates parent duplicates and invalid nested groups without short circuiting", () => {
        const result = createCobolNameIndex([
            group("FIRST", [elementary("X"), elementary("x")]),
            group("first", [elementary("Y"), elementary("y")]),
            group("THIRD", [elementary("Z"), elementary("z")])
        ]);
        const messages = errorsOrThrow(result);
        expect(messages).toHaveLength(4);
        expect(messages.join(" ")).toMatch(/'FIRST' and 'first'/);
        expect(messages.join(" ")).toMatch(/'X' and 'x'/);
        expect(messages.join(" ")).toMatch(/'Y' and 'y'/);
        expect(messages.join(" ")).toMatch(/'Z' and 'z'/);
    });

    test("rejects duplicate top-level record names via ErrorsOr rather than throwing", () => {
        const result = createCobolNameIndex([group("RECORD", []), group("record", [])]);
        expect(errorsOrThrow(result)).toHaveLength(1);
    });
});

describe("compiled-copybook integration", () => {
    const copybook = [
        "01 EMP-RECORD.",
        "   05 PREFIX PIC X.",
        "   05 AMOUNT PIC S9(9) COMP SYNC.",
        "   05 EMP-ID PIC X(5).",
        "   05 EMP-ID-X REDEFINES EMP-ID PIC X(5).",
        "   05 ITEMS OCCURS 3 TIMES.",
        "      10 CODE PIC X(2).",
        "   05 FILLER PIC X(2).",
        "   05 TRAILER PIC X."
    ].join("\n");

    test("indexes real compiled geometry with padding, REDEFINES, OCCURS and FILLER", () => {
        const ast = valueOrThrow(parseCopybook(copybook));
        const roots = valueOrThrow(compileCobolLayout(ast, "name-index-fixture.cpy"));
        const root = roots[0];
        if (!root || root.kind !== "group") throw new Error("Fixture did not compile a group");
        expect(root.children.some(child => child.kind === "padding")).toBe(true);

        const index = indexOf(roots);
        const fields = childOf(index, "emp-record");
        expect([...fields.keys()]).toEqual([
            "PREFIX", "AMOUNT", "EMP-ID", "EMP-ID-X", "ITEMS", "TRAILER"
        ]);
        expect([...childOf(fields, "ITEMS").keys()]).toEqual(["CODE"]);
        expect(findCobolName(fields, "FILLER")).toBeUndefined();

        for (const sourceNode of root.children) {
            if (sourceNode.kind === "padding" || sourceNode.source.name.kind !== "named") continue;
            expect(findCobolName(fields, sourceNode.source.name.name)!.node).toBe(sourceNode);
        }
        const id = findCobolName(fields, "EMP-ID")!.node;
        const alias = findCobolName(fields, "EMP-ID-X")!.node;
        expect(id.leftOffset).toEqual(alias.leftOffset);
    });
});
