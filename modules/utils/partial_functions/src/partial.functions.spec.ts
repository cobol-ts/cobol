import { chainOfResponsibility, PartialFunction } from "./partial.functions";

describe("chainOfResponsibility", () => {
    it("should return default value when no partial function is provided", () => {
        const defaultFn = (x: number): string => `default ${x}`;
        const chain = chainOfResponsibility<number, string>(defaultFn);

        expect(chain(5)).toBe("default 5");
    });

    it("should use the matching partial function when defined", () => {
        const defaultFn = (x: number): string => `default ${x}`;
        const isEven: PartialFunction<number, string> = {
            isDefinedAt: (x: number): boolean => x % 2 === 0,
            apply: (x: number): string => `even ${x}`
        };

        const chain = chainOfResponsibility<number, string>(defaultFn, isEven);

        // For an even number, the chain should return the value from the partial function.
        expect(chain(4)).toBe("even 4");

        // For an odd number, it should fallback to the default.
        expect(chain(3)).toBe("default 3");
    });

    it("should use the first matching partial function when multiple are defined", () => {
        const defaultFn = (x: number): string => `default ${x}`;

        const isEven: PartialFunction<number, string> = {
            isDefinedAt: (x: number): boolean => x % 2 === 0,
            apply: (x: number): string => `even ${x}`
        };

        const greaterThanTwo: PartialFunction<number, string> = {
            isDefinedAt: (x: number): boolean => x > 2,
            apply: (x: number): string => `gt2 ${x}`
        };

        // Order: isEven first, then greaterThanTwo.
        const chain = chainOfResponsibility<number, string>(defaultFn, isEven, greaterThanTwo);

        // For 4: both conditions match, but isEven is first.
        expect(chain(4)).toBe("even 4");

        // For 3: isEven does not match, but 3 > 2 matches.
        expect(chain(3)).toBe("gt2 3");
    });

    it("should return the default value when none of the partial functions match", () => {
        const defaultFn = (x: number): string => `default ${x}`;
        const lessThanZero: PartialFunction<number, string> = {
            isDefinedAt: (x: number): boolean => x < 0,
            apply: (x: number): string => `negative ${x}`
        };

        const chain = chainOfResponsibility<number, string>(defaultFn, lessThanZero);

        // 5 is not less than 0, so should return default
        expect(chain(5)).toBe("default 5");

        // 0 is also not less than 0.
        expect(chain(0)).toBe("default 0");
    });
});
