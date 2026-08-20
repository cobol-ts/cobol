/*
 * Complete encoding vocabulary
 */


/*
 * Character encodings
 */

export type AsciiEncodingName =
    "ascii";


export type EbcdicEncodingName =
    `ebcdic:${string}`;


export type CharacterEncodingName =
    | AsciiEncodingName
    | EbcdicEncodingName;


/*
 * Integer encodings
 */

export type DisplayIntegerEncodingName =
    "display-integer";


export type BinaryIntegerEncodingName =
    "binary-integer";


export type IntegerEncodingName =
    | DisplayIntegerEncodingName
    | BinaryIntegerEncodingName;


/*
 * Decimal encodings
 */

export type DisplayDecimalEncodingName =
    "display-decimal";


export type BinaryDecimalEncodingName =
    "binary-decimal";


export type PackedDecimalEncodingName =
    "packed-decimal";


export type DecimalEncodingName =
    | DisplayDecimalEncodingName
    | BinaryDecimalEncodingName
    | PackedDecimalEncodingName;


/*
 * Floating-point encodings
 */

export type Ieee754EncodingName =
    "ieee754";


export type IbmHexEncodingName =
    "ibm-hex";


export type FloatingPointEncodingName =
    | Ieee754EncodingName
    | IbmHexEncodingName;


/*
 * Numeric encodings
 */

export type NumberEncodingName =
    | IntegerEncodingName
    | DecimalEncodingName
    | FloatingPointEncodingName;


/*
 * Complete encoding-name vocabulary
 */

export type FileEncodingName =
    | CharacterEncodingName
    | NumberEncodingName;


/*
 * Character encoding configuration
 */

export type EbcdicCodePage =
    string;


/*
 * Display numeric configuration
 */

export type DisplaySignEncoding =
    | "unsigned"
    | "leading"
    | "trailing"
    | "leading-separate"
    | "trailing-separate"
    | "leading-overpunch"
    | "trailing-overpunch";


/*
 * Binary numeric configuration
 */

export type ByteOrder =
    | "big-endian"
    | "little-endian";


export type BinarySemantics =
    | "picture"
    | "native";


/*
 * Floating-point configuration
 */

export type FloatingPointPrecision =
    | "single"
    | "double";