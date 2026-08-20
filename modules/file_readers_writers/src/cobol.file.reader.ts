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
    parseRecord,
} from "@cobol-ts/file_parse_write";


export type FileHandleLike = {
    read(
        buffer: Uint8Array,
        offset: number,
        length: number,
        position: number | null,
    ): Promise<{
        bytesRead: number;
        buffer: Uint8Array;
    }>;

    close(): Promise<void>;
};


export type FileRecordReader =
    (
        filename: string,
        recordSize: number,
    ) => AsyncIterable<Uint8Array>;


export async function* readFixedRecords(
    file: FileHandleLike,
    recordSize: number,
): AsyncGenerator<Uint8Array> {
    const buffer =
        new Uint8Array(
            recordSize,
        );

    while (true) {
        let offset = 0;

        while (offset < recordSize) {
            const {
                bytesRead,
            } =
                await file.read(
                    buffer,
                    offset,
                    recordSize - offset,
                    null,
                );

            if (bytesRead === 0)
                break;

            offset += bytesRead;
        }

        if (offset === 0)
            return;

        if (offset !== recordSize)
            throw new Error(
                `Cannot read file: final record has ${offset} bytes but expected ${recordSize}`,
            );

        yield buffer;
    }
}


export const defaultFileRecordReader: FileRecordReader =
    async function* (
        filename,
        recordSize,
    ) {
        const file =
            await open(
                filename,
                "r",
            );

        try {
            yield* readFixedRecords(
                file,
                recordSize,
            );
        } finally {
            await file.close();
        }
    };


export async function* readFileRecords<
    const TFields extends readonly FileFieldMetadata[],
    TEncoding extends FileEncodingName,
>(
    filename: string,
    metadata: FileMetadata<TFields>,
    codecs: FileCodecRegistry<TEncoding>,
    readRecords: FileRecordReader = defaultFileRecordReader,
): AsyncGenerator<ErrorsOr<FileFieldValues<TFields>>> {
    if (metadata.size <= 0)
        throw new Error(
            `Cannot read file: record size must be greater than zero but was ${metadata.size}`,
        );

    const registryErrors =
        validateFieldsAgainstRegistry(
            metadata.fields,
            codecs,
        );

    if (registryErrors.length > 0)
        throw new Error(
            `Cannot read file: ${registryErrors.join("; ")}`,
        );

    for await (
        const record of readRecords(
        filename,
        metadata.size,
    )
        )
        yield parseRecord(
            metadata.fields,
            codecs,
            record,
        );
}