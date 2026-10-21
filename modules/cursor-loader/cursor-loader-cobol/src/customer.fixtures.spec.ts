import {createCobolNameIndex, findCobolName, type CobolNameIndex, type NamedCobolEntry} from "./cobol.layout.index";
import {customerFixtures, customerSimple, customerNested, customerAligned,
    customerFixedOccurs, customerOdoRedefines, customerHexBytes,
    type CustomerFixture} from "./customer.fixtures";
import {valueOrThrow} from "@cobol-ts/errors";
import {evaluateStorageSize} from "@cobol-ts/size";
import {locateCobolEntry} from "@cobol-ts/layout";

// These are actual parsed-and-compiled layouts, not hand-constructed nodes.
const indexOf = (fixture: CustomerFixture): CobolNameIndex =>
    valueOrThrow(createCobolNameIndex(fixture.layout));

const lookup = (index: CobolNameIndex, ...path: string[]): NamedCobolEntry | undefined => {
    let scope = index;
    let selected: NamedCobolEntry | undefined;
    for (const component of path) {
        selected = findCobolName(scope, component);
        if (!selected) return undefined;
        scope = selected.children;
    }
    return selected;
};

describe("customer fixture integrity", () => {
    test("has five actual copybooks, compiled through parseCopybook and compileCobolLayout", () => {
        expect(customerFixtures.map(f => f.label)).toEqual([
            "customer-simple", "customer-nested", "customer-aligned",
            "customer-fixed-occurs", "customer-odo-redefines"
        ]);
        for (const fixture of customerFixtures) {
            expect(fixture.copybook).toContain("01 CUSTOMER.");
            expect(fixture.ast.entries).toHaveLength(1);
            expect(fixture.layout).toHaveLength(1);
            expect(fixture.records).toHaveLength(2);
        }
    });

    test("hand-authored field ranges agree with the production indexed locator", () => {
        for (const fixture of customerFixtures) {
            for (const record of fixture.records) {
                const resolveCount = (path: readonly (string | number)[]) => {
                    if (record.itemCount === undefined) {
                        throw new Error(`Unexpected ODO lookup in ${fixture.label}`);
                    }
                    expect(path).toEqual(["CUSTOMER", "ITEM-COUNT"]);
                    return record.itemCount;
                };
                for (const expected of record.slices) {
                    const actual = valueOrThrow(locateCobolEntry(
                        fixture.layout, expected.path, resolveCount
                    ));
                    expect(actual.offsetBits).toBe(expected.from * 8);
                    expect(actual.sizeBits).toBe((expected.to - expected.from) * 8);
                    // The index navigates declarations, not occurrence instances.
                    const names = expected.path.filter((part): part is string => typeof part === "string");
                    expect(lookup(indexOf(fixture), ...names)!.node).toBe(actual.node);
                }
            }
        }
    });

    test("compiled total physical extent matches both records' independent lengths", () => {
        for (const fixture of customerFixtures) {
            for (const record of fixture.records) {
                const totalBits = evaluateStorageSize(fixture.layout[0].size, path => {
                    expect(path).toEqual(["CUSTOMER", "ITEM-COUNT"]);
                    if (record.itemCount === undefined) throw new Error("Unexpected ODO");
                    return record.itemCount;
                });
                expect(totalBits).toBe(record.length * 8);
            }
        }
    });

    test("raw data and independent byte oracles are internally consistent", () => {
        for (const fixture of customerFixtures) {
            for (const record of fixture.records) {
                expect(record.bytes.length).toBe(record.length);
                for (const slice of record.slices) {
                    expect(slice.from >= 0).toBe(true);
                    expect(slice.to <= record.length).toBe(true);
                    const actual = record.bytes.slice(slice.from, slice.to);
                    expect([...actual]).toEqual([...customerHexBytes(slice.hex)]);
                }
            }
        }
    });
});

describe("createCobolNameIndex against real customer fixtures — initial TDD", () => {
    test("simple customer: indexes the named fields without changing their compiled nodes", () => {
        const fields = lookup(indexOf(customerSimple), "customer")!.children;
        expect([...fields.keys()]).toEqual(["CUSTOMER-ID", "CUSTOMER-NAME", "STATUS"]);
        const root = customerSimple.layout[0];
        if (root.kind !== "group") throw new Error("Expected compiled CUSTOMER group");
        expect(findCobolName(fields, "customer-name")!.node).toBe(root.children[1]);
        expect(customerSimple.records.map(r => r.bytes.length)).toEqual([15, 15]);
    });

    test("nested customer: retains group scope and hides FILLER", () => {
        const fields = lookup(indexOf(customerNested), "CUSTOMER")!.children;
        expect([...fields.keys()]).toEqual(["CUSTOMER-ID", "CONTACT", "STATUS"]);
        expect([...lookup(fields, "CONTACT")!.children.keys()]).toEqual(["FIRST-NAME", "LAST-NAME"]);
        expect(lookup(fields, "FILLER")).toBeUndefined();
        expect(lookup(fields, "FIRST-NAME")).toBeUndefined(); // not flattened
    });

    test("aligned customer: generated padding changes layout, never appears in the name index", () => {
        const root = customerAligned.layout[0];
        if (root.kind !== "group") throw new Error("Expected compiled CUSTOMER group");
        expect(root.children.some(node => node.kind === "padding")).toBe(true);
        expect([...lookup(indexOf(customerAligned), "CUSTOMER")!.children.keys()])
            .toEqual(["CUSTOMER-ID", "BALANCE", "STATUS"]);
    });

    test("fixed OCCURS customer: one indexed declaration contains both REDEFINES alternatives", () => {
        const fields = lookup(indexOf(customerFixedOccurs), "CUSTOMER", "TELEPHONES")!.children;
        expect([...fields.keys()]).toEqual(["PHONE-RAW", "PHONE-PARTS"]);
        expect([...lookup(fields, "PHONE-PARTS")!.children.keys()])
            .toEqual(["PHONE-KIND", "PHONE-NUMBER"]);
        // Two physical occurrences, but only one declaration node in the index.
        expect(customerFixedOccurs.records.map(r => r.bytes.length)).toEqual([17, 17]);
    });

    test("ODO customer: index is record-independent even when record lengths differ", () => {
        const index = indexOf(customerOdoRedefines);
        const fields = lookup(index, "CUSTOMER")!.children;
        expect([...fields.keys()]).toEqual([
            "ITEM-COUNT", "CUSTOMER-ID", "CUSTOMER-NAME", "PURCHASES", "STATUS"
        ]);
        expect([...lookup(fields, "PURCHASES")!.children.keys()])
            .toEqual(["PURCHASE-RAW", "PURCHASE-PARTS"]);
        expect(customerOdoRedefines.records.map(r => r.bytes.length)).toEqual([14, 23]);

        const root = customerOdoRedefines.layout[0];
        expect(evaluateStorageSize(root.size, path => {
            expect(path).toEqual(["CUSTOMER", "ITEM-COUNT"]);
            return 0;
        })).toBe(14 * 8);
        expect(evaluateStorageSize(root.size, () => 3)).toBe(23 * 8);
    });
});
