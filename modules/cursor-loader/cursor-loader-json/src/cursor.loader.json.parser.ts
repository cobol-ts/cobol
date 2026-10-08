import {makeErrorFromException} from "@cobol-ts/errors";

import {
    type Parser,
    type ParserPhysicalRecordContent,
    type ParserResult,
    utf8RangeToString
} from "@cobol-ts/cursor-loader-types";

import {jsonProjectionSupport} from "./json.projection.support";


const LINE_FEED = 0x0a;


/**
 * JSONL parser.
 *
 * The parser is stateless, so there is no reason to construct parser
 * instances.
 *
 * jsonProjectionSupport supplies the JSON-specific interpretation of logical
 * projection paths.
 *
 * utf8RangeToString supplies UTF-8 rendering of physical byte ranges used both
 * for parsing complete JSON records and for downstream diagnostics.
 */
export const jsonParser = {
    ...jsonProjectionSupport,
    toDebugString: utf8RangeToString,
    parse
} satisfies Parser<unknown, undefined, undefined, undefined>;


/**
 * Parse one JSONL physical record.
 *
 * The parser scans for LF itself because JSONL record recognition is naturally
 * part of parsing this format.
 *
 * record.startByte is the inclusive logical byte offset of the current record
 * across record.buffers.
 *
 * record.lastValidByte is the exclusive logical end of bytes currently
 * available from the file.
 *
 * When no LF is currently available, readMore() extends the same physical
 * record in place and scanning continues from the current position.
 *
 * Before returning, record.endByte is set to the exclusive physical end of the
 * current JSONL record.
 */
async function parse(
    record: ParserPhysicalRecordContent<undefined>,
    _details: undefined
): Promise<ParserResult<unknown>> {

    /*
     * Logical position across record.buffers.
     *
     * startByte may be part way through buffers[0].
     */
    let scanByte = record.startByte;
    let bufferIndex = 0;
    let bufferStart = 0;


    /*
     * Position bufferIndex at the buffer containing startByte.
     *
     * In the normal cursor path startByte is within buffers[0], but this keeps
     * the parser correct for the general logical-offset contract.
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
         * Scan every currently available valid byte.
         *
         * lastValidByte, not Uint8Array.length, is authoritative for the end
         * of file data. The final pooled buffer may contain unused bytes after
         * lastValidByte.
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
                    /*
                     * endByte is exclusive.
                     *
                     * Include LF in the physical record. JSON permits trailing
                     * whitespace, so it may safely be passed directly to
                     * JSON.parse().
                     */
                    record.endByte = scanByte + 1;
                    return parseRecord(record);
                }

                scanByte++;
            }


            /*
             * The valid portion of this buffer has been completely scanned.
             */
            if (scanByte >= bufferStart + buffer.length) {
                bufferStart += buffer.length;
                bufferIndex++;
            }
        }


        /*
         * Every currently valid byte has been scanned and no LF was found.
         *
         * If EOF is known, the final JSONL record ends at EOF even when it has
         * no terminating newline.
         */
        if (record.fileFinished) {
            record.endByte = record.lastValidByte;
            return parseRecord(record);
        }


        /*
         * More file data may exist.
         *
         * readMore() appends one physical buffer, advances lastValidByte and
         * sets fileFinished if EOF is discovered.
         *
         * The local scan position remains valid across the await, so no parser
         * state needs to be materialised elsewhere.
         */
        await record.readMore();
    }
}


/**
 * Decode and parse the completed JSONL record.
 *
 * utf8RangeToString already implements the logical byte-range traversal needed
 * for records which begin or end part way through a physical buffer or span
 * several buffers.
 *
 * Keeping that byte-range interpretation shared ensures parsing and diagnostic
 * rendering see exactly the same source bytes.
 */
function parseRecord(
    record: ParserPhysicalRecordContent<undefined>
): ParserResult<unknown> {

    const text = utf8RangeToString(
        record,
        record.startByte,
        record.endByte
    );

    try {
        return JSON.parse(text);
    } catch (error) {
        const message =
            error instanceof Error
                ? error.message
                : String(error);

        return {
            errors: [
                `${record.source}: record ${record.recordNumber}: JSON parse error ${message}\n${text}`
            ]
        };
    }
}
