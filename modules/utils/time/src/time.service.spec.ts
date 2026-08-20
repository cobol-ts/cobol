import { useTime, delay, dateTimeService } from './time.service';

describe('TimeService', () => {
    it('should return current date', () => {
        const timeService = useTime();
        const now = new Date();
        const serviceNow = timeService();

        expect(serviceNow).toBeCloseTo(now.getTime(), -1);
    });

    it('useTime should return dateTimeService by default', () => {
        expect(useTime()).toBe(dateTimeService);
    });
});

describe('delay', () => {
    jest.useFakeTimers();

    afterAll(() => {
        jest.useRealTimers();
    });

    it('should resolve after given milliseconds', async () => {
        let resolved = false;
        const delayPromise = delay(1000).then(() => {
            resolved = true;
        });

        jest.advanceTimersByTime(999);
        await Promise.resolve(); // Ensures promise callbacks execute

        expect(resolved).toBe(false);

        jest.advanceTimersByTime(1);
        await Promise.resolve(); // Ensure promise callback executes after timer advances

        expect(resolved).toBe(true);
    });
});
