import type {JsonValue} from "./cursor.loader.json.parser";
import type {ProjectedArraySource} from "@cobol-ts/arrays";
import {
    type PhysicalRecordContext,
    type ProjectionSupport
} from "@cobol-ts/cursor-loader-types";


/**
 * JSON projection support.
 *
 * JSON uses tokenised string paths as its runtime projection path. Existing
 * string-only paths are reused unchanged; numeric authoring components are
 * converted once to string property names (including array indexes).
 *
 * JSON has no copybook/schema, so array dimensions cannot be discovered at
 * setup. When runtime traversal encounters an array without a literal index
 * in the path, it consumes the next index supplied to the accessor.
 *
 * JSON has no source-preparation record, therefore the optional preparation
 * context is deliberately unused.
 *
 * Runtime projection failures contain only the JSON-specific reason. The
 * generic projection layer adds source, record number, logical projection path
 * and the rendered physical record.
 */
export const jsonProjectionSupport = {
    compileProjectionPath,

    object(representation: JsonValue, _details:undefined, path:readonly string[]): JsonValue {
        const found=jsonValue(representation,path);
        if (found === null || typeof found !== "object" || Array.isArray(found)) {
            throw projectionTypeError(found,"an object");
        }
        return found as JsonValue;
    },
    array(representation: JsonValue, _details:undefined, path:readonly string[]): ProjectedArraySource<JsonValue> {
        const found=jsonValue(representation,path,[],true);
        if (!Array.isArray(found)) throw projectionTypeError(found,"an array");
        return {length:()=>found.length, element:(index:number)=>found[index]};
    },

    integer(
        representation: unknown,
        _details: undefined,
        path: readonly string[],
        ...occurrenceIndices: number[]
    ): number {
        const value = jsonValue(representation,path,occurrenceIndices);

        if (
            typeof value !== "number"
            || !Number.isInteger(value)
        ) {
            throw projectionTypeError(
                value,
                "an integer"
            );
        }

        return value;
    },

    float(
        representation: unknown,
        _details: undefined,
        path: readonly string[],
        ...occurrenceIndices: number[]
    ): number {
        const value = jsonValue(representation,path,occurrenceIndices);

        if (typeof value !== "number") {
            throw projectionTypeError(
                value,
                "a number"
            );
        }

        return value;
    },

    character(
        representation: unknown,
        _details: undefined,
        path: readonly string[],
        ...occurrenceIndices: number[]
    ): string {
        const value = jsonValue(representation,path,occurrenceIndices);

        if (
            typeof value !== "string"
            || value.length !== 1
        ) {
            throw projectionTypeError(
                value,
                "a single character"
            );
        }

        return value;
    },

    string(
        representation: unknown,
        _details: undefined,
        path: readonly string[],
        ...occurrenceIndices: number[]
    ): string {
        const value = jsonValue(representation,path,occurrenceIndices);

        if (typeof value !== "string") {
            throw projectionTypeError(
                value,
                "a string"
            );
        }

        return value;
    }
} satisfies ProjectionSupport<
    unknown,
    undefined,
    readonly string[]
>;


function compileProjectionPath(
    _details: undefined,
    _context: PhysicalRecordContext | undefined,
    path: readonly (string | number)[]
): readonly string[] {
    // Preserve the existing zero-copy behaviour for ordinary JSON paths.
    if (path.every(segment => typeof segment === "string")) {
        return path as readonly string[];
    }
    // Literal numeric path segments denote array properties (e.g. items[2]).
    return path.map(segment => {
        if (
            typeof segment === "number"
            && (!Number.isSafeInteger(segment) || segment < 0)
        ) {
            throw new Error(
                `Invalid literal JSON array index ${segment}: `
                + "expected a non-negative safe integer."
            );
        }
        return String(segment);
    });
}


/**
 * Resolve one already-tokenised JSON path.
 *
 * JSON.parse() produces only:
 *
 *     object
 *     array
 *     string
 *     number
 *     boolean
 *     null
 *
 * Objects and arrays are the only values through which a path may continue.
 */
function jsonValue(
    representation: unknown,
    path: readonly string[],
    occurrenceIndices: readonly number[] = [],
    allowTerminalArray = false
): unknown {
    let value = representation;
    let pathIndex = 0;
    let occurrenceIndex = 0;

    while (true) {
        /*
         * Numeric path components select fixed array elements. Otherwise an
         * encountered array consumes the next accessor argument. This also
         * works for nested arrays and for paths terminating in an array.
         * array.length is available without a runtime index; with an index,
         * length can instead mean a property of an indexed element.
         */
        if (Array.isArray(value)
            && !(allowTerminalArray && pathIndex === path.length)
            && !isExplicitArrayProperty(
                path[pathIndex],
                occurrenceIndex < occurrenceIndices.length
            )) {
            const location = pathIndex === 0
                ? "<root>"
                : formatPath(path, pathIndex - 1);

            if (occurrenceIndex >= occurrenceIndices.length) {
                throw new Error(
                    `JSON array at ${location} requires occurrence index `
                    + `${occurrenceIndex + 1}.`
                );
            }
            const selected = occurrenceIndices[occurrenceIndex++];
            if (!Number.isSafeInteger(selected) || selected < 0) {
                throw new Error(
                    `Invalid JSON occurrence index ${selected} at ${location}: `
                    + "expected a non-negative safe integer."
                );
            }
            if (selected >= value.length) {
                throw new Error(
                    `JSON occurrence index ${selected} at ${location} `
                    + `is outside 0..${value.length - 1}.`
                );
            }
            value = value[selected];
            continue;
        }

        if (pathIndex === path.length) break;
        const segment = path[pathIndex];
        if (value === null || typeof value !== "object") {
            throw pathCannotContinueError(value, path, pathIndex);
        }
        if (!Object.prototype.hasOwnProperty.call(value, segment)) {
            throw missingPropertyError(value, path, pathIndex);
        }
        value = (value as Record<string, unknown>)[segment];
        pathIndex++;
    }

    if (occurrenceIndex !== occurrenceIndices.length) {
        throw new Error(
            `JSON projection consumed ${occurrenceIndex} occurrence `
            + `indexes but received ${occurrenceIndices.length}.`
        );
    }
    return value;
}


/** Numeric selectors are fixed; length without an index preserves array.length. */
function isExplicitArrayProperty(
    segment: string | undefined,
    hasRuntimeIndex: boolean
): boolean {
    if (segment === "length") return !hasRuntimeIndex;
    if (segment === undefined) return false;
    const index = Number(segment);
    return Number.isSafeInteger(index)
        && index >= 0
        && String(index) === segment;
}


/**
 * Projection failures are exceptional rather than parser Errors.
 *
 * Source, record number, complete logical projection path and physical JSON are
 * added by the generic projection layer. These helpers therefore describe only
 * the JSON-specific cause of the failure.
 */
function pathCannotContinueError(
    value: unknown,
    path: readonly string[],
    failedIndex: number
): Error {
    const location =
        failedIndex === 0
            ? "<root>"
            : formatPath(
                path,
                failedIndex - 1
            );

    return new Error(
        `JSON path cannot continue at ${location}: `
        + `value is ${describeValue(value)}; `
        + `cannot resolve property ${JSON.stringify(path[failedIndex])}.`
    );
}


function missingPropertyError(
    value: object,
    path: readonly string[],
    failedIndex: number
): Error {
    const location =
        failedIndex === 0
            ? "<root>"
            : formatPath(
                path,
                failedIndex - 1
            );

    return new Error(
        `JSON property ${JSON.stringify(path[failedIndex])} `
        + `does not exist in ${jsonContainerType(value)} at ${location}. `
        + `Available properties: ${formatProperties(value)}.`
    );
}


function projectionTypeError(
    value: unknown,
    expected: string
): Error {
    return new Error(
        `JSON value is ${describeValue(value)}; expected ${expected}.`
    );
}


function describeValue(
    value: unknown
): string {
    if (value === null) {
        return "null";
    }

    if (Array.isArray(value)) {
        return "an array";
    }

    switch (typeof value) {
        case "string":
            return `string ${JSON.stringify(value)}`;

        case "number":
            return `number ${value}`;

        case "boolean":
            return `boolean ${value}`;

        case "object":
            return "an object";

        default:
            return typeof value;
    }
}


function jsonContainerType(
    value: object
): string {
    return Array.isArray(value)
        ? "array"
        : "object";
}


function formatProperties(
    value: object
): string {
    const properties =
        Object.keys(value)
            .map(property => JSON.stringify(property));

    return properties.length === 0
        ? "<none>"
        : properties.join(", ");
}


function formatPath(
    path: readonly string[],
    end: number = path.length - 1
): string {
    if (path.length === 0) {
        return "<root>";
    }

    let result =
        path[0];

    for (let index = 1; index <= end; index++) {
        result += ".";
        result += path[index];
    }

    return result;
}