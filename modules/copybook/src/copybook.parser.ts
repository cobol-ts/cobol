import {
    ErrorsOr,
    errors,
    value,
    mapErrorsOr,
    flatMapErrorsOr,
    flattenArrayOfErrorsOr,
} from "@cobol-ts/errors";

import {
    CopybookAst,
    CopybookEntry,
    CopybookEntryName,
    CopybookClause,
    GroupEntry,
    ElementaryEntry,
    OccursClause,
    UsageClause,
    SignClause,
    ValueClause,
    JustifiedClause,
    BlankWhenZeroClause,
    SynchronizedClause,
    RedefinesClause,
    ConditionEntry,
    ConditionValue,
} from "./copybook.ast";


export type CopybookParser =
    (s: string, metadata?: any) => ErrorsOr<CopybookAst>;


/*
 * Source representation
 */

type LogicalLine = {
    line: number;
    text: string;
};


type LogicalStatement = {
    lines: LogicalLine[];
};


type Token = {
    text: string;
    line: number;
};


/*
 * Parsed representation
 */

type ParsedEntry = {
    level: number;
    name: CopybookEntryName;
    picture?: string;
    clauses: CopybookClause[];
    conditionValues?: ConditionValue[];
    line: number;
};


type ParsedTreeEntry = ParsedEntry & {
    children: ParsedTreeEntry[];
};


type Declaration = {
    line: number;
    level: number;
    name: CopybookEntryName;
    clauseTokens: Token[];
};


type ParsedClauses = {
    picture?: string;
    clauses: CopybookClause[];
};


/*
 * Clause parsing
 */

type ClauseParseResult =
    | {
    kind: "picture";
    picture: string;
    next: number;
}
    | {
    kind: "clause";
    clause: CopybookClause;
    next: number;
}
    | {
    kind: "error";
    error: string;
    next: number;
};


type ClauseParser = (
    tokens: Token[],
    index: number,
    sourceLines: string[],
) => ClauseParseResult;


/*
 * Public API
 */

export const parseCopybook: CopybookParser = (
    source,
    metadata,
) => {
    const sourceLines =
        source.split(/\r?\n/);

    return flatMapErrorsOr(
        flattenArrayOfErrorsOr(
            toLogicalStatements(sourceLines)
                .map(statement =>
                    parseStatement(
                        statement,
                        sourceLines,
                    ),
                ),
        ),
        parsedEntries =>
            mapErrorsOr(
                classifyTree(
                    buildHierarchy(parsedEntries),
                    sourceLines,
                ),
                entries => ({
                    metadata,
                    entries,
                }),
            ),
    );
};


/*
 * Physical source -> logical statements
 */

const toLogicalStatements = (
    sourceLines: string[],
): LogicalStatement[] => {
    const statements: LogicalStatement[] = [];

    let current: LogicalStatement | undefined;

    sourceLines.forEach((rawLine, index) => {
        const line = index + 1;
        const text =
            normalisePhysicalLine(rawLine);

        if (!text)
            return;

        if (startsStatement(text)) {
            if (current)
                statements.push(current);

            current = {
                lines: [{
                    line,
                    text,
                }],
            };

            return;
        }

        if (!current) {
            current = {
                lines: [{
                    line,
                    text,
                }],
            };

            return;
        }

        current.lines.push({
            line,
            text,
        });
    });

    if (current)
        statements.push(current);

    return statements;
};


const normalisePhysicalLine = (
    line: string,
): string =>
    stripInlineComment(line).trim();


const stripInlineComment = (
    line: string,
): string => {
    let quote: "'" | '"' | undefined;

    for (let index = 0; index < line.length - 1; index++) {
        const current = line[index];
        const next = line[index + 1];

        if (quote) {
            if (current === quote) {
                /*
                 * COBOL escapes a quote by doubling it.
                 */
                if (next === quote) {
                    index++;
                    continue;
                }

                quote = undefined;
            }

            continue;
        }

        if (
            current === "'" ||
            current === '"'
        ) {
            quote = current;
            continue;
        }

        if (
            current === "*" &&
            next === ">"
        )
            return line.substring(0, index);
    }

    /*
     * Traditional full-line comment form accepted by
     * this free-format parser.
     */
    if (line.trimStart().startsWith("*"))
        return "";

    return line;
};


const startsStatement = (
    text: string,
): boolean =>
    /^\d{1,2}\s+/.test(text) ||
    /^COPY\b/i.test(text);


/*
 * Logical statement -> parsed entry
 */
const parseStatement = (
    statement: LogicalStatement,
    sourceLines: string[],
): ErrorsOr<ParsedEntry> =>
    flatMapErrorsOr(
        parseDeclaration(
            statement,
            sourceLines,
        ),
        declaration => {
            if (
                declaration.level === 88 &&
                declaration.name.kind === "filler"
            )
                return errors(
                    diagnostic(
                        sourceLines,
                        declaration.line,
                        "Level 88 condition name cannot be FILLER",
                    ),
                );

            return declaration.level === 88
                ? mapErrorsOr(
                    parseConditionValues(
                        declaration.clauseTokens,
                        declaration.line,
                        sourceLines,
                    ),
                    conditionValues => ({
                        line: declaration.line,
                        level: declaration.level,
                        name: declaration.name,
                        clauses: [],
                        conditionValues,
                    } as ParsedEntry),
                )
                : mapErrorsOr(
                    parseClauses(
                        declaration.clauseTokens,
                        sourceLines,
                    ),
                    parsed => ({
                        line: declaration.line,
                        level: declaration.level,
                        name: declaration.name,
                        picture: parsed.picture,
                        clauses: parsed.clauses,
                    } as ParsedEntry),
                );
        },
    );
/*
 * Logical statement -> declaration
 */

const parseDeclaration = (
    statement: LogicalStatement,
    sourceLines: string[],
): ErrorsOr<Declaration> => {
    const tokens =
        tokeniseStatement(statement);

    const first = tokens[0];

    if (!first)
        return errors(
            diagnostic(
                sourceLines,
                statement.lines[0]?.line ?? 1,
                "Empty declaration",
            ),
        );

    if (upper(first.text) === "COPY")
        return errors(
            diagnostic(
                sourceLines,
                first.line,
                "COPY statements are not supported",
            ),
        );

    if (!/^\d{1,2}$/.test(first.text))
        return errors(
            diagnostic(
                sourceLines,
                first.line,
                `Expected a COBOL level number but found '${first.text}'`,
            ),
        );

    const level = Number(first.text);

    if (!isSupportedLevel(level))
        return errors(
            diagnostic(
                sourceLines,
                first.line,
                `Unsupported COBOL level number '${first.text}'`,
            ),
        );

    if (level === 66)
        return errors(
            diagnostic(
                sourceLines,
                first.line,
                "Level 66 RENAMES entries are not supported",
            ),
        );

    const nameToken = tokens[1];

    if (!nameToken)
        return errors(
            diagnostic(
                sourceLines,
                first.line,
                `Level ${first.text} requires a name`,
            ),
        );

    const clauseTokens =
        tokens.slice(2);

    return value({
        line: first.line,
        level,
        name: parseName(nameToken.text),
        clauseTokens,
    });
};


const isSupportedLevel = (
    level: number,
): boolean =>
    (level >= 1 && level <= 49) ||
    level === 66 ||
    level === 77 ||
    level === 88;


const parseName = (
    text: string,
): CopybookEntryName =>
    upper(text) === "FILLER"
        ? {
            kind: "filler",
        }
        : {
            kind: "named",
            name: text,
        };


/*
 * Logical statement -> tokens
 */

const tokeniseStatement = (
    statement: LogicalStatement,
): Token[] =>
    statement.lines.flatMap(
        (logicalLine, index) => {
            const isLast =
                index ===
                statement.lines.length - 1;

            const text = isLast
                ? removeStatementTerminator(
                    logicalLine.text,
                )
                : logicalLine.text;

            return tokeniseLine(text)
                .map(token => ({
                    text: token,
                    line: logicalLine.line,
                }));
        },
    );


const tokeniseLine = (
    source: string,
): string[] =>
    source.match(
        /"(?:[^"]|"")*"|'(?:[^']|'')*'|(?:,(?!\s)|[^,\s;])+/g,
    ) ?? [];


const removeStatementTerminator = (
    text: string,
): string =>
    text.replace(/\.\s*$/, "").trim();


/*
 * Level 88 condition values
 */

const parseConditionValues = (
    tokens: Token[],
    line: number,
    sourceLines: string[],
): ErrorsOr<ConditionValue[]> => {
    const first = tokens[0];

    if (
        !first ||
        !["VALUE", "VALUES"].includes(
            upper(first.text),
        )
    )
        return errors(
            diagnostic(
                sourceLines,
                line,
                "Level 88 condition requires VALUE",
            ),
        );

    let index = 1;

    if (
        ["IS", "ARE"].includes(
            upper(tokens[index]?.text),
        )
    )
        index++;

    const values: ConditionValue[] = [];

    const parseOperand = ():
        | {
        value: string;
        next: number;
    }
        | {
        error: string;
    } => {
        const token = tokens[index];

        if (!token)
            return {
                error: diagnostic(
                    sourceLines,
                    line,
                    "VALUE requires a value",
                ),
            };

        if (isClauseStart(token))
            return {
                error: diagnostic(
                    sourceLines,
                    token.line,
                    `Level 88 condition cannot contain ${token.text}`,
                ),
            };

        if (
            ["THRU", "THROUGH"].includes(
                upper(token.text),
            )
        )
            return {
                error: diagnostic(
                    sourceLines,
                    token.line,
                    `${token.text} requires a preceding condition value`,
                ),
            };

        if (upper(token.text) === "ALL") {
            const literal = tokens[index + 1];

            if (
                !literal ||
                isClauseStart(literal) ||
                ["THRU", "THROUGH"].includes(
                    upper(literal.text),
                )
            )
                return {
                    error: diagnostic(
                        sourceLines,
                        token.line,
                        "ALL requires a condition value",
                    ),
                };

            return {
                value: `ALL ${literal.text}`,
                next: index + 2,
            };
        }

        return {
            value: token.text,
            next: index + 1,
        };
    };

    while (index < tokens.length) {
        const from =
            parseOperand();

        if ("error" in from)
            return errors(from.error);

        index = from.next;

        const rangeKeyword =
            tokens[index];

        if (
            rangeKeyword &&
            ["THRU", "THROUGH"].includes(
                upper(rangeKeyword.text),
            )
        ) {
            index++;

            const to =
                parseOperand();

            if ("error" in to)
                return errors(
                    diagnostic(
                        sourceLines,
                        rangeKeyword.line,
                        `${rangeKeyword.text} requires an upper value`,
                    ),
                );

            values.push({
                kind: "range",
                from: from.value,
                to: to.value,
            });

            index = to.next;
            continue;
        }

        values.push({
            kind: "value",
            value: from.value,
        });
    }

    if (values.length === 0)
        return errors(
            diagnostic(
                sourceLines,
                line,
                "VALUE requires a value",
            ),
        );

    return value(values);
};

/*
 * Clause parsing
 */

const parseClauses = (
    tokens: Token[],
    sourceLines: string[],
): ErrorsOr<ParsedClauses> => {
    const clauses: CopybookClause[] = [];
    const pictures: string[] = [];
    const parseErrors: string[] = [];

    let index = 0;

    while (index < tokens.length) {
        const token = tokens[index];

        const parser =
            clauseParsers[
                upper(token.text)
                ];

        if (!parser) {
            parseErrors.push(
                diagnostic(
                    sourceLines,
                    token.line,
                    `Unexpected token '${token.text}'`,
                ),
            );

            index++;
            continue;
        }

        const parsed = parser(
            tokens,
            index,
            sourceLines,
        );

        index = parsed.next;

        switch (parsed.kind) {
            case "picture":
                pictures.push(
                    parsed.picture,
                );
                break;

            case "clause":
                clauses.push(
                    parsed.clause,
                );
                break;

            case "error":
                parseErrors.push(
                    parsed.error,
                );
                break;
        }
    }

    if (parseErrors.length > 0)
        return errors(...parseErrors);

    return value({
        picture: pictures[0],
        clauses,
    });
};


/*
 * PIC / PICTURE
 */

const parsePicture: ClauseParser = (
    tokens,
    index,
    sourceLines,
) => {
    const keyword = tokens[index];

    let next = index + 1;

    if (
        upper(tokens[next]?.text) ===
        "IS"
    )
        next++;

    const picture = tokens[next];

    if (
        !picture ||
        isClauseStart(picture)
    )
        return {
            kind: "error",
            error: diagnostic(
                sourceLines,
                keyword.line,
                "PIC requires a picture",
            ),
            next,
        };

    return {
        kind: "picture",
        picture: picture.text,
        next: next + 1,
    };
};


/*
 * REDEFINES
 */

const parseRedefines: ClauseParser = (
    tokens,
    index,
    sourceLines,
) => {
    const keyword = tokens[index];
    const target = tokens[index + 1];

    if (
        !target ||
        isClauseStart(target)
    )
        return {
            kind: "error",
            error: diagnostic(
                sourceLines,
                keyword.line,
                "REDEFINES requires a target",
            ),
            next: index + 1,
        };

    const clause: RedefinesClause = {
        kind: "redefines",
        target: target.text,
    };

    return {
        kind: "clause",
        clause,
        next: index + 2,
    };
};


/*
 * OCCURS
 */

const parseOccurs: ClauseParser = (
    tokens,
    index,
    sourceLines,
) => {
    const keyword = tokens[index];
    const firstCountToken = tokens[index + 1];

    if (!firstCountToken)
        return {
            kind: "error",
            error: diagnostic(
                sourceLines,
                keyword.line,
                "OCCURS requires a count",
            ),
            next: index + 1,
        };

    const firstCount =
        Number(firstCountToken.text);

    if (
        !Number.isInteger(firstCount) ||
        firstCount < 0
    )
        return {
            kind: "error",
            error: diagnostic(
                sourceLines,
                firstCountToken.line,
                `Invalid OCCURS count '${firstCountToken.text}'`,
            ),
            next: index + 2,
        };

    let next = index + 2;
    let min: number | undefined;
    let max: number | undefined;
    let dependingOn: string | undefined;

    if (upper(tokens[next]?.text) === "TO") {
        const maxToken = tokens[next + 1];

        if (!maxToken)
            return {
                kind: "error",
                error: diagnostic(
                    sourceLines,
                    tokens[next].line,
                    "OCCURS TO requires a maximum count",
                ),
                next: next + 1,
            };

        const parsedMax = Number(maxToken.text);

        if (
            !Number.isInteger(parsedMax) ||
            parsedMax <= 0 ||
            firstCount > parsedMax
        )
            return {
                kind: "error",
                error: diagnostic(
                    sourceLines,
                    maxToken.line,
                    `Invalid OCCURS maximum '${maxToken.text}'`,
                ),
                next: next + 2,
            };

        min = firstCount;
        max = parsedMax;
        next += 2;
    }
    else if (firstCount <= 0)
        return {
            kind: "error",
            error: diagnostic(
                sourceLines,
                firstCountToken.line,
                `Invalid OCCURS count '${firstCountToken.text}'`,
            ),
            next,
        };

    if (upper(tokens[next]?.text) === "TIMES")
        next++;

    if (upper(tokens[next]?.text) === "DEPENDING") {
        next++;

        if (upper(tokens[next]?.text) === "ON")
            next++;

        const dependingOnToken = tokens[next];

        if (
            !dependingOnToken ||
            isOccursTailKeyword(dependingOnToken) ||
            isClauseStart(dependingOnToken)
        )
            return {
                kind: "error",
                error: diagnostic(
                    sourceLines,
                    tokens[next - 1]?.line ?? keyword.line,
                    "OCCURS DEPENDING ON requires a data name",
                ),
                next: skipUntilNextClause(
                    tokens,
                    next,
                ),
            };

        dependingOn = dependingOnToken.text;
        next++;

        if (min === undefined) {
            min = 1;
            max = firstCount;
        }
    }
    else if (min !== undefined)
        return {
            kind: "error",
            error: diagnostic(
                sourceLines,
                keyword.line,
                "OCCURS range requires DEPENDING ON",
            ),
            next,
        };

    const keys: NonNullable<OccursClause["keys"]> = [];
    let indexedBy: string[] | undefined;

    while (next < tokens.length) {
        const tailKeyword = upper(tokens[next]?.text);

        if (
            tailKeyword === "ASCENDING" ||
            tailKeyword === "DESCENDING"
        ) {
            const order = tailKeyword === "ASCENDING"
                ? "ascending"
                : "descending";
            const orderToken = tokens[next];
            next++;

            if (upper(tokens[next]?.text) !== "KEY")
                return {
                    kind: "error",
                    error: diagnostic(
                        sourceLines,
                        orderToken.line,
                        `${orderToken.text} requires KEY`,
                    ),
                    next: skipUntilNextClause(
                        tokens,
                        next,
                    ),
                };

            next++;

            if (upper(tokens[next]?.text) === "IS")
                next++;

            const names: string[] = [];

            while (
                next < tokens.length &&
                !isOccursTailKeyword(tokens[next]) &&
                !isClauseStart(tokens[next])
            ) {
                names.push(tokens[next].text);
                next++;
            }

            if (names.length === 0)
                return {
                    kind: "error",
                    error: diagnostic(
                        sourceLines,
                        tokens[next - 1]?.line ?? orderToken.line,
                        `${orderToken.text} KEY requires a data name`,
                    ),
                    next: skipUntilNextClause(
                        tokens,
                        next,
                    ),
                };

            keys.push({
                order,
                names,
            });
            continue;
        }

        if (tailKeyword === "INDEXED") {
            const indexedToken = tokens[next];
            next++;

            if (upper(tokens[next]?.text) !== "BY")
                return {
                    kind: "error",
                    error: diagnostic(
                        sourceLines,
                        indexedToken.line,
                        "INDEXED requires BY",
                    ),
                    next: skipUntilNextClause(
                        tokens,
                        next,
                    ),
                };

            next++;
            const names: string[] = [];

            while (
                next < tokens.length &&
                !isOccursTailKeyword(tokens[next]) &&
                !isClauseStart(tokens[next])
            ) {
                names.push(tokens[next].text);
                next++;
            }

            if (names.length === 0)
                return {
                    kind: "error",
                    error: diagnostic(
                        sourceLines,
                        tokens[next - 1]?.line ?? indexedToken.line,
                        "INDEXED BY requires an index name",
                    ),
                    next: skipUntilNextClause(
                        tokens,
                        next,
                    ),
                };

            if (indexedBy)
                return {
                    kind: "error",
                    error: diagnostic(
                        sourceLines,
                        indexedToken.line,
                        "OCCURS cannot contain more than one INDEXED BY phrase",
                    ),
                    next: skipUntilNextClause(
                        tokens,
                        next,
                    ),
                };

            indexedBy = names;
            continue;
        }

        break;
    }

    const details = {
        ...(keys.length > 0 ? {keys} : {}),
        ...(indexedBy ? {indexedBy} : {}),
    };

    const clause: OccursClause = dependingOn !== undefined
        ? {
            kind: "occurs",
            min: min!,
            max: max!,
            dependingOn,
            ...details,
        }
        : {
            kind: "occurs",
            count: firstCount,
            ...details,
        };

    return {
        kind: "clause",
        clause,
        next,
    };
};

const occursTailKeywords = [
    "ASCENDING",
    "DESCENDING",
    "INDEXED",
] as const;

const isOccursTailKeyword = (
    token: Token | undefined,
): boolean =>
    token !== undefined &&
    occursTailKeywords.includes(
        upper(token.text) as typeof occursTailKeywords[number],
    );

/*
 * USAGE
 */

const parseUsage: ClauseParser = (
    tokens,
    index,
    sourceLines,
) => {
    const keyword = tokens[index];

    let next = index + 1;

    if (
        upper(tokens[next]?.text) ===
        "IS"
    )
        next++;

    const usage = tokens[next];

    if (!usage)
        return {
            kind: "error",
            error: diagnostic(
                sourceLines,
                keyword.line,
                "USAGE requires a value",
            ),
            next,
        };

    if (
        isClauseStart(usage) &&
        !isDirectUsageToken(usage)
    )
        return {
            kind: "error",
            error: diagnostic(
                sourceLines,
                keyword.line,
                "USAGE requires a value",
            ),
            next,
        };

    const clause: UsageClause = {
        kind: "usage",
        usage: upper(usage.text),
    };

    return {
        kind: "clause",
        clause,
        next: next + 1,
    };
};


const parseDirectUsage: ClauseParser = (
    tokens,
    index,
) => {
    const clause: UsageClause = {
        kind: "usage",
        usage: upper(
            tokens[index].text,
        ),
    };

    return {
        kind: "clause",
        clause,
        next: index + 1,
    };
};


/*
 * SIGN
 */

const parseSign: ClauseParser = (
    tokens,
    index,
    sourceLines,
) => {
    const keyword = tokens[index];

    let next = index + 1;

    if (
        upper(tokens[next]?.text) ===
        "IS"
    )
        next++;

    let position:
        | "leading"
        | "trailing"
        | undefined;

    if (
        upper(tokens[next]?.text) ===
        "LEADING"
    ) {
        position = "leading";
        next++;
    } else if (
        upper(tokens[next]?.text) ===
        "TRAILING"
    ) {
        position = "trailing";
        next++;
    }

    let separate = false;

    if (
        upper(tokens[next]?.text) ===
        "SEPARATE"
    ) {
        separate = true;
        next++;

        if (
            upper(tokens[next]?.text) ===
            "CHARACTER"
        )
            next++;
    }

    if (
        position === undefined &&
        !separate
    )
        return {
            kind: "error",
            error: diagnostic(
                sourceLines,
                keyword.line,
                "SIGN requires LEADING, TRAILING or SEPARATE",
            ),
            next: skipUntilNextClause(
                tokens,
                next,
            ),
        };

    const clause: SignClause = {
        kind: "sign",
        position,
        separate,
    };

    return {
        kind: "clause",
        clause,
        next,
    };
};


/*
 * VALUE
 */

const parseValue: ClauseParser = (
    tokens,
    index,
    sourceLines,
) => {
    const keyword = tokens[index];

    let next = index + 1;

    if (
        upper(tokens[next]?.text) ===
        "IS"
    )
        next++;

    const rawValue = tokens[next];

    if (
        !rawValue ||
        isClauseStart(rawValue)
    )
        return {
            kind: "error",
            error: diagnostic(
                sourceLines,
                keyword.line,
                "VALUE requires a value",
            ),
            next,
        };

    const clause: ValueClause = {
        kind: "value",
        value: rawValue.text,
    };

    return {
        kind: "clause",
        clause,
        next: next + 1,
    };
};


/*
 * JUSTIFIED
 */

const parseJustified: ClauseParser = (
    tokens,
    index,
) => {
    let next = index + 1;

    if (
        upper(tokens[next]?.text) ===
        "RIGHT"
    )
        next++;

    const clause: JustifiedClause = {
        kind: "justified",
    };

    return {
        kind: "clause",
        clause,
        next,
    };
};


/*
 * BLANK WHEN ZERO
 */

const parseBlankWhenZero: ClauseParser = (
    tokens,
    index,
    sourceLines,
) => {
    const keyword = tokens[index];

    const when =
        upper(tokens[index + 1]?.text);

    const zero =
        upper(tokens[index + 2]?.text);

    if (
        when !== "WHEN" ||
        ![
            "ZERO",
            "ZEROS",
            "ZEROES",
        ].includes(zero)
    )
        return {
            kind: "error",
            error: diagnostic(
                sourceLines,
                keyword.line,
                "Expected BLANK WHEN ZERO",
            ),
            next: skipUntilNextClause(
                tokens,
                index + 1,
            ),
        };

    const clause: BlankWhenZeroClause = {
        kind: "blank-when-zero",
    };

    return {
        kind: "clause",
        clause,
        next: index + 3,
    };
};


/*
 * SYNCHRONIZED
 */

const parseSynchronized: ClauseParser = (
    tokens,
    index,
) => {
    let next = index + 1;

    let position:
        | "left"
        | "right"
        | undefined;

    if (
        upper(tokens[next]?.text) ===
        "LEFT"
    ) {
        position = "left";
        next++;
    } else if (
        upper(tokens[next]?.text) ===
        "RIGHT"
    ) {
        position = "right";
        next++;
    }

    const clause: SynchronizedClause = {
        kind: "synchronized",
        position,
    };

    return {
        kind: "clause",
        clause,
        next,
    };
};


/*
 * Usage vocabulary
 */

const directUsageTokens = [
    "DISPLAY",
    "BINARY",
    "COMP",
    "COMP-1",
    "COMP-2",
    "COMP-3",
    "COMP-4",
    "COMP-5",
    "COMPUTATIONAL",
    "COMPUTATIONAL-1",
    "COMPUTATIONAL-2",
    "COMPUTATIONAL-3",
    "COMPUTATIONAL-4",
    "COMPUTATIONAL-5",
    "PACKED-DECIMAL",
    "INDEX",
    "POINTER",
    "FUNCTION-POINTER",
    "PROCEDURE-POINTER",
] as const;


type DirectUsageToken =
    typeof directUsageTokens[number];


const picturelessElementaryUsages = [
    "COMP-1",
    "COMP-2",
    "COMPUTATIONAL-1",
    "COMPUTATIONAL-2",
    "INDEX",
    "POINTER",
    "FUNCTION-POINTER",
    "PROCEDURE-POINTER",
] as const;


type PicturelessElementaryUsage =
    typeof picturelessElementaryUsages[number];


/*
 * Clause parser registry
 */

const clauseParsers: Record<
    string,
    ClauseParser
> = {
    PIC: parsePicture,
    PICTURE: parsePicture,

    REDEFINES: parseRedefines,

    OCCURS: parseOccurs,

    USAGE: parseUsage,

    SIGN: parseSign,

    VALUE: parseValue,

    JUST: parseJustified,
    JUSTIFIED: parseJustified,

    BLANK: parseBlankWhenZero,

    SYNC: parseSynchronized,
    SYNCHRONIZED: parseSynchronized,

    ...Object.fromEntries(
        directUsageTokens.map(
            token => [
                token,
                parseDirectUsage,
            ],
        ),
    ),
};


/*
 * Parsed entries -> structural hierarchy
 */

const buildHierarchy = (
    entries: ParsedEntry[],
): ParsedTreeEntry[] => {
    const roots: ParsedTreeEntry[] = [];
    const stack: ParsedTreeEntry[] = [];

    for (const parsedEntry of entries) {
        const entry: ParsedTreeEntry = {
            ...parsedEntry,
            children: [],
        };

        if (parsedEntry.level === 77) {
            roots.push(entry);
            stack.length = 0;
            continue;
        }

        if (parsedEntry.level === 88) {
            while (
                stack.length > 0 &&
                stack[stack.length - 1].level === 88
            )
                stack.pop();

            const parent =
                stack[stack.length - 1];

            if (parent)
                parent.children.push(entry);
            else
                roots.push(entry);

            stack.push(entry);
            continue;
        }

        while (
            stack.length > 0 &&
            parsedEntry.level <=
            stack[stack.length - 1].level
            )
            stack.pop();

        const parent =
            stack[stack.length - 1];

        if (parent)
            parent.children.push(entry);
        else
            roots.push(entry);

        stack.push(entry);
    }

    return roots;
};


/*
 * Structural hierarchy -> public AST
 */

const classifyTree = (
    entries: ParsedTreeEntry[],
    sourceLines: string[],
): ErrorsOr<CopybookEntry[]> =>
    flattenArrayOfErrorsOr(
        entries.map(entry =>
            classifyEntry(
                entry,
                sourceLines,
            ),
        ),
    );


const classifyEntry = (
    entry: ParsedTreeEntry,
    sourceLines: string[],
): ErrorsOr<CopybookEntry> => {
    if (entry.level === 88)
        return errors(
            diagnostic(
                sourceLines,
                entry.line,
                "Level 88 condition must follow an elementary data item",
            ),
        );

    const conditionChildren =
        entry.children.filter(
            child => child.level === 88,
        );

    const dataChildren =
        entry.children.filter(
            child => child.level !== 88,
        );

    if (
        conditionChildren.length > 0 &&
        dataChildren.length > 0
    )
        return errors(
            diagnostic(
                sourceLines,
                entry.line,
                "An entry cannot contain both level 88 conditions and subordinate data items",
            ),
        );

    if (conditionChildren.length > 0) {
        if (
            entry.picture === undefined &&
            !hasPicturelessElementaryUsage(entry)
        )
            return errors(
                diagnostic(
                    sourceLines,
                    entry.line,
                    "Level 88 conditions require an elementary parent",
                ),
            );

        return mapErrorsOr(
            classifyConditions(
                conditionChildren,
                sourceLines,
            ),
            conditions =>
                makeElementaryEntry(
                    entry,
                    conditions,
                ),
        );
    }

    if (dataChildren.length > 0)
        return classifyGroup(
            entry,
            dataChildren,
            sourceLines,
        );

    if (
        entry.picture !== undefined ||
        hasPicturelessElementaryUsage(entry)
    )
        return value(
            makeElementaryEntry(
                entry,
                [],
            ),
        );

    return value(
        makeGroupEntry(
            entry,
            [],
        ),
    );
};


const classifyConditions = (
    entries: ParsedTreeEntry[],
    sourceLines: string[],
): ErrorsOr<ConditionEntry[]> =>
    flattenArrayOfErrorsOr(
        entries.map(entry => {
            if (entry.children.length > 0)
                return errors(
                    diagnostic(
                        sourceLines,
                        entry.line,
                        "Level 88 condition cannot contain subordinate entries",
                    ),
                );

            return value({
                kind: "condition",
                level: 88,
                name: entry.name,
                values: entry.conditionValues!,
                line: entry.line,
            });
        }),
    );

const classifyGroup = (
    entry: ParsedTreeEntry,
    childrenToClassify: ParsedTreeEntry[],
    sourceLines: string[],
): ErrorsOr<GroupEntry> => {
    if (entry.picture !== undefined)
        return errors(
            diagnostic(
                sourceLines,
                entry.line,
                "An entry with a PIC clause cannot contain subordinate entries",
            ),
        );

    if (hasPicturelessElementaryUsage(entry))
        return errors(
            diagnostic(
                sourceLines,
                entry.line,
                "An elementary USAGE entry cannot contain subordinate entries",
            ),
        );

    return mapErrorsOr(
        classifyTree(
            childrenToClassify,
            sourceLines,
        ),
        children =>
            makeGroupEntry(
                entry,
                children,
            ),
    );
};


const makeGroupEntry = (
    entry: ParsedTreeEntry,
    children: CopybookEntry[],
): GroupEntry => ({
    kind: "group",
    level: entry.level,
    name: entry.name,
    clauses: entry.clauses,
    line: entry.line,
    children,
});


const makeElementaryEntry = (
    entry: ParsedTreeEntry,
    conditions: ConditionEntry[],
): ElementaryEntry => ({
    kind: "elementary",
    level: entry.level,
    name: entry.name,
    picture: entry.picture,
    clauses: entry.clauses,
    conditions,
    line: entry.line,
});


const hasPicturelessElementaryUsage = (
    entry: ParsedEntry,
): boolean =>
    entry.clauses.some(
        clause =>
            clause.kind === "usage" &&
            isPicturelessElementaryUsage(
                clause.usage,
            ),
    );


const isPicturelessElementaryUsage = (
    usage: string,
): boolean =>
    picturelessElementaryUsages.includes(
        upper(usage) as
            PicturelessElementaryUsage,
    );


/*
 * Diagnostics
 */

const diagnostic = (
    sourceLines: string[],
    line: number,
    message: string,
): string => {
    const context: string[] = [];

    if (line > 1)
        context.push(
            formatSourceLine(
                sourceLines,
                line - 1,
                false,
            ),
        );

    context.push(
        formatSourceLine(
            sourceLines,
            line,
            true,
        ),
    );

    if (line < sourceLines.length)
        context.push(
            formatSourceLine(
                sourceLines,
                line + 1,
                false,
            ),
        );

    return [
        `${message} at line ${line}`,
        "",
        ...context,
    ].join("\n");
};


const formatSourceLine = (
    sourceLines: string[],
    line: number,
    failing: boolean,
): string => {
    const marker =
        failing ? ">" : " ";

    return `${marker} ${line} | ${sourceLines[line - 1] ?? ""}`;
};


/*
 * Helpers
 */

const skipUntilNextClause = (
    tokens: Token[],
    start: number,
): number => {
    let index = start;

    while (
        index < tokens.length &&
        !isClauseStart(tokens[index])
        )
        index++;

    return index;
};


const isClauseStart = (
    token: Token | undefined,
): boolean =>
    token !== undefined &&
    clauseParsers[
        upper(token.text)
        ] !== undefined;


const isDirectUsageToken = (
    token: Token | undefined,
): boolean =>
    token !== undefined &&
    directUsageTokens.includes(
        upper(token.text) as
            DirectUsageToken,
    );


const upper = (
    value: string | undefined,
): string =>
    value?.toUpperCase() ?? "";