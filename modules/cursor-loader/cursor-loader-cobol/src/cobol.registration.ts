import type {ParserRegistry} from '@cobol-ts/cursor-loader-types';
import {
    cobolParser,
    createCobolRecordState,
    cleanCobolRecordState,
    type CobolProjectionDetails
} from './cobol.parser';

/** Bind the standard production COBOL parser and its record lifecycle once. */
export function createCobolParserRegistry(
    details: CobolProjectionDetails
): ParserRegistry<'cobol'> {
    return {
        cobol: {
            parser: cobolParser,
            parserConfig: () => details,
            createRecordState: createCobolRecordState,
            cleanRecordState: cleanCobolRecordState
        }
    };
}
