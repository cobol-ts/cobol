import {
    BinaryIntegerFieldType,
    Decimal,
    Ieee754FieldType,
    PackedDecimalFieldType,
    TextFieldType,
} from "@cobol-ts/copybookfiles";
import {
    FileFieldCodec,
    TypedFileFieldMetadata,
} from "./cobol.codec";


const validateRange = (
    field: TypedFileFieldMetadata<any, any>,
    bytes: Uint8Array,
): string | undefined => {
    if (field.from < 0 || field.to < field.from || field.to > bytes.length)
        return `${field.name}: invalid byte range [${field.from}, ${field.to}) for array of length ${bytes.length}`;

    return undefined;
};


/*
 * ASCII
 */

export const asciiCodec: FileFieldCodec<string, TextFieldType> = {
    validateBytes: (field, source) =>
        validateRange(field, source),

    read: (field, source) => {
        let result = "";

        for (let offset = field.from; offset < field.to; offset++)
            result += String.fromCharCode(source[offset]);

        return result;
    },

    validateValue: (field, value) => {
        const size = field.to - field.from;

        if (value.length > size)
            return `${field.name}: value requires ${value.length} bytes but field has ${size}`;

        for (const character of value)
            if (character.codePointAt(0)! > 0x7f)
                return `${field.name}: character ${JSON.stringify(character)} cannot be encoded as ASCII`;

        return undefined;
    },

    write: (field, target, value) => {
        const size = field.to - field.from;

        for (let index = 0; index < size; index++)
            target[field.from + index] =
                index < value.length
                    ? value.charCodeAt(index)
                    : 0x20;
    },
};


/*
 * Binary integers
 */

export const binaryIntegerCodec: FileFieldCodec<bigint, BinaryIntegerFieldType> = {
    validateBytes: (field, source) => {
        const rangeError = validateRange(field, source);
        if (rangeError)
            return rangeError;

        if (field.to === field.from)
            return `${field.name}: binary integer field must contain at least one byte`;

        return undefined;
    },

    read: (field, source) => {
        let value = 0n;

        if (field.type.byteOrder === "big-endian") {
            for (let offset = field.from; offset < field.to; offset++)
                value = (value << 8n) | BigInt(source[offset]);
        } else {
            for (let offset = field.to - 1; offset >= field.from; offset--)
                value = (value << 8n) | BigInt(source[offset]);
        }

        if (field.type.signed) {
            const bits = BigInt((field.to - field.from) * 8);
            const signBit = 1n << (bits - 1n);

            if ((value & signBit) !== 0n)
                value -= 1n << bits;
        }

        return value;
    },

    validateValue: (field, value) => {
        const size = field.to - field.from;

        if (size <= 0)
            return `${field.name}: binary integer field must contain at least one byte`;

        const bits = BigInt(size * 8);

        if (field.type.signed) {
            const max = (1n << (bits - 1n)) - 1n;
            const min = -(1n << (bits - 1n));

            if (value < min || value > max)
                return `${field.name}: value ${value} does not fit in signed ${size}-byte integer`;

            return undefined;
        }

        if (value < 0)
            return `${field.name}: unsigned integer cannot contain a negative value`;

        const max = (1n << bits) - 1n;

        if (value > max)
            return `${field.name}: value ${value} does not fit in unsigned ${size}-byte integer`;

        return undefined;
    },

    write: (field, target, value) => {
        const byteCount = field.to - field.from;
        const bits = BigInt(byteCount * 8);
        let encoded = value;

        if (encoded < 0)
            encoded += 1n << bits;

        if (field.type.byteOrder === "big-endian") {
            for (let offset = field.to - 1; offset >= field.from; offset--) {
                target[offset] = Number(encoded & 0xffn);
                encoded >>= 8n;
            }
        } else {
            for (let offset = field.from; offset < field.to; offset++) {
                target[offset] = Number(encoded & 0xffn);
                encoded >>= 8n;
            }
        }
    },
};


/*
 * IEEE-754 floating point
 */

export const ieee754Codec: FileFieldCodec<number, Ieee754FieldType> = {
    validateBytes: (field, source) => {
        const rangeError = validateRange(field, source);
        if (rangeError)
            return rangeError;

        const expectedSize = field.type.precision === "single" ? 4 : 8;
        const size = field.to - field.from;

        if (size !== expectedSize)
            return `${field.name}: IEEE-754 ${field.type.precision} requires ${expectedSize} bytes but field has ${size}`;

        return undefined;
    },

    read: (field, source) => {
        const view = new DataView(
            source.buffer,
            source.byteOffset + field.from,
            field.to - field.from,
        );

        const littleEndian = field.type.byteOrder === "little-endian";

        return field.type.precision === "single"
            ? view.getFloat32(0, littleEndian)
            : view.getFloat64(0, littleEndian);
    },

    validateValue: (field, value) => {
        const expectedSize = field.type.precision === "single" ? 4 : 8;
        const size = field.to - field.from;

        if (size !== expectedSize)
            return `${field.name}: IEEE-754 ${field.type.precision} requires ${expectedSize} bytes but field has ${size}`;

        if (field.type.precision === "single" && !Object.is(Math.fround(value), value))
            return `${field.name}: value ${value} cannot be represented exactly as IEEE-754 single precision`;

        return undefined;
    },

    write: (field, target, value) => {
        const view = new DataView(
            target.buffer,
            target.byteOffset + field.from,
            field.to - field.from,
        );

        const littleEndian = field.type.byteOrder === "little-endian";

        if (field.type.precision === "single")
            view.setFloat32(0, value, littleEndian);
        else
            view.setFloat64(0, value, littleEndian);
    },
};


/*
 * Packed decimal
 */

export const packedDecimalCodec: FileFieldCodec<Decimal, PackedDecimalFieldType> = {
    validateBytes: (field, source) => {
        const rangeError = validateRange(field, source);
        if (rangeError)
            return rangeError;

        if (field.to === field.from)
            return `${field.name}: packed decimal field must contain at least one byte`;

        for (let offset = field.from; offset < field.to - 1; offset++) {
            const high = source[offset] >> 4;
            const low = source[offset] & 0x0f;

            if (high > 9 || low > 9)
                return `${field.name}: invalid packed decimal digit at byte ${offset - field.from}`;
        }

        const finalByte = source[field.to - 1];
        const high = finalByte >> 4;
        const sign = finalByte & 0x0f;

        if (high > 9)
            return `${field.name}: invalid final packed decimal digit`;

        if (sign !== 0x0c && sign !== 0x0d && sign !== 0x0f)
            return `${field.name}: invalid packed decimal sign nibble 0x${sign.toString(16)}`;

        if (!field.type.signed && sign === 0x0d)
            return `${field.name}: unsigned packed decimal cannot contain a negative sign`;

        return undefined;
    },

    read: (field, source) => {
        let unscaled = 0n;

        for (let offset = field.from; offset < field.to; offset++) {
            const byte = source[offset];
            const high = byte >> 4;

            unscaled = unscaled * 10n + BigInt(high);

            if (offset < field.to - 1) {
                const low = byte & 0x0f;
                unscaled = unscaled * 10n + BigInt(low);
            }
        }

        const sign = source[field.to - 1] & 0x0f;

        if (sign === 0x0d)
            unscaled = -unscaled;

        return {
            unscaled,
            scale: field.type.scale,
        };
    },

    validateValue: (field, value) => {
        const size = field.to - field.from;

        if (size <= 0)
            return `${field.name}: packed decimal field must contain at least one byte`;

        if (value.scale !== field.type.scale)
            return `${field.name}: decimal scale must be ${field.type.scale} but was ${value.scale}`;

        if (!field.type.signed && value.unscaled < 0)
            return `${field.name}: unsigned decimal cannot contain a negative value`;

        const physicalDigits = size * 2 - 1;

        if (field.type.digits > physicalDigits)
            return `${field.name}: decimal type requires ${field.type.digits} digits but ${size} bytes can hold only ${physicalDigits}`;

        const magnitude = value.unscaled < 0 ? -value.unscaled : value.unscaled;
        const digits = magnitude.toString().length;

        if (digits > field.type.digits)
            return `${field.name}: decimal has ${digits} digits but field allows ${field.type.digits}`;

        return undefined;
    },

    write: (field, target, value) => {
        const negative = value.unscaled < 0;
        const physicalDigits = (field.to - field.from) * 2 - 1;

        const digits = (negative ? -value.unscaled : value.unscaled)
            .toString()
            .padStart(physicalDigits, "0");

        let digitIndex = 0;

        for (let offset = field.from; offset < field.to - 1; offset++) {
            const high = Number(digits[digitIndex++]);
            const low = Number(digits[digitIndex++]);

            target[offset] = (high << 4) | low;
        }

        const finalDigit = Number(digits[digitIndex]);
        const sign = negative ? 0x0d : field.type.signed ? 0x0c : 0x0f;

        target[field.to - 1] = (finalDigit << 4) | sign;
    },
};