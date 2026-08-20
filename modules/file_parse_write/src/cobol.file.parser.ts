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


export const parseRecord = <
    const TFields extends readonly FileFieldMetadata[],
    TEncoding extends FileEncodingName,
>(
    fields: TFields,
    codecs: FileCodecRegistry<TEncoding>,
    source: Uint8Array,
): ErrorsOr<FileFieldValues<TFields>> => {
    const result: FileFieldValue[] = [];
    let parseErrors: string[] | undefined;

    for (const field of fields) {
        const codec = codecFor(field, codecs,);

        const error = codec.validateBytes(field, source,);

        if (error) {
            (parseErrors ??= []).push(error,);
            continue;
        }

        result.push(codec.read(field, source,),);
    }

    return parseErrors
        ? errors(...parseErrors)
        : value(result as FileFieldValues<TFields>);
};