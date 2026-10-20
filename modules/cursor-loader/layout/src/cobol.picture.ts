/**
 * The small grammar of a COBOL PICTURE character-string.
 *
 * Parsing only recognises symbols and their repetition counts. The data
 * category and physical storage width are separate concerns. Repetitions are
 * retained rather than expanded into a potentially enormous token array.
 */
/** Currency picture symbols are single source characters; the sign value may
 * contain multiple EBCDIC characters (for example $, EUR, CHF). */
export type CobolCurrencySign = Readonly<{symbol: string; value: string}>;
export type CobolPictureOptions = Readonly<{
    /** CURRENCY compiler option (default: picture symbol $ with one-byte sign $). */
    defaultCurrency?: CobolCurrencySign;
    /** SPECIAL-NAMES CURRENCY SIGN declarations; override matching symbols. */
    currencySigns?: readonly CobolCurrencySign[];
}>;

export type CobolPictureToken = Readonly<{
    symbol: string;
    repeat: number;
}>;

export type CobolPictureCategory =
    | "alphabetic"
    | "alphanumeric"
    | "alphanumeric-edited"
    | "numeric"
    | "numeric-edited"
    | "external-floating"
    | "national"
    | "national-edited"
    | "dbcs"
    | "utf8";

export type CobolPicture = Readonly<{
    tokens: readonly CobolPictureToken[];
    category: CobolPictureCategory;
    /** Numeric PICTURE digits (9 symbols), excluding implied P positions. */
    digits: number;
    /** Number of storage character positions (not bytes). */
    positions: number;
    /** An operational S sign, not an editing sign. */
    signed: boolean;
}>;

const singleSymbols = "A B E G N P S U V X Z 9 0 / , . + - * $".replace(/ /g, "");
const implicitSymbols = new Set(["S", "V", "P"]);
const isDigit = (char: string | undefined): boolean =>
    char !== undefined && char >= "0" && char <= "9";

/** Parse the next symbol; CR and DB are single tokens with two-byte spelling. */
function parseSymbol(source: string, offset: number, currency: ReadonlyMap<string, string>): string | undefined {
    const char = source[offset];
    // Currency symbols are case sensitive; other COBOL picture symbols are not.
    if (char !== undefined && currency.has(char)) return char;
    if (source.slice(offset, offset + 2).toUpperCase() === "CR") return "CR";
    if (source.slice(offset, offset + 2).toUpperCase() === "DB") return "DB";
    const upper = char?.toUpperCase();
    return upper !== undefined && singleSymbols.includes(upper) ? upper : undefined;
}

function currencyMap(options: CobolPictureOptions): ReadonlyMap<string, string> | undefined {
    const configured = [options.defaultCurrency ?? {symbol: "$", value: "$"}, ...(options.currencySigns ?? [])];
    const signs = new Map<string, string>();
    for (const {symbol, value} of configured) {
        if ([...symbol].length !== 1 || value.length === 0 ||
            /[0-9+\-.,]/.test(value) || (symbol !== "$" &&
            (singleSymbols.includes(symbol.toUpperCase()) || /[\s()]/.test(symbol))))
            return undefined;
        signs.set(symbol, value);
    }
    return signs;
}

/** Parse an optional repetition such as (18). */
function parseRepetition(
    source: string,
    offset: number
): Readonly<{repeat: number; next: number}> | undefined {
    if (source[offset] !== "(") return {repeat: 1, next: offset};
    let next = offset + 1;
    while (isDigit(source[next])) next++;
    if (next === offset + 1 || source[next] !== ")") return undefined;
    const repeat = Number(source.slice(offset + 1, next));
    return Number.isSafeInteger(repeat) && repeat > 0
        ? {repeat, next: next + 1}
        : undefined;
}

export function parseCobolPictureTokens(source: string, options: CobolPictureOptions = {}): readonly CobolPictureToken[] | undefined {
    const picture = source.replace(/\s/g, "");
    const currency = currencyMap(options);
    if (!currency) return undefined;
    if (!picture) return undefined;
    const tokens: CobolPictureToken[] = [];
    let offset = 0;
    while (offset < picture.length) {
        const symbol = parseSymbol(picture, offset, currency);
        if (!symbol) return undefined;
        const repetition = parseRepetition(picture, offset + symbol.length);
        if (!repetition) return undefined;
        tokens.push({symbol, repeat: repetition.repeat});
        offset = repetition.next;
    }
    return tokens;
}

const all = (tokens: readonly CobolPictureToken[], symbols: string): boolean =>
    tokens.every(token => symbols.includes(`|${token.symbol}|`));

const has = (tokens: readonly CobolPictureToken[], symbols: string): boolean =>
    tokens.some(token => symbols.includes(`|${token.symbol}|`));

const symbolSet = (...symbols: string[]): string => `|${symbols.join("||")}|`;

/** The exponent is E, one explicit sign, then exactly two 9 positions. */
function classifyExternalFloating(tokens: readonly CobolPictureToken[]): CobolPictureCategory | undefined {
    const exponent = tokens.findIndex(token => token.symbol === "E");
    if (exponent < 2 || exponent + 2 >= tokens.length) return undefined;
    const first = tokens[0];
    const expSign = tokens[exponent + 1];
    if (!"+-".includes(first.symbol) || first.repeat !== 1 ||
        !"+-".includes(expSign.symbol) || expSign.repeat !== 1) return undefined;
    const mantissa = tokens.slice(1, exponent);
    const expDigits = tokens.slice(exponent + 2);
    if (!all(mantissa, symbolSet("9", "V", ".")) ||
        !all(expDigits, symbolSet("9")) ||
        expDigits.reduce((n, t) => n + t.repeat, 0) !== 2 ||
        !has(mantissa, symbolSet("V", ".")) ||
        mantissa.filter(t => t.symbol === "V" || t.symbol === ".").reduce((n, t) => n + t.repeat, 0) !== 1) return undefined;
    const digits = mantissa.filter(t => t.symbol === "9").reduce((n, t) => n + t.repeat, 0);
    return digits >= 1 && digits <= 16 ? "external-floating" : undefined;
}

const classifyUtf8 = (tokens: readonly CobolPictureToken[]): CobolPictureCategory | undefined =>
    all(tokens, symbolSet("U")) ? "utf8" : undefined;

const classifyDbcs = (tokens: readonly CobolPictureToken[]): CobolPictureCategory | undefined =>
    has(tokens, symbolSet("G")) && all(tokens, symbolSet("G", "B"))
        ? "dbcs" : undefined;

const classifyNational = (tokens: readonly CobolPictureToken[]): CobolPictureCategory | undefined => {
    if (!has(tokens, symbolSet("N"))) return undefined;
    if (all(tokens, symbolSet("N"))) return "national";
    if (all(tokens, symbolSet("N", "B", "0", "/")) && has(tokens, symbolSet("B", "0", "/")))
        return "national-edited";
    return undefined;
};

const classifyAlphanumeric = (tokens: readonly CobolPictureToken[]): CobolPictureCategory | undefined => {
    if (!has(tokens, symbolSet("A", "X"))) return undefined;
    if (!all(tokens, symbolSet("A", "X", "9", "B", "0", "/"))) return undefined;
    if (has(tokens, symbolSet("B", "0", "/"))) return "alphanumeric-edited";
    return all(tokens, symbolSet("A")) ? "alphabetic" : "alphanumeric";
};

const classifyNumeric = (tokens: readonly CobolPictureToken[], currency: ReadonlyMap<string, string>): CobolPictureCategory | undefined => {
    const valid = symbolSet("9", "S", "V", "P", "B", "Z", "0", "/", ",", ".", "+", "-", "*", "CR", "DB");
    if (!tokens.every(t => valid.includes(`|${t.symbol}|`) || currency.has(t.symbol))) return undefined;
    if (new Set(tokens.filter(t => currency.has(t.symbol)).map(t => t.symbol)).size > 1) return undefined;
    const signs = tokens.filter(t => t.symbol === "S");
    const points = tokens.filter(t => t.symbol === "V");
    if (signs.length > 1 || (signs.length === 1 && (tokens[0] !== signs[0] || signs[0].repeat !== 1)) ||
        points.reduce((n, t) => n + t.repeat, 0) > 1) return undefined;
    const plain = all(tokens, symbolSet("9", "S", "V", "P"));
    if (signs.length && !plain) return undefined;
    return plain ? "numeric" : "numeric-edited";
};

/** Ordered category strategies. A category need not validate every COBOL syntax rule. */
const classifiers: ReadonlyArray<(tokens: readonly CobolPictureToken[], currency: ReadonlyMap<string, string>) => CobolPictureCategory | undefined> = [
    classifyExternalFloating,
    classifyUtf8,
    classifyDbcs,
    classifyNational,
    classifyAlphanumeric,
    classifyNumeric
];

export function parseCobolPicture(source: string, options: CobolPictureOptions = {}): CobolPicture | undefined {
    const currency = currencyMap(options);
    if (!currency) return undefined;
    const tokens = parseCobolPictureTokens(source, options);
    if (!tokens) return undefined;
    let category: CobolPictureCategory | undefined;
    for (const classify of classifiers) {
        category = classify(tokens, currency);
        if (category) break;
    }
    if (!category) return undefined;

    let digits = 0;
    let positions = 0;
    const usedCurrency = new Set<string>();
    for (const {symbol, repeat} of tokens) {
        if (symbol === "9") digits += repeat;
        if (currency.has(symbol)) {
            // IBM: first sign occupies value.length positions; each additional
            // occurrence of the same picture symbol occupies one position.
            positions += repeat + (usedCurrency.has(symbol) ? 0 : currency.get(symbol)!.length - 1);
            usedCurrency.add(symbol);
        } else if (!implicitSymbols.has(symbol)) positions += symbol.length * repeat;
        if (!Number.isSafeInteger(digits) || !Number.isSafeInteger(positions)) return undefined;
    }
    if (positions === 0 || (category === "numeric" && digits === 0)) return undefined;
    return {tokens, category, digits, positions, signed: tokens[0].symbol === "S"};
}
