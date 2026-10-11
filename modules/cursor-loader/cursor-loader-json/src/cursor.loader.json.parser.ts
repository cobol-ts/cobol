import {
    type Parser,
    type ParserPhysicalRecordContent,
    type ParserResult,
    utf8RangeToString
} from "@cobol-ts/cursor-loader-types";

import {jsonProjectionSupport} from "./json.projection.support";


const LINE_FEED = 0x0a;


export type JsonPrimitive =
    | null
    | boolean
    | number
    | string;

export type JsonValue =
    | JsonPrimitive
    | JsonObject
    | JsonArray;

export interface JsonObject {
    [name: string]: JsonValue;
}

export type JsonArray = JsonValue[];

export type JsonProjectionPath = readonly string[];

export type JsonParser = Parser<
    JsonValue,
    undefined,
    undefined,
    undefined,
    JsonProjectionPath
>;


/**
 * JSONL parser.
 *
 * Each successfully parsed record is one JSON value:
 *
 *     null
 *     boolean
 *     number
 *     string
 *     object
 *     array
 *
 * The parser has no configuration, prepared details or per-record state.
 *
 * JSON projection paths remain readonly string[] because JSON property
 * traversal already uses that representation directly.
 */
export const jsonParser = {
    ...jsonProjectionSupport,
    toDebugString: utf8RangeToString,
    parse
} satisfies JsonParser;


/**
 * Parse one JSONL physical record.
 *
 * JSONL records are terminated by LF.
 *
 * CRLF works naturally because CR is JSON whitespace and remains immediately
 * before the terminating LF.
 *
 * record.startByte is the inclusive logical byte offset of this record across
 * record.buffers.
 *
 * record.lastValidByte is the exclusive logical end of source bytes currently
 * available.
 *
 * If no LF is currently available, readMore() extends the same physical record
 * and scanning continues from the current position.
 *
 * The final record may end at EOF without a terminating LF.
 *
 * Before returning, record.endByte is the exclusive physical end of the
 * completed record.
 */
async function parse(
    record: ParserPhysicalRecordContent<undefined>,
    _details: undefined
): Promise<ParserResult<JsonValue>> {
    let scanByte = record.startByte;
    let bufferIndex = 0;
    let bufferStart = 0;

    /*
     * Locate the buffer containing startByte.
     */
    while (
        bufferIndex < record.buffers.length
        && scanByte >= bufferStart + record.buffers[bufferIndex].length
        ) {
        bufferStart += record.buffers[bufferIndex].length;
        bufferIndex++;
    }

    while (true) {
        /*
         * Scan every currently available source byte.
         *
         * lastValidByte, rather than Uint8Array.length, is authoritative. The
         * final pooled buffer may contain unused capacity.
         */
        while (scanByte < record.lastValidByte) {
            const buffer = record.buffers[bufferIndex];
            const bufferValidEnd = Math.min(
                buffer.length,
                record.lastValidByte - bufferStart
            );

            while (
                scanByte < record.lastValidByte
                && scanByte - bufferStart < bufferValidEnd
                ) {
                if (buffer[scanByte - bufferStart] === LINE_FEED) {
                    record.endByte = scanByte + 1;
                    return parseRecord(record);
                }

                scanByte++;
            }

            if (scanByte >= bufferStart + buffer.length) {
                bufferStart += buffer.length;
                bufferIndex++;
            }
        }

        /*
         * EOF terminates the final record even without a newline.
         */
        if (record.fileFinished) {
            record.endByte = record.lastValidByte;
            return parseRecord(record);
        }

        /*
         * Local scan state survives readMore(), so parsing simply resumes from
         * the current logical byte.
         */
        await record.readMore();
    }
}


/**
 * Decode and parse the completed JSONL record.
 *
 * JSON.parse() is the validation boundary. A successful parse necessarily
 * produces a JsonValue.
 */
function parseRecord(
    record: ParserPhysicalRecordContent<undefined>
): ParserResult<JsonValue> {
    const text = utf8RangeToString(
        record,
        record.startByte,
        record.endByte
    );

    try {
        return JSON.parse(text) as JsonValue;
    } catch (error) {
        const message =
            error instanceof Error
                ? error.message
                : String(error);

        return {
            errors: [
                `${record.source}: record ${record.recordNumber}: `
                + `JSON parse error ${message}\n${text}`
            ]
        };
    }
}