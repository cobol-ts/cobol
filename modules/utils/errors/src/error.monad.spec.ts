// tests/error.monad.test.ts

import { NameAnd } from "@cobol-ts/records";
import {
    errorObjectOrThrow,
    Errors,
    ErrorsException,
    errorsOrThrow, flatMapErrorsOr, flatMapErrorsOrK,
    isErrors,
    isValue,
    makeErrorFromException, mapErrorsOr, mapErrorsOrK, partitionNameAndErrorsOr, recover,
    Value, valueOrDefault,
    valueOrThrow
} from "./error.monad";
// adjust path as needed

// Helpers for constructing test data
const createValue = <T>(value: T): Value<T> => ({ value });
const createErrors = (errors: string[], reference?: string, extras?: any): Errors => ({
    errors,
    reference,
    extras,
});

describe("error.monad.ts ", () => {
    describe("makeErrorFromException", () => {
        it("wraps an Error instance and preserves extras", () => {
            const err = new Error("boom!");
            const extras = { code: 123 };
            const result = makeErrorFromException("CTX", err, extras);
            expect(result.errors).toEqual(["CTX error boom!"]);
            expect(result.extras).toBe(extras);
            expect(result.reference).toBeUndefined();
        });

        it("wraps a non-Error value and omits extras when none passed", () => {
            const result = makeErrorFromException("CTX2", 42);
            expect(result.errors).toEqual(["CTX2 error 42"]);
            expect(result.extras).toBeUndefined();
            expect(result.reference).toBeUndefined();
        });
    });

    describe("isValue / isErrors", () => {
        it("identifies Value<T>", () => {
            const v = createValue("foo");
            expect(isValue(v)).toBe(true);
            expect(isErrors(v)).toBe(false);
        });

        it("identifies Errors", () => {
            const e = createErrors(["err"]);
            expect(isValue(e)).toBe(false);
            expect(isErrors(e)).toBe(true);
        });
    });

    describe("valueOrThrow", () => {
        it("returns the wrapped value when given Value<T>", () => {
            expect(valueOrThrow(createValue(123))).toBe(123);
        });

        it("throws ErrorsException when given Errors", () => {
            const e = createErrors(["bad", "worse"], "REF");
            expect(() => valueOrThrow(e)).toThrow(ErrorsException);
            expect(() => valueOrThrow(e)).toThrow("bad, worse");
        });
        it ('throws ErrorsException when given Errors with extras', () => {
            const e = createErrors(["bad", "worse"], "REF", { info: true });
            expect(() => valueOrThrow(e)).toThrow(ErrorsException);
            expect(() => valueOrThrow(e)).toThrow("bad, worse");

        })
    });

    describe("errorsOrThrow", () => {
        it("returns errors array when given Errors", () => {
            const e = createErrors(["fail"]);
            expect(errorsOrThrow(e)).toEqual(["fail"]);
        });

        it("throws ErrorsException when given Value<T>", () => {
            const v = createValue(7);
            expect(() => errorsOrThrow(v)).toThrow(ErrorsException);
            expect(() => errorsOrThrow(v)).toThrow(
                'Expected errors but got value {"value":7}'
            );
        });
    });

    describe("errorObjectOrThrow", () => {
        it("returns the Errors object when given Errors", () => {
            const e = createErrors(["oops"], "XYZ");
            expect(errorObjectOrThrow(e)).toBe(e);
        });

        it("throws ErrorsException when given Value<T>", () => {
            const v = createValue("nope");
            expect(() => errorObjectOrThrow(v)).toThrow(ErrorsException);
            expect(() => errorObjectOrThrow(v)).toThrow(
                'Expected errors but got value {"value":"nope"}'
            );
        });
    });

    describe("valueOrDefault", () => {
        it("returns default when given Errors", () => {
            const def = 999;
            expect(valueOrDefault(createErrors(["err"]), def)).toBe(def);
        });

        it("returns default when Value holds null", () => {
            expect(valueOrDefault(createValue<null>(null), "dflt")).toBe("dflt");
        });

        it("returns default when Value holds undefined", () => {
            expect(valueOrDefault(createValue<undefined>(undefined), 5)).toBe(5);
        });

        it("returns actual value when present and non-nullish", () => {
            expect(valueOrDefault(createValue("here"), "d")).toBe("here");
            expect(valueOrDefault(createValue(0), 100)).toBe(0);
        });
    });

    describe("partitionNameAndErrorsOr", () => {
        it("splits a NameAnd<ErrorsOr> into values and flattened errors", () => {
            const input: NameAnd<Errors | Value<number>> = {
                a: createValue(1),
                b: createErrors(["bad"]),
                c: createValue(2),
                d: createErrors(["worse"], undefined, { info: true }),
            };

            const { values, errors } = partitionNameAndErrorsOr(input);

            expect(values).toEqual({ a: 1, c: 2 });
            // b and d both contribute their error strings
            expect(errors).toEqual(["bad", "worse"]);
        });
    });

    describe("mapErrorsOr", () => {
        it("applies f to the value when Value<T>", () => {
            const v = createValue(4);
            expect(mapErrorsOr(v, (x) => x * 3)).toEqual({ value: 12 });
        });

        it("preserves the same Errors object when given Errors", () => {
            const e = createErrors(["err"]);
            expect(mapErrorsOr(e, (x: any) => 0)).toBe(e);
        });
    });

    describe("flatMapErrorsOr", () => {
        it("flat maps to a new Value when f returns Value", () => {
            const v = createValue(10);
            const out = flatMapErrorsOr(v, (x) =>
                x > 5 ? createValue("ok") : createErrors(["too small"])
            );
            expect(out).toEqual({ value: "ok" });
        });

        it("flat maps to Errors when f returns Errors", () => {
            const v = createValue(2);
            const out = flatMapErrorsOr(v, (x) =>
                x > 5 ? createValue("ok") : createErrors(["too small"])
            );
            expect(out).toEqual(createErrors(["too small"]));
        });

        it("preserves Errors unchanged", () => {
            const e = createErrors(["fail"]);
            const out = flatMapErrorsOr(e, () => createValue("nope"));
            expect(out).toBe(e);
        });
    });

    describe("mapErrorsOrK (async)", () => {
        it("transforms Value asynchronously", async () => {
            const v = createValue(20);
            const out = await mapErrorsOrK(v, async (x) => x + 2);
            expect(out).toEqual({ value: 22 });
        });

        it("preserves Errors without awaiting f", async () => {
            const e = createErrors(["async bad"]);
            const spy = jest.fn<Promise<number>, [number]>().mockResolvedValue(99);
            const out = await mapErrorsOrK(e, spy);
            expect(out).toBe(e);
            expect(spy).not.toHaveBeenCalled();
        });
    });

    describe("flatMapErrorsOrK (async)", () => {
        it("flat maps Value asynchronously to Value", async () => {
            const v = createValue(7);
            const out = await flatMapErrorsOrK(v, async (x) =>
                x > 5 ? createValue("yay") : createErrors(["nope"])
            );
            expect(out).toEqual({ value: "yay" });
        });

        it("flat maps Value asynchronously to Errors", async () => {
            const v = createValue(3);
            const out = await flatMapErrorsOrK(v, async (x) =>
                x > 5 ? createValue("yay") : createErrors(["nope"])
            );
            expect(out).toEqual(createErrors(["nope"]));
        });

        it("preserves Errors without calling f", async () => {
            const e = createErrors(["async fail"]);
            const spy = jest.fn<Promise<Errors>, [number]>().mockResolvedValue(
                createErrors(["won't run"])
            );
            const out = await flatMapErrorsOrK(e, spy);
            expect(out).toBe(e);
            expect(spy).not.toHaveBeenCalled();
        });
    });

    describe("recover", () => {
        it("returns the value when given Value<T>", () => {
            expect(recover(createValue("keep"), () => "lost")).toBe("keep");
        });

        it("applies fallback when given Errors", () => {
            const e = createErrors(["oops"]);
            expect(recover(e, (err) => `recovered: ${err.errors.join(";")}`)).toBe(
                "recovered: oops"
            );
        });
    });
});
