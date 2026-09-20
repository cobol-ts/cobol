import {
    BinarySemantics,
    ByteOrder,
    CharacterEncodingName,
    DisplaySignEncoding,
    FloatingPointPrecision,
} from "./file.characteristic.encoding";


/*
 * Record structure
 */

export type FileMetadata = {
    size?: number;
    entries: FileEntry[];
};


export type FileEntry =
    | FileGroup
    | FileElementary;


/*
 * Entry identity
 */

export type FileEntryName =
    | NamedFileEntryName
    | FillerFileEntryName;


export type NamedFileEntryName = {
    kind: "named";
    name: string;
};


export type FillerFileEntryName = {
    kind: "filler";
};


/*
 * References
 */

export type FileEntryReference = {
    path: readonly string[];
};


/*
 * Offsets
 */

export type FileOffset =
    | StaticFileOffset
    | DynamicFileOffset
    | LengthResolvedFileOffset;


export type StaticFileOffset = {
    kind: "static";
    offset: number;
};


export type DynamicFileOffset = {
    kind: "dynamic";
    fixed: number;
    variables: DynamicFileOffsetVariable[];
};


export type DynamicFileOffsetVariable = {
    value: FileEntryReference;
    size: number;
};


export type LengthResolvedFileOffset = {
    kind: "length-resolved";
    fromEnd: number;
};


/*
 * Common entry characteristics
 */

export type FileEntryCharacteristics = {
    name: FileEntryName;
    description?: string;

    occurs?: FileOccurs;
    redefines?: FileEntryReference;

    size?: number;
    offset?: FileOffset;
};


/*
 * Groups
 */

export type FileGroup =
    FileEntryCharacteristics & {
    kind: "group";
    entries: FileEntry[];
};


/*
 * Elementary fields
 */

export type FileElementary<
    T extends FileFieldValue = FileFieldValue,
> =
    FileEntryCharacteristics & {
    kind: "elementary";
    size: number;
    type: FileFieldType<T>;
    conditions: FileCondition<T>[];
};


/*
 * OCCURS
 */

export type FileOccurs =
    | FixedFileOccurs
    | DependingOnFileOccurs;


export type FixedFileOccurs = {
    kind: "fixed";
    count: number;
};


export type DependingOnFileOccurs = {
    kind: "depending-on";
    min: number;
    max: number;
    dependingOn: FileEntryReference;
};


/*
 * Level 88 conditions
 */

export type FileCondition<
    T extends FileFieldValue = FileFieldValue,
> = {
    name: string;
    values: FileConditionValue<T>[];
};


export type FileConditionValue<
    T extends FileFieldValue = FileFieldValue,
> =
    | SingleFileConditionValue<T>
    | RangeFileConditionValue<T>;


export type SingleFileConditionValue<
    T extends FileFieldValue = FileFieldValue,
> = {
    kind: "value";
    value: T;
};


export type RangeFileConditionValue<
    T extends FileFieldValue = FileFieldValue,
> = {
    kind: "range";
    from: T;
    to: T;
};


/*
 * Field values
 */

export type FileFieldValue =
    | string
    | bigint
    | Decimal
    | number;


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
    digits: number;
};


export type BinaryIntegerFieldType = {
    kind: "integer";
    encoding: "binary-integer";
    byteOrder: ByteOrder;
    semantics: BinarySemantics;
    signed: boolean;
    digits: number;
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