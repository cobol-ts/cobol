import {fromBase64, toBase64} from "./base64";

describe('base64', () => {
    it('round trips a simple string', () => {
        expect(fromBase64(toBase64('Hello, world!'))).toBe('Hello, world!')
    })

    it('round trips an empty string', () => {
        expect(fromBase64(toBase64(''))).toBe('')
    })

    it('round trips unicode', () => {
        expect(fromBase64(toBase64('Hello £世界'))).toBe('Hello £世界')
    })

    it('encodes a known value', () => {
        expect(toBase64('hello')).toBe('aGVsbG8=')
    })

    it('decodes a known value', () => {
        expect(fromBase64('aGVsbG8=')).toBe('hello')
    })
})
