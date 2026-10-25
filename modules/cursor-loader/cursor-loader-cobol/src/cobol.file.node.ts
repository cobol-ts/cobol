import {readFile, open} from 'node:fs/promises';
import {basename} from 'node:path';
import {parseCopybook} from '@cobol-ts/copybook';
import {compileCobolLayout, type CobolLayoutOptions} from '@cobol-ts/layout';
import {valueOrThrow} from '@cobol-ts/errors';
import {type CobolDecodeOptions} from '@cobol-ts/codec';
import {
    createThrowingFileCursor,
    scanThrowingFileCursor,
    type CursorFileDefinition,
    type FileCursorResult
} from '@cobol-ts/cursor-file';
import {fillNodeFileBuffer} from '@cobol-ts/cursor-file/node';
import type {RecordObjectPool} from '@cobol-ts/cursor-record';
import {createCobolDecodedFramedDetails, type CobolFraming} from './cobol.parser';
import {createCobolParserRegistry} from './cobol.registration';

/** Input paths are filenames, not COBOL text or precompiled descriptors. */
export type CobolFileOptions<TProjection> = Readonly<{
    filename: string;
    copybook: string;
    projection: CursorFileDefinition<TProjection,'cobol'>['projection'];
    bufferSize?: number;
    layoutOptions?: CobolLayoutOptions;
    decodeOptions?: CobolDecodeOptions;
    framing?: CobolFraming;
    /** Optional physical record pool. Callback scans default to a fresh simple pool. */
    recordPool?: RecordObjectPool<any>;
    byteBufferPool?: import("@cobol-ts/cursor-loader-types").FileBufferPool;
}>;

/**
 * Open an FB or RDW-framed COBOL file as borrowed, lazy projections.
 *
 * Source setup and decoder compilation happen once, before any row is read.
 * Records use the existing FileCursorResult.close() ownership contract.
 * Opening the handle is deferred until iteration starts; it is closed on
 * completion, error, or iterator.return() (e.g. breaking from for-await).
 */
export async function* readCobolFile<TProjection>(
    options: CobolFileOptions<TProjection>
): AsyncGenerator<FileCursorResult<TProjection>,void,void> {
    const text = await readFile(options.copybook, 'utf8');
    const ast = valueOrThrow(parseCopybook(text));
    const layout = valueOrThrow(compileCobolLayout(ast, basename(options.copybook), options.layoutOptions));
    const details = valueOrThrow(createCobolDecodedFramedDetails(layout, options.framing, options.decodeOptions));

    const file = await open(options.filename, 'r');
    try {
        yield* createThrowingFileCursor<TProjection,typeof file,'cobol'>(
            {filename: options.filename, fileType: 'cobol', projection: options.projection},
            file,
            {
                parsers: createCobolParserRegistry(details),
                bufferSize: options.bufferSize ?? 64 * 1024,
                fillFileBuffer: fillNodeFileBuffer
            }
        );
    } finally {
        await file.close();
    }
}

/**
 * High-throughput alternative to readCobolFile(). Each borrowed projection is
 * usable only until the synchronous callback returns. Return false to stop.
 * All COBOL setup and field decoding is identical to readCobolFile().
 */
export async function scanCobolFile<TProjection>(
    options:CobolFileOptions<TProjection>,
    onRecord:(row:TProjection)=>void|boolean
):Promise<void> {
    const text = await readFile(options.copybook,'utf8');
    const ast = valueOrThrow(parseCopybook(text));
    const layout = valueOrThrow(compileCobolLayout(ast,basename(options.copybook),options.layoutOptions));
    const details = valueOrThrow(createCobolDecodedFramedDetails(layout,options.framing,options.decodeOptions));
    const file = await open(options.filename,'r');
    try {
        await scanThrowingFileCursor<TProjection,typeof file,'cobol'>(
            {filename:options.filename,fileType:'cobol',projection:options.projection},
            file,
            {parsers:createCobolParserRegistry(details),
                bufferSize:options.bufferSize??64*1024,
                fillFileBuffer:fillNodeFileBuffer,
                recordPool:options.recordPool,
                byteBufferPool:options.byteBufferPool},
            onRecord
        );
    } finally {
        await file.close();
    }
}
