import {safeArray, safeObject} from "./safe";


describe('safeArray', () => {
    it('returns empty array for undefined', () => {
        expect(safeArray(undefined)).toEqual([])
    })

    it('returns empty array for null', () => {
        expect(safeArray(null)).toEqual([])
    })

    it('returns original array when given an array', () => {
        const arr = [1, 2, 3]
        expect(safeArray(arr)).toBe(arr)
        expect(safeArray(arr)).toEqual([1, 2, 3])
    })

    it('wraps a single value into an array', () => {
        expect(safeArray(42)).toEqual([42])
        expect(safeArray('foo')).toEqual(['foo'])
        expect(safeArray({ a: 1 })).toEqual([{ a: 1 }])
    })
})

describe('safeObject', () => {
    it('returns empty object for undefined', () => {
        expect(safeObject(undefined)).toEqual({})
    })

    it('returns the same object when provided', () => {
        const obj = { foo: 'bar', baz: 123 }
        expect(safeObject(obj)).toBe(obj)
        expect(safeObject(obj)).toEqual({ foo: 'bar', baz: 123 })
    })

    it('does not treat null as undefined', () => {
        expect(safeObject(null as any)).toBeNull()
    })
})
