import {findPart} from "./dot.language";


describe('findPart', () => {
    const sample = {
        foo: {
            bar: {
                baz: 42,
            },
            'key': {
                nested: 'value',
            },
        },
        list: [ 'zero', 'one', 'two' ],
    }

    it('returns undefined if ref is null or undefined', () => {
        expect(findPart(sample, null)).toBeUndefined()
        expect(findPart(sample, undefined)).toBeUndefined()
    })

    it('returns the original object when ref is empty string', () => {
        expect(findPart(sample, '')).toBe(sample)
    })

    it('retrieves a deeply nested value', () => {
        expect(findPart(sample, 'foo.bar.baz')).toBe(42)
    })

    it('returns undefined for a non-existent path', () => {
        expect(findPart(sample, 'foo.bar.nonexistent')).toBeUndefined()
        expect(findPart(sample, 'nope')).toBeUndefined()
    })

    it('filters out empty segments from leading, trailing, or consecutive dots', () => {
        expect(findPart(sample, '.foo.bar.baz')).toBe(42)
        expect(findPart(sample, 'foo..bar.baz')).toBe(42)
        expect(findPart(sample, 'foo.bar.baz.')).toBe(42)
    })

    it('strips off everything after the first colon in each segment', () => {
        // the segment 'key:withcolon' becomes 'key'
        expect(findPart(sample, 'foo.key:withcolon.nested')).toBe('value')
        // also works if the colon appears in a deeper segment
        expect(findPart(sample, 'foo.bar:baz.baz')).toBe(42)
    })

    it('can index into arrays using numeric keys', () => {
        expect(findPart(sample, 'list.1')).toBe('one')
        expect(findPart(sample, 'list.2')).toBe('two')
        expect(findPart(sample, 'list.10')).toBeUndefined()
    })

    it('returns undefined if any intermediate value becomes nullish', () => {
        const withNull = { a: null as any }
        expect(findPart(withNull, 'a.b')).toBeUndefined()
    })
})
