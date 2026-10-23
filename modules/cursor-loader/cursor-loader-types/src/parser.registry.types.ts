import {
    type Parser,
    type ParserConfig,
    type ParserRecordState
} from "./cursor.loader.types";


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

    /** Parser-owned state cleanup on the final physical-record release. */
    readonly cleanRecordState?: (state:ParserRecordState<TParser>) => void;
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
