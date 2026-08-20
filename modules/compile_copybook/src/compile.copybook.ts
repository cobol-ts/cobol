import {
    errors,
    ErrorsOr,
    isErrors,
    value,
} from "@cobol-ts/errors";

import {
    CopybookAst,
    CopybookClause,
    CopybookEntry,
    CopybookEntryName,
    ElementaryEntry,
    GroupEntry,
    SignClause,
} from "@cobol-ts/copybook";
import {
    BinarySemantics,
    ByteOrder,
    CharacterEncodingName, DisplaySignEncoding,
    FileEncodingName,
    FloatingPointEncodingName
} from "@cobol-ts/copybookfiles";
import {
    AuthoringFileEntry,
    AuthoringFileMetadata, BinaryDecimalFieldType, BinaryIntegerFieldType, DisplayDecimalFieldType,
    DisplayIntegerFieldType,
    FileFieldType, IbmHexFieldType, Ieee754FieldType, PackedDecimalFieldType,
    TextFieldType
} from "@cobol-ts/copybookfiles";


/*
 * Configuration
 */

export type CopybookCompilerConfig = {
    supportedEncodings:
        readonly FileEncodingName[];

    characterEncoding:
        CharacterEncodingName;

    binary: {
        byteOrder:
            ByteOrder;

        semantics:
            BinarySemantics;
    };

    floatingPoint: {
        comp1:
            FloatingPointEncodingName;

        comp2:
            FloatingPointEncodingName;
    };

    defaultDisplaySign:
        DisplaySignEncoding;
};


/*
 * Public API
 */

export const compileCopybook = (
    ast: CopybookAst,
    config: CopybookCompilerConfig,
): ErrorsOr<AuthoringFileMetadata> => {
    const supported =
        new Set<FileEncodingName>(
            config.supportedEncodings,
        );

    const compileErrors: string[] = [];
    const entries: AuthoringFileEntry[] = [];

    for (const entry of ast.entries) {
        compileEntry(
            entry,
            config,
            supported,
            entries,
            compileErrors,
            false,
        );
    }

    return compileErrors.length > 0
        ? errors(...compileErrors)
        : value({
            entries,
        });
};


/*
 * Entries
 */

const compileEntry = (
    entry: CopybookEntry,
    config: CopybookCompilerConfig,
    supported: ReadonlySet<FileEncodingName>,
    entries: AuthoringFileEntry[],
    compileErrors: string[],
    filler: boolean,
    occurrence?: number,
): void => {
    const isFiller =
        filler ||
        entry.name.kind === "filler";

    switch (entry.kind) {
        case "group":
            compileGroup(
                entry,
                config,
                supported,
                entries,
                compileErrors,
                isFiller,
                occurrence,
            );
            return;

        case "elementary":
            compileElementary(
                entry,
                config,
                supported,
                entries,
                compileErrors,
                isFiller,
                occurrence,
            );
            return;
    }
};


const compileGroup = (
    entry: GroupEntry,
    config: CopybookCompilerConfig,
    supported: ReadonlySet<FileEncodingName>,
    entries: AuthoringFileEntry[],
    compileErrors: string[],
    filler: boolean,
    parentOccurrence?: number,
): void => {
    const occurs =
        occursCount(entry.clauses);

    if (occurs === undefined) {
        for (const child of entry.children) {
            compileEntry(
                child,
                config,
                supported,
                entries,
                compileErrors,
                filler,
                parentOccurrence,
            );
        }

        return;
    }

    for (
        let occurrence = 0;
        occurrence < occurs;
        occurrence++
    ) {
        for (const child of entry.children) {
            compileEntry(
                child,
                config,
                supported,
                entries,
                compileErrors,
                filler,
                occurrence,
            );
        }
    }
};


const compileElementary = (
    entry: ElementaryEntry,
    config: CopybookCompilerConfig,
    supported: ReadonlySet<FileEncodingName>,
    entries: AuthoringFileEntry[],
    compileErrors: string[],
    filler: boolean,
    parentOccurrence?: number,
): void => {
    const occurs =
        occursCount(entry.clauses) ?? 1;

    const compiled =
        compileElementaryType(
            entry,
            config,
            supported,
        );

    if (isErrors(compiled)) {
        compileErrors.push(
            ...compiled.errors.map(
                error =>
                    `${entryName(entry.name, entry.line)}: ${error}`,
            ),
        );

        return;
    }

    for (
        let occurrence = 0;
        occurrence < occurs;
        occurrence++
    ) {
        if (filler) {
            entries.push({
                kind: "filler",
                size: compiled.value.size,
            });

            continue;
        }

        entries.push({
            kind: "field",

            name:
                fieldName(
                    entry.name,
                    occurrence,
                    occurs,
                    parentOccurrence,
                ),

            size:
            compiled.value.size,

            type:
            compiled.value.type,
        });
    }
};


/*
 * Elementary type compilation
 */

type CompiledElementaryType = {
    size: number;
    type: FileFieldType;
};


const compileElementaryType = (
    entry: ElementaryEntry,
    config: CopybookCompilerConfig,
    supported: ReadonlySet<FileEncodingName>,
): ErrorsOr<CompiledElementaryType> => {
    const usage =
        usageOf(entry.clauses);

    if (isFloatingPointUsage(usage))
        return compileFloatingPoint(
            usage,
            config,
            supported,
        );

    if (!entry.picture)
        return errors(
            "Elementary field requires a PIC clause",
        );

    const picture =
        compilePicture(
            entry.picture,
        );

    if (isErrors(picture))
        return picture;

    switch (usage) {
        case undefined:
        case "DISPLAY":
            return compileDisplay(
                picture.value,
                entry.clauses,
                config,
                supported,
            );

        case "BINARY":
        case "COMP":
        case "COMPUTATIONAL":
        case "COMP-4":
        case "COMPUTATIONAL-4":
            return compileBinary(
                picture.value,
                config.binary.semantics,
                config,
                supported,
            );

        case "COMP-5":
        case "COMPUTATIONAL-5":
            return compileBinary(
                picture.value,
                "native",
                config,
                supported,
            );

        case "COMP-3":
        case "COMPUTATIONAL-3":
        case "PACKED-DECIMAL":
            return compilePackedDecimal(
                picture.value,
                supported,
            );

        default:
            return errors(
                `USAGE '${usage}' is not supported`,
            );
    }
};


/*
 * PIC compilation
 */

type CompiledPicture =
    | TextPicture
    | IntegerPicture
    | DecimalPicture;


type TextPicture = {
    kind: "text";
    size: number;
};


type IntegerPicture = {
    kind: "integer";
    digits: number;
    signed: boolean;
};


type DecimalPicture = {
    kind: "decimal";
    digits: number;
    scale: number;
    signed: boolean;
};


const compilePicture = (
    source: string,
): ErrorsOr<CompiledPicture> => {
    const picture =
        source
            .replace(/\s+/g, "")
            .toUpperCase();

    if (picture.length === 0)
        return errors(
            "PIC cannot be empty",
        );

    if (picture.startsWith("X")) {
        const size =
            countPictureSymbols(
                picture,
                "X",
            );

        return isErrors(size)
            ? size
            : value({
                kind: "text",
                size: size.value,
            });
    }

    const signed =
        picture.startsWith("S");

    const numeric =
        signed
            ? picture.substring(1)
            : picture;

    const parts =
        numeric.split("V");

    if (parts.length > 2)
        return errors(
            `Invalid numeric PIC '${source}': more than one V`,
        );

    const integerDigits =
        countPictureSymbols(
            parts[0],
            "9",
        );

    if (isErrors(integerDigits))
        return integerDigits;

    if (parts.length === 1)
        return value({
            kind: "integer",
            digits: integerDigits.value,
            signed,
        });

    const decimalDigits =
        countPictureSymbols(
            parts[1],
            "9",
        );

    if (isErrors(decimalDigits))
        return decimalDigits;

    return value({
        kind: "decimal",
        digits:
            integerDigits.value +
            decimalDigits.value,
        scale:
        decimalDigits.value,
        signed,
    });
};


const countPictureSymbols = (
    source: string,
    symbol: "X" | "9",
): ErrorsOr<number> => {
    if (!source)
        return errors(
            "PIC component cannot be empty",
        );

    let count = 0;
    let index = 0;

    while (index < source.length) {
        if (source[index] !== symbol)
            return errors(
                `Unsupported PIC '${source}'`,
            );

        index++;

        if (source[index] !== "(") {
            count++;
            continue;
        }

        const close =
            source.indexOf(
                ")",
                index,
            );

        if (close < 0)
            return errors(
                `Invalid PIC '${source}': missing ')'`,
            );

        const repeatText =
            source.substring(
                index + 1,
                close,
            );

        const repeat =
            Number(repeatText);

        if (
            !Number.isInteger(repeat) ||
            repeat <= 0
        )
            return errors(
                `Invalid PIC repetition '${repeatText}'`,
            );

        count += repeat;
        index = close + 1;
    }

    return value(count);
};


/*
 * DISPLAY
 */

const compileDisplay = (
    picture: CompiledPicture,
    clauses: CopybookClause[],
    config: CopybookCompilerConfig,
    supported: ReadonlySet<FileEncodingName>,
): ErrorsOr<CompiledElementaryType> => {
    switch (picture.kind) {
        case "text":
            return compileText(
                picture,
                config,
                supported,
            );

        case "integer":
            return compileDisplayInteger(
                picture,
                clauses,
                config,
                supported,
            );

        case "decimal":
            return compileDisplayDecimal(
                picture,
                clauses,
                config,
                supported,
            );
    }
};


const compileText = (
    picture: TextPicture,
    config: CopybookCompilerConfig,
    supported: ReadonlySet<FileEncodingName>,
): ErrorsOr<CompiledElementaryType> => {
    const encoding =
        config.characterEncoding;

    const supportError =
        requireSupported(
            encoding,
            supported,
        );

    if (supportError)
        return errors(
            supportError,
        );

    const type: TextFieldType = {
        kind: "text",
        encoding,
    };

    return value({
        size: picture.size,
        type,
    });
};


const compileDisplayInteger = (
    picture: IntegerPicture,
    clauses: CopybookClause[],
    config: CopybookCompilerConfig,
    supported: ReadonlySet<FileEncodingName>,
): ErrorsOr<CompiledElementaryType> => {
    const encoding =
        "display-integer" as const;

    const supportError =
        requireSupported(
            encoding,
            supported,
        );

    if (supportError)
        return errors(
            supportError,
        );

    const sign =
        displaySign(
            picture.signed,
            clauses,
            config.defaultDisplaySign,
        );

    const type: DisplayIntegerFieldType = {
        kind: "integer",
        encoding,
        characterEncoding:
        config.characterEncoding,
        sign,
    };

    return value({
        size:
            picture.digits +
            separateSignSize(sign),
        type,
    });
};


const compileDisplayDecimal = (
    picture: DecimalPicture,
    clauses: CopybookClause[],
    config: CopybookCompilerConfig,
    supported: ReadonlySet<FileEncodingName>,
): ErrorsOr<CompiledElementaryType> => {
    const encoding =
        "display-decimal" as const;

    const supportError =
        requireSupported(
            encoding,
            supported,
        );

    if (supportError)
        return errors(
            supportError,
        );

    const sign =
        displaySign(
            picture.signed,
            clauses,
            config.defaultDisplaySign,
        );

    const type: DisplayDecimalFieldType = {
        kind: "decimal",
        encoding,
        characterEncoding:
        config.characterEncoding,
        sign,
        digits:
        picture.digits,
        scale:
        picture.scale,
        signed:
        picture.signed,
    };

    return value({
        size:
            picture.digits +
            separateSignSize(sign),
        type,
    });
};


/*
 * BINARY / COMP
 */

const compileBinary = (
    picture: CompiledPicture,
    semantics: BinarySemantics,
    config: CopybookCompilerConfig,
    supported: ReadonlySet<FileEncodingName>,
): ErrorsOr<CompiledElementaryType> => {
    if (picture.kind === "text")
        return errors(
            "BINARY/COMP cannot be used with a text PIC",
        );

    if (picture.kind === "integer") {
        const encoding =
            "binary-integer" as const;

        const supportError =
            requireSupported(
                encoding,
                supported,
            );

        if (supportError)
            return errors(
                supportError,
            );

        const type: BinaryIntegerFieldType = {
            kind: "integer",
            encoding,
            byteOrder:
            config.binary.byteOrder,
            semantics,
            signed:
            picture.signed,
        };

        const size =
            binarySizeForDigits(
                picture.digits,
            );

        return isErrors(size)
            ? size
            : value({
                size: size.value,
                type,
            });
    }

    const encoding =
        "binary-decimal" as const;

    const supportError =
        requireSupported(
            encoding,
            supported,
        );

    if (supportError)
        return errors(
            supportError,
        );

    const type: BinaryDecimalFieldType = {
        kind: "decimal",
        encoding,
        byteOrder:
        config.binary.byteOrder,
        semantics,
        digits:
        picture.digits,
        scale:
        picture.scale,
        signed:
        picture.signed,
    };

    const size =
        binarySizeForDigits(
            picture.digits,
        );

    return isErrors(size)
        ? size
        : value({
            size: size.value,
            type,
        });
};


const binarySizeForDigits = (
    digits: number,
): ErrorsOr<number> => {
    if (digits <= 4)
        return value(2);

    if (digits <= 9)
        return value(4);

    if (digits <= 18)
        return value(8);

    return errors(
        `Binary PIC with ${digits} digits is not supported`,
    );
};


/*
 * COMP-3 / packed decimal
 */

const compilePackedDecimal = (
    picture: CompiledPicture,
    supported: ReadonlySet<FileEncodingName>,
): ErrorsOr<CompiledElementaryType> => {
    if (picture.kind === "text")
        return errors(
            "COMP-3/PACKED-DECIMAL cannot be used with a text PIC",
        );

    const encoding =
        "packed-decimal" as const;

    const supportError =
        requireSupported(
            encoding,
            supported,
        );

    if (supportError)
        return errors(
            supportError,
        );

    const digits =
        picture.digits;

    const scale =
        picture.kind === "decimal"
            ? picture.scale
            : 0;

    const type: PackedDecimalFieldType = {
        kind: "decimal",
        encoding,
        digits,
        scale,
        signed:
        picture.signed,
    };

    return value({
        size:
            Math.ceil(
                (digits + 1) / 2,
            ),
        type,
    });
};


/*
 * COMP-1 / COMP-2
 */

const compileFloatingPoint = (
    usage: string | undefined,
    config: CopybookCompilerConfig,
    supported: ReadonlySet<FileEncodingName>,
): ErrorsOr<CompiledElementaryType> => {
    switch (usage) {
        case "COMP-1":
        case "COMPUTATIONAL-1":
            return compileFloatingPointType(
                config.floatingPoint.comp1,
                "single",
                4,
                config,
                supported,
            );

        case "COMP-2":
        case "COMPUTATIONAL-2":
            return compileFloatingPointType(
                config.floatingPoint.comp2,
                "double",
                8,
                config,
                supported,
            );

        default:
            return errors(
                `Unsupported floating-point USAGE '${usage}'`,
            );
    }
};


const compileFloatingPointType = (
    encoding: FloatingPointEncodingName,
    precision: "single" | "double",
    size: number,
    config: CopybookCompilerConfig,
    supported: ReadonlySet<FileEncodingName>,
): ErrorsOr<CompiledElementaryType> => {
    const supportError =
        requireSupported(
            encoding,
            supported,
        );

    if (supportError)
        return errors(
            supportError,
        );

    switch (encoding) {
        case "ieee754": {
            const type: Ieee754FieldType = {
                kind: "floating-point",
                encoding,
                precision,
                byteOrder:
                config.binary.byteOrder,
            };

            return value({
                size,
                type,
            });
        }

        case "ibm-hex": {
            const type: IbmHexFieldType = {
                kind: "floating-point",
                encoding,
                precision,
                byteOrder:
                config.binary.byteOrder,
            };

            return value({
                size,
                type,
            });
        }
    }
};


/*
 * Clauses
 */

const occursCount = (
    clauses: CopybookClause[],
): number | undefined =>
    clauses.find(
        clause =>
            clause.kind === "occurs",
    )?.count;


const usageOf = (
    clauses: CopybookClause[],
): string | undefined =>
    clauses.find(
        clause =>
            clause.kind === "usage",
    )?.usage;


const signOf = (
    clauses: CopybookClause[],
): SignClause | undefined =>
    clauses.find(
        (clause): clause is SignClause =>
            clause.kind === "sign",
    );


const displaySign = (
    signed: boolean,
    clauses: CopybookClause[],
    defaultSign: DisplaySignEncoding,
): DisplaySignEncoding => {
    if (!signed)
        return "unsigned";

    const sign =
        signOf(clauses);

    if (!sign)
        return defaultSign;

    const position =
        sign.position ?? "trailing";

    if (sign.separate)
        return position === "leading"
            ? "leading-separate"
            : "trailing-separate";

    return position === "leading"
        ? "leading-overpunch"
        : "trailing-overpunch";
};


const separateSignSize = (
    sign: DisplaySignEncoding,
): number =>
    sign === "leading-separate" ||
    sign === "trailing-separate"
        ? 1
        : 0;


/*
 * Encoding support
 */

const requireSupported = (
    encoding: FileEncodingName,
    supported: ReadonlySet<FileEncodingName>,
): string | undefined =>
    supported.has(encoding)
        ? undefined
        : `Encoding '${encoding}' is not supported`;


/*
 * Usage helpers
 */

const isFloatingPointUsage = (
    usage: string | undefined,
): boolean =>
    usage === "COMP-1" ||
    usage === "COMP-2" ||
    usage === "COMPUTATIONAL-1" ||
    usage === "COMPUTATIONAL-2";


/*
 * Names
 */

const entryName = (
    name: CopybookEntryName,
    line: number,
): string =>
    name.kind === "named"
        ? name.name
        : `FILLER at line ${line}`;


const fieldName = (
    name: CopybookEntryName,
    occurrence: number,
    occurs: number,
    parentOccurrence?: number,
): string => {
    if (name.kind === "filler")
        throw new Error(
            "FILLER cannot be used as a field name",
        );

    const base =
        name.name;

    const withParent =
        parentOccurrence === undefined
            ? base
            : `${base}[${parentOccurrence}]`;

    return occurs === 1
        ? withParent
        : `${withParent}[${occurrence}]`;
};