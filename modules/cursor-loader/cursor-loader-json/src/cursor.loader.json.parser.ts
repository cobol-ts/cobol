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


/*
 * Decode the logical bytes of a physical record as UTF-8.
 *
 * The record may begin part way through its first buffer and may span
 * several buffers.
 */

function decodeRecord(
    record: PhysicalRecordContent
): string {

    const decoder =
        new TextDecoder(
            "utf-8",
            {
                fatal: true
            }
        );


    /*
     * Common case: the complete record is in one buffer.
     */

    if (
        record.buffers.length === 1
    ) {
        return decoder.decode(
            record.buffers[0].subarray(
                record.firstBufferOffset,
                record.firstBufferOffset
                + record.length
            )
        );
    }


    let remaining =
        record.length;

    let result =
        "";


    for (
        let index = 0;
        index < record.buffers.length;
        index++
    ) {
        const buffer =
            record.buffers[index];

        const start =
            index === 0
                ? record.firstBufferOffset
                : 0;

        const available =
            buffer.length - start;

        const length =
            Math.min(
                available,
                remaining
            );


        result += decoder.decode(
            buffer.subarray(
                start,
                start + length
            ),
            {
                stream:
                    true
            }
        );


        remaining -=
            length;


        if (
            remaining === 0
        ) {
            break;
        }
    }


    return result
        + decoder.decode();
}