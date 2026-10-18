/**
 * IBM Enterprise COBOL 6.4 legality tests.
 *
 * Neither the redefining nor the redefined item may itself declare
 * OCCURS DEPENDING ON.
 *
 * IBM reference: https://www.ibm.com/docs/en/cobol-zos/6.4.0?topic=entry-redefines-clause
 */
import {type CopybookClause, type ElementaryEntry, type GroupEntry} from "@cobol-ts/copybook";
import {errorsOrThrow} from "@cobol-ts/errors";
import {compileCobolLayout} from "./cobol.layout";

const named = (name: string) => ({kind: "named" as const, name});
const field = (name: string, picture = "X", clauses: CopybookClause[] = []): ElementaryEntry => ({
    kind: "elementary", level: 5, name: named(name), picture,
    clauses, conditions: [], line: 7
});
const group = (name: string, children: (ElementaryEntry | GroupEntry)[], clauses: CopybookClause[] = []): GroupEntry => ({
    kind: "group", level: 5, name: named(name), children, clauses, line: 6
});
const odo = (dependingOn: string): CopybookClause => ({
    kind: "occurs", min: 0, max: 4, dependingOn
});
const redefine = (target: string): CopybookClause => ({kind: "redefines", target});
const compile = (...children: (ElementaryEntry | GroupEntry)[]) =>
    compileCobolLayout({metadata: {}, entries: [{
            kind: "group", level: 1, name: named("RECORD"),
            children, clauses: [], line: 1
        }]}, "ibm-invalid.cpy");

describe("IBM 6.4: ODO and explicit REDEFINES legality", () => {
    test("rejects an explicit REDEFINES of an ODO table", () => {
        // 01 RECORD.
        //    05 COUNT PIC 9.
        //    05 ITEMS OCCURS 0 TO 4 DEPENDING ON COUNT.
        //       10 VALUE PIC X.
        //    05 ALTERNATIVE REDEFINES ITEMS PIC X(4).
        const result = compile(
            field("COUNT", "9"),
            group("ITEMS", [field("VALUE")], [odo("COUNT")]),
            field("ALTERNATIVE", "X(4)", [redefine("ITEMS")])
        );
        expect(errorsOrThrow(result)[0]).toContain("REDEFINES target 'ITEMS' cannot declare OCCURS DEPENDING ON");
    });

    test("rejects an ODO table that explicitly REDEFINES a fixed item", () => {
        // 01 RECORD.
        //    05 COUNT PIC 9.
        //    05 BASE PIC X(4).
        //    05 ITEMS REDEFINES BASE OCCURS 0 TO 4 DEPENDING ON COUNT.
        //       10 VALUE PIC X.
        const result = compile(
            field("COUNT", "9"), field("BASE", "X(4)"),
            group("ITEMS", [field("VALUE")], [redefine("BASE"), odo("COUNT")])
        );
        expect(errorsOrThrow(result)[0]).toContain("REDEFINES subject 'ITEMS' cannot declare OCCURS DEPENDING ON");
    });
});
