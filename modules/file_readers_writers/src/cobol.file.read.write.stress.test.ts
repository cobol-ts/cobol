import {
    mkdtemp,
    rm,
} from "node:fs/promises";
import {
    tmpdir,
} from "node:os";
import {
    join,
} from "node:path";
import {
    defaultFileCodecRegistry,
} from "@cobol-ts/cobolcodec";
import {
    compileFileMetadata,
} from "@cobol-ts/copybookfiles";
import {
    valueOrThrow,
} from "@cobol-ts/errors";
import {
    generateEdgeRecords,
    generateRecords,
} from "@cobol-ts/file_parse_write/src/cobol.file.property.generators";
import {
    readFileRecords,
} from "./cobol.file.reader";
import {
    withFileWriter,
} from "./cobol.file.writer";


describe(
    "COBOL file integration",
    () => {
        it(
            "round trips random multi-record files through the filesystem",
            async () => {
                const directory =
                    await mkdtemp(
                        join(
                            tmpdir(),
                            "cobol-ts-",
                        ),
                    );

                try {
                    for (
                        let iteration = 0;
                        iteration < 1000;
                        iteration++
                    ) {
                        const recordCount =
                            randomInteger(
                                1,
                                50,
                            );

                        const {
                            metadata,
                            records,
                            expected,
                        } =
                            Math.random() < 0.5
                                ? generateRecords(
                                    recordCount,
                                )
                                : generateEdgeRecords(
                                    recordCount,
                                );

                        const compiled =
                            valueOrThrow(
                                compileFileMetadata(
                                    metadata,
                                ),
                            );

                        const filename =
                            join(
                                directory,
                                `records-${iteration}.dat`,
                            );

                        await withFileWriter(
                            filename,
                            compiled,
                            defaultFileCodecRegistry,
                            async write => {
                                for (const record of records)
                                    valueOrThrow(
                                        await write(
                                            record,
                                        ),
                                    );
                            },
                        );

                        const actual = [];

                        for await (
                            const result of readFileRecords(
                            filename,
                            compiled,
                            defaultFileCodecRegistry,
                        )
                            )
                            actual.push(
                                valueOrThrow(
                                    result,
                                ),
                            );

                        try {
                            expect(actual)
                                .toEqual(
                                    expected,
                                );
                        } catch (error) {
                            throw new Error(
                                `Filesystem round trip failed at iteration ${iteration} with ${recordCount} records`,
                                {
                                    cause: error,
                                },
                            );
                        }
                    }
                } finally {
                    await rm(
                        directory,
                        {
                            recursive: true,
                            force: true,
                        },
                    );
                }
            },
            30_000,
        );
    },
);


function randomInteger(
    minimum: number,
    maximum: number,
): number {
    return Math.floor(
            Math.random() *
            (
                maximum -
                minimum +
                1
            ),
        ) +
        minimum;
}