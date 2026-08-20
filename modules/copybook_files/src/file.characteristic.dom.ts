import {
    BinarySemantics,
    ByteOrder,
    CharacterEncodingName,
    DisplaySignEncoding,
    FloatingPointPrecision,
} from "./file.characteristic.encoding";


export type FileFieldValue =
    | string
    | bigint
    | Decimal
    | number;


/*
 * Authoring metadata
 */

export type AuthoringFileMetadata = {
    entries: AuthoringFileEntry[];
};


export type AuthoringFileEntry =
    | AuthoringFileFieldMetadata
    | AuthoringFileFillerMetadata;


export type AuthoringFileFieldMetadata<
    T extends FileFieldValue = FileFieldValue,
> = {
    kind: "field";
    name: string;
    description?: string;
    size: number;
    type: FileFieldType<T>;
};


export type AuthoringFileFillerMetadata = {
    kind: "filler";
    size: number;
};


/*
 * Canonical metadata
 */

export type FileMetadata<
    TFields extends readonly FileFieldMetadata[] = FileFieldMetadata[],
> = {
    size: number;
    fields: TFields;
};


export type FileFieldMetadata<
    T extends FileFieldValue = FileFieldValue,
> = {
    name: string;
    description?: string;
    from: number;
    to: number;
    type: FileFieldType<T>;
};


/*
 * Field types
 */

export type FileFieldType<
    T extends FileFieldValue = FileFieldValue,
> =
    T extends string ? TextFieldType
        : T extends bigint ? IntegerFieldType
            : T extends Decimal ? DecimalFieldType
                : T extends number ? FloatingPointFieldType
                    : never;


/*
 * Text
 */

export type TextFieldType = {
    kind: "text";
    encoding: CharacterEncodingName;
};


/*
 * Integer
 */

export type IntegerFieldType =
    | DisplayIntegerFieldType
    | BinaryIntegerFieldType;


export type DisplayIntegerFieldType = {
    kind: "integer";
    encoding: "display-integer";
    characterEncoding: CharacterEncodingName;
    sign: DisplaySignEncoding;
};


export type BinaryIntegerFieldType = {
    kind: "integer";
    encoding: "binary-integer";
    byteOrder: ByteOrder;
    semantics: BinarySemantics;
    signed: boolean;
};


/*
 * Decimal
 */

export type DecimalFieldType =
    | DisplayDecimalFieldType
    | BinaryDecimalFieldType
    | PackedDecimalFieldType;


export type DisplayDecimalFieldType = {
    kind: "decimal";
    encoding: "display-decimal";
    characterEncoding: CharacterEncodingName;
    sign: DisplaySignEncoding;
    digits: number;
    scale: number;
    signed: boolean;
};


export type BinaryDecimalFieldType = {
    kind: "decimal";
    encoding: "binary-decimal";
    byteOrder: ByteOrder;
    semantics: BinarySemantics;
    digits: number;
    scale: number;
    signed: boolean;
};


export type PackedDecimalFieldType = {
    kind: "decimal";
    encoding: "packed-decimal";
    digits: number;
    scale: number;
    signed: boolean;
};


/*
 * Floating point
 */

export type FloatingPointFieldType =
    | Ieee754FieldType
    | IbmHexFieldType;


export type Ieee754FieldType = {
    kind: "floating-point";
    encoding: "ieee754";
    precision: FloatingPointPrecision;
    byteOrder: ByteOrder;
};


export type IbmHexFieldType = {
    kind: "floating-point";
    encoding: "ibm-hex";
    precision: FloatingPointPrecision;
    byteOrder: ByteOrder;
};


/*
 * Runtime exact decimal value
 */

export type Decimal = {
    unscaled: bigint;
    scale: number;
};