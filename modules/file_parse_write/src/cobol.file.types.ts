import {
    Decimal,
    FileEncodingName,
    FileFieldMetadata,
    FileFieldType,
    TextFieldType,
    IntegerFieldType,
    DecimalFieldType,
    FloatingPointFieldType,
} from "@cobol-ts/copybookfiles";


export type FileFieldValueForType<TType extends FileFieldType, > =
    TType extends TextFieldType ? string
        : TType extends IntegerFieldType ? bigint
            : TType extends DecimalFieldType ? Decimal
                : TType extends FloatingPointFieldType ? number
                    : never;


export type FileFieldValueForMetadata<T extends FileFieldMetadata, > =
    FileFieldValueForType<T["type"]>;


export type FileFieldValues<TFields extends readonly FileFieldMetadata[], > = {
    -readonly [Index in keyof TFields]:
    TFields[Index] extends FileFieldMetadata
        ? FileFieldValueForMetadata<TFields[Index]>
        : never;
};


export type FileEncodingForMetadata<T extends FileFieldMetadata, > =
    T["type"]["encoding"];


export type FileEncodingsForMetadata<TFields extends readonly FileFieldMetadata[], > =
    FileEncodingForMetadata<TFields[number]>;