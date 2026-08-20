export type DataAS<T> = {
    data: T
}
export type LoadingAS = {
    loading: true
}
export type ErrorAS = {
    errors: string[]
}

export type AsyncState<T> = DataAS<T> | LoadingAS | ErrorAS

export function isDataAs(a: AsyncState<any>): a is DataAS<any> {
    return (a as DataAS<any>).data !== undefined
}

export function isLoadingAs(a: AsyncState<any>): a is LoadingAS {
    return (a as LoadingAS).loading !== undefined
}

export function isErrorAs(a: AsyncState<any>): a is ErrorAS {
    return (a as ErrorAS).errors !== undefined
}

export function dataOrThrow<T>(state: AsyncState<T>, errorMessage: string): T {
    if (isDataAs(state)) {
        return state.data as T;
    } else if (isLoadingAs(state)) {
        throw new Error("Data is still loading");
    } else if (isErrorAs(state)) {
        throw new Error(errorMessage);
    }
    throw new Error("Unknown state");
}

export function errorsOrThrowAs<T>(state: AsyncState<T>): string[] {
    if (isErrorAs(state)) {
        return state.errors;
    } else if (isLoadingAs(state)) {
        throw new Error("Data is still loading");
    } else if (isDataAs(state)) {
        throw new Error(`No error present. Data is ${JSON.stringify(state.data)}`);
    }
    throw new Error("Unknown state");
}

