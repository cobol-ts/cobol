import {type CopybookClause, type ElementaryEntry, type GroupEntry} from "@cobol-ts/copybook";
import {errorsOrThrow, valueOrThrow} from "@cobol-ts/errors";
import {compileCobolLayout} from "./cobol.layout";
import {locateCobolEntry} from "./cobol.layout.location";

const named = (name: string) => ({kind: "named" as const, name});
const field = (name: string, picture = "X", clauses: CopybookClause[] = [], level = 5): ElementaryEntry =>
    ({kind: "elementary", name: named(name), level, picture, clauses, conditions: [], line: 3});
const group = (name: string, children: (ElementaryEntry | GroupEntry)[], clauses: CopybookClause[] = [], level = 5): GroupEntry =>
    ({kind: "group", name: named(name), children, clauses, level, line: 3});
const record = (...children: (ElementaryEntry | GroupEntry)[]) => group("RECORD", children, [], 1);
const odo = (name: string, max = 4): CopybookClause => ({kind: "occurs", dependingOn: name, min: 0, max});
const fixed = (count: number): CopybookClause => ({kind: "occurs", count});
const roots = () => valueOrThrow(compileCobolLayout({metadata: {}, entries: [record(
    field("OUTER-COUNT", "9"),
    field("INNER-COUNT", "9"),
    group("OUTER", [
        group("INNER", [field("CODE", "X(2)", [], 15)], [odo("INNER-COUNT")], 10),
        field("TRAILER", "X", [], 10)
    ], [odo("OUTER-COUNT", 3)]),
    field("FINAL")
)]}, "location-ibm.cpy"));
const counts = (outer: number, inner: number) => (path: readonly (string | number)[]) => {
    if (path.join(".") === "RECORD.OUTER-COUNT") return outer;
    if (path.join(".") === "RECORD.INNER-COUNT") return inner;
    throw new Error(`Unexpected controller path ${path.join(".")}`);
};
const locate = (path: readonly (string | number)[], outer = 2, inner = 3) =>
    valueOrThrow(locateCobolEntry(roots(), path, counts(outer, inner)));

describe("locateCobolEntry: IBM-legal nested ODO", () => {
    test("locates a selected field in the second inner table of the second outer occurrence", () => {
        const at = locate(["RECORD", "OUTER", 1, "INNER", 1, "CODE"]);
        expect(at.offsetBits).toBe(88); // controllers 16 + prior OUTER 56 + prior INNER 16
        expect(at.sizeBits).toBe(16);
        expect(locate(["RECORD", "OUTER", 1, "TRAILER"]).offsetBits).toBe(120);
        expect(locate(["RECORD", "FINAL"]).offsetBits).toBe(128);
    });

    test("locates different nested occurrences without materialising the table", () => {
        expect(locate(["RECORD", "OUTER", 0, "INNER", 0, "CODE"], 3, 4).offsetBits).toBe(16);
        expect(locate(["RECORD", "OUTER", 2, "INNER", 3, "CODE"], 3, 4).offsetBits).toBe(208);
    });

    test("uses zero active occurrences without corrupting the fixed prefix", () => {
        expect(locate(["RECORD", "FINAL"], 0, 4).offsetBits).toBe(16);
        expect(locate(["RECORD", "FINAL"], 2, 0).offsetBits).toBe(32);
        expect(errorsOrThrow(locateCobolEntry(roots(),
            ["RECORD", "OUTER", 0, "INNER", 0, "CODE"], counts(0, 3)))[0]).toContain("out of range");
    });

    test("rejects an invalid inner index and an invalid outer index", () => {
        expect(errorsOrThrow(locateCobolEntry(roots(),
            ["RECORD", "OUTER", 1, "INNER", 3, "CODE"], counts(2, 3)))[0]).toContain("out of range");
        expect(errorsOrThrow(locateCobolEntry(roots(),
            ["RECORD", "OUTER", 2, "INNER", 0, "CODE"], counts(2, 3)))[0]).toContain("out of range");
    });

    test("rejects out-of-bounds ODO counts on field lookup", () => {
        expect(errorsOrThrow(locateCobolEntry(roots(),
            ["RECORD", "FINAL"], counts(4, 3)))[0]).toContain("bounds");
        expect(errorsOrThrow(locateCobolEntry(roots(),
            ["RECORD", "OUTER", 0, "INNER", 0, "CODE"], counts(1, 5)))[0]).toContain("bounds");
    });

    test("provides correct byte coordinates for a byte-backed cursor", () => {
        const location = locate(["RECORD", "OUTER", 1, "INNER", 1, "CODE"]);
        const bytes = new Uint8Array(20);
        bytes.set([65, 66], location.offsetBits / 8);
        expect([...bytes.slice(location.offsetBits / 8,
            (location.offsetBits + location.sizeBits) / 8)]).toEqual([65, 66]);
    });

    test("keeps elementary and group fixed OCCURS location support", () => {
        const base = valueOrThrow(compileCobolLayout({metadata: {}, entries: [record(
            field("BYTES", "X(2)", [fixed(3)]),
            group("ONE", [field("VALUE", "X", [], 10)], [fixed(1)]),
            field("END")
        )]}, "fixed.cpy"));
        const read = () => 0;
        expect(valueOrThrow(locateCobolEntry(base, ["RECORD", "BYTES", 2], read)).offsetBits).toBe(32);
        expect(valueOrThrow(locateCobolEntry(base, ["RECORD", "ONE", 0, "VALUE"], read)).offsetBits).toBe(48);
        expect(valueOrThrow(locateCobolEntry(base, ["RECORD", "END"], read)).offsetBits).toBe(56);
    });

    test("retains REDEFINES shared-start physical location", () => {
        const base = valueOrThrow(compileCobolLayout({metadata: {}, entries: [record(
            field("ORIGINAL", "X(3)"),
            field("ALTERNATIVE", "X", [{kind: "redefines", target: "ORIGINAL"}]),
            field("AFTER")
        )]}, "fixed.cpy"));
        expect(valueOrThrow(locateCobolEntry(base, ["RECORD", "ORIGINAL"], () => 0)).offsetBits).toBe(0);
        expect(valueOrThrow(locateCobolEntry(base, ["RECORD", "ALTERNATIVE"], () => 0)).offsetBits).toBe(0);
        expect(valueOrThrow(locateCobolEntry(base, ["RECORD", "AFTER"], () => 0)).offsetBits).toBe(24);
    });
});
