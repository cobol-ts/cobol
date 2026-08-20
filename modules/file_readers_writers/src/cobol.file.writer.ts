import {
    open,
} from "node:fs/promises";
import {
    ErrorsOr,
} from "@cobol-ts/errors";
import {
    FileEncodingName,
    FileFieldMetadata,
    FileMetadata,
} from "@cobol-ts/copybookfiles";
import {
    FileCodecRegistry,
    validateFieldsAgainstRegistry,
} from "@cobol-ts/cobolcodec";
import {
    FileFieldValues,
    writeRecord,
} from "@cobol-ts/file_parse_write";


export type FileHandleLike = {
    write(
        buffer: Uint8Array,
        offset: number,
        length: number,
        position: number | null,
    ): Promise<{
        bytesWritten: number;
        buffer: Uint8Array;
    }>;

    close(): Promise<void>;
};


export type OpenFile =
    (
        filename: string,
        flags: string,
    ) => Promise<FileHandleLike>;


export type RecordWriter<
    TFields extends readonly FileFieldMetadata[],
> =
    (
        record: FileFieldValues<TFields>,
    ) => Promise<ErrorsOr<void>>;


export async function writeAll(
    file: FileHandleLike,
    buffer: Uint8Array,
): Promise<void> {
    let offset = 0;

    while (offset < buffer.length) {
        const {
            bytesWritten,
        } =
            await file.write(
                buffer,
                offset,
                buffer.length - offset,
                null,
            );

        if (bytesWritten === 0)
            throw new Error(
                `Cannot write file: wrote zero bytes with ${buffer.length - offset} bytes remaining`,
            );

        offset += bytesWritten;
    }
}


export async function withFileWriter<
    const TFields extends readonly FileFieldMetadata[],
    TEncoding extends FileEncodingName,
    TResult,
>(
    filename: string,
    metadata: FileMetadata<TFields>,
    codecs: FileCodecRegistry<TEncoding>,
    fn: (write: RecordWriter<TFields>) => Promise<TResult>,
    openFile: OpenFile = open,
): Promise<TResult> {
    if (metadata.size <= 0)
        throw new Error(
            `Cannot write file: record size must be greater than zero but was ${metadata.size}`,
        );

    const registryErrors =
        validateFieldsAgainstRegistry(
            metadata.fields,
            codecs,
        );

    if (registryErrors.length > 0)
        throw new Error(
            `Cannot write file: ${registryErrors.join("; ")}`,
        );

    const file =
        await openFile(
            filename,
            "w",
        );

    try {
        const buffer =
            new Uint8Array(
                metadata.size,
            );

        const write: RecordWriter<TFields> =
            async record => {
                const result =
                    writeRecord(
                        metadata.fields,
                        codecs,
                        buffer,
                        record,
                    );

                if ("errors" in result)
                    return result;

                await writeAll(
                    file,
                    buffer,
                );

                return result;
            };

        return await fn(
            write,
        );
    } finally {
        await file.close();
    }
}