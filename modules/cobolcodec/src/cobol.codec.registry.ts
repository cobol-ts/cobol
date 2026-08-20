import {
    BinaryDecimalFieldType,
    BinaryIntegerFieldType,
    CharacterEncodingName,
    Decimal,
    DisplayDecimalFieldType,
    DisplayIntegerFieldType,
    FileEncodingName,
    FileFieldMetadata,
    IbmHexFieldType,
    Ieee754FieldType,
    PackedDecimalFieldType,
    TextFieldType,
} from "@cobol-ts/copybookfiles";
import {
    FileFieldCodec,
} from "./cobol.codec";
import {
    ebcdic037Codec,
} from "./ebcdic.037.codec";
import {
    asciiCodec,
    binaryIntegerCodec,
    ieee754Codec,
    packedDecimalCodec,
} from "./primitive.codec";


export type FileCodecForEncoding<TEncoding extends FileEncodingName, > =
    TEncoding extends CharacterEncodingName
        ? FileFieldCodec<string, TextFieldType>
        : TEncoding extends "display-integer"
            ? FileFieldCodec<bigint, DisplayIntegerFieldType>
            : TEncoding extends "binary-integer"
                ? FileFieldCodec<bigint, BinaryIntegerFieldType>
                : TEncoding extends "display-decimal"
                    ? FileFieldCodec<Decimal, DisplayDecimalFieldType>
                    : TEncoding extends "binary-decimal"
                        ? FileFieldCodec<Decimal, BinaryDecimalFieldType>
                        : TEncoding extends "packed-decimal"
                            ? FileFieldCodec<Decimal, PackedDecimalFieldType>
                            : TEncoding extends "ieee754"
                                ? FileFieldCodec<number, Ieee754FieldType>
                                : TEncoding extends "ibm-hex"
                                    ? FileFieldCodec<number, IbmHexFieldType>
                                    : never;


export type FileCodecRegistry<TEncoding extends FileEncodingName, > = {
    [Encoding in TEncoding]: FileCodecForEncoding<Encoding>;
};


export type DefaultFileEncodingName =
    | "ascii"
    | "ebcdic:037"
    | "binary-integer"
    | "packed-decimal"
    | "ieee754";


export const defaultFileCodecRegistry: FileCodecRegistry<DefaultFileEncodingName> = {
    ascii: asciiCodec,
    "ebcdic:037": ebcdic037Codec,
    "binary-integer": binaryIntegerCodec,
    "packed-decimal": packedDecimalCodec,
    ieee754: ieee754Codec,
};


export const codecFor = <TEncoding extends FileEncodingName, >(
    field: FileFieldMetadata,
    registry: FileCodecRegistry<TEncoding>,
): FileFieldCodec<any, any> => {
    const codec =
        registry[field.type.encoding as TEncoding];

    if (!codec)
        throw new Error(
            `Cannot happen: no codec registered for encoding '${field.type.encoding}'`,
        );

    return codec;
};

export const validateFieldsAgainstRegistry = <TEncoding extends FileEncodingName, >(
    fields: readonly FileFieldMetadata[],
    registry: FileCodecRegistry<TEncoding>,
): string[] => {
    const validationErrors: string[] = [];

    for (const field of fields) {
        const encoding = field.type.encoding;

        if (!Object.hasOwn(registry, encoding))
            validationErrors.push(
                `${field.name}: no codec registered for encoding '${encoding}'`,
            );
    }

    return validationErrors;
};
