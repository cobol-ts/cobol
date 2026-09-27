import {
    makeErrorFromException
} from "@cobol-ts/errors";

import {
    type Parser,
    type ParserResult,
    type PhysicalRecordContent
} from "@cobol-ts/cursor-loader-types";


export class JsonParser<
    Representation = unknown
> implements Parser<Representation> {

    parse(
        record: PhysicalRecordContent
    ): ParserResult<Representation> {

        try {
            return JSON.parse(
                decodeRecord(
                    record
                )
            ) as Representation;
        } catch (
            error
            ) {
            return makeErrorFromException(
                "JSON parse",
                error
            );
        }
    }
}


/**
 * Decode the logical bytes of a physical record as UTF-8.
 *
 * startOffset is a logical offset across all supplied buffers.
 *
 * The record may begin in any buffer and may span several buffers.
 *
 * TextDecoder is used in streaming mode so that a multi-byte UTF-8
 * character may itself span physical buffers.
 */
function decodeRecord(
    record: PhysicalRecordContent
): string {

    const decoder =
        new TextDecoder(
            "utf-8",
            {
                fatal:
                    true
            }
        );


    const recordEnd =
        record.startOffset
        + record.length;


    let logicalOffset =
        0;

    let result =
        "";


    for (
        const buffer
        of record.buffers
        ) {
        const bufferStart =
            logicalOffset;

        const bufferEnd =
            logicalOffset
            + buffer.length;


        const decodeStart =
            Math.max(
                record.startOffset,
                bufferStart
            );

        const decodeEnd =
            Math.min(
                recordEnd,
                bufferEnd
            );


        if (
            decodeStart
            < decodeEnd
        ) {
            result +=
                decoder.decode(
                    buffer.subarray(
                        decodeStart
                        - bufferStart,

                        decodeEnd
                        - bufferStart
                    ),
                    {
                        stream:
                            true
                    }
                );
        }


        logicalOffset =
            bufferEnd;


        if (
            logicalOffset
            >= recordEnd
        ) {
            break;
        }
    }


    return result
        + decoder.decode();
}