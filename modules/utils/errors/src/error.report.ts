export type ErrorType = 's/w' | 'validation' | 'network' | 'ui'| 'state';
export type ThrowError = (type: ErrorType, msg: string, e?: any) => never ;
