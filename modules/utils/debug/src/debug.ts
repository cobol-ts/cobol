import {NameAnd} from "@cobol-ts/records";


export type DebugState = NameAnd<boolean>;

export type DebugLog = DebugLogFn & {
    debug: boolean;
    debugError: DebugErrorFn;
};


export type DebugLogFn = (...msg: any[]) => void;
export type DebugErrorFn = (error: Error, ...msg: any[]) => void;


export function makeDebugLog(debugState: DebugState, name: string): DebugLog {
    const debug = debugState[name] ?? false;
    if (debug) {
        const debugLog = console.log.bind(console, name);  // Attach component name to logs

        const error: DebugErrorFn = (error: Error, ...msg: any[]) => {
            console.error(`[ERROR] ${name}`, error, ...msg);
        };

        return Object.assign(debugLog, {
            debug,
            debugError: error,
        });
    } else {
        const debugLog = () => {};
        const error = () => {};
        return Object.assign(debugLog, {
            debug,
            debugError: error,
        });
    }
}

