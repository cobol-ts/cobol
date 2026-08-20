import {NameAnd} from "@cobol-ts/records";

/**
 * Represents either a successful value of type T or a set of errors.
 * @template T - The type of the successful value.
 */
export type ErrorsOr<T> = Errors | Value<T>;

/**
 * Wraps a successful value.
 * @template T - The type of the wrapped value.
 */
export type Value<T> = { value: T };

/**
 * Represents one or more error messages, with optional debugging metadata.
 */
export type Errors = {
    /** The list of error messages. */
    errors: string[];
    /** Optional reference identifier for debugging. */
    reference?: string;
    /** Optional extra context or metadata. */
    extras?: any;
};
export const value = <T>(t: T): ErrorsOr<T> => ({ value: t });
export const errors = (...es: string[]): ErrorsOr<never> => ({ errors: es });
/**
 * Creates an Errors object from an exception or unknown error.
 * @param context - A string describing the context where the error occurred.
 * @param err - The caught error or any thrown value.
 * @param extras - Optional additional metadata.
 * @returns An Errors object containing a formatted message and extras.
 */
export function makeErrorFromException(
    context: string,
    err: unknown,
    extras?: any,
): Errors {
    const message = err instanceof Error ? err.message : String(err);
    return {errors: [`${context} error ${message}`], extras};
}

/**
 * Exception type used to throw structured error lists.
 */
export class ErrorsException extends Error {
    /**
     * @param errors - The array of error messages.
     * @param reference - Optional reference ID for debugging.
     */
    constructor(public errors: string[], public reference?: string) {
        super(errors.join(', '));
        this.name = 'ErrorsException';
    }
}

/**
 * Type guard to check if an ErrorsOr contains a value.
 * @param e - The ErrorsOr to inspect.
 * @returns True if e contains a value, false if it contains errors.
 */
export function isValue<T>(e: ErrorsOr<T>): e is Value<T> {
    return 'value' in e;
}

/**
 * Type guard to check if an ErrorsOr contains errors.
 * @param e - The ErrorsOr to inspect.
 * @returns True if e contains errors, false if it contains a value.
 */
export function isErrors<T>(e: ErrorsOr<T>): e is Errors {
    return 'errors' in e
}

/**
 * Extracts the wrapped value or throws an ErrorsException if errors are present.
 * @param e - The ErrorsOr to unwrap.
 * @throws {ErrorsException} When e contains errors.
 * @returns The unwrapped value of type T.
 */
export function valueOrThrow<T>(e: ErrorsOr<T>): T {
    if (isErrors(e)) throw new ErrorsException(e.errors, e.reference);
    return e.value;
}

/**
 * Returns the wrapped value, a default if errors exist or if the value is null/undefined.
 * @param e - The ErrorsOr to inspect.
 * @param defaultValue - The default to return on errors or nullish values.
 * @returns The wrapped value or defaultValue.
 */
export const valueOrDefault = <T>(
    e: ErrorsOr<T>,
    defaultValue: T,
): T => {
    if (isErrors(e)) return defaultValue;
    const value = e?.value;
    return value === null || value === undefined ? defaultValue : value;
};

/**
 * Splits a record of named ErrorsOr<T> into its successful values and aggregated errors.
 * @template T - The type of the successful values.
 * @param es - An object mapping names to ErrorsOr<T>.
 * @returns An object containing two properties:
 *   - values: A record of names to unwrapped T values.
 *   - errors: A flat array of all error messages.
 */
export function partitionNameAndErrorsOr<T>(
    es: NameAnd<ErrorsOr<T>>,
): { values: NameAnd<T>; errors: string[] } {
    const values: NameAnd<T> = {};
    const errors: string[] = [];
    for (const [name, value] of Object.entries(es)) {
        if (isValue(value)) values[name] = value.value;
        else errors.push(...value.errors);
    }
    return {values, errors};
}

/**
 * Extracts errors or throws if a value is present unexpectedly.
 * @param e - The ErrorsOr to inspect.
 * @throws {ErrorsException} When e contains a value.
 * @returns The array of error messages.
 */
export function errorsOrThrow<T>(e: ErrorsOr<T>): string[] {
    if (isValue(e))
        throw new ErrorsException([
            `Expected errors but got value ${JSON.stringify(e)}`,
        ]);
    return e.errors;
}

/**
 * Extracts the Errors object or throws if a value is present unexpectedly.
 * @param e - The ErrorsOr to inspect.
 * @throws {ErrorsException} When e contains a value.
 * @returns The Errors object.
 */
export function errorObjectOrThrow<T>(e: ErrorsOr<T>): Errors {
    if (isValue(e))
        throw new ErrorsException([
            `Expected errors but got value ${JSON.stringify(e)}`,
        ]);
    return e;
}

/**
 * Applies a transform function to the wrapped value, preserving errors.
 * @template T - Original value type.
 * @template T1 - Transformed value type.
 * @param e - The ErrorsOr to map.
 * @param f - Function to apply if a value is present.
 * @returns A new ErrorsOr containing either the transformed value or the original errors.
 */
export function mapErrorsOr<T, T1>(
    e: ErrorsOr<T>,
    f: (t: T) => T1,
): ErrorsOr<T1> {
    if (isValue(e)) return {value: f(e.value)};
    return e;
}

/**
 * Applies a transform that returns ErrorsOr to the wrapped value, flattening the result.
 * @template T - Original value type.
 * @template T1 - Resulting value type.
 * @param e - The ErrorsOr to flatMap.
 * @param f - Function to apply if a value is present.
 * @returns The result of f(e.value) or the original errors.
 */
export function flatMapErrorsOr<T, T1>(
    e: ErrorsOr<T>,
    f: (t: T) => ErrorsOr<T1>,
): ErrorsOr<T1> {
    if (isValue(e)) return f(e.value);
    return e;
}

/**
 * Asynchronously transforms the wrapped value, preserving errors.
 * @template T - Original value type.
 * @template T1 - Transformed value type.
 * @param e - The ErrorsOr to map.
 * @param f - Async function to apply if a value is present.
 * @returns A promise resolving to a new ErrorsOr of the transformed value or original errors.
 */
export function mapErrorsOrK<T, T1>(
    e: ErrorsOr<T>,
    f: (t: T) => Promise<T1>,
): Promise<ErrorsOr<T1>> {
    return isValue(e) ? f(e.value).then((v) => ({value: v})) : Promise.resolve(e as ErrorsOr<T1>);
}

/**
 * Asynchronously flatMaps the wrapped value, flattening nested ErrorsOr.
 * @template T - Original value type.
 * @template T1 - Resulting value type.
 * @param e - The ErrorsOr to flatMap.
 * @param f - Async function returning ErrorsOr to apply if a value is present.
 * @returns A promise resolving to ErrorsOr<T1>.
 */
export function flatMapErrorsOrK<T, T1>(
    e: ErrorsOr<T>,
    f: (t: T) => Promise<ErrorsOr<T1>>,
): Promise<ErrorsOr<T1>> {
    return isValue(e)
        ? f(e.value)
        : Promise.resolve(e as ErrorsOr<T1>);
}

/**
 * Recovers from errors by applying a fallback function, or returns the value if present.
 * @template T - The value type.
 * @param e - The ErrorsOr to recover.
 * @param f - Function to produce a fallback value from the Errors.
 * @returns The original value or the fallback.
 */
export function recover<T>(
    e: ErrorsOr<T>,
    f: (e: Errors) => T,
): T {
    if (isErrors(e)) return f(e);
    return e.value;
}

/**
 * Represents an asynchronous function from a single input to an ErrorsOr result.
 * @template From - Input parameter type.
 * @template To - Output result type.
 */
export type AsyncErrorCall<From, To> = (
    from: From,
) => Promise<ErrorsOr<To>>;

/**
 * Represents an asynchronous function from two inputs to an ErrorsOr result.
 * @template From1 - First input parameter type.
 * @template From2 - Second input parameter type.
 * @template To - Output result type.
 */
export type AsyncErrorCall2<From1, From2, To> = (
    from1: From1,
    from2: From2,
) => Promise<ErrorsOr<To>>;


export function flattenArrayOfErrorsOr<T>(
    es: ErrorsOr<T>[],
): ErrorsOr<T[]> {
    const values: T[] = [];
    const errors: string[] = [];
    for (const e of es) {
        if (isValue(e)) values.push(e.value);
        else errors.push(...e.errors);
    }
    return errors.length > 0 ? {errors} : {value: values};
}