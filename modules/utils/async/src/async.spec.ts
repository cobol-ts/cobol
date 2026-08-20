import {
    AsyncState,
    DataAS,
    dataOrThrow,
    ErrorAS,
    errorsOrThrowAs,
    isDataAs,
    isErrorAs,
    isLoadingAs,
    LoadingAS
} from "./async";

describe('AsyncState type guards', () => {
    const dataState: DataAS<number> = {data: 42};
    const loadingState: LoadingAS = {loading: true};
    const errorState: ErrorAS = {errors: ['oops']};

    it('identifies DataAS correctly', () => {
        expect(isDataAs(dataState)).toBe(true);
        expect(isLoadingAs(dataState)).toBe(false);
        expect(isErrorAs(dataState)).toBe(false);
    });

    it('identifies LoadingAS correctly', () => {
        expect(isDataAs(loadingState)).toBe(false);
        expect(isLoadingAs(loadingState)).toBe(true);
        expect(isErrorAs(loadingState)).toBe(false);
    });

    it('identifies ErrorAS correctly', () => {
        expect(isDataAs(errorState)).toBe(false);
        expect(isLoadingAs(errorState)).toBe(false);
        expect(isErrorAs(errorState)).toBe(true);
    });
});

describe('dataOrThrow helper', () => {
    const errMsg = 'fail msg';

    it('returns data when state is DataAS', () => {
        const dataState: AsyncState<string> = {data: 'hello'};
        expect(dataOrThrow(dataState, errMsg)).toBe('hello');
    });

    it('throws loading error when state is LoadingAS', () => {
        const loadingState: AsyncState<string> = {loading: true};
        expect(() => dataOrThrow(loadingState, errMsg)).toThrow(
            'Data is still loading'
        );
    });

    it('throws provided error when state is ErrorAS', () => {
        const errorState: AsyncState<string> = {errors: ['network']};
        expect(() => dataOrThrow(errorState, errMsg)).toThrow(errMsg);
    });

    it('throws Unknown state for invalid state object', () => {
        // cast empty object to AsyncState<any> to simulate bad input
        const bad = {} as AsyncState<any>;
        expect(() => dataOrThrow(bad, errMsg)).toThrow('Unknown state');
    });
});

describe('errorOrThrow helper', () => {
    it('returns error string when state is ErrorAS', () => {
        const errorState: AsyncState<number> = {errors: ['bad']};
        expect(errorsOrThrowAs(errorState)).toEqual(['bad']);
    });

    it('throws loading error when state is LoadingAS', () => {
        const loadingState: AsyncState<number> = {loading: true};
        expect(() => errorsOrThrowAs(loadingState)).toThrow(
            'Data is still loading'
        );
    });

    it('throws no-error message when state is DataAS', () => {
        const dataState: AsyncState<{ x: number }> = {data: {x: 1}};
        expect(() => errorsOrThrowAs(dataState)).toThrow(
            `No error present. Data is ${JSON.stringify(dataState.data)}`
        );
    });

    it('throws Unknown state for invalid state object', () => {
        const bad = {} as AsyncState<any>;
        expect(() => errorsOrThrowAs(bad)).toThrow('Unknown state');
    });
});