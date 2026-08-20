import {errorsOrThrow} from "@cobol-ts/errors";
import {jsonCodec, nullCodec, stringCodec} from "./codec";
import type {Validator} from "@cobol-ts/validate";

describe("jsonCodec.encode", () => {
    const validateNumber: Validator<number> = (ctx) => (n: any) =>
        typeof n === "number" && n >= 0 ? [] : [ctx + " negative"];

    it("encodes a valid number", () => {
        const context = "testEncode";
        const codec = jsonCodec<number>(context, {validate: validateNumber});
        const result = codec.encode(42);
        expect(result).toEqual({value: JSON.stringify(42)});
    });

    it("returns a validation error for invalid input", () => {
        const context = "testEncode";
        const codec = jsonCodec<number>(context, {validate: validateNumber});

        const errs = errorsOrThrow(codec.encode(-1));
        expect(errs).toEqual(["testEncode encode negative"]);
    });

    it("catches JSON.stringify errors on circular structures", () => {
        type Obj = { self?: Obj };
        const circular: Obj = {} as any;
        circular.self = circular;

        const context = "testEncode";
        const codec = jsonCodec<Obj>(context, {validate: () => () => []});

        const errs = errorsOrThrow(codec.encode(circular));
        expect(errs).toEqual([
            "testEncode encode error Converting circular structure to JSON\n    --> starting at object with constructor 'Object'\n    --- property 'self' closes the circle"
        ]);
    });

    it("applies encoderCleaner before stringify", () => {
        type Data = { foo: string; bar: string };
        const context = "testEncode";
        const alwaysValid: Validator<Data> = () => () => [];

        // 1) No-op cleaner
        const codec1 = jsonCodec<Data>(context, {
            validate: alwaysValid,
            encoderCleaner: (d) => d,
        });
        const input = {foo: "keep", bar: "remove me"};
        expect(codec1.encode(input)).toEqual({
            value: JSON.stringify(input),
        });

        // 2) Actual removal
        const codec2 = jsonCodec<Data>(context, {
            validate: alwaysValid,
            encoderCleaner: (d) => ({foo: d.foo, bar: ""}),
        });
        expect(codec2.encode(input)).toEqual({
            value: JSON.stringify({foo: "keep", bar: ""}),
        });
    });
});

describe("jsonCodec.decode", () => {
    const validateFoo: Validator<any> = (ctx) => (o: any) =>
        o && o.foo === "bar" ? [] : [`${ctx} invalid foo`];

    it("decodes valid JSON and validates", () => {
        const context = "testDecode";
        const codec = jsonCodec<{ foo: string }>(context, {validate: validateFoo});
        const json = JSON.stringify({foo: "bar"});
        expect(codec.decode(json)).toEqual({value: {foo: "bar"}});
    });

    it("returns a validation error for decoded value", () => {
        const context = "testDecode";
        const codec = jsonCodec<{ foo: string }>(context, {validate: validateFoo});
        const badJson = JSON.stringify({foo: "baz"});

        const errs = errorsOrThrow(codec.decode(badJson));
        expect(errs).toEqual([
            "testDecode decode invalid foo"
        ]);
    });

    it("catches JSON.parse errors for malformed input", () => {
        const context = "testDecode";
        const codec = jsonCodec<any>(context, {validate: () => () => []});
        const badJson = "{not valid json}";

        const errs = errorsOrThrow(codec.decode(badJson));
        expect(errs).toEqual([
            "testDecode decode error Expected property name or '}' in JSON at position 1 (line 1 column 2)"
        ]);
    });

    it("applies decoderCleaner before validation", () => {
        const context = "testDecode";
        const validateValue: Validator<any> = (ctx) => (o: any) =>
            o && typeof o.value === "string" ? [] : ["missing value"];

        const codec = jsonCodec<{ value: string }>(context, {
            validate: validateValue,
            decoderCleaner: (o: any) => ({value: o.other}),
        });

        const json = JSON.stringify({other: "cleaned"});
        expect(codec.decode(json)).toEqual({value: {value: "cleaned"}});
    });
});

describe("nullCodec", () => {
    const DEFAULT = "DEFAULT_VALUE" as const;
    const codec = nullCodec<string>(DEFAULT);

    describe("encode()", () => {
        it("replaces null with the default value", () => {
            expect(codec.encode(null as any)).toEqual({value: DEFAULT});
        });

        it("passes through a non-null string", () => {
            const input = "hello" as const;
            expect(codec.encode(input)).toEqual({value: input});
        });

        it("handles empty string separately from null", () => {
            const input = "" as const;
            expect(codec.encode(input)).toEqual({value: ""});
        });
    });

    describe("decode()", () => {
        it("replaces null with the default value", () => {
            expect(codec.decode(null as any)).toEqual({value: DEFAULT});
        });

        it("passes through a non-null string", () => {
            const input = "world" as const;
            expect(codec.decode(input)).toEqual({value: input});
        });

        it("treats empty string as a valid value", () => {
            const input = "" as const;
            expect(codec.decode(input)).toEqual({value: ""});
        });
    });
});

describe("stringCodec", () => {

    test("encode and decode a string", () => {
        expect(stringCodec.decode('abc')).toEqual({value: 'abc'})
        expect(stringCodec.encode('sad')).toEqual({value: 'sad'})
    })
})