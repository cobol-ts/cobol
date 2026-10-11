import {type ProjectionAuthoring} from "@cobol-ts/cursor-loader-types";


export interface JsonFileDefinition {
    readonly filename: string;
    readonly fileType: "jsonl";
    readonly projection: ProjectionAuthoring;
}