import {
    ValidationOptions,
    Validator,
    combineValidators,
    composeTypedOr,
    mustBeArrayOf,
    mustBeNumber,
    mustBeObjectWithFields,
    mustBeString,
    mustBeStringIfPresent,
    mustBeValue,
} from "@cobol-ts/validate";

import {
    ConditionEntry,
    ConditionValue,
    CopybookAst,
    CopybookClause,
    CopybookEntry,
    CopybookEntryName,
    ElementaryEntry,
    GroupEntry,
    OccursClause,
    RedefinesClause,
    SignClause,
    SynchronizedClause,
    UsageClause,
    ValueClause,
} from "./copybook.ast";


type CopybookSource = string[];


/*
 * Error formatting
 */

const copybookError = (
    options: ValidationOptions<CopybookSource> | undefined,
    line: unknown,
    message: string,
): string => {
    if (
        typeof line !== "number" ||
        !Number.isInteger(line) ||
        line <= 0
    )
        return message;

    const heading =
        `${message} at source line ${line}`;

    const source = options?.source;

    if (
        !source ||
        line > source.length
    )
        return heading;

    const result = [
        heading,
        "",
    ];

    if (line > 1)
        result.push(
            `  ${line - 1} | ${source[line - 2]}`,
        );

    result.push(
        `> ${line} | ${source[line - 1]}`,
    );

    if (line < source.length)
        result.push(
            `  ${line + 1} | ${source[line]}`,
        );

    return result.join("\n");
};


const copybookErrors = (
    options: ValidationOptions<CopybookSource> | undefined,
    line: unknown,
    errors: string[],
): string[] =>
    errors.map(
        error =>
            copybookError(
                options,
                line,
                error,
            ),
    );


/*
 * Small generic helpers
 */

const optionalBoolean:
    Validator<boolean | undefined, CopybookSource> =
    (ctx, _options) => value => {
        if (
            value === undefined ||
            value === null
        )
            return [];

        return typeof value === "boolean"
            ? []
            : [
                `${ctx} must be a boolean`,
            ];
    };


const optionalEnum = <T extends string>(
    values: readonly T[],
): Validator<T | undefined, CopybookSource> =>
    (ctx, _options) => value => {
        if (
            value === undefined ||
            value === null
        )
            return [];

        return values.includes(value)
            ? []
            : [
                `${ctx} must be one of ${values.join(", ")} but was ${String(value)}`,
            ];
    };


/*
 * Elementary-only USAGE
 */

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


const hasPicturelessElementaryUsage = (
    entry: Pick<CopybookEntry, "clauses">,
): boolean => {
    if (!Array.isArray(entry.clauses))
        return false;

    return entry.clauses.some(
        clause =>
            clause?.kind === "usage" &&
            typeof clause.usage === "string" &&
            picturelessElementaryUsages.includes(
                clause.usage.toUpperCase() as
                    PicturelessElementaryUsage,
            ),
    );
};


/*
 * Entry names
 */

const copybookEntryNameValidator:
    Validator<CopybookEntryName, CopybookSource> =
    composeTypedOr(
        name => name?.kind,
        {
            named:
                mustBeObjectWithFields({
                    kind: mustBeValue("named"),
                    name: mustBeString,
                }),

            filler:
                mustBeObjectWithFields({
                    kind: mustBeValue("filler"),
                }),
        },
    );


/*
 * Clauses
 */

const copybookClauseValidator:
    Validator<CopybookClause, CopybookSource> =
    composeTypedOr(
        clause => clause?.kind,
        {
            redefines:
                mustBeObjectWithFields<RedefinesClause>({
                    kind: mustBeValue("redefines"),
                    target: mustBeString,
                }),

            occurs:
                (ctx, _options) => clause => {
                    if (
                        typeof clause !== "object" ||
                        clause === null
                    )
                        return [
                            `${ctx} must be an object`,
                        ];

                    const result: string[] = [];

                    if ("count" in clause) {
                        if (typeof clause.count !== "number")
                            result.push(
                                `${ctx}.count must be a number`,
                            );
                    }
                    else {
                        if (typeof clause.min !== "number")
                            result.push(
                                `${ctx}.min must be a number`,
                            );

                        if (typeof clause.max !== "number")
                            result.push(
                                `${ctx}.max must be a number`,
                            );

                        if (typeof clause.dependingOn !== "string")
                            result.push(
                                `${ctx}.dependingOn must be a string`,
                            );
                    }

                    if (
                        "keys" in clause &&
                        clause.keys !== undefined
                    ) {
                        if (!Array.isArray(clause.keys))
                            result.push(
                                `${ctx}.keys must be an array`,
                            );
                        else
                            clause.keys.forEach(
                                (key, keyIndex) => {
                                    if (
                                        typeof key !== "object" ||
                                        key === null
                                    ) {
                                        result.push(
                                            `${ctx}.keys[${keyIndex}] must be an object`,
                                        );
                                        return;
                                    }

                                    if (
                                        key.order !== "ascending" &&
                                        key.order !== "descending"
                                    )
                                        result.push(
                                            `${ctx}.keys[${keyIndex}].order must be one of ascending, descending but was ${String(key.order)}`,
                                        );

                                    if (!Array.isArray(key.names))
                                        result.push(
                                            `${ctx}.keys[${keyIndex}].names must be an array`,
                                        );
                                    else
                                        key.names.forEach(
                                            (name, nameIndex) => {
                                                if (typeof name !== "string")
                                                    result.push(
                                                        `${ctx}.keys[${keyIndex}].names[${nameIndex}] must be a string`,
                                                    );
                                            },
                                        );
                                },
                            );
                    }

                    if (
                        "indexedBy" in clause &&
                        clause.indexedBy !== undefined
                    ) {
                        if (!Array.isArray(clause.indexedBy))
                            result.push(
                                `${ctx}.indexedBy must be an array`,
                            );
                        else
                            clause.indexedBy.forEach(
                                (name, nameIndex) => {
                                    if (typeof name !== "string")
                                        result.push(
                                            `${ctx}.indexedBy[${nameIndex}] must be a string`,
                                        );
                                },
                            );
                    }

                    return result;
                },

            usage:
                mustBeObjectWithFields<UsageClause>({
                    kind: mustBeValue("usage"),
                    usage: mustBeString,
                }),

            sign:
                mustBeObjectWithFields<SignClause>({
                    kind: mustBeValue("sign"),
                    position: optionalEnum(
                        ["leading", "trailing"],
                    ),
                    separate: optionalBoolean,
                }),

            value:
                mustBeObjectWithFields<ValueClause>({
                    kind: mustBeValue("value"),
                    value: mustBeString,
                }),

            justified:
                mustBeObjectWithFields({
                    kind: mustBeValue("justified"),
                }),

            "blank-when-zero":
                mustBeObjectWithFields({
                    kind: mustBeValue(
                        "blank-when-zero",
                    ),
                }),

            synchronized:
                mustBeObjectWithFields<SynchronizedClause>({
                    kind: mustBeValue("synchronized"),
                    position: optionalEnum(
                        ["left", "right"],
                    ),
                }),
        },
    );


/*
 * Semantic helpers
 */

const validateDuplicateClauses:
    Validator<CopybookEntry, CopybookSource> =
    (ctx, options) => entry => {
        if (!Array.isArray(entry.clauses))
            return [];

        const singletonKinds:
            CopybookClause["kind"][] = [
            "redefines",
            "occurs",
            "usage",
            "sign",
            "value",
            "justified",
            "blank-when-zero",
            "synchronized",
        ];

        return singletonKinds.flatMap(
            kind => {
                const count =
                    entry.clauses.filter(
                        clause =>
                            clause?.kind === kind,
                    ).length;

                return count > 1
                    ? [
                        copybookError(
                            options,
                            entry.line,
                            `${ctx}.clauses contains ${count} ${kind} clauses; at most one is allowed`,
                        ),
                    ]
                    : [];
            },
        );
    };


const validateOccursCounts:
    Validator<CopybookEntry, CopybookSource> =
    (ctx, options) => entry => {
        if (!Array.isArray(entry.clauses))
            return [];

        return entry.clauses.flatMap(
            (clause, index) => {
                if (clause?.kind !== "occurs")
                    return [];

                if ("count" in clause) {
                    if (typeof clause.count !== "number")
                        return [];

                    return (
                        !Number.isInteger(clause.count) ||
                        clause.count <= 0
                    )
                        ? [
                            copybookError(
                                options,
                                entry.line,
                                `${ctx}.clauses[${index}].count must be a positive integer`,
                            ),
                        ]
                        : [];
                }

                if (
                    typeof clause.min !== "number" ||
                    typeof clause.max !== "number"
                )
                    return [];

                const result: string[] = [];

                const validMin =
                    Number.isInteger(clause.min) &&
                    clause.min >= 0;

                const validMax =
                    Number.isInteger(clause.max) &&
                    clause.max > 0;

                if (!validMin)
                    result.push(
                        copybookError(
                            options,
                            entry.line,
                            `${ctx}.clauses[${index}].min must be a non-negative integer`,
                        ),
                    );

                if (!validMax)
                    result.push(
                        copybookError(
                            options,
                            entry.line,
                            `${ctx}.clauses[${index}].max must be a positive integer`,
                        ),
                    );

                if (
                    validMin &&
                    validMax &&
                    clause.min > clause.max
                )
                    result.push(
                        copybookError(
                            options,
                            entry.line,
                            `${ctx}.clauses[${index}].min must not exceed max`,
                        ),
                    );

                return result;
            },
        );
    };


const validateOccursSemantics:
    Validator<CopybookEntry, CopybookSource> =
    (ctx, options) => entry => {
        if (!Array.isArray(entry.clauses))
            return [];

        return entry.clauses.flatMap(
            (clause, index) => {
                if (clause?.kind !== "occurs")
                    return [];

                const result: string[] = [];
                const clauseContext =
                    `${ctx}.clauses[${index}]`;

                if (
                    typeof entry.level === "number" &&
                    (
                        entry.level === 1 ||
                        entry.level === 77
                    )
                )
                    result.push(
                        copybookError(
                            options,
                            entry.line,
                            `${clauseContext} OCCURS is not allowed at level ${entry.level}`,
                        ),
                    );

                if (
                    "dependingOn" in clause &&
                    typeof clause.dependingOn === "string" &&
                    clause.dependingOn.trim().length === 0
                )
                    result.push(
                        copybookError(
                            options,
                            entry.line,
                            `${clauseContext}.dependingOn must not be empty`,
                        ),
                    );

                if (
                    Array.isArray(clause.keys) &&
                    clause.keys.length === 0
                )
                    result.push(
                        copybookError(
                            options,
                            entry.line,
                            `${clauseContext}.keys must contain at least one key`,
                        ),
                    );

                if (Array.isArray(clause.keys))
                    clause.keys.forEach(
                        (key, keyIndex) => {
                            if (
                                typeof key !== "object" ||
                                key === null ||
                                !Array.isArray(key.names)
                            )
                                return;

                            if (key.names.length === 0)
                                result.push(
                                    copybookError(
                                        options,
                                        entry.line,
                                        `${clauseContext}.keys[${keyIndex}].names must contain at least one name`,
                                    ),
                                );

                            key.names.forEach(
                                (name, nameIndex) => {
                                    if (
                                        typeof name === "string" &&
                                        name.trim().length === 0
                                    )
                                        result.push(
                                            copybookError(
                                                options,
                                                entry.line,
                                                `${clauseContext}.keys[${keyIndex}].names[${nameIndex}] must not be empty`,
                                            ),
                                        );
                                },
                            );
                        },
                    );

                if (
                    Array.isArray(clause.indexedBy) &&
                    clause.indexedBy.length === 0
                )
                    result.push(
                        copybookError(
                            options,
                            entry.line,
                            `${clauseContext}.indexedBy must contain at least one name`,
                        ),
                    );

                if (Array.isArray(clause.indexedBy))
                    clause.indexedBy.forEach(
                        (name, nameIndex) => {
                            if (
                                typeof name === "string" &&
                                name.trim().length === 0
                            )
                                result.push(
                                    copybookError(
                                        options,
                                        entry.line,
                                        `${clauseContext}.indexedBy[${nameIndex}] must not be empty`,
                                    ),
                                );
                        },
                    );

                return result;
            },
        );
    };


const validateLevel:
    Validator<CopybookEntry, CopybookSource> =
    (ctx, options) => entry => {
        if (typeof entry.level !== "number")
            return [];

        const supported =
            (
                entry.level >= 1 &&
                entry.level <= 49
            ) ||
            entry.level === 77;

        return supported
            ? []
            : [
                copybookError(
                    options,
                    entry.line,
                    `${ctx}.level must be between 1 and 49, or 77, but was ${entry.level}`,
                ),
            ];
    };


const validateSourceLine:
    Validator<CopybookEntry, CopybookSource> =
    (ctx, options) => entry => {
        if (typeof entry.line !== "number")
            return [];

        return (
            Number.isInteger(entry.line) &&
            entry.line > 0
        )
            ? []
            : [
                copybookError(
                    options,
                    entry.line,
                    `${ctx}.line must be a positive integer but was ${entry.line}`,
                ),
            ];
    };


const validateGroupSemantics:
    Validator<GroupEntry, CopybookSource> =
    (ctx, options) => entry => {
        if (
            typeof entry !== "object" ||
            entry === null ||
            !Array.isArray(entry.clauses)
        )
            return [];

        return hasPicturelessElementaryUsage(entry)
            ? [
                copybookError(
                    options,
                    entry.line,
                    `${ctx} is a group but has an elementary-only USAGE`,
                ),
            ]
            : [];
    };


const validateElementarySemantics:
    Validator<ElementaryEntry, CopybookSource> =
    (ctx, options) => entry => {
        if (
            typeof entry !== "object" ||
            entry === null ||
            !Array.isArray(entry.clauses)
        )
            return [];

        if (
            entry.picture === undefined &&
            !hasPicturelessElementaryUsage(entry)
        )
            return [
                copybookError(
                    options,
                    entry.line,
                    `${ctx} is elementary but has neither PIC nor an elementary-only USAGE`,
                ),
            ];

        return [];
    };


/*
 * Level 88 conditions
 */

const conditionValueValidator:
    Validator<ConditionValue, CopybookSource> =
    composeTypedOr(
        conditionValue => conditionValue?.kind,
        {
            value:
                mustBeObjectWithFields({
                    kind: mustBeValue("value"),
                    value: mustBeString,
                }),

            range:
                mustBeObjectWithFields({
                    kind: mustBeValue("range"),
                    from: mustBeString,
                    to: mustBeString,
                }),
        },
    );


const conditionEntryValidator:
    Validator<ConditionEntry, CopybookSource> =
    mustBeObjectWithFields<
        ConditionEntry,
        CopybookSource
    >({
        kind: mustBeValue("condition"),
        level: mustBeValue(88),
        name: copybookEntryNameValidator,
        values: mustBeArrayOf(
            conditionValueValidator,
        ),
        line: mustBeNumber,
    });


const validateConditionSemantics:
    Validator<ConditionEntry, CopybookSource> =
    (ctx, options) => condition => {
        if (
            typeof condition !== "object" ||
            condition === null
        )
            return [];

        const result: string[] = [];

        if (
            condition.name?.kind === "filler"
        )
            result.push(
                copybookError(
                    options,
                    condition.line,
                    `${ctx}.name cannot be FILLER`,
                ),
            );

        if (
            Array.isArray(condition.values) &&
            condition.values.length === 0
        )
            result.push(
                copybookError(
                    options,
                    condition.line,
                    `${ctx}.values must contain at least one value`,
                ),
            );

        return result;
    };


/*
 * Entry shape
 *
 * Shape errors belonging to an entry inherit that
 * entry's physical source line.
 *
 * Child entries are validated separately because
 * they have their own physical source lines.
 */

type GroupEntryWithoutChildren =
    Omit<GroupEntry, "children">;


const groupEntryLocalValidator:
    Validator<GroupEntryWithoutChildren, CopybookSource> =
    mustBeObjectWithFields<
        GroupEntryWithoutChildren,
        CopybookSource
    >({
        kind: mustBeValue("group"),
        level: mustBeNumber,
        name: copybookEntryNameValidator,
        clauses: mustBeArrayOf(
            copybookClauseValidator,
        ),
        line: mustBeNumber,
    });


const elementaryEntryLocalValidator:
    Validator<ElementaryEntry, CopybookSource> =
    mustBeObjectWithFields<
        ElementaryEntry,
        CopybookSource
    >({
        kind: mustBeValue("elementary"),
        level: mustBeNumber,
        name: copybookEntryNameValidator,
        picture: mustBeStringIfPresent,
        clauses: mustBeArrayOf(
            copybookClauseValidator,
        ),
        conditions: mustBeArrayOf(
            conditionEntryValidator,
        ),
        line: mustBeNumber,
    });


let copybookEntryValidator:
    Validator<CopybookEntry, CopybookSource>;


const groupEntryValidator:
    Validator<GroupEntry, CopybookSource> =
    (ctx, options) => entry => {
        const result =
            copybookErrors(
                options,
                entry?.line,
                groupEntryLocalValidator(
                    ctx,
                    options,
                )(entry),
            );

        if (!Array.isArray(entry?.children)) {
            result.push(
                copybookError(
                    options,
                    entry?.line,
                    `${ctx}.children must be an array`,
                ),
            );

            return result;
        }

        result.push(
            ...entry.children.flatMap(
                (child, index) =>
                    copybookEntryValidator(
                        `${ctx}.children[${index}]`,
                        options,
                    )(child),
            ),
        );

        return result;
    };


const elementaryEntryValidator:
    Validator<ElementaryEntry, CopybookSource> =
    (ctx, options) => entry =>
        copybookErrors(
            options,
            entry?.line,
            elementaryEntryLocalValidator(
                ctx,
                options,
            )(entry),
        );


/*
 * Runtime entry boundary
 *
 * CopybookEntry describes a valid AST, but this validator
 * deliberately receives values which may not actually satisfy
 * that type at runtime.
 */

type RuntimeCopybookEntry = {
    kind?: unknown;
    line?: unknown;
};


copybookEntryValidator =
    (ctx, options) => entry => {
        if (
            typeof entry !== "object" ||
            entry === null
        )
            return [
                `${ctx} has no valid type`,
            ];

        const runtimeEntry =
            entry as unknown as RuntimeCopybookEntry;

        const kind =
            runtimeEntry.kind;

        const line =
            runtimeEntry.line;

        if (
            kind === undefined ||
            kind === null
        )
            return [
                copybookError(
                    options,
                    line,
                    `${ctx} has no valid type`,
                ),
            ];

        if (kind === "group")
            return groupEntryValidator(
                ctx,
                options,
            )(entry as GroupEntry);

        if (kind === "elementary")
            return elementaryEntryValidator(
                ctx,
                options,
            )(entry as ElementaryEntry);

        return [
            copybookError(
                options,
                line,
                `${ctx} has illegal type ${String(kind)}. Legal values are: elementary, group`,
            ),
        ];
    };


/*
 * Recursive semantic validation
 */

const validateEntrySemantics:
    Validator<CopybookEntry, CopybookSource> =
    (ctx, options) => entry => {
        if (
            typeof entry !== "object" ||
            entry === null
        )
            return [];

        const result: string[] = [];

        result.push(
            ...validateLevel(
                ctx,
                options,
            )(entry),
        );

        result.push(
            ...validateSourceLine(
                ctx,
                options,
            )(entry),
        );

        if (Array.isArray(entry.clauses)) {
            result.push(
                ...validateDuplicateClauses(
                    ctx,
                    options,
                )(entry),
            );

            result.push(
                ...validateOccursCounts(
                    ctx,
                    options,
                )(entry),
            );

            result.push(
                ...validateOccursSemantics(
                    ctx,
                    options,
                )(entry),
            );
        }

        if (entry.kind === "group") {
            if (Array.isArray(entry.clauses))
                result.push(
                    ...validateGroupSemantics(
                        ctx,
                        options,
                    )(entry),
                );

            if (Array.isArray(entry.children))
                result.push(
                    ...entry.children.flatMap(
                        (child, index) =>
                            validateEntrySemantics(
                                `${ctx}.children[${index}]`,
                                options,
                            )(child),
                    ),
                );
        }

        if (entry.kind === "elementary") {
            if (Array.isArray(entry.clauses))
                result.push(
                    ...validateElementarySemantics(
                        ctx,
                        options,
                    )(entry),
                );

            if (Array.isArray(entry.conditions))
                result.push(
                    ...entry.conditions.flatMap(
                        (condition, index) =>
                            validateConditionSemantics(
                                `${ctx}.conditions[${index}]`,
                                options,
                            )(condition),
                    ),
                );
        }

        return result;
    };


/*
 * Copybook
 */

const validateCopybookShape:
    Validator<CopybookAst, CopybookSource> =
    (ctx, options) => ast => {
        if (
            typeof ast !== "object" ||
            ast === null
        )
            return [
                `${ctx} must be an object`,
            ];

        if (!Array.isArray(ast.entries))
            return [
                `${ctx}.entries must be an array`,
            ];

        return ast.entries.flatMap(
            (entry, index) =>
                copybookEntryValidator(
                    `${ctx}.entries[${index}]`,
                    options,
                )(entry),
        );
    };


const validateCopybookSemantics:
    Validator<CopybookAst, CopybookSource> =
    (ctx, options) => ast => {
        if (
            typeof ast !== "object" ||
            ast === null ||
            !Array.isArray(ast.entries)
        )
            return [];

        return ast.entries.flatMap(
            (entry, index) =>
                validateEntrySemantics(
                    `${ctx}.entries[${index}]`,
                    options,
                )(entry),
        );
    };


/*
 * Public validator
 */

export const validateCopybook:
    Validator<CopybookAst, CopybookSource> =
    combineValidators(
        validateCopybookShape,
        validateCopybookSemantics,
    );