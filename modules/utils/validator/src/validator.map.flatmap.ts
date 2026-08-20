import { ErrorsOr, makeErrorFromException } from "@cobol-ts/errors";
import { Validator } from "./validator";

/**
 * Pure mapping with validation and exception safety (eager input).
 */
export function validateMap<T, R>(
    context: string,
    validate: Validator<T> = () => () => [],
): (t: T, fn: (t: T) => R) => ErrorsOr<R> {
    return (t, fn) => {
        const errors = validate ? validate(context)(t) : [];
        if (errors.length > 0) {
            return { errors, extras: t };
        }
        try {
            return { value: fn(t) };
        } catch (e) {
            return makeErrorFromException(context, e, t);
        }
    };
}

/**
 * Pure mapping with validation and exception safety (lazy/thunk input).
 * Single try-catch wraps both thunk execution and transform.
 */
export function validateMapLazy<T, R>(
    context: string,
    validate: Validator<T> = () => () => [],
): (tThunk: () => T, fn: (t: T) => R) => ErrorsOr<R> {
    return (tThunk, fn) => {
        let t: T | undefined;
        try {
            t = tThunk();
            const errors = validate ? validate(context)(t) : [];
            if (errors.length > 0) {
                return { errors, extras: t };
            }
            return { value: fn(t) };
        } catch (e) {
            return makeErrorFromException(context, e, t);
        }
    };
}

/**
 * Fallible transform with validation and exception safety (eager input).
 */
export function validateFlatMap<T, R>(
    context: string,
    validate: Validator<T> = () => () => [],
): (t: T, fn: (t: T) => ErrorsOr<R>) => ErrorsOr<R> {
    return (t, fn) => {
        const errors = validate ? validate(context)(t) : [];
        if (errors.length > 0) {
            return { errors, extras: t };
        }
        try {
            return fn(t);
        } catch (e) {
            return makeErrorFromException(context, e, t);
        }
    };
}

/**
 * Fallible transform with validation and exception safety (lazy/thunk input).
 * Single try-catch wraps both thunk execution and flatMap.
 */
export function validateFlatMapLazy<T, R>(
    context: string,
    validate: Validator<T> = () => () => [],
): (tThunk: () => T, fn: (t: T) => ErrorsOr<R>) => ErrorsOr<R> {
    return (tThunk, fn) => {
        let t: T | undefined;
        try {
            t = tThunk();
            const errors = validate ? validate(context)(t) : [];
            if (errors.length > 0) {
                return { errors, extras: t };
            }
            return fn(t);
        } catch (e) {
            return makeErrorFromException(context, e, t);
        }
    };
}

