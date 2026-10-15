import {
    type PhysicalRecordContext,
    type ProjectionSupport
} from "@cobol-ts/cursor-loader-types";


/**
 * JSON projection support.
 *
 * JSON already uses tokenised string paths as its runtime projection path, so
 * compileProjectionPath() simply returns the canonical path unchanged.
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

    integer(
        representation: unknown,
        _details: undefined,
        path: readonly string[]
    ): number {
        const value = jsonValue(representation,path);

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
        path: readonly string[]
    ): number {
        const value = jsonValue(representation,path);

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
        path: readonly string[]
    ): string {
        const value = jsonValue(representation,path);

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
        path: readonly string[]
    ): string {
        const value = jsonValue(representation,path);

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
    path: readonly string[]
): readonly string[] {
    return path;
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
    path: readonly string[]
): unknown {
    let value =
        representation;

    for (let index = 0; index < path.length; index++) {
        const segment =
            path[index];

        if (
            value === null
            || typeof value !== "object"
        ) {
            throw pathCannotContinueError(
                value,
                path,
                index
            );
        }

        if (
            !Object.prototype.hasOwnProperty.call(
                value,
                segment
            )
        ) {
            throw missingPropertyError(
                value,
                path,
                index
            );
        }

        value =
            (
                value as Record<string,unknown>
            )[segment];
    }

    return value;
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