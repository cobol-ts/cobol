import type {CompiledCobolEntry, CompiledCobolElementary, CompiledCobolGroup} from "@cobol-ts/layout";
import {evaluateStorageSize} from "@cobol-ts/size";
import {findCobolName, type CobolNameIndex} from "./cobol.layout.index";

/**
 * Once-only compilation of a COBOL projection path.
 * All geometry is in bits and relative to the beginning of the logical record.
 * Runtime access needs only occurrence arguments and this numeric descriptor.
 */
export type CobolProjectionPath = Readonly<{
    node: CompiledCobolElementary | CompiledCobolGroup;
    offsetBits: number;
    sizeBits: number;
    runtimeDimensions: readonly Readonly<{strideBits: number; count: number}>[];
    /** Source-scoped logical path for resolving child fields at compilation only. */
    fullPath: readonly (string | number)[];
    /** Dimensions already supplied by enclosing projected-array selections. */
    boundDimensions: number;
}>;

const describePath = (path: readonly (string | number)[]): string => path.join(".");

const staticBits = (expression: CompiledCobolEntry["size"], path: readonly (string | number)[]): number => {
    try {
        const bits = evaluateStorageSize(expression, () => {
            throw new Error("requires an OCCURS DEPENDING ON controller");
        });
        if (!Number.isSafeInteger(bits) || bits < 0) throw new Error("invalid static size");
        return bits;
    } catch (cause) {
        throw new Error(`Cannot statically compile ${describePath(path)}: ${cause instanceof Error ? cause.message : String(cause)}`);
    }
};

/**
 * A named OCCURS declaration consumes a dimension, in path order.
 * A following number fixes the occurrence at setup; otherwise the occurrence
 * is supplied by the accessor at runtime. No [] placeholder is required.
 *
 * Examples:
 *   ["CUSTOMER", "ACCOUNTS", 2, "ID"]  -> no runtime arguments
 *   ["CUSTOMER", "ACCOUNTS", "ID"]     -> accountId(index)
 *   ["CUSTOMER", "ORDERS", "ITEMS", 1, "SKU"] -> sku(orderIndex)
 *
 * This first stage accepts only record-independent, fixed OCCURS geometry.
 */
export function compileCobolProjectionPath(
    index: CobolNameIndex,
    path: readonly (string | number)[],
    allowGroup = false
): CobolProjectionPath {
    let scope = index;
    let offsetBits = 0;
    let selected: CompiledCobolEntry | undefined;
    const runtimeDimensions: {strideBits: number; count: number}[] = [];

    for (let position = 0; position < path.length; position++) {
        const name = path[position];
        if (typeof name !== "string") {
            throw new Error(`Unexpected occurrence index ${name} in ${describePath(path)}; a number must follow an OCCURS declaration`);
        }
        const named = findCobolName(scope, name);
        if (!named) throw new Error(`Unknown COBOL projection declaration '${name}' in ${describePath(path)}`);
        selected = named.node;
        offsetBits += staticBits(selected.leftOffset, path);

        const occurs = selected.source.clauses.find(clause => clause.kind === "occurs");
        if (occurs?.kind === "occurs") {
            if (!("count" in occurs)) {
                throw new Error(`ODO projection requires record-specific count resolution: ${describePath(path)}`);
            }
            const count = occurs.count;
            if (!Number.isSafeInteger(count) || count < 1) {
                throw new Error(`Invalid fixed OCCURS count at '${name}'`);
            }
            const strideBits = staticBits(selected.size, path) / count;
            if (!Number.isSafeInteger(strideBits)) {
                throw new Error(`Nonintegral fixed OCCURS stride at '${name}'`);
            }

            const next = path[position + 1];
            if (typeof next === "number") {
                if (!Number.isSafeInteger(next) || next < 0 || next >= count) {
                    throw new RangeError(`OCCURS index ${String(next)} outside 0..${count - 1} at '${name}'`);
                }
                offsetBits += next * strideBits;
                position++;
            } else {
                runtimeDimensions.push({strideBits, count});
            }
        }
        scope = named.children;
    }

    if (!selected || selected.kind === "padding" || (selected.kind !== "elementary" && !allowGroup)) {
        throw new Error(`COBOL projection must select ${allowGroup ? "a named field or group" : "an elementary field"}: ${describePath(path)}`);
    }

    const totalSizeBits = staticBits(selected.size, path);
    const occurs = selected.source.clauses.find(clause => clause.kind === "occurs");
    const sizeBits = occurs?.kind === "occurs" && "count" in occurs
        ? totalSizeBits / occurs.count
        : totalSizeBits;
    if (!Number.isSafeInteger(sizeBits)) throw new Error(`Invalid field size for ${describePath(path)}`);

    return {node: selected, offsetBits, sizeBits, runtimeDimensions, fullPath:path, boundDimensions:0};
}

/** Resolve just the remaining runtime dimensions; there is no name lookup. */
export function locateCompiledCobolPath(
    path: CobolProjectionPath,
    occurrenceIndices: readonly number[] = []
): Readonly<{offsetBits: number; sizeBits: number}> {
    if (occurrenceIndices.length !== path.runtimeDimensions.length) {
        throw new Error(`Expected ${path.runtimeDimensions.length} COBOL occurrence indexes, got ${occurrenceIndices.length}`);
    }
    let offsetBits = path.offsetBits;
    for (let i = 0; i < occurrenceIndices.length; i++) {
        const occurrenceIndex = occurrenceIndices[i];
        const {count, strideBits} = path.runtimeDimensions[i];
        if (!Number.isSafeInteger(occurrenceIndex) || occurrenceIndex < 0 || occurrenceIndex >= count) {
            throw new RangeError(`OCCURS index ${String(occurrenceIndex)} outside 0..${count - 1}`);
        }
        offsetBits += occurrenceIndex * strideBits;
    }
    return {offsetBits, sizeBits: path.sizeBits};
}

/**
 * Compile a relative member below an already selected group. The compiled
 * absolute offset is for occurrence zero. Array selection adds only its
 * numeric stride to the byte-backed view; inherited dimensions are removed
 * from the child's descriptor once, here, not during field access.
 */
export function compileCobolMemberPath(
    index: CobolNameIndex,
    path: readonly (string | number)[],
    parent?: CobolProjectionPath
): CobolProjectionPath {
    const fullPath = parent ? [...parent.fullPath, ...path] : path;
    const compiled = compileCobolProjectionPath(index, fullPath, true);
    const inherited = parent
        ? parent.boundDimensions + (parent.runtimeDimensions.length > 0 && parent.node.source.clauses.some(c=>c.kind === "occurs") ? 1 : 0)
        : 0;
    if (inherited > compiled.runtimeDimensions.length) {
        throw new Error(`Invalid enclosing OCCURS selection at ${describePath(fullPath)}`);
    }
    return {...compiled,
        runtimeDimensions:compiled.runtimeDimensions.slice(inherited),
        boundDimensions:inherited};
}
