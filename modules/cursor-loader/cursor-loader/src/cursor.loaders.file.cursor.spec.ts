import {
    type Errors
} from "@cobol-ts/errors";

import {
    type CursorOptions,
    type FileDetails,
    type Parser,
    type ParserMap,
    type PhysicalRecordContent,
    type RecordCursor,
    type RecordReaderMap
} from "@cobol-ts/cursor-loader-types";

import {
    createFileCursor
} from "./cursor.loader.file.cursor";


describe(
    "createFileCursor",
    () => {

        test(
            "parses and projects records",
            async () => {

                const parser:
                    Parser<
                        string,
                        undefined
                    > = {

                    parse(
                        record
                    ): string {

                        return decodeRecord(
                            record
                        );
                    }
                };


                const parsers = {
                    text:
                    parser
                } satisfies ParserMap;


                const options =
                    createOptions(
                        parsers,
                        lineReader(
                            "one",
                            "two"
                        )
                    );


                const details:
                    FileDetails<
                        typeof parsers,
                        "text",
                        string,
                        number
                    > = {

                    type:
                        "line",

                    filename:
                        "test.txt",

                    parser:
                        "text",

                    cardinality:
                        "many",

                    project:
                        representation =>
                            representation.toUpperCase(),

                    entityId:
                        () =>
                            0
                };


                expect(
                    await collect(
                        createFileCursor(
                            details,
                            options
                        )
                    )
                ).toEqual(
                    [
                        "ONE",
                        "TWO"
                    ]
                );
            }
        );


        test(
            "uses the physical reader selected by the file type",
            async () => {

                const calls:
                    string[] =
                    [];


                const parser:
                    Parser<
                        string,
                        undefined
                    > = {

                    parse(
                        record
                    ): string {

                        return decodeRecord(
                            record
                        );
                    }
                };


                const parsers = {
                    text:
                    parser
                } satisfies ParserMap;


                const readers:
                    RecordReaderMap = {

                    line:
                        async function* () {

                            calls.push(
                                "line"
                            );

                            yield physicalRecord(
                                "line"
                            );
                        },

                    fixed:
                        async function* () {

                            calls.push(
                                "fixed"
                            );

                            yield physicalRecord(
                                "fixed"
                            );
                        },

                    "length-prefixed":
                        async function* () {

                            calls.push(
                                "length-prefixed"
                            );

                            yield physicalRecord(
                                "length-prefixed"
                            );
                        }
                };


                const options:
                    CursorOptions<
                        typeof parsers,
                        number
                    > = {

                    parsers,

                    recordReaders:
                    readers,

                    compareEntityId:
                    compareNumber
                };


                const details:
                    FileDetails<
                        typeof parsers,
                        "text",
                        string,
                        number
                    > = {

                    type:
                        "line",

                    filename:
                        "test.txt",

                    parser:
                        "text",

                    cardinality:
                        "many",

                    project:
                        value =>
                            value,

                    entityId:
                        () =>
                            0
                };


                expect(
                    await collect(
                        createFileCursor(
                            details,
                            options
                        )
                    )
                ).toEqual(
                    [
                        "line"
                    ]
                );


                expect(
                    calls
                ).toEqual(
                    [
                        "line"
                    ]
                );
            }
        );


        test(
            "uses the first physical record for parser preparation",
            async () => {

                interface Prepared {
                    readonly prefix:
                        string;
                }


                const parser:
                    Parser<
                        string,
                        undefined,
                        Prepared
                    > = {

                    prepare(
                        record
                    ): Prepared {

                        return {
                            prefix:
                                decodeRecord(
                                    record
                                )
                        };
                    },

                    parse(
                        record,
                        details
                    ): string {

                        return details.prefix
                            + ":"
                            + decodeRecord(
                                record
                            );
                    }
                };


                const parsers = {
                    prepared:
                    parser
                } satisfies ParserMap;


                const options =
                    createOptions(
                        parsers,
                        lineReader(
                            "header",
                            "one",
                            "two"
                        )
                    );


                const details:
                    FileDetails<
                        typeof parsers,
                        "prepared",
                        string,
                        number
                    > = {

                    type:
                        "line",

                    filename:
                        "test.csv",

                    parser:
                        "prepared",

                    parserConfig:
                    undefined,

                    cardinality:
                        "many",

                    project:
                        value =>
                            value,

                    entityId:
                        () =>
                            0
                };


                expect(
                    await collect(
                        createFileCursor(
                            details,
                            options
                        )
                    )
                ).toEqual(
                    [
                        "header:one",
                        "header:two"
                    ]
                );
            }
        );


        test(
            "returns a source-decorated error when preparation fails",
            async () => {

                const parser:
                    Parser<
                        string,
                        undefined,
                        string
                    > = {

                    prepare():
                        Errors {

                        return {
                            errors: [
                                "bad header"
                            ]
                        };
                    },

                    parse():
                        string {

                        throw new Error(
                            "parse must not be called"
                        );
                    }
                };


                const parsers = {
                    prepared:
                    parser
                } satisfies ParserMap;


                const options =
                    createOptions(
                        parsers,
                        lineReader(
                            "header",
                            "data"
                        )
                    );


                const details:
                    FileDetails<
                        typeof parsers,
                        "prepared",
                        string,
                        number
                    > = {

                    type:
                        "line",

                    filename:
                        "test.csv",

                    parser:
                        "prepared",

                    parserConfig:
                    undefined,

                    cardinality:
                        "many",

                    project:
                        value =>
                            value,

                    entityId:
                        () =>
                            0
                };


                expect(
                    await collect(
                        createFileCursor(
                            details,
                            options
                        )
                    )
                ).toEqual(
                    [
                        {
                            errors: [
                                "test.csv: line 1: bad header"
                            ],

                            extras: {
                                filename:
                                    "test.csv",

                                recordNumber:
                                    1
                            }
                        }
                    ]
                );
            }
        );


        test(
            "stops when the preparation record has a physical validation error",
            async () => {

                const parse =
                    jest.fn();


                const parser:
                    Parser<
                        string,
                        undefined,
                        string
                    > = {

                    prepare():
                        string {

                        return "prepared";
                    },

                    parse
                };


                const parsers = {
                    prepared:
                    parser
                } satisfies ParserMap;


                const options =
                    createOptions(
                        parsers,
                        async function* () {

                            yield [
                                "bad physical record"
                            ];

                            yield physicalRecord(
                                "data"
                            );
                        }
                    );


                const details:
                    FileDetails<
                        typeof parsers,
                        "prepared",
                        string,
                        number
                    > = {

                    type:
                        "line",

                    filename:
                        "test.csv",

                    parser:
                        "prepared",

                    parserConfig:
                    undefined,

                    cardinality:
                        "many",

                    project:
                        value =>
                            value,

                    entityId:
                        () =>
                            0
                };


                expect(
                    await collect(
                        createFileCursor(
                            details,
                            options
                        )
                    )
                ).toEqual(
                    [
                        {
                            errors: [
                                "test.csv: line 1: bad physical record"
                            ],

                            extras: {
                                filename:
                                    "test.csv",

                                recordNumber:
                                    1
                            }
                        }
                    ]
                );


                expect(
                    parse
                ).not.toHaveBeenCalled();
            }
        );


        test(
            "continues after a physical validation error once the parser is prepared",
            async () => {

                const parser:
                    Parser<
                        string,
                        undefined
                    > = {

                    parse(
                        record
                    ): string {

                        return decodeRecord(
                            record
                        );
                    }
                };


                const parsers = {
                    text:
                    parser
                } satisfies ParserMap;


                const options =
                    createOptions(
                        parsers,
                        async function* () {

                            yield physicalRecord(
                                "one"
                            );

                            yield [
                                "bad physical record"
                            ];

                            yield physicalRecord(
                                "three"
                            );
                        }
                    );


                const details:
                    FileDetails<
                        typeof parsers,
                        "text",
                        string,
                        number
                    > = {

                    type:
                        "line",

                    filename:
                        "test.txt",

                    parser:
                        "text",

                    cardinality:
                        "many",

                    project:
                        value =>
                            value,

                    entityId:
                        () =>
                            0
                };


                expect(
                    await collect(
                        createFileCursor(
                            details,
                            options
                        )
                    )
                ).toEqual(
                    [
                        "one",

                        {
                            errors: [
                                "test.txt: line 2: bad physical record"
                            ],

                            extras: {
                                filename:
                                    "test.txt",

                                recordNumber:
                                    2
                            }
                        },

                        "three"
                    ]
                );
            }
        );


        test(
            "continues after a parser error",
            async () => {

                const parser:
                    Parser<
                        string,
                        undefined
                    > = {

                    parse(
                        record
                    ): string | Errors {

                        const value =
                            decodeRecord(
                                record
                            );


                        if (
                            value === "bad"
                        ) {
                            return {
                                errors: [
                                    "cannot parse record"
                                ]
                            };
                        }


                        return value;
                    }
                };


                const parsers = {
                    text:
                    parser
                } satisfies ParserMap;


                const options =
                    createOptions(
                        parsers,
                        lineReader(
                            "one",
                            "bad",
                            "three"
                        )
                    );


                const details:
                    FileDetails<
                        typeof parsers,
                        "text",
                        string,
                        number
                    > = {

                    type:
                        "line",

                    filename:
                        "test.txt",

                    parser:
                        "text",

                    cardinality:
                        "many",

                    project:
                        value =>
                            value,

                    entityId:
                        () =>
                            0
                };


                expect(
                    await collect(
                        createFileCursor(
                            details,
                            options
                        )
                    )
                ).toEqual(
                    [
                        "one",

                        {
                            errors: [
                                "test.txt: line 2: cannot parse record"
                            ],

                            extras: {
                                filename:
                                    "test.txt",

                                recordNumber:
                                    2
                            }
                        },

                        "three"
                    ]
                );
            }
        );


        test(
            "continues after representation validation errors",
            async () => {

                const parser:
                    Parser<
                        string,
                        undefined
                    > = {

                    parse(
                        record
                    ): string {

                        return decodeRecord(
                            record
                        );
                    }
                };


                const parsers = {
                    text:
                    parser
                } satisfies ParserMap;


                const options =
                    createOptions(
                        parsers,
                        lineReader(
                            "one",
                            "bad",
                            "three"
                        )
                    );


                const details:
                    FileDetails<
                        typeof parsers,
                        "text",
                        string,
                        number
                    > = {

                    type:
                        "line",

                    filename:
                        "test.txt",

                    parser:
                        "text",

                    cardinality:
                        "many",

                    checkRepresentation:
                        value =>
                            value === "bad"
                                ? [
                                    "invalid representation"
                                ]
                                : [],

                    project:
                        value =>
                            value,

                    entityId:
                        () =>
                            0
                };


                expect(
                    await collect(
                        createFileCursor(
                            details,
                            options
                        )
                    )
                ).toEqual(
                    [
                        "one",

                        {
                            errors: [
                                "test.txt: line 2: invalid representation"
                            ],

                            extras: {
                                filename:
                                    "test.txt",

                                recordNumber:
                                    2
                            }
                        },

                        "three"
                    ]
                );
            }
        );


        test(
            "allows projection errors to propagate",
            async () => {

                const parser:
                    Parser<
                        string,
                        undefined
                    > = {

                    parse(
                        record
                    ): string {

                        return decodeRecord(
                            record
                        );
                    }
                };


                const parsers = {
                    text:
                    parser
                } satisfies ParserMap;


                const options =
                    createOptions(
                        parsers,
                        lineReader(
                            "one"
                        )
                    );


                const details:
                    FileDetails<
                        typeof parsers,
                        "text",
                        string,
                        number
                    > = {

                    type:
                        "line",

                    filename:
                        "test.txt",

                    parser:
                        "text",

                    cardinality:
                        "many",

                    project():
                        string {

                        throw new Error(
                            "projection exploded"
                        );
                    },

                    entityId:
                        () =>
                            0
                };


                const cursor =
                    createFileCursor(
                        details,
                        options
                    );


                await expect(
                    cursor.next()
                ).rejects.toThrow(
                    "projection exploded"
                );
            }
        );


        test(
            "reports a missing preparation record for an empty file",
            async () => {

                const parser:
                    Parser<
                        string,
                        undefined,
                        string
                    > = {

                    prepare():
                        string {

                        return "prepared";
                    },

                    parse(
                        record
                    ): string {

                        return decodeRecord(
                            record
                        );
                    }
                };


                const parsers = {
                    prepared:
                    parser
                } satisfies ParserMap;


                const options =
                    createOptions(
                        parsers,
                        async function* () {
                            return;
                        }
                    );


                const details:
                    FileDetails<
                        typeof parsers,
                        "prepared",
                        string,
                        number
                    > = {

                    type:
                        "line",

                    filename:
                        "empty.csv",

                    parser:
                        "prepared",

                    parserConfig:
                    undefined,

                    cardinality:
                        "many",

                    project:
                        value =>
                            value,

                    entityId:
                        () =>
                            0
                };


                expect(
                    await collect(
                        createFileCursor(
                            details,
                            options
                        )
                    )
                ).toEqual(
                    [
                        {
                            errors: [
                                "empty.csv: Parser preparation record is missing"
                            ],

                            extras: {
                                filename:
                                    "empty.csv"
                            }
                        }
                    ]
                );
            }
        );


        test(
            "uses record rather than line in source information for fixed files",
            async () => {

                const parser:
                    Parser<
                        string,
                        undefined
                    > = {

                    parse():
                        Errors {

                        return {
                            errors: [
                                "bad record"
                            ]
                        };
                    }
                };


                const parsers = {
                    text:
                    parser
                } satisfies ParserMap;


                const readers:
                    RecordReaderMap = {

                    line:
                    emptyReader,

                    fixed:
                        async function* () {

                            yield physicalRecord(
                                "xxxx"
                            );
                        },

                    "length-prefixed":
                    emptyReader
                };


                const options:
                    CursorOptions<
                        typeof parsers,
                        number
                    > = {

                    parsers,

                    recordReaders:
                    readers,

                    compareEntityId:
                    compareNumber
                };


                const details:
                    FileDetails<
                        typeof parsers,
                        "text",
                        string,
                        number
                    > = {

                    type:
                        "fixed",

                    filename:
                        "test.dat",

                    recordSize:
                        4,

                    parser:
                        "text",

                    cardinality:
                        "many",

                    project:
                        value =>
                            value,

                    entityId:
                        () =>
                            0
                };


                expect(
                    await collect(
                        createFileCursor(
                            details,
                            options
                        )
                    )
                ).toEqual(
                    [
                        {
                            errors: [
                                "test.dat: record 1: bad record"
                            ],

                            extras: {
                                filename:
                                    "test.dat",

                                recordNumber:
                                    1
                            }
                        }
                    ]
                );
            }
        );


        test(
            "projects before advancing the physical cursor",
            async () => {

                let currentRecordValid =
                    false;


                const reader:
                    RecordReaderMap["line"] =
                    async function* () {

                        currentRecordValid =
                            true;


                        yield physicalRecord(
                            "one"
                        );


                        /*
                         * Code after yield runs only when the consumer
                         * advances this physical cursor.
                         */
                        currentRecordValid =
                            false;
                    };


                const parser:
                    Parser<
                        string,
                        undefined
                    > = {

                    parse(
                        record
                    ): string {

                        return decodeRecord(
                            record
                        );
                    }
                };


                const parsers = {
                    text:
                    parser
                } satisfies ParserMap;


                const options =
                    createOptions(
                        parsers,
                        reader
                    );


                const details:
                    FileDetails<
                        typeof parsers,
                        "text",
                        string,
                        number
                    > = {

                    type:
                        "line",

                    filename:
                        "test.txt",

                    parser:
                        "text",

                    cardinality:
                        "many",

                    project(
                        representation
                    ): string {

                        expect(
                            currentRecordValid
                        ).toBe(
                            true
                        );


                        return representation;
                    },

                    entityId:
                        () =>
                            0
                };


                expect(
                    await collect(
                        createFileCursor(
                            details,
                            options
                        )
                    )
                ).toEqual(
                    [
                        "one"
                    ]
                );


                expect(
                    currentRecordValid
                ).toBe(
                    false
                );
            }
        );
    }
);


function createOptions<
    TParsers extends ParserMap
>(
    parsers: TParsers,
    line:
    RecordReaderMap["line"]
): CursorOptions<
    TParsers,
    number
> {

    return {
        parsers,

        recordReaders: {
            line,

            fixed:
            emptyReader,

            "length-prefixed":
            emptyReader
        },

        compareEntityId:
        compareNumber
    };
}


function lineReader(
    ...records: string[]
): RecordReaderMap["line"] {

    return async function* () {

        for (
            const record
            of records
            ) {
            yield physicalRecord(
                record
            );
        }
    };
}


async function* emptyReader():
    RecordCursor {

    return;
}


function physicalRecord(
    value: string
): PhysicalRecordContent {

    const buffer =
        new TextEncoder().encode(
            value
        );


    return {
        buffers: [
            buffer
        ],

        startOffset:
            0,

        length:
        buffer.length
    };
}


function decodeRecord(
    record: PhysicalRecordContent
): string {

    const result =
        new Uint8Array(
            record.length
        );


    const recordEnd =
        record.startOffset
        + record.length;


    let logicalOffset =
        0;

    let targetOffset =
        0;


    for (
        const buffer
        of record.buffers
        ) {
        const bufferStart =
            logicalOffset;

        const bufferEnd =
            logicalOffset
            + buffer.length;


        const copyStart =
            Math.max(
                record.startOffset,
                bufferStart
            );

        const copyEnd =
            Math.min(
                recordEnd,
                bufferEnd
            );


        if (
            copyStart
            < copyEnd
        ) {
            const sourceStart =
                copyStart
                - bufferStart;

            const sourceEnd =
                copyEnd
                - bufferStart;


            result.set(
                buffer.subarray(
                    sourceStart,
                    sourceEnd
                ),
                targetOffset
            );


            targetOffset +=
                sourceEnd
                - sourceStart;
        }


        logicalOffset =
            bufferEnd;
    }


    return new TextDecoder().decode(
        result
    );
}


async function collect<T>(
    cursor:
    AsyncGenerator<
        T,
        void,
        unknown
    >
): Promise<T[]> {

    const values:
        T[] =
        [];


    for await (
        const value
        of cursor
        ) {
        values.push(
            value
        );
    }


    return values;
}


function compareNumber(
    left: number,
    right: number
): number {

    return left
        - right;
}
test(
    "decorates a thrown parser exception with filename line number and parser name",
    async () => {

        const parserError =
            new Error(
                "parser exploded"
            );


        const parser:
            Parser<
                string,
                undefined
            > = {

            parse():
                string {

                throw parserError;
            }
        };


        const parsers = {
            text:
            parser
        } satisfies ParserMap;


        const options =
            createOptions(
                parsers,
                lineReader(
                    "one"
                )
            );


        const details:
            FileDetails<
                typeof parsers,
                "text",
                string,
                number
            > = {

            type:
                "line",

            filename:
                "test.txt",

            parser:
                "text",

            cardinality:
                "many",

            project:
                value =>
                    value,

            entityId:
                () =>
                    0
        };


        const cursor =
            createFileCursor(
                details,
                options
            );


        await expect(
            cursor.next()
        ).rejects.toThrow(
            'test.txt: line 1: parser "text" failed: parser exploded'
        );
    }
);


test(
    "preserves the original parser exception as cause",
    async () => {

        const parserError =
            new Error(
                "parser exploded"
            );


        const parser:
            Parser<
                string,
                undefined
            > = {

            parse():
                string {

                throw parserError;
            }
        };


        const parsers = {
            text:
            parser
        } satisfies ParserMap;


        const options =
            createOptions(
                parsers,
                lineReader(
                    "one"
                )
            );


        const details:
            FileDetails<
                typeof parsers,
                "text",
                string,
                number
            > = {

            type:
                "line",

            filename:
                "test.txt",

            parser:
                "text",

            cardinality:
                "many",

            project:
                value =>
                    value,

            entityId:
                () =>
                    0
        };


        const cursor =
            createFileCursor(
                details,
                options
            );


        let thrown:
            unknown;


        try {
            await cursor.next();
        } catch (
            error
            ) {
            thrown =
                error;
        }


        expect(
            thrown
        ).toBeInstanceOf(
            Error
        );


        if (
            !(
                thrown
                instanceof Error
            )
        ) {
            throw new Error(
                "expected parser exception"
            );
        }


        expect(
            thrown.cause
        ).toBe(
            parserError
        );
    }
);


test(
    "decorates a thrown preparation exception with filename line number and parser name",
    async () => {

        const parser:
            Parser<
                string,
                undefined,
                string
            > = {

            prepare():
                string {

                throw new Error(
                    "preparation exploded"
                );
            },

            parse():
                string {

                throw new Error(
                    "parse must not be called"
                );
            }
        };


        const parsers = {
            prepared:
            parser
        } satisfies ParserMap;


        const options =
            createOptions(
                parsers,
                lineReader(
                    "header",
                    "data"
                )
            );


        const details:
            FileDetails<
                typeof parsers,
                "prepared",
                string,
                number
            > = {

            type:
                "line",

            filename:
                "test.csv",

            parser:
                "prepared",

            parserConfig:
            undefined,

            cardinality:
                "many",

            project:
                value =>
                    value,

            entityId:
                () =>
                    0
        };


        const cursor =
            createFileCursor(
                details,
                options
            );


        await expect(
            cursor.next()
        ).rejects.toThrow(
            'test.csv: line 1: parser "prepared" preparation failed: preparation exploded'
        );
    }
);


test(
    "uses record rather than line when a parser throws for a fixed file",
    async () => {

        const parser:
            Parser<
                string,
                undefined
            > = {

            parse():
                string {

                throw new Error(
                    "parser exploded"
                );
            }
        };


        const parsers = {
            text:
            parser
        } satisfies ParserMap;


        const readers:
            RecordReaderMap = {

            line:
            emptyReader,

            fixed:
                async function* () {

                    yield physicalRecord(
                        "xxxx"
                    );
                },

            "length-prefixed":
            emptyReader
        };


        const options:
            CursorOptions<
                typeof parsers,
                number
            > = {

            parsers,

            recordReaders:
            readers,

            compareEntityId:
            compareNumber
        };


        const details:
            FileDetails<
                typeof parsers,
                "text",
                string,
                number
            > = {

            type:
                "fixed",

            filename:
                "test.dat",

            recordSize:
                4,

            parser:
                "text",

            cardinality:
                "many",

            project:
                value =>
                    value,

            entityId:
                () =>
                    0
        };


        const cursor =
            createFileCursor(
                details,
                options
            );


        await expect(
            cursor.next()
        ).rejects.toThrow(
            'test.dat: record 1: parser "text" failed: parser exploded'
        );
    }
);


test(
    "does not wrap projection exceptions as parser exceptions",
    async () => {

        const parser:
            Parser<
                string,
                undefined
            > = {

            parse(
                record
            ): string {

                return decodeRecord(
                    record
                );
            }
        };


        const parsers = {
            text:
            parser
        } satisfies ParserMap;


        const options =
            createOptions(
                parsers,
                lineReader(
                    "one"
                )
            );


        const details:
            FileDetails<
                typeof parsers,
                "text",
                string,
                number
            > = {

            type:
                "line",

            filename:
                "test.txt",

            parser:
                "text",

            cardinality:
                "many",

            project():
                string {

                throw new Error(
                    "projection exploded"
                );
            },

            entityId:
                () =>
                    0
        };


        const cursor =
            createFileCursor(
                details,
                options
            );


        await expect(
            cursor.next()
        ).rejects.toThrow(
            "projection exploded"
        );


        try {
            await createFileCursor(
                details,
                options
            ).next();
        } catch (
            error
            ) {
            expect(
                error
            ).toBeInstanceOf(
                Error
            );


            if (
                error
                instanceof Error
            ) {
                expect(
                    error.message
                ).toBe(
                    "projection exploded"
                );
            }
        }
    }
);


test(
    "decorates a non-Error value thrown by the parser",
    async () => {

        const parser:
            Parser<
                string,
                undefined
            > = {

            parse():
                string {

                throw "parser exploded";
            }
        };


        const parsers = {
            text:
            parser
        } satisfies ParserMap;


        const options =
            createOptions(
                parsers,
                lineReader(
                    "one"
                )
            );


        const details:
            FileDetails<
                typeof parsers,
                "text",
                string,
                number
            > = {

            type:
                "line",

            filename:
                "test.txt",

            parser:
                "text",

            cardinality:
                "many",

            project:
                value =>
                    value,

            entityId:
                () =>
                    0
        };


        const cursor =
            createFileCursor(
                details,
                options
            );


        await expect(
            cursor.next()
        ).rejects.toThrow(
            'test.txt: line 1: parser "text" failed: parser exploded'
        );
    }
);