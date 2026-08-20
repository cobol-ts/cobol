// -------------------------------------------------------------------------------------------------
// Core types & combinator with new signature
// -------------------------------------------------------------------------------------------------

import {NameAnd} from "@cobol-ts/records";

export type ValidationOptions<Source> = {
    debug?: boolean;
    source?: Source;
};

/**
 * Validator<T> now is a function that, given a context string,
 * returns a function which takes a value of type T and returns error messages.
 */
export type Validator<T, Source = any> =
    (context: string, options?: ValidationOptions<Source>) => (t: T) => string[];

/**
 * Compose multiple validators into one (collects all errors).
 */
export function combineValidators<T, Source = any>(
    ...validators: Validator<T, Source>[]
): Validator<T, Source> {
    return (ctx: string, options) => (t: T): string[] =>
        validators.flatMap(v => v(ctx, options)(t));
}

function validateDebug(ctx: string, msg: string, value: any) {
    console.log(`Validator ${ctx} ${msg} with value:`, JSON.stringify(value));
}

// -------------------------------------------------------------------------------------------------
// Helper to extract the payload type from a Validator<T>
// -------------------------------------------------------------------------------------------------

type UnwrapValidator<V> =
    V extends Validator<infer U, any> ? U : never;

type UnwrapSource<V> =
    V extends Validator<any, infer Source> ? Source : never;

/**
 * Given a map of named validators, return a Validator over the union of their input types.
 */
export function composeOr<
    V extends Record<string, Validator<any, any>>
>(
    validators: V
): Validator<
    UnwrapValidator<V[keyof V]>,
    UnwrapSource<V[keyof V]>
> {
    type T = UnwrapValidator<V[keyof V]>;
    type Source = UnwrapSource<V[keyof V]>;

    return (ctx: string, options?: ValidationOptions<Source>) => (value: T): string[] => {
        const reasons: string[] = [];

        if (options?.debug)
            validateDebug(ctx, 'composing or', value);

        // if (value === undefined || value === null) {
        for (const key in validators) {
            const validator = validators[key] as Validator<T, Source>;
            const errors = validator(ctx, options)(value as any);

            if (errors.length === 0)
                return [];

            reasons.push(`${ctx} is not a ${key} because ${errors.join(", ")}`);
        }

        return reasons;
    }
}

export function composeTypedOr<
    V extends Record<string, Validator<any, any>>,
    T extends UnwrapValidator<V[keyof V]>
>(
    typeFn: (t: T) => keyof V,
    validators: V
): Validator<T, UnwrapSource<V[keyof V]>> {
    type Source = UnwrapSource<V[keyof V]>;

    return (ctx: string, options?: ValidationOptions<Source>) => (value: T): string[] => {
        const reasons: string[] = [];
        const type = typeFn(value);

        if (options?.debug)
            validateDebug(ctx, `composing typed or ${type?.toString()}`, value);

        if (!type)
            return [`${ctx} has no valid type`];

        const validator = validators[type];

        if (!validator)
            return [
                `${ctx} has illegal type ${type?.toString()}. Legal values are: ${Object.keys(validators).sort().join(", ")}`
            ];

        return validator(ctx, options)(value as any);
    }
}


// -------------------------------------------------------------------------------------------------
// Generic "must be type" factories (required + optional)
// -------------------------------------------------------------------------------------------------

/**
 * Creates a validator that asserts the value is present (not undefined/null) and of type T.
 */
export function mustBeType<T, Source = any>(
    typeCheck: (v: unknown) => v is T,
    typeName: string
): Validator<T, Source> {
    return (ctx: string, options) => (value: T): string[] => {
        if (options?.debug)
            validateDebug(ctx, `must be type ${typeName}`, value);

        if (value === undefined)
            return [`${ctx} is required but was undefined`];

        if (value === null)
            return [`${ctx} is required but was null`];

        return typeCheck(value)
            ? []
            : [`${ctx} must be a ${typeName}`];
    };
}

/**
 * Creates a validator that skips undefined/null, else behaves like mustBeType.
 */
export function mustBeTypeIfPresent<T, Source = any>(
    typeCheck: (v: unknown) => v is T,
    typeName: string
): Validator<T | undefined, Source> {
    const required = mustBeType<T, Source>(typeCheck, typeName);

    return (ctx: string, options) => (value: T | undefined): string[] => {
        if (options?.debug)
            validateDebug(ctx, `must be type ${typeName} if present`, value);

        if (value === undefined || value === null)
            return [];

        return required(ctx, options)(value as T);
    };
}

// -------------------------------------------------------------------------------------------------
// Primitive validators
// -------------------------------------------------------------------------------------------------

export const mustBeString: Validator<string> = mustBeType<string>(
    v => typeof v === 'string',
    'string'
);

export function mustBeValue<T, Source = any>(
    expected: T,
): Validator<T, Source> {
    return (ctx: string, options) => (value: T): string[] => {
        if (options?.debug)
            validateDebug(
                ctx,
                `must be value ${String(expected)}`,
                value,
            );

        return value === expected
            ? []
            : [
                `${ctx} must be ${String(expected)} but was ${String(value)}`,
            ];
    };
}


export const mustBeNumber: Validator<number> = mustBeType<number>(
    v => typeof v === 'number',
    'number'
);

export const mustBeBoolean: Validator<boolean> = mustBeType<boolean>(
    v => typeof v === 'boolean',
    'boolean'
);

export const mustBeStringIfPresent: Validator<string | undefined> =
    mustBeTypeIfPresent<string>(v => typeof v === 'string', 'string');

export const mustBeNumberIfPresent: Validator<number | undefined> =
    mustBeTypeIfPresent<number>(v => typeof v === 'number', 'number');

export const mustBeBooleanIfPresent: Validator<boolean | undefined> =
    mustBeTypeIfPresent<boolean>(v => typeof v === 'boolean', 'boolean');

// -------------------------------------------------------------------------------------------------
// Array-of-T validators (required + optional)
// -------------------------------------------------------------------------------------------------

/**
 * Creates a Validator for T[]: checks array and applies item validator to each element.
 */
export function mustBeArrayOf<T, Source = any>(
    itemValidator: Validator<T, Source>
): Validator<T[], Source> {
    return (ctx: string, options) => (value: T[]): string[] => {
        if (options?.debug)
            validateDebug(ctx, 'must be array of', value);

        if (!Array.isArray(value)) {
            return [`${ctx} must be an array`];
        }

        return value.flatMap((item, idx) =>
            itemValidator(`${ctx}[${idx}]`, options)(item)
        );
    };
}

/**
 * Optional version of mustBeArrayOf: skips undefined/null, else applies array validator.
 */
export function mustBeArrayOfIfPresent<T, Source = any>(
    itemValidator: Validator<T, Source>
): Validator<T[] | undefined, Source> {
    const required = mustBeArrayOf<T, Source>(itemValidator);

    return (ctx: string, options) => (value: T[] | undefined): string[] => {
        if (options?.debug)
            validateDebug(ctx, 'must be array of if present', value);

        if (value === undefined || value === null)
            return [];

        return required(ctx, options)(value);
    };
}

// -------------------------------------------------------------------------------------------------
// Object field validators
// -------------------------------------------------------------------------------------------------

/**
 * Builds a Validator<T> from per-key validators.
 * Checks object shape and applies each field validator.
 */
export function mustBeObjectWithFields<
    T extends Record<string, any>,
    Source = any
>(
    fields: { [K in keyof T]: Validator<T[K], Source> },
    required?: boolean
): Validator<T, Source> {
    return (ctx: string, options) => (value: T): string[] => {

        if (options?.debug)
            validateDebug(ctx, `must be object with fields. Required ${required}`, value);

        if (!required && !value)
            return [];

        if (typeof value !== 'object' || value === null) {
            return [`${ctx} must be an object`];
        }

        const obj = value as { [K in keyof T]: unknown };

        return (Object.keys(fields) as (keyof T)[]).flatMap(key =>
            fields[key](`${ctx}.${String(key)}`, options)(obj[key] as T[typeof key])
        );
    };
}

export function mustBeNameAnd<T, Source = any>(
    validator: Validator<T, Source>,
    required?: boolean
): Validator<NameAnd<T>, Source> {
    return (ctx: string, options) => (value: NameAnd<T>): string[] => {
        if (options?.debug)
            validateDebug(ctx, `must be NameAnd`, value);

        if (!required && !value)
            return [];

        if (typeof value !== 'object' || value === null) {
            return [`${ctx} must be an object`];
        }

        if (Array.isArray(value)) {
            return [`${ctx} must be a NameAnd object, not an array`];
        }

        const errors: string[] = [];

        for (const [key, val] of Object.entries(value)) {
            if (typeof key !== 'string' || key.trim() === '') {
                errors.push(`${ctx} has invalid key: ${key}`);
                continue;
            }

            errors.push(...validator(`${ctx}.${key}`, options)(val));
        }

        return errors;
    }
}