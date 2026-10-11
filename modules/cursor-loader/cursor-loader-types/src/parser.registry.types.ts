import {
    type Parser,
    type ParserConfig,
    type ParserRecordState
} from "@cobol-ts/cursor-loader-types";


export type AnyParser =
    Parser<any,any,any,any,any>;


export interface ParserRegistryEntry<
    TFileDefinition,
    TParser extends AnyParser
> {
    readonly parser:
        TParser;

    readonly parserConfig:
        (
            definition: TFileDefinition
        ) => ParserConfig<TParser>;

    readonly createRecordState:
        () => ParserRecordState<TParser>;
}


export type ParserRegistry<
    TFileType extends string
> =
    Readonly<
        Record<
            TFileType,
            ParserRegistryEntry<any,AnyParser>
        >
    >;
