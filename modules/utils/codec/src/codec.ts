import {ErrorsOr} from "@cobol-ts/errors";
import {Validator, validateMap, validateMapLazy} from "@cobol-ts/validate";

export type Codec<T> = {
    encode: (t: T) => ErrorsOr<string>
    decode: (s: string) => ErrorsOr<T>
}

export function nullCodec<T extends string>(defaultValue: T): Codec<T> {
    return {
        encode: (t) => ({value: t === null ? defaultValue : t}),
        decode: (t) => ({value: t === null ? defaultValue : t as T}),
    };
}

export const stringCodec: Codec<string> = {
    encode: (t) => ({value: t}),
    decode: (s) => ({value: s }),
}

export type JsonCodecConfig<T> = {
    validate?: Validator<T>;
    encoderCleaner?: (t: T) => T;
    decoderCleaner?: (t: T) => T;
};


export function jsonCodec<T>(
    context: string,
    {
        validate = () => () => [],
        encoderCleaner = (x) => x,
        decoderCleaner = (x) => x,
    }: JsonCodecConfig<T> = {},
): Codec<T> {

    return {
        encode: (t) =>
            validateMap<T, string>(`${context} encode`, validate)(
                t,
                (t) => JSON.stringify(encoderCleaner(t)),
            ),

        decode: (s) =>
            validateMapLazy<T, T>(`${context} decode`, validate)(
                () => decoderCleaner(JSON.parse(s)),
                (cleaned) => cleaned,
            ),
    };
}
