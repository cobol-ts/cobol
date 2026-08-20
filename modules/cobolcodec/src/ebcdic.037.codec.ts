import {
    TextFieldType,
} from "@cobol-ts/copybookfiles";
import {
    FileFieldCodec,
    TypedFileFieldMetadata,
} from "./cobol.codec";


const cp037Decode: readonly string[] = [
    "\u0000", "\u0001", "\u0002", "\u0003", "\u009c", "\t", "\u0086", "\u007f", "\u0097", "\u008d", "\u008e", "\u000b", "\f", "\r", "\u000e", "\u000f",
    "\u0010", "\u0011", "\u0012", "\u0013", "\u009d", "\u0085", "\b", "\u0087", "\u0018", "\u0019", "\u0092", "\u008f", "\u001c", "\u001d", "\u001e", "\u001f",
    "\u0080", "\u0081", "\u0082", "\u0083", "\u0084", "\n", "\u0017", "\u001b", "\u0088", "\u0089", "\u008a", "\u008b", "\u008c", "\u0005", "\u0006", "\u0007",
    "\u0090", "\u0091", "\u0016", "\u0093", "\u0094", "\u0095", "\u0096", "\u0004", "\u0098", "\u0099", "\u009a", "\u009b", "\u0014", "\u0015", "\u009e", "\u001a",
    " ", "\u00a0", "\u00e2", "\u00e4", "\u00e0", "\u00e1", "\u00e3", "\u00e5", "\u00e7", "\u00f1", "\u00a2", ".", "<", "(", "+", "|",
    "&", "\u00e9", "\u00ea", "\u00eb", "\u00e8", "\u00ed", "\u00ee", "\u00ef", "\u00ec", "\u00df", "!", "$", "*", ")", ";", "\u00ac",
    "-", "/", "\u00c2", "\u00c4", "\u00c0", "\u00c1", "\u00c3", "\u00c5", "\u00c7", "\u00d1", "\u00a6", ",", "%", "_", ">", "?",
    "\u00f8", "\u00c9", "\u00ca", "\u00cb", "\u00c8", "\u00cd", "\u00ce", "\u00cf", "\u00cc", "`", ":", "#", "@", "'", "=", "\"",
    "\u00d8", "a", "b", "c", "d", "e", "f", "g", "h", "i", "\u00ab", "\u00bb", "\u00f0", "\u00fd", "\u00fe", "\u00b1",
    "\u00b0", "j", "k", "l", "m", "n", "o", "p", "q", "r", "\u00aa", "\u00ba", "\u00e6", "\u00b8", "\u00c6", "\u00a4",
    "\u00b5", "~", "s", "t", "u", "v", "w", "x", "y", "z", "\u00a1", "\u00bf", "\u00d0", "\u00dd", "\u00de", "\u00ae",
    "^", "\u00a3", "\u00a5", "\u00b7", "\u00a9", "\u00a7", "\u00b6", "\u00bc", "\u00bd", "\u00be", "[", "]", "\u00af", "\u00a8", "\u00b4", "\u00d7",
    "{", "A", "B", "C", "D", "E", "F", "G", "H", "I", "\u00ad", "\u00f4", "\u00f6", "\u00f2", "\u00f3", "\u00f5",
    "}", "J", "K", "L", "M", "N", "O", "P", "Q", "R", "\u00b9", "\u00fb", "\u00fc", "\u00f9", "\u00fa", "\u00ff",
    "\\", "\u00f7", "S", "T", "U", "V", "W", "X", "Y", "Z", "\u00b2", "\u00d4", "\u00d6", "\u00d2", "\u00d3", "\u00d5",
    "0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "\u00b3", "\u00db", "\u00dc", "\u00d9", "\u00da", "\u009f",
];


const cp037Encode =
    new Map<string, number>(
        cp037Decode.map(
            (character, byte) => [
                character,
                byte,
            ],
        ),
    );


const validateType = (
    field: TypedFileFieldMetadata<string, TextFieldType>,
): string | undefined =>
    field.type.encoding === "ebcdic:037"
        ? undefined
        : `${field.name}: EBCDIC CP037 codec requires encoding 'ebcdic:037'`;


const validateBytes = (
    field: TypedFileFieldMetadata<string, TextFieldType>,
    source: Uint8Array,
): string | undefined => {
    const typeError = validateType(field);
    if (typeError)
        return typeError;

    if (field.from < 0 || field.to < field.from || field.to > source.length)
        return `${field.name}: invalid byte range [${field.from}, ${field.to}) for array of length ${source.length}`;

    return undefined;
};


const validateValue = (
    field: TypedFileFieldMetadata<string, TextFieldType>,
    value: string,
): string | undefined => {
    const typeError = validateType(field);
    if (typeError)
        return typeError;

    const size = field.to - field.from;

    if (value.length > size)
        return `${field.name}: value requires ${value.length} bytes but field has ${size}`;

    for (const character of value)
        if (!cp037Encode.has(character))
            return `${field.name}: character ${JSON.stringify(character)} cannot be encoded as EBCDIC CP037`;

    return undefined;
};


const read = (
    field: TypedFileFieldMetadata<string, TextFieldType>,
    source: Uint8Array,
): string => {
    if (field.type.encoding !== "ebcdic:037")
        throw new Error("ebcdic037Codec requires encoding 'ebcdic:037'");

    let result = "";

    for (let offset = field.from; offset < field.to; offset++)
        result += cp037Decode[source[offset]];

    return result;
};


const write = (
    field: TypedFileFieldMetadata<string, TextFieldType>,
    target: Uint8Array,
    value: string,
): void => {
    if (field.type.encoding !== "ebcdic:037")
        throw new Error("ebcdic037Codec requires encoding 'ebcdic:037'");

    const size = field.to - field.from;

    for (let index = 0; index < size; index++)
        target[field.from + index] =
            index < value.length
                ? cp037Encode.get(value[index])!
                : 0x40;
};


export const ebcdic037Codec: FileFieldCodec<string, TextFieldType> = {
    validateBytes,
    read,
    validateValue,
    write,
};