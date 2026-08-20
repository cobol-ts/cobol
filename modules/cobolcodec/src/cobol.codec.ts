import {
    FileFieldMetadata,
    FileFieldType,
    FileFieldValue,
} from "@cobol-ts/copybookfiles";


export type TypedFileFieldMetadata<T extends FileFieldValue, TType extends FileFieldType<T>, > =
    Omit<FileFieldMetadata<T>, "type"> & {
    type: TType;
};


export type ValueValidator<T extends FileFieldValue, TType extends FileFieldType<T>, > =
    (field: TypedFileFieldMetadata<T, TType>, value: T,) => string | undefined;


export type ByteValidator<T extends FileFieldValue, TType extends FileFieldType<T>, > =
    (field: TypedFileFieldMetadata<T, TType>, source: Uint8Array,) => string | undefined;


export type ByteReader<T extends FileFieldValue, TType extends FileFieldType<T>, > =
    (field: TypedFileFieldMetadata<T, TType>, source: Uint8Array,) => T;


export type ByteWriter<T extends FileFieldValue, TType extends FileFieldType<T>, > =
    (field: TypedFileFieldMetadata<T, TType>, target: Uint8Array, value: T,) => void;


export type FileFieldCodec<T extends FileFieldValue, TType extends FileFieldType<T>, > = {
    validateBytes: ByteValidator<T, TType>;
    read: ByteReader<T, TType>;
    validateValue: ValueValidator<T, TType>;
    write: ByteWriter<T, TType>;
};