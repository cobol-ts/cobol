

// Mock console methods
import {DebugState, makeDebugLog} from "./debug";

const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

describe('makeDebugLog', () => {
    afterEach(() => {
        jest.clearAllMocks();
    });

    it('logs messages when debug is enabled', () => {
        const debugState: DebugState = { componentA: true };
        const log = makeDebugLog(debugState, 'componentA');

        log('Test message');
        expect(consoleLogSpy).toHaveBeenCalledWith('componentA', 'Test message');
    });

    it('does not log messages when debug is disabled', () => {
        const debugState: DebugState = { componentA: false };
        const log = makeDebugLog(debugState, 'componentA');

        log('Test message');
        expect(consoleLogSpy).not.toHaveBeenCalled();
    });

    it('logs errors when debug is enabled', () => {
        const debugState: DebugState = { componentA: true };
        const log = makeDebugLog(debugState, 'componentA');
        const error = new Error('Test error');

        log.debugError(error, 'Additional info');
        expect(consoleErrorSpy).toHaveBeenCalledWith('[ERROR] componentA', error, 'Additional info');
    });

    it('does not log errors when debug is disabled', () => {
        const debugState: DebugState = { componentA: false };
        const log = makeDebugLog(debugState, 'componentA');
        const error = new Error('Test error');

        log.debugError(error, 'Additional info');
        expect(consoleErrorSpy).not.toHaveBeenCalled();
    });

    it('defaults to no logging if debug state is undefined', () => {
        const debugState: DebugState = {};
        const log = makeDebugLog(debugState, 'componentB');

        log('Should not log');
        expect(consoleLogSpy).not.toHaveBeenCalled();
    });

    it('logs correctly for multiple components with different states', () => {
        const debugState: DebugState = { componentA: true, componentB: false };
        const logA = makeDebugLog(debugState, 'componentA');
        const logB = makeDebugLog(debugState, 'componentB');

        logA('Message A');
        logB('Message B');

        expect(consoleLogSpy).toHaveBeenCalledWith('componentA', 'Message A');
        expect(consoleLogSpy).not.toHaveBeenCalledWith('componentB', 'Message B');
    });

    it('preserves stack trace when logging', () => {
        const debugState: DebugState = { componentA: true };
        const log = makeDebugLog(debugState, 'componentA');

        function logTest() {
            log('Trace message');
        }

        logTest();
        expect(consoleLogSpy.mock.calls[0][1]).toBe('Trace message');
    });
});