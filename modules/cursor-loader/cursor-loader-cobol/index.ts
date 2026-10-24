export * from './src/cobol.layout.index'
export * from './src/cobol.debug.range'

// Public runtime integration entry points used by cursor-file consumers.
export {cobolParser, createCobolDecodedFixedDetails, createCobolDecodedProjectionDetails,
    createCobolFixedDetails, createCobolProjectionDetails, createCobolDecodedFramedDetails, createCobolRecordState,
    cleanCobolRecordState} from './src/cobol.parser';
export * from './src/cobol.registration'

export type {CobolFraming} from './src/cobol.parser';
