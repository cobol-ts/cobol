import {type ProjectionSupport} from "@cobol-ts/cursor-loader-types";


/**
 * JSON projection support.
 *
 * JSON already uses tokenised string paths as its runtime projection path, so
 * compileProjectionPath() simply returns the canonical path unchanged.
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
            throw projectionTypeError(path,"integer");
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
            throw projectionTypeError(path,"float");
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
            throw projectionTypeError(path,"character");
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
            throw projectionTypeError(path,"string");
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
    let value = representation;

    for (let index = 0; index < path.length; index++) {
        if (
            value === null
            || typeof value !== "object"
        ) {
            throw projectionPathError(path,index);
        }

        const segment = path[index];

        if (
            !Object.prototype.hasOwnProperty.call(
                value,
                segment
            )
        ) {
            throw projectionPathError(path,index);
        }

        value = (
            value as Record<string,unknown>
        )[segment];
    }

    return value;
}


/**
 * Projection failures are exceptional rather than parser Errors.
 *
 * These messages are deliberately generated only on the failure path.
 */
function projectionPathError(
    path: readonly string[],
    failedIndex: number
): Error {
    return new Error(
        `JSON projection path not found: ${formatPath(
            path,
            failedIndex
        )}`
    );
}


function projectionTypeError(
    path: readonly string[],
    expected: string
): Error {
    return new Error(
        `JSON projection value at ${formatPath(path)} is not ${expected}`
    );
}


function formatPath(
    path: readonly string[],
    end: number = path.length - 1
): string {
    if (path.length === 0) {
        return "<root>";
    }

    let result = path[0];

    for (let index = 1; index <= end; index++) {
        result += ".";
        result += path[index];
    }

    return result;
}