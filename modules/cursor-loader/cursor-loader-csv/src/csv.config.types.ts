import {type ProjectionAuthoring} from "@cobol-ts/cursor-loader-types";
import {CsvParserConfig} from "./csv.parser";



export interface CsvFileDefinition {
    readonly filename: string;
    readonly fileType: "csv";
    readonly projection: ProjectionAuthoring;
    readonly config?: CsvParserConfig;
}