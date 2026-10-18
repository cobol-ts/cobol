import {
    type CopybookClause,
    type ElementaryEntry,
    type GroupEntry,
    parseCopybook
} from "@cobol-ts/copybook";
import {errorsOrThrow, valueOrThrow} from "@cobol-ts/errors";
import {evaluateStorageSize, type StorageSizeExpression} from "@cobol-ts/size";
import {
    compileCobolLayout,
    type CompiledCobolEntry,
    type CompiledCobolGroup
} from "./cobol.layout";
import {locateCobolEntry} from "./cobol.layout.location";

/**
 * Cross-feature IBM Enterprise COBOL 6.4 layout tests.
 *
 * Deliberately keep the expected bit positions independent of the compiler's
 * symbolic-expression construction. All arithmetic below is physical layout
 * arithmetic, rather than a second invocation of the compiler's algorithms.
 *
 * This suite checks active (sending/field-location) extents. It does not claim
 * to model COBOL's context-dependent maximum-length receiving-item rule.
 */
const named = (name: string) => ({kind: "named" as const, name});
const field = (
    name: string,
    picture = "X",
    clauses: CopybookClause[] = [],
    level = 5
): ElementaryEntry => ({
    kind: "elementary", name: named(name), level, picture,
    clauses, conditions: [], line: 7
});
const group = (
    name: string,
    children: (ElementaryEntry | GroupEntry)[],
    clauses: CopybookClause[] = [],
    level = 5
): GroupEntry => ({
    kind: "group", name: named(name), children, clauses, level, line: 6
});
const record = (...children: (ElementaryEntry | GroupEntry)[]) =>
    group("RECORD", children, [], 1);
const odo = (controller: string, max = 4, min = 0): CopybookClause =>
    ({kind: "occurs", dependingOn: controller, min, max});
const fixed = (count: number): CopybookClause => ({kind: "occurs", count});
const redefine = (target: string): CopybookClause => ({kind: "redefines", target});
const sync = (): CopybookClause[] => [
    {kind: "usage", usage: "COMP"}, {kind: "synchronized"}
];
const compile = (...entries: (ElementaryEntry | GroupEntry)[]) =>
    compileCobolLayout({metadata: {}, entries: [record(...entries)]}, "campaign.cpy");
const asGroup = (node: CompiledCobolEntry): CompiledCobolGroup => {
    if (node.kind !== "group") throw new Error("Expected compiled group");
    return node;
};
const rootOf = (...entries: (ElementaryEntry | GroupEntry)[]) =>
    asGroup(valueOrThrow(compile(...entries))[0]);
const namedChild = (parent: CompiledCobolGroup, name: string): CompiledCobolEntry => {
    const result = parent.children.find(item => item.kind !== "padding" &&
        item.source.name.kind === "named" && item.source.name.name === name);
    if (!result) throw new Error(`Missing compiled child ${name}`);
    return result;
};
const getCounts = (values: Record<string, number>) =>
    (path: readonly (string | number)[]): number => {
        const name = path.join(".");
        if (!(name in values)) throw new Error(`Unexpected ODO controller: ${name}`);
        return values[name];
    };
const singleCount = (n: number) => getCounts({"RECORD.COUNT": n});
const bits = (expr: StorageSizeExpression, counts: Record<string, number>): number =>
    evaluateStorageSize(expr, getCounts(counts));
const b = (expr: StorageSizeExpression, n: number): number =>
    evaluateStorageSize(expr, singleCount(n));
const location = (
    compiled: CompiledCobolGroup,
    path: readonly (string | number)[],
    counts: Record<string, number>
) => valueOrThrow(locateCobolEntry([compiled], path, getCounts(counts)));
const failsWith = (run: () => unknown, fragment: string) => {
    let actual = "";
    try { run(); } catch (error) { actual = String(error); }
    expect(actual).toContain(fragment);
};

// IBM: explicit REDEFINES is permitted for fixed entries, including entries
// adjacent to variable regions. We do NOT redefine an ODO subject itself.
describe("IBM 6.4 layout correctness campaign: ODO and fixed overlays", () => {
    // 01 RECORD.
    //   05 COUNT PIC 9.
    //   05 BASE PIC X.
    //   05 ALT REDEFINES BASE PIC X(3).
    //   05 ITEMS PIC X(2) OCCURS 0 TO 4 DEPENDING ON COUNT.
    //   05 END-MARK PIC X.
    test("fixed unequal overlay preceding ODO advances by maximum, not final alternative", () => {
        const top = rootOf(
            field("COUNT", "9"), field("BASE"),
            field("ALT", "X(3)", [redefine("BASE")]),
            field("ITEMS", "X(2)", [odo("COUNT")]), field("END-MARK")
        );
        const base = namedChild(top, "BASE");
        const alt = namedChild(top, "ALT");
        const items = namedChild(top, "ITEMS");
        const end = namedChild(top, "END-MARK");
        for (const n of [0, 1, 2, 4]) {
            expect(b(top.size, n)).toBe(40 + 16 * n);
            expect(b(items.leftOffset, n)).toBe(32);
            expect(b(base.leftOffset, n)).toBe(8);
            expect(b(alt.leftOffset, n)).toBe(8);
            expect(b(base.rightOffset, n)).toBe(24 + 16 * n);
            expect(b(alt.rightOffset, n)).toBe(8 + 16 * n);
            expect(b(end.leftOffset, n)).toBe(32 + 16 * n);
        }
    });

    // 05 ITEMS PIC X OCCURS 0 TO 4 DEPENDING ON COUNT.
    // 05 BASE PIC X(3).
    // 05 SHORT REDEFINES BASE PIC X.
    // 05 FINAL PIC X.
    test("fixed overlay following ODO moves symbolically with the preceding table", () => {
        const top = rootOf(
            field("COUNT", "9"), field("ITEMS", "X", [odo("COUNT")]),
            field("BASE", "X(3)"), field("SHORT", "X", [redefine("BASE")]),
            field("FINAL")
        );
        const base = namedChild(top, "BASE");
        const short = namedChild(top, "SHORT");
        for (const n of [0, 1, 4]) {
            expect(b(top.size, n)).toBe(40 + 8 * n);
            expect(b(base.leftOffset, n)).toBe(8 + 8 * n);
            expect(b(short.leftOffset, n)).toBe(8 + 8 * n);
            expect(b(base.rightOffset, n)).toBe(8);
            expect(b(short.rightOffset, n)).toBe(24);
            expect(location(top, ["RECORD", "FINAL"], {"RECORD.COUNT": n}).offsetBits)
                .toBe(32 + 8 * n);
        }
    });

    test("a chain of fixed overlays after ODO uses maximum alternative extent", () => {
        const top = rootOf(
            field("COUNT", "9"), field("ITEMS", "X", [odo("COUNT")]),
            field("A"), field("B", "X(4)", [redefine("A")]),
            field("C", "X(2)", [redefine("B")]), field("TAIL")
        );
        const a = namedChild(top, "A"), bNode = namedChild(top, "B"), c = namedChild(top, "C");
        for (const n of [0, 2, 4]) {
            expect(b(top.size, n)).toBe(48 + 8 * n);
            expect(b(a.leftOffset, n)).toBe(8 + 8 * n);
            expect(b(bNode.leftOffset, n)).toBe(8 + 8 * n);
            expect(b(c.leftOffset, n)).toBe(8 + 8 * n);
            expect(b(a.rightOffset, n)).toBe(32);
            expect(b(bNode.rightOffset, n)).toBe(8);
            expect(b(c.rightOffset, n)).toBe(24);
        }
    });

    // A fixed REDEFINES pair within one occurrence body is legal: neither
    // REDEFINES participant has its own OCCURS DEPENDING ON clause.
    test("fixed overlay inside an ODO occurrence contributes one maximum per active occurrence", () => {
        const top = rootOf(
            field("COUNT", "9"),
            group("ITEMS", [
                field("RAW", "X", [], 10),
                field("VIEW", "X(2)", [redefine("RAW")], 10),
                field("TAG", "X", [], 10)
            ], [odo("COUNT")]), field("END-MARK")
        );
        const items = asGroup(namedChild(top, "ITEMS"));
        const raw = namedChild(items, "RAW"), view = namedChild(items, "VIEW");
        const tag = namedChild(items, "TAG");
        for (const n of [0, 1, 3]) {
            expect(b(items.size, n)).toBe(24 * n);
            expect(b(top.size, n)).toBe(16 + 24 * n);
            expect(b(raw.leftOffset, n)).toBe(0);
            expect(b(view.leftOffset, n)).toBe(0);
            expect(b(raw.rightOffset, n)).toBe(16);
            expect(b(view.rightOffset, n)).toBe(8);
            expect(b(tag.leftOffset, n)).toBe(16);
            expect(location(top, ["RECORD", "END-MARK"], {"RECORD.COUNT": n}).offsetBits)
                .toBe(8 + 24 * n);
            if (n > 0) {
                expect(location(top, ["RECORD", "ITEMS", n - 1, "TAG"], {"RECORD.COUNT": n}).offsetBits)
                    .toBe(8 + (n - 1) * 24 + 16);
            }
        }
    });

    test("overlay in fixed repeated body remains independent of adjacent ODO", () => {
        const top = rootOf(
            field("COUNT", "9"),
            group("FRAMES", [
                field("HEAD", "X(2)", [], 10),
                field("HEAD-ALT", "X", [redefine("HEAD")], 10),
                field("END", "X", [], 10)
            ], [fixed(2)]),
            group("ITEMS", [field("VALUE", "X", [], 10)], [odo("COUNT")]),
            field("FINAL")
        );
        for (const n of [0, 1, 4]) {
            expect(b(top.size, n)).toBe(64 + 8 * n);
            expect(location(top, ["RECORD", "FRAMES", 1, "END"], {"RECORD.COUNT": n}).offsetBits)
                .toBe(8 + 24 + 16);
            expect(location(top, ["RECORD", "FINAL"], {"RECORD.COUNT": n}).offsetBits)
                .toBe(56 + 8 * n);
        }
    });
});

describe("IBM 6.4 layout correctness campaign: symbolic synchronization", () => {
    // 05 COUNT PIC 9.
    // 05 ITEMS PIC X OCCURS 0 TO 4 DEPENDING ON COUNT.
    // 05 ALIGNED PIC 9(4) COMP SYNCHRONIZED.
    test("alignment after ODO follows absolute left-origin parity, including count zero", () => {
        const top = rootOf(
            field("COUNT", "9"), field("ITEMS", "X", [odo("COUNT")]),
            field("ALIGNED", "9(4)", sync()), field("FINAL")
        );
        const aligned = namedChild(top, "ALIGNED");
        const padding = top.children.find(node => node.kind === "padding");
        if (!padding) throw new Error("Expected symbolic alignment padding");
        for (const n of [0, 1, 2, 3, 4]) {
            const start = 8 + 8 * n;
            const pad = (16 - start % 16) % 16;
            expect(b(padding.size, n)).toBe(pad);
            expect(b(aligned.leftOffset, n)).toBe(start + pad);
            expect(b(top.size, n)).toBe(start + pad + 16 + 8);
            expect(location(top, ["RECORD", "ALIGNED"], {"RECORD.COUNT": n}).offsetBits)
                .toBe(start + pad);
        }
    });

    test("nested group owns no duplicate first-field alignment padding", () => {
        const top = rootOf(
            field("COUNT", "9"), field("ITEMS", "X", [odo("COUNT")]),
            group("NESTED", [
                field("ALIGNED", "9(4)", sync(), 10),
                field("TAIL", "X", [], 10)
            ]), field("FINAL")
        );
        const nested = asGroup(namedChild(top, "NESTED"));
        expect(nested.children.filter(node => node.kind === "padding").length).toBe(0);
        expect(top.children.filter(node => node.kind === "padding").length).toBe(1);
        for (const n of [0, 1, 2, 3, 4]) {
            const position = 8 + n * 8;
            const pad = (16 - position % 16) % 16;
            expect(b(nested.leftOffset, n)).toBe(position + pad);
            expect(b(nested.size, n)).toBe(24);
            expect(b(nested.children[0].rightOffset, n)).toBe(8);
            expect(b(top.size, n)).toBe(position + pad + 24 + 8);
        }
    });

    // Each occurrence body is 8 + 8 padding + 16 = 32 bits.
    test("ODO group with internal SYNCHRONIZED field keeps a stable aligned stride", () => {
        const top = rootOf(
            field("COUNT", "9"),
            group("ITEMS", [
                field("FIRST", "X", [], 10),
                field("ALIGNED", "9(4)", sync(), 10)
            ], [odo("COUNT")]), field("FINAL")
        );
        const items = asGroup(namedChild(top, "ITEMS"));
        const aligned = namedChild(items, "ALIGNED");
        expect(items.children.filter(node => node.kind === "padding").length).toBe(1);
        for (const n of [0, 1, 4]) {
            expect(b(items.size, n)).toBe(32 * n);
            // ITEMS begins at record bit 8, so FIRST ends exactly on the
            // 16-bit boundary. The extra 8 bits are trailing stride padding.
            expect(b(aligned.leftOffset, n)).toBe(8);
            expect(b(top.size, n)).toBe(16 + 32 * n);
            if (n > 0) expect(location(top, ["RECORD", "ITEMS", n - 1, "ALIGNED"], {"RECORD.COUNT": n}).offsetBits)
                .toBe(8 + (n - 1) * 32 + 8);
        }
    });

    test("alignment following an inner ODO is recalculated within every fixed occurrence", () => {
        const top = rootOf(
            field("COUNT", "9"),
            group("FRAMES", [
                field("ITEMS", "X", [odo("COUNT")], 10),
                field("ALIGNED", "9(4)", sync(), 10)
            ], [fixed(3)]), field("FINAL")
        );
        // FRAMES starts at absolute bit 8. The internal padding therefore
        // aligns (8 + 8*n), not just the group-relative 8*n. Trailing
        // repetition padding restores the next frame to the same alignment.
        const framePad = (n: number) => (16 - (8 + 8 * n) % 16) % 16;
        const body = (n: number) => 8 * n + framePad(n) + 16;
        const frameSize = (n: number) => body(n) + (16 - body(n) % 16) % 16;
        for (const n of [0, 1, 2, 3, 4]) {
            expect(b(top.size, n)).toBe(16 + 3 * frameSize(n));
            expect(location(top, ["RECORD", "FRAMES", 2, "ALIGNED"], {"RECORD.COUNT": n}).offsetBits)
                .toBe(8 + 2 * frameSize(n) + 8 * n + framePad(n));
        }
    });
});

describe("IBM 6.4 layout correctness campaign: nested ODO extents and anchoring", () => {
    // Both controlling fields are fixed before either table; IBM forbids
    // a controlling field that is itself variably located or a table element.
    const structure = () => rootOf(
        field("OUTER-COUNT", "9"), field("INNER-COUNT", "9"),
        group("OUTER", [
            group("INNER", [field("CODE", "X(2)", [], 15)], [odo("INNER-COUNT", 4)], 10),
            field("TRAILER", "X", [], 10)
        ], [odo("OUTER-COUNT", 3)]),
        field("FINAL")
    );
    const counts = (outer: number, inner: number) => ({
        "RECORD.OUTER-COUNT": outer,
        "RECORD.INNER-COUNT": inner
    });

    test("outer count zero: inner controller need not be read and FINAL stays fixed", () => {
        const top = structure();
        const resolver = (path: readonly (string | number)[]) => {
            if (path.join(".") === "RECORD.OUTER-COUNT") return 0;
            throw new Error(`Inner count must not be read: ${path.join(".")}`);
        };
        expect(evaluateStorageSize(top.size, resolver)).toBe(24);
        expect(evaluateStorageSize(namedChild(top, "FINAL").leftOffset, resolver)).toBe(16);
        expect(valueOrThrow(locateCobolEntry([top], ["RECORD", "FINAL"], resolver)).offsetBits).toBe(16);
    });

    test("inner count zero, outer count nonzero: trailers still occupy every outer occurrence", () => {
        const top = structure();
        for (const outer of [1, 2, 3]) {
            expect(bits(top.size, counts(outer, 0))).toBe(24 + outer * 8);
            expect(location(top, ["RECORD", "OUTER", outer - 1, "TRAILER"], counts(outer, 0)).offsetBits)
                .toBe(16 + (outer - 1) * 8);
            expect(location(top, ["RECORD", "FINAL"], counts(outer, 0)).offsetBits)
                .toBe(16 + outer * 8);
        }
    });

    test("maximum counts: locate last nested item and trailing record field", () => {
        const top = structure();
        const c = counts(3, 4);
        expect(bits(top.size, c)).toBe(24 + 3 * (64 + 8));
        expect(location(top, ["RECORD", "OUTER", 2, "INNER", 3, "CODE"], c).offsetBits)
            .toBe(16 + 2 * 72 + 3 * 16);
        expect(location(top, ["RECORD", "FINAL"], c).offsetBits).toBe(16 + 3 * 72);
    });

    test("nested symbolic left/right offsets agree with physical suffix sizes", () => {
        const top = structure();
        const outer = asGroup(namedChild(top, "OUTER"));
        const inner = asGroup(namedChild(outer, "INNER"));
        const trailer = namedChild(outer, "TRAILER");
        const final = namedChild(top, "FINAL");
        for (const outerN of [0, 1, 3]) for (const innerN of [0, 2, 4]) {
            const c = counts(outerN, innerN);
            const outerOccurrenceBits = innerN * 16 + 8;
            expect(bits(inner.size, c)).toBe(innerN * 16);
            expect(bits(inner.rightOffset, c)).toBe(8);
            expect(bits(trailer.leftOffset, c)).toBe(innerN * 16);
            expect(bits(trailer.rightOffset, c)).toBe(0);
            expect(bits(outer.size, c)).toBe(outerN * outerOccurrenceBits);
            expect(bits(outer.rightOffset, c)).toBe(8);
            expect(bits(final.leftOffset, c)).toBe(16 + outerN * outerOccurrenceBits);
            expect(bits(final.rightOffset, c)).toBe(0);
            expect(bits(top.children[0].rightOffset, c)).toBe(8 + outerN * outerOccurrenceBits + 8);
        }
    });

    test("rejects out-of-range outer and inner runtime counts", () => {
        const top = structure();
        for (const n of [-1, 4]) {
            failsWith(() => bits(top.size, counts(n, 2)), n < 0 ? "Invalid" : "bounds");
            expect(errorsOrThrow(locateCobolEntry([top], ["RECORD", "FINAL"], getCounts(counts(n, 2))))[0])
                .toContain(n < 0 ? "Invalid" : "bounds");
        }
        for (const n of [-1, 5]) {
            failsWith(() => bits(top.size, counts(1, n)), n < 0 ? "Invalid" : "bounds");
            expect(errorsOrThrow(locateCobolEntry([top], ["RECORD", "OUTER", 0, "INNER", 0, "CODE"], getCounts(counts(1, n))))[0])
                .toContain(n < 0 ? "Invalid" : "bounds");
        }
    });

    test("rejects invalid nested occurrence indices even when the other level is in range", () => {
        const top = structure(), c = counts(2, 3);
        for (const path of [
            ["RECORD", "OUTER", 2, "INNER", 0, "CODE"],
            ["RECORD", "OUTER", 1, "INNER", 3, "CODE"],
            ["RECORD", "OUTER", 1, "INNER", -1, "CODE"]
        ]) {
            expect(errorsOrThrow(locateCobolEntry([top], path, getCounts(c)))[0])
                .toContain(path.includes(-1) ? "nonnegative" : "out of range");
        }
    });
});

describe("IBM 6.4 layout correctness campaign: parser integration and diagnostics", () => {
    test("parser-to-compiler-to-location: ODO followed by fixed overlay and trailer", () => {
        const source = [
            "01 RECORD.",
            "   05 COUNT PIC 9.",
            "   05 ITEMS PIC X OCCURS 0 TO 4 TIMES DEPENDING ON COUNT.",
            "   05 BASE PIC X(3).",
            "   05 SHORT REDEFINES BASE PIC X.",
            "   05 FINAL PIC X."
        ].join("\n");
        const top = asGroup(valueOrThrow(compileCobolLayout(
            valueOrThrow(parseCopybook(source)), "campaign-parser.cpy"
        ))[0]);
        for (const n of [0, 2, 4]) {
            expect(b(top.size, n)).toBe(40 + 8 * n);
            expect(location(top, ["RECORD", "FINAL"], {"RECORD.COUNT": n}).offsetBits)
                .toBe(32 + 8 * n);
        }
    });

    test("rejects a variably located controller after a nested ODO group", () => {
        const result = compile(
            field("COUNT", "9"),
            group("NEST", [field("ITEM", "X", [odo("COUNT")], 10)]),
            field("LATE-COUNT", "9"),
            group("SECOND", [field("VALUE", "X", [], 10)], [odo("LATE-COUNT")])
        );
        expect(errorsOrThrow(result)[0]).toContain("variably located");
    });

    test("rejects a controller declared inside fixed repetition", () => {
        const result = compile(group("FRAMES", [
            field("COUNT", "9", [], 10),
            group("ITEMS", [field("VALUE", "X", [], 15)], [odo("COUNT")], 10)
        ], [fixed(3)]));
        expect(errorsOrThrow(result)[0]).toContain("table element");
    });

    test("public compiled nodes remain closed geometry without intent markers", () => {
        const top = rootOf(
            field("COUNT", "9"),
            group("ITEMS", [field("VALUE", "X", [], 10)], [odo("COUNT")]),
            field("FINAL")
        );
        const serialized = JSON.stringify(top);
        expect(serialized.includes('"kind":"origin"')).toBe(false);
        expect(serialized.includes('"role"')).toBe(false);
        expect(serialized.includes('"count"')).toBe(false);
        const table = asGroup(namedChild(top, "ITEMS"));
        expect(Object.keys(table).sort()).toEqual([
            "children", "kind", "leftOffset", "rightOffset", "size", "source"
        ]);
    });
});
