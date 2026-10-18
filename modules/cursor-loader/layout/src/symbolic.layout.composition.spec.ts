import {valueOrThrow, errorsOrThrow} from "@cobol-ts/errors";
import {
    type CopybookAst,
    type CopybookClause,
    type ElementaryEntry,
    type GroupEntry
} from "@cobol-ts/copybook";
import {evaluateStorageSize, type StorageSizeExpression} from "@cobol-ts/size";
import {compileCobolLayout, type CompiledCobolGroup} from "./cobol.layout";

const named = (name: string) => ({kind: "named" as const, name});
const sync = (): CopybookClause => ({kind: "synchronized"});
const usage = (usage: string): CopybookClause => ({kind: "usage", usage});

function elementary(name: string, clauses: CopybookClause[] = []): ElementaryEntry {
    return {
        kind: "elementary", level: 5, name: named(name),
        picture: "9", clauses, conditions: [], line: 2
    };
}
function group(name: string, children: (GroupEntry | ElementaryEntry)[]): GroupEntry {
    return {kind: "group", level: 1, name: named(name), clauses: [], children, line: 1};
}
function compile(root: GroupEntry): CompiledCobolGroup {
    const ast: CopybookAst = {metadata: {}, entries: [root]};
    const variable: StorageSizeExpression = {
        kind: "depending-on", path: ["REC", "COUNT"], expression: 8
    };
    const layout = valueOrThrow(compileCobolLayout(ast, "symbolic.cpy", {
        primitiveSizer: (_, context) => ({
            value: context.path.at(-1) === "VARIABLE"
                ? variable
                : context.path.at(-1) === "ALIGNED" ? 16 : 8
        })
    }));
    const result = layout[0];
    if (result.kind !== "group") throw new Error("Expected compiled group");
    return result;
}
const evaluate = (expression: StorageSizeExpression, count: number): number =>
    evaluateStorageSize(expression, path => {
        expect(path).toEqual(["REC", "COUNT"]);
        return count;
    });

describe("symbolic layout composition", () => {
    test("keeps padding symbolic until a dependent size is evaluated", () => {
        const record = compile(group("REC", [
            elementary("COUNT"),
            elementary("VARIABLE"),
            elementary("ALIGNED", [usage("COMP"), sync()])
        ]));

        const symbolicPadding = record.children.find(
            child => child.kind === "padding" && typeof child.size !== "number"
        );
        expect(symbolicPadding).toBeDefined();
        for (const count of [0, 1, 2, 3, 7]) {
            const position = 8 + 8 * count;
            const padding = (16 - position % 16) % 16;
            expect(evaluate(record.size, count)).toBe(position + padding + 16);
        }
    });

    test("aligns nested descendants to the absolute record origin", () => {
        const record = compile(group("REC", [
            elementary("COUNT"),
            elementary("VARIABLE"),
            group("NESTED", [
                elementary("ALIGNED", [usage("COMP"), sync()])
            ])
        ]));

        for (const count of [0, 1, 2, 3, 7]) {
            const position = 8 + 8 * count;
            const padding = (16 - position % 16) % 16;
            expect(evaluate(record.size, count)).toBe(position + padding + 16);
        }
        // Internal substitution markers never escape into public size expressions.
        expect(JSON.stringify(record).includes('"kind":"origin"')).toBe(false);
    });
});


describe("alignment-intent architecture", () => {
    test("resolves nested internal padding from record-origin position without origin variables", () => {
        const record = compile(group("REC", [
            elementary("COUNT"),
            group("INNER", [
                elementary("VARIABLE"),
                elementary("ALIGNED", [usage("COMP"), sync()])
            ])
        ]));
        const inner = record.children.find(child => child.kind === "group");
        if (!inner || inner.kind !== "group") throw new Error("Expected inner group");
        const padding = inner.children.find(child => child.kind === "padding");
        if (!padding) throw new Error("Expected symbolic padding");
        if (typeof padding.size === "number") throw new Error("Padding incorrectly made constant");
        for (const count of [0, 1, 2, 3, 7]) {
            const position = 8 + count * 8;
            const required = (16 - position % 16) % 16;
            expect(evaluate(padding.size, count)).toBe(required);
            expect(evaluate(padding.leftOffset, count)).toBe(count * 8);
            expect(evaluate(inner.size, count)).toBe(count * 8 + required + 16);
            expect(evaluate(record.size, count)).toBe(8 + count * 8 + required + 16);
        }
        expect(JSON.stringify(record).includes('"kind":"origin"')).toBe(false);
    });

    test("owns initial nested alignment padding in the parent", () => {
        const record = compile(group("REC", [
            elementary("VARIABLE"),
            group("INNER", [elementary("ALIGNED", [usage("COMP"), sync()])])
        ]));
        const inner = record.children.find(child => child.kind === "group");
        if (!inner || inner.kind !== "group") throw new Error("Expected inner group");
        expect(inner.children.length).toBe(1);
        const padding = record.children.find(child => child.kind === "padding");
        if (!padding) throw new Error("Expected parent padding");
        for (const count of [0, 1, 2, 3]) {
            const position = 8 * count;
            const required = (16 - position % 16) % 16;
            expect(evaluate(padding.size, count)).toBe(required);
            expect(evaluate(inner.leftOffset, count)).toBe(position + required);
        }
    });

    test("publishes only the established geometry fields", () => {
        const record = compile(group("REC", [
            elementary("VARIABLE"),
            elementary("ALIGNED", [usage("COMP"), sync()])
        ]));
        const padding = record.children.find(child => child.kind === "padding");
        if (!padding) throw new Error("Expected symbolic padding");
        expect(Object.keys(padding).sort()).toEqual([
            "kind", "leftOffset", "rightOffset", "size"
        ]);
        expect("count" in record).toBe(false);
        expect("role" in padding).toBe(false);
        expect("source" in padding).toBe(false);
    });

    test("aggregates placement failures from independent record roots", () => {
        const redefine = (name: string) => ({
            ...elementary(name),
            clauses: [{kind: "redefines" as const, target: "MISSING"}]
        });
        const ast: CopybookAst = {
            metadata: {},
            entries: [
                group("FIRST", [redefine("BAD-A")]),
                group("SECOND", [redefine("BAD-B")])
            ]
        };
        const result = compileCobolLayout(ast, "errors.cpy");
        expect(errorsOrThrow(result)).toEqual([
            "Copybook errors.cpy, line 2, FIRST.BAD-A: REDEFINES target 'MISSING' has no active overlay region",
            "Copybook errors.cpy, line 2, SECOND.BAD-B: REDEFINES target 'MISSING' has no active overlay region"
        ]);
    });
});
