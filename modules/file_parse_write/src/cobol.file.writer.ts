import {
    errors,
    ErrorsOr,
    value,
} from "@cobol-ts/errors";
import {
    FileEncodingName,
    FileFieldMetadata,
    FileFieldValue,
} from "@cobol-ts/copybookfiles";
import {
    codecFor,
    FileCodecRegistry,
} from "@cobol-ts/cobolcodec";
import {
    FileFieldValues,
} from "./cobol.file.types";


export const writeRecord = <
    const TFields extends readonly FileFieldMetadata[],
    TEncoding extends FileEncodingName,
>(
    fields: TFields,
    codecs: FileCodecRegistry<TEncoding>,
    target: Uint8Array,
    record: FileFieldValues<TFields>,
): ErrorsOr<void> => {
    let writeErrors: string[] | undefined;

    for (let index = 0; index < fields.length; index++) {
        const field = fields[index];
        const fieldValue = record[index] as FileFieldValue;

        if (fieldValue === undefined) {
            (writeErrors ??= []).push(
                `${field.name}: value is missing`,
            );

            continue;
        }

        const codec = codecFor(field, codecs,);

        const error = codec.validateValue(field, fieldValue,);

        if (error) {
            (writeErrors ??= []).push(error,);
            continue;
        }

        codec.write(field, target, fieldValue,);
    }

    return writeErrors
        ? errors(...writeErrors)
        : value(undefined);
};