/**
 * Converts a camelCase string to a series of words with the first letter capitalized.
 * Example: "thisText" => "This Text"
 *
 * @param input - The camelCase string to convert.
 * @returns The formatted string.
 */
export function camelCaseToWords(input: string): string {
    if (!input) return input;
    return input
        .replace(/([a-z])([A-Z])/g, "$1 $2") // Insert space before uppercase letters preceded by lowercase letters
        .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2") // Handle sequences of uppercase letters
        .replace(/([a-zA-Z])([0-9])/g, "$1 $2") // Insert space before numbers following letters
        .replace(/([0-9])([a-zA-Z])/g, "$1 $2") // Insert space before letters following numbers
        .split(" ") // Split into words
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1)) // Capitalize each word
        .join(" ") // Join words back into a string
        .trim(); // Trim leading and trailing spaces
}

export function camelCase(input: string): string {
    if (!input) return input;
    return input
        .replace(/[^a-zA-Z@0-9\s-_]/g, "")  // Remove special characters except spaces, hyphens, and underscores
        .toLowerCase()
        .split(/[\s-_]+/)  // Split by space, hyphen, or underscore
        .filter(x => x.trim().length > 0)
        .map((word, index) =>
            index === 0 ? word : word.charAt(0).toUpperCase() + word.slice(1),
        )
        .join("");
}


export function capitalizeFirstLetter(input: string): string {
    if (!input) return input;
    return input.charAt(0).toUpperCase() + input.slice(1);
}

export const ellipsesInMiddle = (
    text: string,
    maxLength: number,
    ellipsis = "...",
): string => {
    if (text.length <= maxLength) return text;

    const ellipsisLength = ellipsis.length;
    const partLength = Math.floor((maxLength - ellipsisLength) / 2);

    // Ensure we don't cut too much when maxLength is small
    if (partLength <= 0) return ellipsis;

    const start = text.slice(0, partLength);
    const end = text.slice(-partLength);

    return `${start}${ellipsis}${end}`;
};


const nameWithOptionsRegex = /^\s*(.*?)\s*(?:\(\s*(.*?)\s*\))?\s*$/;

export type NameAndOptions = {
    name: string
    options: string[]
}

export function nameWithOptions(input: string): NameAndOptions {
    const match = input.match(nameWithOptionsRegex);
    if (!match) return { name: input.trim(), options: [] };

    const name = match[1].trim();
    const optionsPart = match[2];

    const options = optionsPart
        ? optionsPart.split(",").map((opt) => opt.trim()).filter((opt) => opt.length > 0)
        : [];

    return { name, options };
}

export type AttributeValue = {
    attribute: string;
    value?: string;
};

export function parseAttributeValue(input: string): AttributeValue {
    const parts = input.split(":");
    if (parts.length === 1 && parts[0]) return { attribute: parts[0], value: undefined };
    if (parts.length !== 2 || !parts[0] || !parts[1]) {
        throw new Error(`Invalid attribute:value format: '${input}'`);
    }

    return {
        attribute: parts[0],
        value: parts[1],
    };
}

let pathMarker = /[\/\\]/g;
export function lastSegment ( s: string, marker: string | RegExp = pathMarker ) {
    if ( s === undefined ) return undefined
    const parts = s.split ( marker ).filter(s => s.length> 0)
    if ( parts.length === 0 ) return s
    return parts[ parts.length - 1 ]
}
export function allButLastSegment ( s: string, marker: string | RegExp = pathMarker ): string {
    if ( s === undefined ) return undefined as any as string
    const parts = s.split ( marker ).filter(s => s.length> 0)
    if ( parts.length === 0 ) return s
    let result = parts.slice ( 0, -1 ).join ( '/' );
    return result
}
export function firstSegment(s: string, marker?: string | RegExp): string
export function firstSegment(s: undefined, marker?: string | RegExp): undefined
export function firstSegment(s: string | undefined, marker?: string | RegExp): string | undefined
export function firstSegment(
    s: string | undefined,
    marker: string | RegExp = pathMarker
): string | undefined {
    if (s === undefined) return undefined

    const parts = s.split(marker).filter(s => s.length > 0)
    if (parts.length === 0) return s
    return parts[0]
}
/**
 * Partition a string into “first two / next two / the rest”
 * @param name – input string
 * @returns partitioned string: “ab/cd/efghij”
 * @throws if name.length < 5
 */
export function toGitStoragePath(name: string): string {
    if (name.length < 5) {
        throw new Error(`toGitStoragePath: input must be at least 5 chars, got ${name.length}: ${name}`);
    }
    const first  = name.slice(0, 2);
    const second = name.slice(2, 4);
    const rest   = name.slice(4);
    return `${first}/${second}/${rest}`;
}

export type SafeIdOptions = {
    /** Prefix to ensure the id is non-empty and starts sensibly */
    prefix?: string;
    /** Max length to avoid absurdly long ids; default 128 */
    maxLen?: number;
};

/**
 * Convert an arbitrary string into a safe, CSS-selector-friendly HTML id.
 *
 * Notes:
 * - Replaces '.' with '_' to avoid querySelector/CSS escaping issues.
 * - Replaces any non [A-Za-z0-9_-] characters with '_' and collapses repeats.
 * - Ensures the result starts with a letter by prefixing if needed.
 * - Deterministic and idempotent: safeId(safeId(x)) === safeId(x)
 */
export function safeId(raw: string, opts: SafeIdOptions = {}): string {
    const prefix = opts.prefix ?? "id";
    const maxLen = opts.maxLen ?? 128;

    const input = String(raw ?? "");

    // 1) Replace dots (the big practical gotcha) and normalise everything else.
    // Keep only A-Z a-z 0-9 _ -
    let out = input
        .replace(/\./g, "_")
        .replace(/[^A-Za-z0-9_-]+/g, "_")
        .replace(/_+/g, "_")
        .replace(/^_+|_+$/g, "");

    // 2) If empty, use prefix.
    if (!out) out = prefix;

    // 3) Ensure starts with a letter (tooling friendliness).
    // If it doesn't, prefix it (with underscore separator to keep stable + readable).
    if (!/^[A-Za-z]/.test(out)) out = `${prefix}_${out}`;

    // 4) Enforce max length (keep prefix + beginning, deterministic).
    if (out.length > maxLen) out = out.slice(0, maxLen);

    // 5) If truncation ends with underscore(s), trim.
    out = out.replace(/_+$/g, "");

    // 6) Still empty after trimming? Fall back.
    if (!out) out = prefix;

    return out;
}
