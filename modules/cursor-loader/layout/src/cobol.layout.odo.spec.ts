import {type CopybookAst, type CopybookClause, type ElementaryEntry, type GroupEntry, parseCopybook} from "@cobol-ts/copybook";
import {errorsOrThrow, valueOrThrow} from "@cobol-ts/errors";
import {evaluateStorageSize, type StorageSizeExpression} from "@cobol-ts/size";
import {compileCobolLayout, type CompiledCobolEntry, type CompiledCobolGroup} from "./cobol.layout";

const named = (name: string) => ({kind: "named" as const, name});
const odo = (dependingOn: string, min = 0, max = 3): CopybookClause =>
    ({kind: "occurs", min, max, dependingOn});
const field = (name: string, picture = "X", clauses: CopybookClause[] = [], level = 5): ElementaryEntry =>
    ({kind: "elementary", level, name: named(name), picture, clauses, conditions: [], line: 3});
const group = (name: string, children: (ElementaryEntry | GroupEntry)[],
               clauses: CopybookClause[] = [], level = 1): GroupEntry =>
    ({kind: "group", level, name: named(name), children, clauses, line: 2});
const record = (...children: (ElementaryEntry | GroupEntry)[]): GroupEntry => group("RECORD", children);
const compile = (root: GroupEntry) => compileCobolLayout({metadata: {}, entries: [root]}, "odo.cpy");
const asGroup = (node: CompiledCobolEntry): CompiledCobolGroup => {
    if (node.kind !== "group") throw new Error(`Expected compiled group, got ${node.kind}`);
    return node;
};
const at = (expression: StorageSizeExpression, count: number) =>
    evaluateStorageSize(expression, path => {
        expect(path).toEqual(["RECORD", "ITEM-COUNT"]);
        return count;
    });

// This suite deliberately covers only record-level (non-nested) ODO.
// Nested occurrence index bindings and dialect-specific physical allocation
// are separate increments, not guessed at here.
describe("compileCobolLayout: first OCCURS DEPENDING ON increment", () => {
    // 01 RECORD.
    //    05 ITEM-COUNT PIC 9.
    //    05 ITEMS OCCURS 0 TO 3 DEPENDING ON ITEM-COUNT.
    //       10 ITEM-CODE PIC X(2).
    //    05 TRAILER PIC X(3).
    test("constructs a symbolic table size and both parent-relative offsets", () => {
        const root = asGroup(valueOrThrow(compile(record(
            field("ITEM-COUNT", "9"),
            group("ITEMS", [field("ITEM-CODE", "X(2)", [], 10)], [odo("ITEM-COUNT")], 5),
            field("TRAILER", "X(3)")
        )))[0]);
        const [count, items, trailer] = root.children;
        const table = asGroup(items);
        expect(table.size).toEqual({
            kind: "depending-on", path: ["RECORD", "ITEM-COUNT"], expression: 16, min: 0, max: 3
        });
        expect(table.leftOffset).toBe(8);
        expect(table.rightOffset).toBe(24);
        expect(table.children.length).toBe(1);
        expect(table.children[0].size).toBe(16);
        expect(table.children[0].leftOffset).toBe(0);
        expect(table.children[0].rightOffset).toBe(0);
        for (const n of [0, 1, 3]) {
            expect(at(root.size, n)).toBe(32 + 16 * n);
            expect(at(count.rightOffset, n)).toBe(24 + 16 * n);
            expect(at(trailer.leftOffset, n)).toBe(8 + 16 * n);
            expect(at(trailer.rightOffset, n)).toBe(0);
        }
    });

    // 01 RECORD.
    //    05 ITEM-COUNT PIC 9.
    //    05 ITEMS PIC X(2) OCCURS 0 TO 3 DEPENDING ON item-count.
    //    05 TRAILER PIC X.
    test("supports elementary ODO and case-insensitive controller resolution", () => {
        const root = asGroup(valueOrThrow(compile(record(
            field("ITEM-COUNT", "9"),
            field("ITEMS", "X(2)", [odo("item-count")]),
            field("TRAILER")
        )))[0]);
        expect(root.children[1].size).toEqual({
            kind: "depending-on", path: ["RECORD", "ITEM-COUNT"], expression: 16, min: 0, max: 3
        });
        for (const n of [0, 1, 3]) {
            expect(at(root.size, n)).toBe(16 + 16 * n);
            expect(at(root.children[2].leftOffset, n)).toBe(8 + 16 * n);
        }
    });

    // 01 RECORD.
    //    05 ITEM-COUNT PIC 9.
    //    05 ITEMS OCCURS 0 TO 3 DEPENDING ON ITEM-COUNT.
    //       10 FIRST PIC X.
    //       10 SECOND PIC 9(4) COMP SYNCHRONIZED.
    //    05 TRAILER PIC X.
    test("includes each occurrence's trailing alignment in the symbolic stride", () => {
        const root = asGroup(valueOrThrow(compile(record(
            field("ITEM-COUNT", "9"),
            group("ITEMS", [
                field("FIRST", "X", [], 10),
                field("SECOND", "9(4)", [
                    {kind: "usage", usage: "COMP"}, {kind: "synchronized"}
                ], 10)
            ], [odo("ITEM-COUNT")], 5),
            field("TRAILER")
        )))[0]);
        const items = asGroup(root.children[1]);
        expect(items.size).toEqual({
            kind: "depending-on", path: ["RECORD", "ITEM-COUNT"], expression: 32, min: 0, max: 3
        });
        // A single occurrence is 8 + 16 + 8 trailing padding, not 24.
        expect(items.children[items.children.length - 1].kind).toBe("padding");
        for (const n of [0, 1, 3]) {
            expect(at(root.size, n)).toBe(16 + 32 * n);
            expect(at(root.children[2].leftOffset, n)).toBe(8 + 32 * n);
        }
    });

    test("parses an actual copybook and compiles its ODO expression", () => {
        const source = [
            "01 RECORD.",
            "   05 ITEM-COUNT PIC 9.",
            "   05 ITEMS OCCURS 0 TO 3 TIMES DEPENDING ON ITEM-COUNT.",
            "      10 ITEM-CODE PIC X(2).",
            "   05 TRAILER PIC X(3)."
        ].join("\n");
        const parsed = valueOrThrow(parseCopybook(source));
        const root = asGroup(valueOrThrow(compileCobolLayout(parsed, "actual.cpy"))[0]);
        const items = asGroup(root.children[1]);
        expect(items.size).toEqual({
            kind: "depending-on", path: ["RECORD", "ITEM-COUNT"], expression: 16, min: 0, max: 3
        });
        for (const n of [0, 1, 3]) expect(at(root.size, n)).toBe(32 + 16 * n);
    });

    test("does not leak intermediate occurrence metadata into the public tree", () => {
        const root = asGroup(valueOrThrow(compile(record(
            field("ITEM-COUNT", "9"),
            group("ITEMS", [field("CODE", "X", [], 10)], [odo("ITEM-COUNT")], 5)
        )))[0]);
        const table = asGroup(root.children[1]);
        expect(Object.keys(table).sort()).toEqual([
            "children", "kind", "leftOffset", "rightOffset", "size", "source"
        ]);
        expect("count" in table).toBe(false);
    });

    test("supports ODO whose controlling field is nested within the same group", () => {
        const result = valueOrThrow(compile(record(group("NESTED", [
            field("ITEM-COUNT", "9", [], 10),
            group("ITEMS", [field("CODE", "X", [], 15)], [odo("ITEM-COUNT")], 10)
        ], [], 5))));
        const nested = asGroup(asGroup(result[0]).children[0]);
        expect(asGroup(nested.children[1]).size).toEqual({
            kind: "depending-on", path: ["RECORD", "NESTED", "ITEM-COUNT"], expression: 8, min: 0, max: 3
        });
    });

    test("rejects a missing controlling field with a diagnostic", () => {
        const result = compile(record(
            field("ITEM-COUNT", "9"),
            group("ITEMS", [field("VALUE")], [odo("NOT-THERE")], 5)
        ));
        expect(errorsOrThrow(result)[0]).toContain("NOT-THERE");
    });

    test("rejects an ambiguous controlling field", () => {
        const result = compile(record(
            field("ITEM-COUNT", "9"), field("ITEM-COUNT", "9"),
            group("ITEMS", [field("VALUE")], [odo("ITEM-COUNT")], 5)
        ));
        expect(errorsOrThrow(result)[0]).toContain("ambiguous");
    });

    test("rejects invalid ODO min/max bounds", () => {
        const result = compile(record(
            field("ITEM-COUNT", "9"),
            group("ITEMS", [field("VALUE")], [odo("ITEM-COUNT", 4, 3)], 5)
        ));
        expect(errorsOrThrow(result)[0]).toContain("bounds");
    });
});
