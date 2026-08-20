export type TimeService = () => number;

export const dateTimeService: TimeService = () => new Date().getTime();
//Later we will do this with a context so that we can mock the time service
export function useTime(): TimeService {
    return dateTimeService;
}

export function delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
