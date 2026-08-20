import {errors, ErrorsOr, value} from "@cobol-ts/errors";
import {
    AuthoringFileEntry,
    AuthoringFileFieldMetadata,
    AuthoringFileMetadata,
    FileFieldMetadata,
    FileFieldValue,
    FileMetadata,
} from "./file.characteristic.dom";


export const compileFileMetadata = (
    metadata: AuthoringFileMetadata,
): ErrorsOr<FileMetadata> => {
    const compileErrors: string[] = [];
    const fields: FileFieldMetadata[] = [];
    let offset = 0;

    for (const entry of metadata.entries) {
        const entryErrors = validateEntry(entry);

        if (entryErrors) {
            compileErrors.push(entryErrors);
            continue;
        }

        if (entry.kind === "field")
            fields.push(
                compileField(
                    entry,
                    offset,
                ),
            );

        offset += entry.size;
    }

    return compileErrors.length > 0
        ? errors(...compileErrors)
        : value({
            size: offset,
            fields,
        });
};


const validateEntry = (
    entry: AuthoringFileEntry,
): string | undefined => {
    if (entry.size <= 0)
        return entry.kind === "field"
            ? `${entry.name}: size must be greater than zero but was ${entry.size}`
            : `filler: size must be greater than zero but was ${entry.size}`;

    return undefined;
};


const compileField = <
    T extends FileFieldValue,
>(
    field: AuthoringFileFieldMetadata<T>,
    from: number,
): FileFieldMetadata<T> => ({
    name: field.name,
    description: field.description,
    from,
    to: from + field.size,
    type: field.type,
});