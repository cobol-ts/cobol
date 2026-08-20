import {DebugLog} from "./debug";

export function createMockDebugLog(): DebugLog {
    const mockLog = jest.fn();
    const mockError = jest.fn();
    return Object.assign(mockLog, {
        debug: true,
        debugError: mockError,
    });
}
