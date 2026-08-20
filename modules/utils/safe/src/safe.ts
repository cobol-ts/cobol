
export function safeArray<T> ( ts: T | T[] | undefined ): T[] {
  if ( ts === undefined || ts === null ) return []
  if ( Array.isArray ( ts ) ) return ts
  return [ ts ];
}
export function safeObject<T> ( t: Record<string,T> | undefined ): Record<string,T> {
  return t === undefined ? {} : t
}
