import {
    type CopybookClause, type ElementaryEntry, type GroupEntry, parseCopybook
} from "@cobol-ts/copybook";
import {errorsOrThrow, valueOrThrow} from "@cobol-ts/errors";
import {evaluateStorageSize} from "@cobol-ts/size";
import {compileCobolLayout} from "./cobol.layout";
import {locateCobolEntry} from "./cobol.layout.location";

const named = (name: string) => ({kind: "named" as const, name});
const odo = (dependingOn: string, min = 0, max = 5): CopybookClause =>
    ({kind: "occurs", min, max, dependingOn});
const fixed = (count: number): CopybookClause => ({kind: "occurs", count});
const field = (name: string, picture = "X", clauses: CopybookClause[] = [], level = 10): ElementaryEntry =>
    ({kind: "elementary", name: named(name), level, picture, clauses, conditions: [], line: 4});
const group = (name: string, children: (ElementaryEntry | GroupEntry)[],
               clauses: CopybookClause[] = [], level = 5): GroupEntry =>
    ({kind: "group", name: named(name), level, children, clauses, line: 3});
const record = (...children: (ElementaryEntry | GroupEntry)[]): GroupEntry =>
    group("RECORD", children, [], 1);
const compile = (root: GroupEntry) => valueOrThrow(
    compileCobolLayout({metadata: {}, entries: [root]}, "location.cpy")
);
const countsFor = (counts: readonly number[]) => (path: readonly (string | number)[]) => {
    if (path.length !== 4 || path[0] !== "RECORD" || path[1] !== "GROUPS" ||
        typeof path[2] !== "number" || path[3] !== "ITEM-COUNT")
        throw new Error(`Unexpected path ${JSON.stringify(path)}`);
    return counts[path[2]];
};
const example = () => compile(record(
    group("GROUPS", [
        field("ITEM-COUNT", "9"),
        group("ITEMS", [field("CODE", "X(2)", [], 15)], [odo("ITEM-COUNT")], 10),
        field("TRAILER")
    ], [fixed(3)]),
    field("FINAL")
));

describe("locateCobolEntry: nested ODO with concrete occurrence indices", () => {
    // 01 RECORD.
    //    05 GROUPS OCCURS 3 TIMES.
    //       10 ITEM-COUNT PIC 9.
    //       10 ITEMS OCCURS 0 TO 5 TIMES DEPENDING ON ITEM-COUNT.
    //          15 CODE PIC X(2).
    //       10 TRAILER PIC X.
    //    05 FINAL PIC X.
    test("locates the second CODE in the second GROUPS occurrence", () => {
        const roots = example();
        const locate = (path: readonly (string | number)[]) => valueOrThrow(
            locateCobolEntry(roots, path, countsFor([1, 3, 2]))
        );
        const second = locate(["RECORD", "GROUPS", 1, "ITEMS", 1, "CODE"]);
        expect(second.offsetBits).toBe(56); // first GROUPS: 32; count: 8; prior CODE: 16
        expect(second.sizeBits).toBe(16);
        expect(second.node.kind).toBe("elementary");
        expect(locate(["RECORD", "GROUPS", 2, "ITEMS", 1, "CODE"]).offsetBits).toBe(120);
        expect(locate(["RECORD", "FINAL"]).offsetBits).toBe(144);
    });

    test("provides byte-backed coordinates for a selected occurrence", () => {
        const roots = example();
        const location = valueOrThrow(locateCobolEntry(roots,
            ["RECORD", "GROUPS", 1, "ITEMS", 1, "CODE"], countsFor([1, 3, 2])));
        // The layout layer returns bit coordinates; byte-backed cursors use
        // them without allocating repeated objects or decoding other fields.
        const bytes = new Uint8Array(19);
        bytes.set([65, 66], 7);
        expect(location.offsetBits % 8).toBe(0);
        expect(location.sizeBits % 8).toBe(0);
        expect([...bytes.subarray(location.offsetBits / 8,
            (location.offsetBits + location.sizeBits) / 8)]).toEqual([65, 66]);
    });

    test("the nested child's relative left and right offsets evaluate with its enclosing index", () => {
        const roots = example();
        const recordNode = roots[0];
        if (recordNode.kind !== "group") throw new Error("Expected record");
        const groups = recordNode.children[0];
        if (groups.kind !== "group") throw new Error("Expected repeated group");
        const items = groups.children[1];
        expect(evaluateStorageSize(items.leftOffset, countsFor([1, 3, 2]), [1])).toBe(8);
        expect(evaluateStorageSize(groups.children[0].rightOffset, countsFor([1, 3, 2]), [1])).toBe(56);
        expect(evaluateStorageSize(items.size, countsFor([1, 3, 2]), [1])).toBe(48);
    });

    test("sums different preceding occurrence extents, rather than multiplying the selected stride", () => {
        const roots = example();
        const left = valueOrThrow(locateCobolEntry(roots,
            ["RECORD", "GROUPS", 2, "ITEM-COUNT"], countsFor([1, 3, 2])));
        expect(left.offsetBits).toBe(96); // 32 + 64; not 2 * 48
        expect(left.sizeBits).toBe(8);
    });

    test("rejects an ODO occurrence past the actual count for its enclosing index", () => {
        const roots = example();
        const result = locateCobolEntry(roots, ["RECORD", "GROUPS", 0, "ITEMS", 1, "CODE"], countsFor([1, 3, 2]));
        expect(errorsOrThrow(result)[0]).toContain("out of range");
        expect(valueOrThrow(locateCobolEntry(roots,
            ["RECORD", "GROUPS", 2, "ITEMS", 1, "CODE"], countsFor([1, 3, 2]))).offsetBits).toBe(120);
    });

    test("rejects missing indices, invalid fixed indices and unknown fields", () => {
        const roots = example();
        const resolve = countsFor([1, 3, 2]);
        expect(errorsOrThrow(locateCobolEntry(roots,
            ["RECORD", "GROUPS", "ITEMS", 0, "CODE"], resolve))[0]).toContain("index");
        expect(errorsOrThrow(locateCobolEntry(roots,
            ["RECORD", "GROUPS", 3, "TRAILER"], resolve))[0]).toContain("out of range");
        expect(errorsOrThrow(locateCobolEntry(roots,
            ["RECORD", "UNKNOWN"], resolve))[0]).toContain("Unknown");
        expect(errorsOrThrow(locateCobolEntry(roots,
            ["RECORD", "GROUPS", -1, "TRAILER"], resolve))[0]).toContain("index");
    });

    test("handles an empty dependent table", () => {
        const roots = example();
        expect(errorsOrThrow(locateCobolEntry(roots,
            ["RECORD", "GROUPS", 0, "ITEMS", 0, "CODE"], countsFor([0, 2, 0])))[0]).toContain("out of range");
        expect(valueOrThrow(locateCobolEntry(roots,
            ["RECORD", "GROUPS", 1, "ITEMS", 1, "CODE"], countsFor([0, 2, 0]))).offsetBits).toBe(40);
    });

    test("rejects counts outside declared ODO bounds", () => {
        const roots = example();
        expect(errorsOrThrow(locateCobolEntry(roots,
            ["RECORD", "GROUPS", 1, "ITEMS", 0], countsFor([1, 6, 2])))[0]).toContain("bounds");
    });

    test("locates an elementary fixed OCCURS and explicit OCCURS 1", () => {
        const roots = compile(record(
            field("BYTES", "X(2)", [fixed(3)], 5),
            group("ONE", [field("VALUE", "X", [], 10)], [fixed(1)], 5),
            field("END", "X", [], 5)
        ));
        const resolve = () => {throw new Error("No dependent counts");};
        expect(valueOrThrow(locateCobolEntry(roots,
            ["RECORD", "BYTES", 2], resolve)).offsetBits).toBe(32);
        expect(valueOrThrow(locateCobolEntry(roots,
            ["RECORD", "BYTES", 2], resolve)).sizeBits).toBe(16);
        expect(valueOrThrow(locateCobolEntry(roots,
            ["RECORD", "ONE", 0, "VALUE"], resolve)).offsetBits).toBe(48);
        expect(valueOrThrow(locateCobolEntry(roots,
            ["RECORD", "END"], resolve)).offsetBits).toBe(56);
    });

    test("locates nested fixed OCCURS with per-occurrence ODO controls", () => {
        // 01 RECORD.
        //    05 OUTER OCCURS 2 TIMES.
        //       10 INNER OCCURS 2 TIMES.
        //          15 ITEM-COUNT PIC 9.
        //          15 ITEMS OCCURS 0 TO 5 DEPENDING ON ITEM-COUNT.
        //             20 CODE PIC X.
        //       10 OUTER-TRAILER PIC X.
        const roots = compile(record(
            group("OUTER", [
                group("INNER", [
                    field("ITEM-COUNT", "9", [], 15),
                    group("ITEMS", [field("CODE", "X", [], 20)], [odo("ITEM-COUNT")], 15)
                ], [fixed(2)], 10),
                field("OUTER-TRAILER", "X", [], 10)
            ], [fixed(2)])
        ));
        const counts = [[0, 1], [2, 3]];
        const resolve = (path: readonly (string | number)[]) =>
            counts[path[2] as number][path[4] as number];
        const result = valueOrThrow(locateCobolEntry(roots,
            ["RECORD", "OUTER", 1, "INNER", 1, "ITEMS", 2, "CODE"], resolve));
        expect(result.offsetBits).toBe(80);
        expect(result.sizeBits).toBe(8);
    });

    test("returns one selected occurrence's size, not its entire repetition extent", () => {
        const roots = example();
        const resolve = countsFor([1, 3, 2]);
        const groupOccurrence = valueOrThrow(locateCobolEntry(roots,
            ["RECORD", "GROUPS", 1], resolve));
        const itemOccurrence = valueOrThrow(locateCobolEntry(roots,
            ["RECORD", "GROUPS", 1, "ITEMS", 2], resolve));
        expect(groupOccurrence.offsetBits).toBe(32);
        expect(groupOccurrence.sizeBits).toBe(64);
        expect(itemOccurrence.offsetBits).toBe(72);
        expect(itemOccurrence.sizeBits).toBe(16);
    });

    test("REDEFINES alternatives are located at their shared physical start", () => {
        const roots = compile(record(
            field("ORIGINAL", "X(3)", [], 5),
            field("ALTERNATIVE", "X", [{kind: "redefines", target: "ORIGINAL"}], 5),
            field("AFTER", "X", [], 5)
        ));
        const resolve = () => {throw new Error("No dependent counts");};
        expect(valueOrThrow(locateCobolEntry(roots,
            ["RECORD", "ORIGINAL"], resolve)).offsetBits).toBe(0);
        expect(valueOrThrow(locateCobolEntry(roots,
            ["RECORD", "ALTERNATIVE"], resolve)).offsetBits).toBe(0);
        expect(valueOrThrow(locateCobolEntry(roots,
            ["RECORD", "AFTER"], resolve)).offsetBits).toBe(24);
    });

    test("evaluates symbolic alignment when navigating into a nested synchronized group", () => {
        const source = record(
            field("COUNT", "9", [], 5),
            field("VARIABLE", "X", [], 5),
            group("INNER", [field("ALIGNED", "9(4)", [
                {kind: "usage", usage: "COMP"}, {kind: "synchronized"}
            ], 10)], [], 5)
        );
        const roots = valueOrThrow(compileCobolLayout(
            {metadata: {}, entries: [source]}, "align-location.cpy",
            {primitiveSizer: (_, context) => ({value: context.path.at(-1) === "VARIABLE"
                        ? {kind: "depending-on", path: ["RECORD", "COUNT"], expression: 8}
                        : context.path.at(-1) === "ALIGNED" ? 16 : 8})}
        ));
        for (const [count, expected] of [[0, 16], [1, 16], [2, 32], [3, 32]]) {
            const location = valueOrThrow(locateCobolEntry(roots,
                ["RECORD", "INNER", "ALIGNED"], () => count));
            expect(location.offsetBits).toBe(expected);
            expect(location.sizeBits).toBe(16);
        }
    });

    test("locates a field after a symbolic ODO and nested group", () => {
        const roots = compile(record(
            group("BLOCK", [
                field("ITEM-COUNT", "9"),
                group("ITEMS", [field("CODE", "X", [], 15)], [odo("ITEM-COUNT")], 10),
                field("TRAILER")
            ]), field("FINAL")
        ));
        const resolve = () => 4;
        expect(valueOrThrow(locateCobolEntry(roots,
            ["RECORD", "BLOCK", "TRAILER"], resolve)).offsetBits).toBe(40);
        expect(valueOrThrow(locateCobolEntry(roots,
            ["RECORD", "FINAL"], resolve)).offsetBits).toBe(48);
    });

    test("works with an actual parsed copybook", () => {
        const parsed = valueOrThrow(parseCopybook([
            "01 RECORD.",
            "   05 GROUPS OCCURS 3 TIMES.",
            "      10 ITEM-COUNT PIC 9.",
            "      10 ITEMS OCCURS 0 TO 5 TIMES DEPENDING ON ITEM-COUNT.",
            "         15 CODE PIC X(2).",
            "      10 TRAILER PIC X.",
            "   05 FINAL PIC X."
        ].join("\n")));
        const roots = valueOrThrow(compileCobolLayout(parsed, "parsed.cpy"));
        const result = valueOrThrow(locateCobolEntry(roots,
            ["RECORD", "GROUPS", 1, "ITEMS", 1, "CODE"], countsFor([1, 3, 2])));
        expect(result.offsetBits).toBe(56);
        expect(result.sizeBits).toBe(16);
    });
});
