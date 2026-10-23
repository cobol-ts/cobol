import {parseCobolPicture, type CobolPictureOptions} from '@cobol-ts/layout';
import {FragmentedByteCursor} from './fragmented.bytes';
import {cp037Characters} from './ebcdic.037';

/** Compiled once per projected elementary declaration. The decoder uses the
 * supplied reusable byte cursor; it never retains any record or byte buffer. */
export type CobolFieldDecoder = Readonly<{
    kind: 'text' | 'numeric';
    decode(cursor: FragmentedByteCursor): string | number;
}>;

/** Only storage conventions we can interpret without guessing. */
export type CobolDecodeOptions = CobolPictureOptions & Readonly<{
    encoding?: 'ebcdic-037' | 'ascii';
}>;

export type CobolFieldDeclaration = Readonly<{
    picture?: string;
    clauses: readonly Readonly<{
        kind: string;
        usage?: string;
        position?: string;
        separate?: boolean;
    }>[];
}>;

type Sign = Readonly<{separate: boolean; leading: boolean}>;
type Charset = 'ebcdic-037' | 'ascii';
type Storage = 'display' | 'packed' | 'binary';

function digit(byte: number, charset: Charset): number {
    const zero = charset === 'ebcdic-037' ? 0xf0 : 0x30;
    const n = byte - zero;
    if (n < 0 || n > 9) throw new Error(`Invalid ${charset} DISPLAY numeric digit 0x${byte.toString(16)}`);
    return n;
}

function accumulate(value: number, d: number): number {
    const next = value * 10 + d;
    if (!Number.isSafeInteger(next)) throw new RangeError('COBOL numeric value exceeds JavaScript safe integer precision');
    return next;
}

// Nonnegative 0..9 means positive; -(digit+1) means negative.
// Returning a tagged number avoids allocating an object per signed digit.
function signedDigit(byte: number, charset: Charset): number {
    if (charset === 'ebcdic-037') {
        if (byte >= 0xc0 && byte <= 0xc9) return byte - 0xc0;
        if (byte >= 0xd0 && byte <= 0xd9) return -(byte - 0xd0 + 1);
    } else {
        // ASCII overpunch: positive { A..I, negative } J..R.
        if (byte === 0x7b) return 0;
        if (byte >= 0x41 && byte <= 0x49) return byte - 0x40;
        if (byte === 0x7d) return -1;
        if (byte >= 0x4a && byte <= 0x52) return -(byte - 0x49 + 1);
    }
    return digit(byte, charset);
}

class TextFieldDecoder implements CobolFieldDecoder {
    readonly kind = 'text' as const;
    constructor(private readonly encoding: Charset, private readonly width: number) {}
    decode(cursor: FragmentedByteCursor): string {
        if (cursor.length !== this.width) throw new RangeError(`Text field requires ${this.width} bytes, got ${cursor.length}`);
        let result = '';
        if (this.encoding === 'ebcdic-037') {
            while (cursor.remaining) result += cp037Characters[cursor.next()];
        } else {
            while (cursor.remaining) {
                const b = cursor.next();
                if (b > 0x7f) throw new Error(`Non-ASCII byte 0x${b.toString(16)} in ASCII field`);
                result += String.fromCharCode(b);
            }
        }
        // Preserve COBOL's space padding, do not silently trim the value.
        return result;
    }
}

class NumberFieldDecoder implements CobolFieldDecoder {
    readonly kind = 'numeric' as const;
    constructor(private readonly storage: Storage, private readonly charset: Charset,
        private readonly digits: number, private readonly scale: number,
        private readonly signed: boolean, private readonly sign: Sign,
        private readonly width: number) {}

    decode(cursor: FragmentedByteCursor): number {
        if (cursor.length !== this.width) throw new RangeError(`Numeric field requires ${this.width} bytes, got ${cursor.length}`);
        let number: number;
        if (this.storage === 'display') number = this.display(cursor);
        else if (this.storage === 'packed') number = this.packed(cursor);
        else number = this.binary(cursor);
        return this.scale === 0 ? number : number / 10 ** this.scale;
    }

    private display(cursor: FragmentedByteCursor): number {
        let negative = false, value = 0;
        const plus = this.charset === 'ebcdic-037' ? 0x4e : 0x2b;
        const minus = this.charset === 'ebcdic-037' ? 0x60 : 0x2d;
        if (this.signed && this.sign.separate && this.sign.leading) {
            const b = cursor.next();
            if (b !== plus && b !== minus) throw new Error('Invalid separate DISPLAY leading sign');
            negative = b === minus;
        }
        for (let index = 0; index < this.digits; index++) {
            const b = cursor.next();
            if (this.signed && !this.sign.separate &&
                index === (this.sign.leading ? 0 : this.digits - 1)) {
                const signed = signedDigit(b, this.charset);
                negative = signed < 0;
                value = accumulate(value, signed < 0 ? -signed - 1 : signed);
            } else value = accumulate(value, digit(b, this.charset));
        }
        if (this.signed && this.sign.separate && !this.sign.leading) {
            const b = cursor.next();
            if (b !== plus && b !== minus) throw new Error('Invalid separate DISPLAY trailing sign');
            negative = b === minus;
        }
        return negative ? -value : value;
    }

    private packed(cursor: FragmentedByteCursor): number {
        let value = 0, negative = false;
        const padded = (this.digits + 1) % 2 === 1;
        let seen = 0;
        for (let i = 0; i < this.width; i++) {
            const b = cursor.next(), high = b >>> 4, low = b & 0xf;
            if (i === 0 && padded) {
                if (high !== 0) throw new Error('Nonzero packed-decimal leading padding nibble');
            } else {
                if (high > 9) throw new Error('Invalid packed-decimal digit');
                value = accumulate(value, high); seen++;
            }
            if (i < this.width - 1) {
                if (low > 9) throw new Error('Invalid packed-decimal digit');
                value = accumulate(value, low); seen++;
            } else {
                if (low !== 0xc && low !== 0xd && low !== 0xf)
                    throw new Error('Invalid packed-decimal sign nibble');
                negative = low === 0xd;
            }
        }
        if (seen !== this.digits) throw new RangeError('Incorrect packed-decimal digit count');
        if (negative && !this.signed) throw new Error('Unsigned packed-decimal field has a negative sign');
        return negative ? -value : value;
    }

    private binary(cursor: FragmentedByteCursor): number {
        // IBM z/OS BINARY / COMP / COMP-4: big-endian two's complement.
        // Start sign-extended rather than reading an unsafe unsigned 64-bit
        // number and trying to subtract 2^64 after precision has been lost.
        const first = cursor.next();
        let n = this.signed && (first & 0x80) ? first - 256 : first;
        while (cursor.remaining) n = n * 256 + cursor.next();
        if (!Number.isSafeInteger(n)) throw new RangeError('Binary integer exceeds JavaScript safe integer precision');
        return n;
    }
}

/** Compile field-specific decisions once; never infer unsupported dialects.
 * `width` is the compiler's actual selected elementary storage size in bytes.
 * This first milestone supports single-byte DISPLAY text, unedited numeric
 * DISPLAY, PACKED-DECIMAL/COMP-3 and mainframe big-endian BINARY/COMP/COMP-4.
 */
export function compileCobolFieldDecoder(field: CobolFieldDeclaration, width: number,
    options: CobolDecodeOptions = {}): CobolFieldDecoder {
    if (!Number.isSafeInteger(width) || width < 1) throw new RangeError(`Invalid elementary width ${width}`);
    if (!field.picture) throw new Error('PICTURE-less COBOL field decoding is not supported');
    const picture = parseCobolPicture(field.picture, options);
    if (!picture) throw new Error(`Unsupported COBOL PICTURE ${field.picture}`);
    const encoding = options.encoding ?? 'ebcdic-037';
    const usage = field.clauses.find(c => c.kind === 'usage')?.usage?.toUpperCase().replace(/\s+/g, '-').replace(/^COMPUTATIONAL/, 'COMP') ?? 'DISPLAY';
    const signClause = field.clauses.find(c => c.kind === 'sign');
    const sign: Sign = {separate: signClause?.separate === true, leading: signClause?.position === 'leading'};
    if (usage === 'DISPLAY' && (picture.category === 'alphanumeric' || picture.category === 'alphabetic')) {
        if (picture.positions !== width) throw new Error('COBOL text width does not match PICTURE');
        return new TextFieldDecoder(encoding, width);
    }
    if (picture.category !== 'numeric') throw new Error(`COBOL ${picture.category} decoder is not yet implemented`);
    if (picture.tokens.some(token => token.symbol === 'P'))
        throw new Error('Scaling P PICTURE is not yet implemented');
    const v = picture.tokens.findIndex(token => token.symbol === 'V');
    const scale = v < 0 ? 0 : picture.tokens.slice(v + 1).reduce((sum, token) => sum + (token.symbol === '9' ? token.repeat : 0), 0);
    let storage: Storage;
    if (usage === 'DISPLAY') storage = 'display';
    else if (usage === 'COMP-3' || usage === 'PACKED-DECIMAL') storage = 'packed';
    else if (usage === 'COMP' || usage === 'COMP-4' || usage === 'BINARY') storage = 'binary';
    else throw new Error(`COBOL USAGE ${usage} decoding is not yet implemented`);
    const expected = storage === 'display' ? picture.digits + (picture.signed && sign.separate ? 1 : 0)
        : storage === 'packed' ? Math.ceil((picture.digits + 1) / 2)
            : picture.digits <= 4 ? 2 : picture.digits <= 9 ? 4 : 8;
    if (width !== expected) throw new Error(`${storage} PICTURE ${field.picture} needs ${expected} bytes, got ${width}`);
    if (storage !== 'display' && signClause) throw new Error(`${storage} storage does not support SIGN clause`);
    if (!picture.signed && signClause) throw new Error('SIGN clause requires signed PICTURE');
    return new NumberFieldDecoder(storage, encoding, picture.digits, scale, picture.signed, sign, width);
}
