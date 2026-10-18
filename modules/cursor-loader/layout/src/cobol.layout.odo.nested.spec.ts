import {type CopybookClause, type ElementaryEntry, type GroupEntry, parseCopybook} from "@cobol-ts/copybook";
import {errorsOrThrow, valueOrThrow} from "@cobol-ts/errors";
import {evaluateStorageSize} from "@cobol-ts/size";
import {compileCobolLayout, type CompiledCobolGroup} from "./cobol.layout";

const named = (name: string) => ({kind: "named" as const, name});
const field = (name: string, picture = "X", clauses: CopybookClause[] = [], level = 5): ElementaryEntry =>
    ({kind: "elementary", name: named(name), level, picture, clauses, conditions: [], line: 3});
const group = (name: string, children: (ElementaryEntry | GroupEntry)[], clauses: CopybookClause[] = [], level = 5): GroupEntry =>
    ({kind: "group", name: named(name), children, clauses, level, line: 3});
const record = (...children: (ElementaryEntry | GroupEntry)[]) => group("RECORD", children, [], 1);
const odo = (name: string, max = 3, min = 0): CopybookClause => ({kind: "occurs", dependingOn: name, min, max});
const fixed = (count: number): CopybookClause => ({kind: "occurs", count});
const compile = (root: GroupEntry) => compileCobolLayout({metadata: {}, entries: [root]}, "ibm-6.4.cpy");
const asGroup = (node: unknown): CompiledCobolGroup => {
    if (!node || typeof node !== "object" || !("kind" in node) || node.kind !== "group")
        throw new Error("Expected compiled group");
    return node as CompiledCobolGroup;
};

const legalNested = () => record(
    field("OUTER-COUNT", "9"),
    field("INNER-COUNT", "9"),
    group("OUTER", [
        group("INNER", [field("CODE", "X(2)", [], 15)], [odo("INNER-COUNT", 4)], 10),
        field("TRAILER", "X", [], 10)
    ], [odo("OUTER-COUNT", 3)]),
    field("FINAL", "X")
);
const resolve = (outer: number, inner: number) => (path: readonly (string | number)[]) => {
    if (JSON.stringify(path) === JSON.stringify(["RECORD", "OUTER-COUNT"])) return outer;
    if (JSON.stringify(path) === JSON.stringify(["RECORD", "INNER-COUNT"])) return inner;
    throw new Error(`Unexpected count path ${JSON.stringify(path)}`);
};

describe("IBM Enterprise COBOL 6.4: nested ODO", () => {
    // 01 RECORD.
    //    05 OUTER-COUNT PIC 9.
    //    05 INNER-COUNT PIC 9.
    //    05 OUTER OCCURS 0 TO 3 DEPENDING ON OUTER-COUNT.
    //       10 INNER OCCURS 0 TO 4 DEPENDING ON INNER-COUNT.
    //          15 CODE PIC X(2).
    //       10 TRAILER PIC X.
    //    05 FINAL PIC X.
    test("compiles a variable table inside another variable table with fixed-location controllers", () => {
        const top = asGroup(valueOrThrow(compile(legalNested()))[0]);
        const outer = asGroup(top.children[2]);
        const inner = asGroup(outer.children[0]);
        expect(outer.size).toEqual({kind: "depending-on", path: ["RECORD", "OUTER-COUNT"],
            min: 0, max: 3, expression: {kind: "sum", terms: [
                {kind: "depending-on", path: ["RECORD", "INNER-COUNT"], min: 0, max: 4, expression: 16}, 8
            ]}});
        expect(inner.size).toEqual({kind: "depending-on", path: ["RECORD", "INNER-COUNT"],
            min: 0, max: 4, expression: 16});
        expect(inner.rightOffset).toBe(8);
        expect(outer.rightOffset).toBe(8);
        for (const [n, m] of [[0, 0], [0, 3], [1, 0], [1, 2], [2, 3], [3, 4]]) {
            const get = resolve(n, m);
            expect(evaluateStorageSize(top.size, get)).toBe(24 + n * (8 + 16 * m));
            expect(evaluateStorageSize(top.children[3].leftOffset, get)).toBe(16 + n * (8 + 16 * m));
            expect(evaluateStorageSize(outer.children[1].leftOffset, get)).toBe(16 * m);
        }
    });

    test("parser-to-layout: IBM complex ODO with nested variable group", () => {
        const text = [
            "01 RECORD.",
            "   05 OUTER-COUNT PIC 9.",
            "   05 INNER-COUNT PIC 9.",
            "   05 OUTER OCCURS 0 TO 3 TIMES DEPENDING ON OUTER-COUNT.",
            "      10 INNER OCCURS 0 TO 4 TIMES DEPENDING ON INNER-COUNT.",
            "         15 CODE PIC X(2).",
            "      10 TRAILER PIC X.",
            "   05 FINAL PIC X."
        ].join("\n");
        const top = asGroup(valueOrThrow(compileCobolLayout(valueOrThrow(parseCopybook(text)), "ibm.cpy"))[0]);
        expect(evaluateStorageSize(top.size, resolve(2, 3))).toBe(136);
    });

    test("supports an ODO nested in an ordinary group with a fixed-location local controller", () => {
        const top = asGroup(valueOrThrow(compile(record(group("BLOCK", [
            field("COUNT", "9", [], 10),
            group("ITEMS", [field("CODE", "X", [], 15)], [odo("COUNT")], 10)
        ]))))[0]);
        expect(asGroup(asGroup(top.children[0]).children[1]).size).toEqual({
            kind: "depending-on", path: ["RECORD", "BLOCK", "COUNT"], min: 0, max: 3, expression: 8
        });
    });

    test("IBM variable-length elements inside a fixed OCCURS use a fixed-location object", () => {
        // IBM complex ODO also permits a fixed table containing an ODO table.
        // 01 RECORD.
        //    05 COUNT PIC 9.
        //    05 BLOCKS OCCURS 3 TIMES.
        //       10 HEADER PIC X.
        //       10 ITEMS OCCURS 0 TO 4 DEPENDING ON COUNT.
        //          15 CODE PIC X(2).
        //    05 END-MARK PIC X.
        const top = asGroup(valueOrThrow(compile(record(
            field("COUNT", "9"),
            group("BLOCKS", [
                field("HEADER", "X", [], 10),
                group("ITEMS", [field("CODE", "X(2)", [], 15)], [odo("COUNT", 4)], 10)
            ], [fixed(3)]),
            field("END-MARK")
        )))[0]);
        const blocks = asGroup(top.children[1]);
        const items = asGroup(blocks.children[1]);
        expect(items.size).toEqual({kind: "depending-on", path: ["RECORD", "COUNT"],
            min: 0, max: 4, expression: 16});
        for (const count of [0, 1, 4]) {
            expect(evaluateStorageSize(top.size, () => count)).toBe(16 + 3 * (8 + 16 * count));
            expect(evaluateStorageSize(top.children[2].leftOffset, () => count)).toBe(8 + 3 * (8 + 16 * count));
        }
    });

    test("an ODO object cannot occupy storage within its own table", () => {
        const layout = compile(record(
            group("ITEMS", [
                field("COUNT", "9", [], 10),
                field("CODE", "X", [], 10)
            ], [odo("COUNT")])
        ));
        expect(errorsOrThrow(layout)[0]).toContain("inside its own table");
    });

    test("collects independent illegal controller diagnostics", () => {
        const layout = compile(record(
            field("FIRST", "X"),
            field("SECOND", "9V9"),
            group("TABLE-A", [field("VALUE", "X", [], 10)], [odo("FIRST")]),
            group("TABLE-B", [field("VALUE", "X", [], 10)], [odo("SECOND")])
        ));
        const messages = errorsOrThrow(layout);
        expect(messages.length).toBe(2);
        expect(messages[0]).toContain("FIRST");
        expect(messages[1]).toContain("SECOND");
    });

    test("rejects a controller inside fixed OCCURS because it requires a subscript", () => {
        const layout = compile(record(group("GROUPS", [
            field("ITEM-COUNT", "9", [], 10),
            group("ITEMS", [field("CODE", "X", [], 15)], [odo("ITEM-COUNT")], 10)
        ], [fixed(3)])));
        expect(errorsOrThrow(layout)[0]).toContain("table element");
    });

    test("rejects a controller inside an outer ODO, even though the algebra can index it", () => {
        const layout = compile(record(
            field("OUTER-COUNT", "9"),
            group("OUTER", [
                field("INNER-COUNT", "9", [], 10),
                group("INNER", [field("CODE", "X", [], 15)], [odo("INNER-COUNT")], 10)
            ], [odo("OUTER-COUNT")])
        ));
        expect(errorsOrThrow(layout)[0]).toContain("table element");
    });

    test("rejects a controller physically following a variable-length table", () => {
        const layout = compile(record(
            field("OUTER-COUNT", "9"),
            group("OUTER", [field("CODE", "X", [], 10)], [odo("OUTER-COUNT")]),
            field("INNER-COUNT", "9"),
            group("INNER", [field("CODE", "X", [], 10)], [odo("INNER-COUNT")])
        ));
        expect(errorsOrThrow(layout)[0]).toContain("variably located");
    });

    test("rejects a controller following an enclosing group containing ODO", () => {
        const layout = compile(record(
            field("COUNT", "9"),
            group("BLOCK", [group("TABLE", [field("CODE", "X", [], 15)], [odo("COUNT")], 10)]),
            field("SECOND-COUNT", "9"),
            group("SECOND", [field("CODE", "X", [], 10)], [odo("SECOND-COUNT")])
        ));
        expect(errorsOrThrow(layout)[0]).toContain("variably located");
    });

    test("rejects a non-integer controlling PICTURE", () => {
        for (const picture of ["X", "9V99", "ZZ9"]) {
            const layout = compile(record(field("COUNT", picture),
                group("ITEMS", [field("CODE", "X", [], 10)], [odo("COUNT")])));
            expect(errorsOrThrow(layout)[0]).toContain("integer");
        }
    });

    test("accepts a signed integer controlling PICTURE", () => {
        const top = asGroup(valueOrThrow(compile(record(
            field("COUNT", "S9(3)"),
            group("ITEMS", [field("CODE", "X", [], 10)], [odo("COUNT")])
        )))[0]);
        expect(evaluateStorageSize(top.size, () => 2)).toBe(40);
    });

    test("enforces a nonzero declared minimum during symbolic evaluation", () => {
        const top = asGroup(valueOrThrow(compile(record(
            field("COUNT", "9"),
            group("ITEMS", [field("CODE", "X", [], 10)], [odo("COUNT", 4, 1)])
        )))[0]);
        let failure = "";
        try {evaluateStorageSize(top.size, () => 0);}
        catch (err) {failure = String(err);}
        expect(failure).toContain("bounds");
        expect(evaluateStorageSize(top.size, () => 1)).toBe(16);
    });

    test("evaluates declared ODO bounds at every access to symbolic size", () => {
        const top = asGroup(valueOrThrow(compile(legalNested()))[0]);
        for (const [n, m] of [[4, 1], [1, 5], [-1, 2]]) {
            let message = "";
            try {evaluateStorageSize(top.size, resolve(n, m));}
            catch (err) {message = String(err);}
            expect(message).toContain(n < 0 ? "Invalid OCCURS" : "bounds");
        }
    });
});
