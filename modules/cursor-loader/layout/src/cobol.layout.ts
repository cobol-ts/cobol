
import {
    type CopybookAst,
    type CopybookEntry,
    type CopybookEntryName,
    ElementaryEntry,
    GroupEntry
} from "@cobol-ts/copybook";
import {type StorageSizeExpression, canonicaliseStorageSize} from "@cobol-ts/size";
import {type ErrorsOr, value, errors} from "@cobol-ts/errors";
import {
    type CobolPrimitiveSizer,
    type CobolPrimitiveSizeContext,
    defaultCobolPrimitiveSizer
} from "./cobol.primitive.size";

export type CobolLayoutOptions = {
    readonly primitiveSizer: CobolPrimitiveSizer;
};

export const defaultOptions: CobolLayoutOptions = {
    primitiveSizer: defaultCobolPrimitiveSizer
};

export type CompiledCobolEntry = CompiledCobolGroup | CompiledCobolElementary;

export type CompiledCobolPosition = {
    /** Distance from parent's start to this entry's start. */
    readonly leftOffset: StorageSizeExpression;
    /** Distance from this entry's end to parent's end; excludes this entry's size. */
    readonly rightOffset: StorageSizeExpression;
};

export type CompiledCobolStorage = CompiledCobolPosition & {
    /** Total storage extent, including all occurrences. */
    readonly size: StorageSizeExpression;
};

export type CompiledCobolGroup = CompiledCobolStorage & {
    readonly kind: "group";
    readonly name: CopybookEntryName;
    readonly children: readonly CompiledCobolEntry[];
};

export type CompiledCobolElementary = CompiledCobolStorage & {
    readonly kind: "elementary";
    readonly name: CopybookEntryName;
};

function sum(expressions: readonly StorageSizeExpression[]): StorageSizeExpression {
    return canonicaliseStorageSize({kind: "sum", terms: expressions});
}

function nameOf(entry: CopybookEntry): string {
    return entry.name.kind === "named" ? entry.name.name : "FILLER";
}

/** Apply repetition without assuming each occurrence has a constant size. */
function applyOccurs(
    entry: GroupEntry | ElementaryEntry,
    size: StorageSizeExpression,
    context: CobolPrimitiveSizeContext
): ErrorsOr<StorageSizeExpression> {
    const clauses = entry.clauses.filter(c => c.kind === "occurs");
    if (!clauses.length) return value(size);
    if (clauses.length > 1)
        return errors(`Copybook ${context.copybook}, line ${entry.line}: Multiple OCCURS clauses`);

    const occurs = clauses[0];
    if (!("count" in occurs))
        return errors(`Copybook ${context.copybook}, line ${entry.line}: Variable OCCURS is not yet supported`);

    if (!Number.isSafeInteger(occurs.count) || occurs.count < 0)
        return errors(`Copybook ${context.copybook}, line ${entry.line}: Invalid OCCURS count ${occurs.count}`);

    return value(canonicaliseStorageSize({
        kind: "occurs",
        count: occurs.count,
        expression: size
    }));
}

function compileChildren(
    entries: readonly CopybookEntry[],
    context: CobolPrimitiveSizeContext,
    sizer: CobolPrimitiveSizer
): ErrorsOr<readonly CompiledCobolEntry[]> {
    const children: CompiledCobolEntry[] = [];
    for (const entry of entries) {
        const result = compileEntry(entry, context, sizer);
        if ("errors" in result) return result;
        children.push(result.value);
    }

    const positioned: CompiledCobolEntry[] = [];
    let leftOffset: StorageSizeExpression = 0;

    for (let i = 0; i < children.length; i++) {
        const child = children[i];
        const rightOffset = sum(children.slice(i + 1).map(c => c.size));
        positioned.push({...child, leftOffset, rightOffset});
        leftOffset = sum([leftOffset, child.size]);
    }
    return value(positioned);
}

function compileEntry(
    entry: CopybookEntry,
    context: CobolPrimitiveSizeContext,
    sizer: CobolPrimitiveSizer
): ErrorsOr<CompiledCobolEntry> {
    if (entry.kind === "elementary") {
        const primitive = sizer(entry, context);
        if ("errors" in primitive) return primitive;
        const size = applyOccurs(entry, canonicaliseStorageSize(primitive.value), context);
        if ("errors" in size) return size;

        return value({
            kind: "elementary",
            name: entry.name,
            size: size.value,
            leftOffset: 0,
            rightOffset: 0
        });
    }

    if (entry.kind === "group") {
        const childrenContext: CobolPrimitiveSizeContext = {
            ...context,
            path: [...(context.path ?? []), nameOf(entry)]
        };
        const children = compileChildren(entry.children, childrenContext, sizer);
        if ("errors" in children) return children;

        const bodySize = sum(children.value.map(c => c.size));
        const size = applyOccurs(entry, bodySize, context);
        if ("errors" in size) return size;

        return value({
            kind: "group",
            name: entry.name,
            size: size.value,
            leftOffset: 0,
            rightOffset: 0,
            children: children.value
        });
    }

    return errors(`Copybook ${context.copybook}, line ${entry.line}: Unsupported entry '${entry.kind}'`);
}

export function compileCobolLayout(
    ast: CopybookAst,
    options: CobolLayoutOptions = defaultOptions
): ErrorsOr<readonly CompiledCobolEntry[]> {
    const context: CobolPrimitiveSizeContext = {
        copybook: ast.metadata?.file ?? "<unknown>"
    };
    const roots: CompiledCobolEntry[] = [];

    for (const entry of ast.entries) {
        const result = compileEntry(entry, context, options.primitiveSizer);
        if ("errors" in result) return result;
        roots.push(result.value);
    }
    return value(roots);
}
