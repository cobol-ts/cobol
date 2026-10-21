import {type CompiledCobolEntry} from "@cobol-ts/layout";
import {createCobolNameIndex} from "./cobol.layout.index";

// This tests the name index in isolation: the layout compiler has its own
// extensive tests of sizes, offsets, OCCURS and REDEFINES.
function elementary(name: string, leftOffset = 0): CompiledCobolEntry {
    return {
        kind: "elementary", size: 8, leftOffset, rightOffset: 0,
        source: {kind: "elementary", level: 5, name: {kind: "named", name},
            clauses: [], conditions: [], line: 1, picture: "X"}
    };
}
function group(name: string, children: CompiledCobolEntry[]): CompiledCobolEntry {
    return {
        kind: "group", size: 32, leftOffset: 0, rightOffset: 0,
        source: {kind: "group", level: 5, name: {kind: "named", name},
            clauses: [], line: 1, children: []},
        children
    };
}

test("indexes nested declarations once without changing their node identities", () => {
    const name = elementary("NAME", 8);
    const details = group("DETAILS", [
        {kind: "padding", size: 8, leftOffset: 0, rightOffset: 0},
        name
    ]);
    const record = group("RECORD", [elementary("ID"), details]);
    const index = createCobolNameIndex([record]);
    expect([...index.keys()]).toEqual(["RECORD"]);
    expect([...index.get("RECORD")!.children.keys()]).toEqual(["ID", "DETAILS"]);
    expect(index.get("RECORD")!.children.get("DETAILS")!.children.get("NAME")!.node)
        .toBe(name);
});

test("REDEFINES alternatives remain separately accessible", () => {
    const first = elementary("FIELD");
    const alternate = elementary("FIELD-ALT");
    const index = createCobolNameIndex([group("RECORD", [first, alternate])]);
    const children = index.get("RECORD")!.children;
    expect(children.get("FIELD")!.node).toBe(first);
    expect(children.get("FIELD-ALT")!.node).toBe(alternate);
});

test("rejects duplicate names rather than silently overwriting a node", () => {
    const record = group("RECORD", [elementary("NAME"), elementary("name")]);
    expect(() => createCobolNameIndex([record])).toThrow(/Ambiguous COBOL name 'NAME'/);
});

test("omits generated padding from the index", () => {
    const index = createCobolNameIndex([group("RECORD", [
        elementary("A"),
        {kind: "padding", size: 8, leftOffset: 8, rightOffset: 0},
        elementary("B", 16)
    ])]);
    expect([...index.get("RECORD")!.children.keys()]).toEqual(["A", "B"]);
});
