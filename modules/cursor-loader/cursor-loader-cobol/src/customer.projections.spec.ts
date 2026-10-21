import {valueOrThrow} from "@cobol-ts/errors";
import {type CompiledCobolEntry} from "@cobol-ts/layout";
import {
    createCobolNameIndex, findCobolName,
    type CobolNameIndex, type NamedCobolEntry
} from "./cobol.layout.index";
import {
    customerSimple, customerNested, customerAligned,
    customerFixedOccurs, customerOdoRedefines,
    type CustomerFixture
} from "./customer.fixtures";

/**
 * This suite tests ONLY declaration-name resolution through the production
 * CobolNameIndex. It intentionally does not evaluate a size, compute an offset,
 * read a byte or resolve an OCCURS index.
 *
 * A path denotes a *declaration* in the copybook, not an individual occurrence.
 * Thus CUSTOMER.TELEPHONES.PHONE-PARTS.PHONE-NUMBER is meaningful even before
 * we decide how application projection paths will select TELEPHONES[0] or [1].
 */

// The index currently exposes single-segment findCobolName. This tiny adapter
// only follows its children; it is NOT a second physical locator or projection
// compiler. When we introduce a public full-path resolver, these cases should
// be pointed at that function unchanged.
function lookup(index: CobolNameIndex, path: readonly string[]): NamedCobolEntry | undefined {
    let scope = index;
    let found: NamedCobolEntry | undefined;
    for (const component of path) {
        found = findCobolName(scope, component);
        if (!found) return undefined;
        scope = found.children;
    }
    return found;
}

const indexed = (fixture: CustomerFixture): CobolNameIndex =>
    valueOrThrow(createCobolNameIndex(fixture.layout));

/**
 * Independent identity oracle: find the compiled node by its copybook source
 * line, *not* by its name or an index lookup. Explicit source lines in the
 * test table identify the intended declaration even in nested scopes.
 */
function nodeFromSourceLine(fixture: CustomerFixture, line: number): Exclude<CompiledCobolEntry, {kind: "padding"}> {
    const found: Exclude<CompiledCobolEntry, {kind: "padding"}>[] = [];
    const visit = (nodes: readonly CompiledCobolEntry[]) => {
        for (const node of nodes) {
            if (node.kind === "padding") continue;
            if (node.source.line === line) found.push(node);
            if (node.kind === "group") visit(node.children);
        }
    };
    visit(fixture.layout);
    expect(found).toHaveLength(1);
    return found[0];
}

type NamedCase = readonly [
    title: string,
    fixture: CustomerFixture,
    path: readonly string[],
    sourceLine: number,
    kind: "group" | "elementary"
];

/** Source lines and paths are literal expectations, not obtained from the index. */
const namedDeclarations: readonly NamedCase[] = [
    // Flat layout: every field and the root.
    ["simple / root", customerSimple, ["CUSTOMER"], 1, "group"],
    ["simple / id", customerSimple, ["CUSTOMER", "CUSTOMER-ID"], 2, "elementary"],
    ["simple / name", customerSimple, ["CUSTOMER", "CUSTOMER-NAME"], 3, "elementary"],
    ["simple / status", customerSimple, ["CUSTOMER", "STATUS"], 4, "elementary"],

    // Nested groups: CONTACT is a node in its own right; children are scoped.
    ["nested / root", customerNested, ["CUSTOMER"], 1, "group"],
    ["nested / id", customerNested, ["CUSTOMER", "CUSTOMER-ID"], 2, "elementary"],
    ["nested / contact group", customerNested, ["CUSTOMER", "CONTACT"], 3, "group"],
    ["nested / first name", customerNested, ["CUSTOMER", "CONTACT", "FIRST-NAME"], 4, "elementary"],
    ["nested / last name", customerNested, ["CUSTOMER", "CONTACT", "LAST-NAME"], 5, "elementary"],
    ["nested / status after FILLER", customerNested, ["CUSTOMER", "STATUS"], 7, "elementary"],

    // Padding exists in physical geometry, but not in the name hierarchy.
    ["aligned / root", customerAligned, ["CUSTOMER"], 1, "group"],
    ["aligned / id", customerAligned, ["CUSTOMER", "CUSTOMER-ID"], 2, "elementary"],
    ["aligned / balance after padding", customerAligned, ["CUSTOMER", "BALANCE"], 3, "elementary"],
    ["aligned / status", customerAligned, ["CUSTOMER", "STATUS"], 4, "elementary"],

    // Fixed OCCURS: resolve the declaration and each overlay alternative;
    // the name index does not expand the two physical occurrences.
    ["fixed OCCURS / root", customerFixedOccurs, ["CUSTOMER"], 1, "group"],
    ["fixed OCCURS / id", customerFixedOccurs, ["CUSTOMER", "CUSTOMER-ID"], 2, "elementary"],
    ["fixed OCCURS / telephones group", customerFixedOccurs, ["CUSTOMER", "TELEPHONES"], 3, "group"],
    ["fixed OCCURS / raw overlay", customerFixedOccurs, ["CUSTOMER", "TELEPHONES", "PHONE-RAW"], 4, "elementary"],
    ["fixed OCCURS / parts overlay", customerFixedOccurs, ["CUSTOMER", "TELEPHONES", "PHONE-PARTS"], 5, "group"],
    ["fixed OCCURS / kind", customerFixedOccurs, ["CUSTOMER", "TELEPHONES", "PHONE-PARTS", "PHONE-KIND"], 6, "elementary"],
    ["fixed OCCURS / number", customerFixedOccurs, ["CUSTOMER", "TELEPHONES", "PHONE-PARTS", "PHONE-NUMBER"], 7, "elementary"],
    ["fixed OCCURS / status after repetitions", customerFixedOccurs, ["CUSTOMER", "STATUS"], 8, "elementary"],

    // ODO: every declaration is still statically named. There is no reason
    // to retrieve ITEM-COUNT just to find the STATUS *declaration*.
    ["ODO / root", customerOdoRedefines, ["CUSTOMER"], 1, "group"],
    ["ODO / item count", customerOdoRedefines, ["CUSTOMER", "ITEM-COUNT"], 2, "elementary"],
    ["ODO / id", customerOdoRedefines, ["CUSTOMER", "CUSTOMER-ID"], 3, "elementary"],
    ["ODO / name", customerOdoRedefines, ["CUSTOMER", "CUSTOMER-NAME"], 4, "elementary"],
    ["ODO / purchases group", customerOdoRedefines, ["CUSTOMER", "PURCHASES"], 5, "group"],
    ["ODO / raw overlay", customerOdoRedefines, ["CUSTOMER", "PURCHASES", "PURCHASE-RAW"], 6, "elementary"],
    ["ODO / parts overlay", customerOdoRedefines, ["CUSTOMER", "PURCHASES", "PURCHASE-PARTS"], 7, "group"],
    ["ODO / SKU", customerOdoRedefines, ["CUSTOMER", "PURCHASES", "PURCHASE-PARTS", "SKU"], 8, "elementary"],
    ["ODO / quantity", customerOdoRedefines, ["CUSTOMER", "PURCHASES", "PURCHASE-PARTS", "QUANTITY"], 9, "elementary"],
    ["ODO / status after ODO", customerOdoRedefines, ["CUSTOMER", "STATUS"], 10, "elementary"]
];

describe("customer name index: each declared path resolves to the right compiled node", () => {
    test.each(namedDeclarations)("%s", (_title, fixture, path, sourceLine, kind) => {
        const resolved = lookup(indexed(fixture), path);
        expect(resolved).toBeDefined();
        expect(resolved!.node).toBe(nodeFromSourceLine(fixture, sourceLine));
        expect(resolved!.node.kind).toBe(kind);
        // An extra assertion makes mistakes in the manually recorded line
        // numbers obvious when editing a fixture copybook.
        const source = fixture.copybook.split("\n")[sourceLine - 1];
        expect(source).toBeDefined();
        expect(resolved!.node.source.line).toBe(sourceLine);
    });
});

/** Every application accessor points to a particular, hand-selected declaration. */
type ProjectionCase = readonly [string, CustomerFixture, string, number];
const applicationPaths: readonly ProjectionCase[] = [
    ["simple / id()", customerSimple, "id", 2],
    ["simple / name()", customerSimple, "name", 3],
    ["simple / status()", customerSimple, "status", 4],
    ["nested / id()", customerNested, "id", 2],
    ["nested / firstName()", customerNested, "firstName", 4],
    ["nested / lastName()", customerNested, "lastName", 5],
    ["nested / status()", customerNested, "status", 7],
    ["aligned / id()", customerAligned, "id", 2],
    ["aligned / balance()", customerAligned, "balance", 3],
    ["aligned / status()", customerAligned, "status", 4],
    ["fixed OCCURS / id()", customerFixedOccurs, "id", 2],
    ["fixed OCCURS / status()", customerFixedOccurs, "status", 8],
    ["ODO / itemCount()", customerOdoRedefines, "itemCount", 2],
    ["ODO / id()", customerOdoRedefines, "id", 3],
    ["ODO / name()", customerOdoRedefines, "name", 4],
    ["ODO / status()", customerOdoRedefines, "status", 10]
];

describe("customer application projection paths resolve to their intended declarations", () => {
    test.each(applicationPaths)("%s", (_title, fixture, accessor, sourceLine) => {
        const field = fixture.projection[accessor];
        expect(field).toBeDefined();
        const resolved = lookup(indexed(fixture), field.path);
        expect(resolved).toBeDefined();
        expect(resolved!.node.kind).toBe("elementary");
        expect(resolved!.node).toBe(nodeFromSourceLine(fixture, sourceLine));
    });
});

describe("customer name index: scope and interpretation boundaries", () => {
    test("lookup is case-insensitive, but the index keeps the names from the copybook", () => {
        const index = indexed(customerNested);
        const upper = lookup(index, ["CUSTOMER", "CONTACT", "FIRST-NAME"]);
        const lower = lookup(index, ["customer", "contact", "first-name"]);
        const mixed = lookup(index, ["Customer", "cOnTaCt", "First-Name"]);
        expect(lower).toBe(upper);
        expect(mixed).toBe(upper);
        expect([...lookup(index, ["CUSTOMER", "CONTACT"])!.children.keys()])
            .toEqual(["FIRST-NAME", "LAST-NAME"]);
    });

    test("a group is addressable, but its children are not flattened into its parent", () => {
        const index = indexed(customerNested);
        expect(lookup(index, ["CUSTOMER", "CONTACT"])!.node.kind).toBe("group");
        expect(lookup(index, ["CUSTOMER", "FIRST-NAME"])).toBeUndefined();
        expect(lookup(index, ["CUSTOMER", "CONTACT", "FIRST-NAME"])!.node.kind).toBe("elementary");
    });

    test("FILLER and generated padding cannot be projected, but later siblings can", () => {
        const nested = indexed(customerNested);
        const aligned = indexed(customerAligned);
        expect(lookup(nested, ["CUSTOMER", "FILLER"])).toBeUndefined();
        expect(lookup(nested, ["CUSTOMER", "STATUS"])!.node)
            .toBe(nodeFromSourceLine(customerNested, 7));
        expect(lookup(aligned, ["CUSTOMER", "PADDING"])).toBeUndefined();
        expect(lookup(aligned, ["CUSTOMER", "BALANCE"])!.node)
            .toBe(nodeFromSourceLine(customerAligned, 3));
    });

    test("REDEFINES alternatives are independently named, with their original nodes", () => {
        const index = indexed(customerFixedOccurs);
        const raw = lookup(index, ["CUSTOMER", "TELEPHONES", "PHONE-RAW"]);
        const parts = lookup(index, ["CUSTOMER", "TELEPHONES", "PHONE-PARTS"]);
        expect(raw!.node).toBe(nodeFromSourceLine(customerFixedOccurs, 4));
        expect(parts!.node).toBe(nodeFromSourceLine(customerFixedOccurs, 5));
        expect(raw!.node === parts!.node).toBe(false);
    });

    test("fixed OCCURS is indexed as one declaration, not one name per occurrence", () => {
        const index = indexed(customerFixedOccurs);
        const telephones = lookup(index, ["CUSTOMER", "TELEPHONES"]);
        expect(telephones!.node).toBe(nodeFromSourceLine(customerFixedOccurs, 3));
        expect([...telephones!.children.keys()]).toEqual(["PHONE-RAW", "PHONE-PARTS"]);
        expect(lookup(index, ["CUSTOMER", "TELEPHONES", "PHONE-PARTS", "PHONE-KIND"])!.node)
            .toBe(nodeFromSourceLine(customerFixedOccurs, 6));
    });

    test("ODO declaration lookup needs no record, even after the varying table", () => {
        const index = indexed(customerOdoRedefines);
        const purchase = lookup(index, ["CUSTOMER", "PURCHASES", "PURCHASE-PARTS", "SKU"]);
        const status = lookup(index, ["CUSTOMER", "STATUS"]);
        expect(purchase!.node).toBe(nodeFromSourceLine(customerOdoRedefines, 8));
        expect(status!.node).toBe(nodeFromSourceLine(customerOdoRedefines, 10));
        // The fixture records have different active ODO counts; no count was
        // needed in order to find either declaration.
        expect(customerOdoRedefines.records.map(record => record.itemCount))
            .toEqual([0, 3]);
    });

    test.each([
        ["nonexistent field", customerSimple, ["CUSTOMER", "DOES-NOT-EXIST"]],
        ["wrong nested scope", customerNested, ["CUSTOMER", "CONTACT", "STATUS"]],
        ["missing intermediate group", customerNested, ["CUSTOMER", "FIRST-NAME"]],
        ["cannot descend through elementary", customerSimple, ["CUSTOMER", "CUSTOMER-NAME", "STATUS"]],
        ["wrong overlay branch", customerFixedOccurs, ["CUSTOMER", "TELEPHONES", "PHONE-RAW", "PHONE-NUMBER"]],
        ["not flattened into ODO parent", customerOdoRedefines, ["CUSTOMER", "SKU"]],
        ["not flattened into PURCHASES", customerOdoRedefines, ["CUSTOMER", "PURCHASES", "SKU"]],
        ["absent root", customerSimple, ["NOT-CUSTOMER", "CUSTOMER-ID"]]
    ] as const)("rejects %s", (_title, fixture, path) => {
        expect(lookup(indexed(fixture), path)).toBeUndefined();
    });
});

// Deliberately NOT tested as name lookups yet:
//   ["CUSTOMER", "TELEPHONES[0]", "PHONE-RAW"]
//   ["CUSTOMER", "PURCHASES[2]", "PURCHASE-PARTS", "SKU"]
// Those require a separately specified occurrence-selector syntax and a real
// projection-path compiler. Name indexing resolves only declarations.
