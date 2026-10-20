/** Full parser -> layout -> byte-offset integration for IBM compiler options. */
import {parseCopybook} from "@cobol-ts/copybook";
import {valueOrThrow, errorsOrThrow} from "@cobol-ts/errors";
import {compileCobolLayout} from "./cobol.layout";
import {locateCobolEntry} from "./cobol.layout.location";

const compile = (source: string, primitiveSizing = {}) => valueOrThrow(
    compileCobolLayout(valueOrThrow(parseCopybook(source)), "IBM-OPTIONS.cpy", {primitiveSizing})
);
const noCount = (): never => {throw new Error("No ODO in IBM options fixture")};

describe("IBM file-layout compiler options: end-to-end", () => {
    test("CURRENCY SIGN and UTF-8 BYTE-LENGTH shift following physical fields", () => {
        const roots = compile(`
01 RECORD.
   05 AMOUNT PIC f9(3).99.
   05 TEXT PIC U BYTE-LENGTH 11.
   05 TRAILER PIC X(2).
`, {currencySigns: [{symbol: "f", value: "CHF"}]});
        const amount = valueOrThrow(locateCobolEntry(roots, ["RECORD", "AMOUNT"], noCount));
        const utf8 = valueOrThrow(locateCobolEntry(roots, ["RECORD", "TEXT"], noCount));
        const trailer = valueOrThrow(locateCobolEntry(roots, ["RECORD", "TRAILER"], noCount));
        expect({start: amount.offsetBits, size: amount.sizeBits}).toEqual({start: 0, size: 72});
        expect({start: utf8.offsetBits, size: utf8.sizeBits}).toEqual({start: 72, size: 88});
        expect({start: trailer.offsetBits, size: trailer.sizeBits}).toEqual({start: 160, size: 16});
    });

    test("DYNAMIC LENGTH parsed but not misrepresented as fixed file storage", () => {
        const source = `01 RECORD.\n 05 TEXT PIC U DYNAMIC LENGTH LIMIT 20.\n`;
        const ast = valueOrThrow(parseCopybook(source));
        const field = ast.entries[0];
        expect(field.kind).toBe("group");
        if (field.kind !== "group") return;
        const child = field.children[0];
        if (child.kind !== "elementary") throw new Error("Expected elementary child");
        expect(child.clauses).toContainEqual({kind: "dynamic-length", limit: 20});
        const result = compileCobolLayout(ast, "IBM-OPTIONS.cpy");
        expect(errorsOrThrow(result).join(" ")).toContain("no inline file-record size");
    });
});
