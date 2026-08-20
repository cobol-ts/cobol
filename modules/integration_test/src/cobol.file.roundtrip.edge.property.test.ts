import {
    valueOrThrow,
} from "@cobol-ts/errors";
import {
    defaultFileCodecRegistry,
} from "@cobol-ts/cobolcodec";

import {
    parseRecord,
} from "@cobol-ts/file_parse_write/src/cobol.file.parser";
import {
    generateEdgeRecord,
} from "@cobol-ts/file_parse_write/src/cobol.file.property.generators";
import {
    writeRecord,
} from "@cobol-ts/file_parse_write/src/cobol.file.writer";
import {compileFileMetadata} from "@cobol-ts/copybookfiles";


describe(
    "COBOL file round trip edge properties",
    () => {
        it(
            "round trips 10,000 edge-biased random file definitions and records",
            () => {
                for (
                    let iteration = 0;
                    iteration < 10_000;
                    iteration++
                ) {
                    const {
                        metadata,
                        record,
                        expected,
                    } =
                        generateEdgeRecord();

                    const compiled =
                        valueOrThrow(
                            compileFileMetadata(
                                metadata,
                            ),
                        );

                    const bytes =
                        new Uint8Array(
                            compiled.size,
                        );

                    valueOrThrow(
                        writeRecord(
                            compiled.fields,
                            defaultFileCodecRegistry,
                            bytes,
                            record,
                        ),
                    );

                    const parsed =
                        valueOrThrow(
                            parseRecord(
                                compiled.fields,
                                defaultFileCodecRegistry,
                                bytes,
                            ),
                        );

                    expect(parsed)
                        .toEqual(
                            expected,
                        );
                }
            },
        );
    },
);