import type {ResolvePath, StorageSizeExpression} from "@cobol-ts/size";
import {evaluateStorageSize, resolveDependingOnCount} from "@cobol-ts/size";
import {type ErrorsOr, errors, value} from "@cobol-ts/errors";
import type {CompiledCobolEntry} from "./cobol.layout";

/** A concrete, zero-based OCCURS index follows each repeated field name. */
export type CobolLocationPath = readonly (string | number)[];

/** Bit positions are relative to the beginning of the selected record root. */
export type LocatedCobolEntry = Readonly<{
    node: CompiledCobolEntry;
    offsetBits: number;
    sizeBits: number;
}>;

/**
 * Locate one physical occurrence in the compiled tree. The compiled layout
 * describes only ONE occurrence body: preceding occurrences must be summed
 * with their own bindings, not multiplied by the selected occurrence's size.
 *
 * No new compiler metadata or traversal phase is needed. Count clauses remain
 * available on the existing source AST stored in every compiled declaration.
 * The resolver returns numeric controller values for concrete COBOL paths.
 */
export function locateCobolEntry(
    roots: readonly CompiledCobolEntry[],
    path: CobolLocationPath,
    resolve: ResolvePath
): ErrorsOr<LocatedCobolEntry> {
    if (!path.length) return errors("A COBOL location path must name a record");

    let siblings: readonly CompiledCobolEntry[] = roots;
    let position = 0;
    const enclosingIndices: number[] = [];
    let ordinal = 0;

    try {
        while (ordinal < path.length) {
            const name = path[ordinal++];
            if (typeof name !== "string" || !name.length)
                return errors("Expected a COBOL declaration name in location path");
            const matches = siblings.filter((node): node is Extract<CompiledCobolEntry, {kind: "group" | "elementary"}> => node.kind !== "padding" &&
                node.source.name.kind === "named" &&
                node.source.name.name.toUpperCase() === name.toUpperCase());
            if (!matches.length) return errors(`Unknown COBOL field '${name}'`);
            if (matches.length !== 1) return errors(`Ambiguous COBOL field '${name}'`);
            const node = matches[0];
            position += evaluateStorageSize(node.leftOffset, resolve, enclosingIndices);

            const occurs = node.source.clauses.find(clause => clause.kind === "occurs");
            let selectedSize: StorageSizeExpression = node.size;
            if (occurs?.kind === "occurs") {
                const index = path[ordinal];
                if (typeof index !== "number" || !Number.isSafeInteger(index) || index < 0)
                    return errors(`A nonnegative occurrence index is required for '${name}'`);
                ordinal++;

                let available: number;
                if ("count" in occurs) {
                    available = occurs.count;
                    if (typeof node.size === "number") {
                        // Constant repetition can be folded to a number by the
                        // canonicaliser; its one-occurrence stride is recoverable.
                        selectedSize = node.size / occurs.count;
                    } else if (node.size.kind === "occurs") {
                        selectedSize = node.size.expression;
                    } else {
                        throw new Error(`Expected an OCCURS size expression for '${name}'`);
                    }
                } else {
                    if (typeof node.size === "number" || node.size.kind !== "depending-on")
                        throw new Error(`Expected an ODO size expression for '${name}'`);
                    selectedSize = node.size.expression;
                    // Count is resolved before introducing the new occurrence
                    // index, precisely as for evaluation of depending-on.
                    available = resolveDependingOnCount(
                        node.size.path, resolve, enclosingIndices
                    );
                    if (available < occurs.min || available > occurs.max)
                        return errors(`ODO count ${available} for '${name}' is outside declared bounds ${occurs.min}..${occurs.max}`);
                }
                if (index >= available)
                    return errors(`Occurrence index ${index} out of range for '${name}' (count ${available})`);

                // A prefix OCCURS expression binds each earlier index in turn,
                // correctly handling variable-sized earlier occurrences.
                position += typeof selectedSize === "number"
                    ? index * selectedSize
                    : evaluateStorageSize({
                        kind: "occurs", count: index, expression: selectedSize
                    }, resolve, enclosingIndices);
                enclosingIndices.push(index);
            } else if (typeof path[ordinal] === "number") {
                return errors(`Field '${name}' does not declare OCCURS`);
            }

            if (ordinal === path.length) return value({
                node,
                offsetBits: position,
                sizeBits: evaluateStorageSize(selectedSize, resolve, enclosingIndices)
            });
            if (node.kind !== "group")
                return errors(`Elementary field '${name}' has no children`);
            siblings = node.children;
        }
    } catch (failure) {
        return errors(failure instanceof Error ? failure.message : String(failure));
    }
    return errors("Invalid COBOL location path");
}
