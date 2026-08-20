// testUtils.ts

/**
 * Runs `fn`, silences all console.error calls during its execution,
 * then restores console.error and returns what was logged.
 */
export function captureConsoleError<T>(fn: () => T): { result: T; errors: any[][] } {
    const originalError = console.error
    const errors: any[][] = []
    console.error = (...args: any[]) => {
        errors.push(args)
    }

    let result!: T
    try {
        result = fn()
    } finally {
        console.error = originalError
    }

    return { result, errors }
}

/**
 * Like `captureConsoleError`, but supports async callbacks.
 */
export async function captureConsoleErrorAsync<T>(
    fn: () => Promise<T>
): Promise<{ result: T; errors: any[][] }> {
    const originalError = console.error
    const errors: any[][] = []
    console.error = (...args: any[]) => {
        errors.push(args)
    }

    let result!: T
    try {
        result = await fn()
    } finally {
        console.error = originalError
    }

    return { result, errors }
}
/**
 * Runs `fn`, silences all console.log calls during its execution,
 * then restores console.log and returns what was logged.
 */
export function captureConsoleLog<T>(fn: () => T): { result: T; logs: any[][] } {
    const originalLog = console.log;
    const logs: any[][] = [];
    console.log = (...args: any[]) => {
        logs.push(args);
    };

    let result!: T;
    try {
        result = fn();
    } finally {
        console.log = originalLog;
    }

    return { result, logs };
}

/**
 * Like `captureConsoleLog`, but supports async callbacks.
 */
export async function captureConsoleLogAsync<T>(
    fn: () => Promise<T>
): Promise<{ result: T; logs: any[][] }> {
    const originalLog = console.log;
    const logs: any[][] = [];
    console.log = (...args: any[]) => {
        logs.push(args);
    };

    let result!: T;
    try {
        result = await fn();
    } finally {
        console.log = originalLog;
    }

    return { result, logs };
}
