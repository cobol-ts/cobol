import {
    type ParserPhysicalRecordContent
} from "@cobol-ts/cursor-loader-types";


const DEFAULT_SEPARATOR = ",".charCodeAt(0);
const DEFAULT_QUOTE = "\"".charCodeAt(0);

const CR = "\r".charCodeAt(0);
const LF = "\n".charCodeAt(0);

export const CSV_LINE_ENDING_LF: readonly number[] = [LF];
export const CSV_LINE_ENDING_CRLF: readonly number[] = [CR,LF];

const FIELD_START = 0;
const UNQUOTED = 1;
const QUOTED = 2;
const AFTER_QUOTE = 3;

type CsvState =
    | typeof FIELD_START
    | typeof UNQUOTED
    | typeof QUOTED
    | typeof AFTER_QUOTE;


export interface CsvWalkOptions {
    readonly separator?: number;
    readonly quote?: number;

    /**
     * undefined:
     *     line ending is not yet known; recognise LF or CRLF.
     *
     * defined:
     *     recognise only this line ending.
     */
    readonly lineEnding?: readonly number[];
}


export interface CsvWalkResult {
    /**
     * The line ending which terminated this record.
     *
     * undefined means the record ended at EOF without a line ending.
     */
    readonly lineEnding: readonly number[] | undefined;
}


export type CsvFieldVisitor<TContext> = (
    context: TContext,
    column: number,
    startByte: number,
    endByte: number
) => void;


export function csvLineEndingLength(
    byte: number,
    nextByte: number | undefined,
    lineEnding: readonly number[] | undefined
): number {
    if (lineEnding !== undefined) {
        if (byte !== lineEnding[0]) return 0;

        if (lineEnding.length === 1) {
            return 1;
        }

        if (
            lineEnding.length === 2
            && nextByte === lineEnding[1]
        ) {
            return 2;
        }

        return 0;
    }

    if (byte === LF) {
        return 1;
    }

    if (
        byte === CR
        && nextByte === LF
    ) {
        return 2;
    }

    return 0;
}


export async function walkCsvRecord<TRecordState,TContext>(
    record: ParserPhysicalRecordContent<TRecordState>,
    visitor: CsvFieldVisitor<TContext>,
    context: TContext,
    options: CsvWalkOptions = {}
): Promise<CsvWalkResult> {
    const separator = options.separator ?? DEFAULT_SEPARATOR;
    const quote = options.quote ?? DEFAULT_QUOTE;
    const lineEnding = options.lineEnding;

    let position = record.startByte;
    let column = 0;
    let state: CsvState = FIELD_START;
    let fieldStart = position;
    let quotedEnd = position;

    let bufferIndex = 0;
    let index = position;

    while (
        bufferIndex < record.buffers.length
        && index >= record.buffers[bufferIndex].length
        ) {
        index -= record.buffers[bufferIndex].length;
        bufferIndex++;
    }

    while (true) {
        if (position >= record.lastValidByte) {
            if (!record.fileFinished) {
                await record.readMore();
                continue;
            }

            if (
                position === record.startByte
                && state === FIELD_START
                && column === 0
            ) {
                record.endByte = position;

                return {
                    lineEnding: undefined
                };
            }

            if (state === QUOTED) {
                throw csvError(
                    record,
                    column,
                    position,
                    "unterminated quoted field"
                );
            }

            visitField(
                visitor,
                context,
                state,
                column,
                fieldStart,
                position,
                quotedEnd
            );

            record.endByte = position;

            return {
                lineEnding: undefined
            };
        }

        while (
            bufferIndex < record.buffers.length
            && index >= record.buffers[bufferIndex].length
            ) {
            index -= record.buffers[bufferIndex].length;
            bufferIndex++;
        }

        const buffer = record.buffers[bufferIndex];
        const byte = buffer[index];

        if (state === QUOTED) {
            if (byte === quote) {
                quotedEnd = position;
                state = AFTER_QUOTE;
            }

            position++;
            index++;
            continue;
        }

        if (
            state === AFTER_QUOTE
            && byte === quote
        ) {
            state = QUOTED;
            position++;
            index++;
            continue;
        }

        const needsNextByte =
            lineEnding === undefined
                ? byte === CR
                : (
                    lineEnding.length === 2
                    && byte === lineEnding[0]
                );

        if (
            needsNextByte
            && position + 1 >= record.lastValidByte
            && !record.fileFinished
        ) {
            await record.readMore();
        }

        const nextByte =
            position + 1 < record.lastValidByte
                ? nextRecordByte(
                    record,
                    bufferIndex,
                    index
                )
                : undefined;

        const lineEndingLength = csvLineEndingLength(
            byte,
            nextByte,
            lineEnding
        );

        if (lineEndingLength !== 0) {
            visitField(
                visitor,
                context,
                state,
                column,
                fieldStart,
                position,
                quotedEnd
            );

            record.endByte =
                position + lineEndingLength;

            return {
                lineEnding:
                    lineEnding
                    ?? (
                        lineEndingLength === 1
                            ? CSV_LINE_ENDING_LF
                            : CSV_LINE_ENDING_CRLF
                    )
            };
        }

        switch (state) {
            case FIELD_START:
                if (byte === separator) {
                    visitor(
                        context,
                        column,
                        position,
                        position
                    );

                    column++;
                    position++;
                    index++;
                    fieldStart = position;
                    continue;
                }

                if (byte === quote) {
                    position++;
                    index++;
                    fieldStart = position;
                    state = QUOTED;
                    continue;
                }

                fieldStart = position;
                state = UNQUOTED;
                position++;
                index++;
                continue;

            case UNQUOTED:
                if (byte === separator) {
                    visitor(
                        context,
                        column,
                        fieldStart,
                        position
                    );

                    column++;
                    position++;
                    index++;
                    fieldStart = position;
                    state = FIELD_START;
                    continue;
                }

                if (byte === quote) {
                    throw csvError(
                        record,
                        column,
                        position,
                        "quote inside unquoted field"
                    );
                }

                position++;
                index++;
                continue;

            case AFTER_QUOTE:
                if (byte === separator) {
                    visitor(
                        context,
                        column,
                        fieldStart,
                        quotedEnd
                    );

                    column++;
                    position++;
                    index++;
                    fieldStart = position;
                    state = FIELD_START;
                    continue;
                }

                if (
                    byte === CR
                    && (
                        lineEnding === undefined
                        || (
                            lineEnding.length === 2
                            && lineEnding[0] === CR
                            && lineEnding[1] === LF
                        )
                    )
                    && nextByte !== LF
                ) {
                    throw csvError(
                        record,
                        column,
                        position + 1,
                        "CR after closing quote was not followed by LF"
                    );
                }

                throw csvError(
                    record,
                    column,
                    position,
                    "unexpected byte after closing quote"
                );
        }
    }
}


function visitField<TContext>(
    visitor: CsvFieldVisitor<TContext>,
    context: TContext,
    state: CsvState,
    column: number,
    fieldStart: number,
    position: number,
    quotedEnd: number
): void {
    visitor(
        context,
        column,
        fieldStart,
        state === AFTER_QUOTE
            ? quotedEnd
            : position
    );
}


function nextRecordByte<TRecordState>(
    record: ParserPhysicalRecordContent<TRecordState>,
    bufferIndex: number,
    index: number
): number | undefined {
    const buffer = record.buffers[bufferIndex];

    if (index + 1 < buffer.length) {
        return buffer[index + 1];
    }

    return record.buffers[bufferIndex + 1]?.[0];
}


function csvError<TRecordState>(
    record: ParserPhysicalRecordContent<TRecordState>,
    column: number,
    position: number,
    reason: string
): Error {
    return new Error(
        `${record.source}: record ${record.recordNumber}: `
        + `CSV column ${column}: ${reason} at logical byte ${position}`
    );
}