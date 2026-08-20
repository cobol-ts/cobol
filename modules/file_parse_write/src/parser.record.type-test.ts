import {ErrorsOr,} from "@cobol-ts/errors";
import {Decimal, FileFieldMetadata,} from "@cobol-ts/copybookfiles";
import {defaultFileCodecRegistry,} from "@cobol-ts/cobolcodec";
import {FileEncodingsForMetadata, FileFieldValues} from "./cobol.file.types";
import {parseRecord} from "./cobol.file.parser";


type Equal<TActual, TExpected, > =
    (<T>() => T extends TActual ? 1 : 2) extends
        (<T>() => T extends TExpected ? 1 : 2)
        ? true
        : false;


type Expect<T extends true, > = T;


const fields = [
    {
        name: "NAME",
        from: 0,
        to: 5,
        type: {
            kind: "text",
            encoding: "ascii",
        },
    },

    {
        name: "COUNT",
        from: 5,
        to: 7,
        type: {
            kind: "integer",
            encoding: "binary-integer",
            byteOrder: "big-endian",
            semantics: "native",
            signed: false,
        },
    },

    {
        name: "BALANCE",
        from: 7,
        to: 10,
        type: {
            kind: "decimal",
            encoding: "packed-decimal",
            digits: 5,
            scale: 2,
            signed: true,
        },
    },

    {
        name: "RATE",
        from: 10,
        to: 14,
        type: {
            kind: "floating-point",
            encoding: "ieee754",
            precision: "single",
            byteOrder: "big-endian",
        },
    },
] as const satisfies readonly FileFieldMetadata[];


/*
 * Metadata tuple -> value tuple
 */

type Values = FileFieldValues<typeof fields>;

type ValuesAreCorrect =
    Expect<
        Equal<
            Values,
            [
                string,
                bigint,
                Decimal,
                number,
            ]
        >
    >;


/*
 * Metadata tuple -> required encodings
 */

type Encodings =
    FileEncodingsForMetadata<typeof fields>;

type EncodingsAreCorrect =
    Expect<
        Equal<
            Encodings,
            | "ascii"
            | "binary-integer"
            | "packed-decimal"
            | "ieee754"
        >
    >;


/*
 * parseRecord preserves the tuple type
 */

const parsed =
    parseRecord(
        fields,
        defaultFileCodecRegistry,
        new Uint8Array(14),
    );

type ParsedIsCorrect =
    Expect<
        Equal<
            typeof parsed,
            ErrorsOr<
                [
                    string,
                    bigint,
                    Decimal,
                    number,
                ]
            >
        >
    >;


/*
 * A smaller tuple gives a correspondingly smaller result
 */

const textFields = [
    {
        name: "FIRST",
        from: 0,
        to: 5,
        type: {
            kind: "text",
            encoding: "ascii",
        },
    },

    {
        name: "SECOND",
        from: 5,
        to: 10,
        type: {
            kind: "text",
            encoding: "ascii",
        },
    },
] as const satisfies readonly FileFieldMetadata[];

const parsedText =
    parseRecord(
        textFields,
        defaultFileCodecRegistry,
        new Uint8Array(10),
    );

type ParsedTextIsCorrect =
    Expect<
        Equal<
            typeof parsedText,
            ErrorsOr<[string, string]>
        >
    >;


/*
 * Empty metadata gives an empty tuple
 */

const emptyFields =
    [] as const satisfies readonly FileFieldMetadata[];

const parsedEmpty =
    parseRecord(
        emptyFields,
        defaultFileCodecRegistry,
        new Uint8Array(0),
    );

type ParsedEmptyIsCorrect =
    Expect<
        Equal<
            typeof parsedEmpty,
            ErrorsOr<[]>
        >
    >;


/*
 * Deliberately reference these so noUnusedLocals does not complain.
 */

export type ParseRecordTypeTests =
    | ValuesAreCorrect
    | EncodingsAreCorrect
    | ParsedIsCorrect
    | ParsedTextIsCorrect
    | ParsedEmptyIsCorrect;