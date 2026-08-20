import {
    AuthoringFileFieldMetadata,
    AuthoringFileMetadata,
    Decimal,
    FileFieldValue,
} from "@cobol-ts/copybookfiles";


export type GeneratedField<
    T extends FileFieldValue = FileFieldValue,
> = {
    field: AuthoringFileFieldMetadata<T>;

    generateValue: () => {
        value: T;
        expected: T;
    };
};


export type GeneratedRecord = {
    metadata: AuthoringFileMetadata;
    record: FileFieldValue[];
    expected: FileFieldValue[];
};


export type GeneratedRecords = {
    metadata: AuthoringFileMetadata;
    records: FileFieldValue[][];
    expected: FileFieldValue[][];
};


type FieldGenerator =
    (
        name: string,
        edgeBiased: boolean,
    ) => GeneratedField;


const fieldGenerators: FieldGenerator[] = [
    asciiField,
    ebcdic037Field,
    signedBinaryIntegerField,
    unsignedBinaryIntegerField,
    packedDecimalField,
    float32Field,
    float64Field,
];


export function generateRecord(): GeneratedRecord {
    const generated =
        generateRecords(
            1,
        );

    return {
        metadata: generated.metadata,
        record: generated.records[0],
        expected: generated.expected[0],
    };
}


export function generateEdgeRecord(): GeneratedRecord {
    const generated =
        generateEdgeRecords(
            1,
        );

    return {
        metadata: generated.metadata,
        record: generated.records[0],
        expected: generated.expected[0],
    };
}


export function generateRecords(
    recordCount: number = 1,
): GeneratedRecords {
    return generateRecordsUsing(
        recordCount,
        false,
    );
}


export function generateEdgeRecords(
    recordCount: number = 1,
): GeneratedRecords {
    return generateRecordsUsing(
        recordCount,
        true,
    );
}


function generateRecordsUsing(
    recordCount: number,
    edgeBiased: boolean,
): GeneratedRecords {
    const fieldCount =
        randomInteger(
            1,
            20,
        );

    const fields: GeneratedField[] = [];

    for (
        let index = 0;
        index < fieldCount;
        index++
    ) {
        const generator =
            randomElement(
                fieldGenerators,
            );

        fields.push(
            generator(
                `FIELD-${index}`,
                edgeBiased,
            ),
        );
    }

    const records: FileFieldValue[][] = [];
    const expected: FileFieldValue[][] = [];

    for (
        let recordIndex = 0;
        recordIndex < recordCount;
        recordIndex++
    ) {
        const record: FileFieldValue[] = [];
        const expectedRecord: FileFieldValue[] = [];

        for (const field of fields) {
            const generated =
                field.generateValue();

            record.push(
                generated.value,
            );

            expectedRecord.push(
                generated.expected,
            );
        }

        records.push(
            record,
        );

        expected.push(
            expectedRecord,
        );
    }

    return {
        metadata: {
            entries:
                fields.map(
                    field =>
                        field.field,
                ),
        },

        records,
        expected,
    };
}


/*
 * ASCII
 */

function asciiField(
    name: string,
    edgeBiased: boolean,
): GeneratedField<string> {
    const size =
        randomInteger(
            1,
            30,
        );

    return {
        field: {
            kind: "field",
            name,
            size,

            type: {
                kind: "text",
                encoding: "ascii",
            },
        },

        generateValue: () => {
            const length =
                edgeBiased
                    ? edgeStringLength(
                        size,
                    )
                    : randomInteger(
                        0,
                        size,
                    );

            const value =
                randomAscii(
                    length,
                );

            return {
                value,

                expected:
                    value.padEnd(
                        size,
                        " ",
                    ),
            };
        },
    };
}


/*
 * EBCDIC 037
 */

function ebcdic037Field(
    name: string,
    edgeBiased: boolean,
): GeneratedField<string> {
    const size =
        randomInteger(
            1,
            30,
        );

    return {
        field: {
            kind: "field",
            name,
            size,

            type: {
                kind: "text",
                encoding: "ebcdic:037",
            },
        },

        generateValue: () => {
            const length =
                edgeBiased
                    ? edgeStringLength(
                        size,
                    )
                    : randomInteger(
                        0,
                        size,
                    );

            const value =
                randomCharacters(
                    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 ",
                    length,
                );

            return {
                value,

                expected:
                    value.padEnd(
                        size,
                        " ",
                    ),
            };
        },
    };
}


/*
 * Signed binary integer
 */

function signedBinaryIntegerField(
    name: string,
    edgeBiased: boolean,
): GeneratedField<bigint> {
    const size =
        randomInteger(
            1,
            8,
        );

    const bits =
        BigInt(
            size * 8,
        );

    const minimum =
        -(1n << (bits - 1n));

    const maximum =
        (1n << (bits - 1n)) -
        1n;

    const byteOrder =
        randomByteOrder();

    return {
        field: {
            kind: "field",
            name,
            size,

            type: {
                kind: "integer",
                encoding: "binary-integer",
                byteOrder,
                semantics: "native",
                signed: true,
            },
        },

        generateValue: () => {
            const value =
                edgeBiased
                    ? edgeOrRandomBigInt(
                        [
                            minimum,
                            minimum + 1n,
                            -1n,
                            0n,
                            1n,
                            maximum - 1n,
                            maximum,
                        ],
                        minimum,
                        maximum,
                    )
                    : Math.random() < 0.75
                        ? randomBigIntWithin(
                            maxBigInt(
                                minimum,
                                -1_000_000n,
                            ),
                            minBigInt(
                                maximum,
                                1_000_000n,
                            ),
                        )
                        : randomBigIntWithin(
                            minimum,
                            maximum,
                        );

            return {
                value,
                expected: value,
            };
        },
    };
}


/*
 * Unsigned binary integer
 */

function unsignedBinaryIntegerField(
    name: string,
    edgeBiased: boolean,
): GeneratedField<bigint> {
    const size =
        randomInteger(
            1,
            8,
        );

    const bits =
        BigInt(
            size * 8,
        );

    const maximum =
        (1n << bits) -
        1n;

    const byteOrder =
        randomByteOrder();

    return {
        field: {
            kind: "field",
            name,
            size,

            type: {
                kind: "integer",
                encoding: "binary-integer",
                byteOrder,
                semantics: "native",
                signed: false,
            },
        },

        generateValue: () => {
            const value =
                edgeBiased
                    ? edgeOrRandomBigInt(
                        [
                            0n,
                            1n,
                            maximum > 0n
                                ? maximum - 1n
                                : maximum,
                            maximum,
                        ],
                        0n,
                        maximum,
                    )
                    : Math.random() < 0.75
                        ? randomBigIntWithin(
                            0n,
                            minBigInt(
                                maximum,
                                1_000_000n,
                            ),
                        )
                        : randomBigIntWithin(
                            0n,
                            maximum,
                        );

            return {
                value,
                expected: value,
            };
        },
    };
}


/*
 * Packed decimal
 */

function packedDecimalField(
    name: string,
    edgeBiased: boolean,
): GeneratedField<Decimal> {
    const size =
        randomInteger(
            1,
            8,
        );

    const physicalDigits =
        size * 2 - 1;

    const digits =
        edgeBiased
            ? randomElement([
                1,
                physicalDigits,
                randomInteger(
                    1,
                    physicalDigits,
                ),
            ])
            : randomInteger(
                1,
                physicalDigits,
            );

    const scale =
        edgeBiased
            ? randomElement([
                0,
                digits,
                randomInteger(
                    0,
                    digits,
                ),
            ])
            : randomInteger(
                0,
                digits,
            );

    const signed =
        Math.random() < 0.5;

    const maximum =
        10n ** BigInt(digits) -
        1n;

    const minimum =
        signed
            ? -maximum
            : 0n;

    return {
        field: {
            kind: "field",
            name,
            size,

            type: {
                kind: "decimal",
                encoding: "packed-decimal",
                digits,
                scale,
                signed,
            },
        },

        generateValue: () => {
            const unscaled =
                edgeBiased
                    ? edgeOrRandomBigInt(
                        signed
                            ? [
                                minimum,
                                minimum + 1n,
                                -1n,
                                0n,
                                1n,
                                maximum - 1n,
                                maximum,
                            ]
                            : [
                                0n,
                                1n,
                                maximum > 0n
                                    ? maximum - 1n
                                    : maximum,
                                maximum,
                            ],
                        minimum,
                        maximum,
                    )
                    : randomPackedDecimalValue(
                        signed,
                        maximum,
                    );

            const value: Decimal = {
                unscaled,
                scale,
            };

            return {
                value,
                expected: value,
            };
        },
    };
}


/*
 * IEEE-754 single precision
 */

function float32Field(
    name: string,
    edgeBiased: boolean,
): GeneratedField<number> {
    const byteOrder =
        randomByteOrder();

    return {
        field: {
            kind: "field",
            name,
            size: 4,

            type: {
                kind: "floating-point",
                encoding: "ieee754",
                precision: "single",
                byteOrder,
            },
        },

        generateValue: () => {
            const value =
                edgeBiased
                    ? randomElement([
                        Math.fround(-1_000_000),
                        Math.fround(-1),
                        Math.fround(-0),
                        Math.fround(0),
                        Math.fround(1),
                        Math.fround(1_000_000),
                        Math.fround(
                            randomNumber(
                                -1_000_000,
                                1_000_000,
                            ),
                        ),
                    ])
                    : Math.fround(
                        randomNumber(
                            -1_000_000,
                            1_000_000,
                        ),
                    );

            return {
                value,
                expected: value,
            };
        },
    };
}


/*
 * IEEE-754 double precision
 */

function float64Field(
    name: string,
    edgeBiased: boolean,
): GeneratedField<number> {
    const byteOrder =
        randomByteOrder();

    return {
        field: {
            kind: "field",
            name,
            size: 8,

            type: {
                kind: "floating-point",
                encoding: "ieee754",
                precision: "double",
                byteOrder,
            },
        },

        generateValue: () => {
            const value =
                edgeBiased
                    ? randomElement([
                        -1_000_000_000,
                        -1,
                        -0,
                        0,
                        1,
                        1_000_000_000,
                        randomNumber(
                            -1_000_000_000,
                            1_000_000_000,
                        ),
                    ])
                    : randomNumber(
                        -1_000_000_000,
                        1_000_000_000,
                    );

            return {
                value,
                expected: value,
            };
        },
    };
}


/*
 * Edge helpers
 */

function edgeStringLength(
    size: number,
): number {
    return randomElement([
        0,
        1,
        Math.max(
            0,
            size - 1,
        ),
        size,
        randomInteger(
            0,
            size,
        ),
    ]);
}


function edgeOrRandomBigInt(
    edgeValues: bigint[],
    minimum: bigint,
    maximum: bigint,
): bigint {
    return Math.random() < 0.6
        ? randomElement(
            edgeValues,
        )
        : randomBigIntWithin(
            minimum,
            maximum,
        );
}


function randomPackedDecimalValue(
    signed: boolean,
    maximum: bigint,
): bigint {
    const commonMaximum =
        minBigInt(
            maximum,
            9999n,
        );

    const valueMaximum =
        Math.random() < 0.25
            ? maximum
            : commonMaximum;

    return signed
        ? randomBigIntWithin(
            -valueMaximum,
            valueMaximum,
        )
        : randomBigIntWithin(
            0n,
            valueMaximum,
        );
}


/*
 * Random helpers
 */

function randomByteOrder():
    "big-endian" | "little-endian" {
    return Math.random() < 0.5
        ? "big-endian"
        : "little-endian";
}


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


function randomNumber(
    minimum: number,
    maximum: number,
): number {
    return minimum +
        Math.random() *
        (
            maximum -
            minimum
        );
}


function randomElement<T>(
    values: T[],
): T {
    return values[
        randomInteger(
            0,
            values.length - 1,
        )
        ];
}


function randomAscii(
    length: number,
): string {
    return randomCharacters(
        "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 !\"#$%&'()*+,-./:;<=>?@[\\]^_`{|}~",
        length,
    );
}


function randomCharacters(
    characters: string,
    length: number,
): string {
    let result = "";

    for (
        let index = 0;
        index < length;
        index++
    )
        result +=
            characters[
                randomInteger(
                    0,
                    characters.length - 1,
                )
                ];

    return result;
}


function randomBigIntWithin(
    minimum: bigint,
    maximum: bigint,
): bigint {
    const range =
        maximum -
        minimum +
        1n;

    const bits =
        bitLength(
            range - 1n,
        );

    if (bits === 0)
        return minimum;

    const bytes =
        Math.ceil(
            bits / 8,
        );

    const excessBits =
        bytes * 8 -
        bits;

    while (true) {
        let candidate = 0n;

        for (
            let index = 0;
            index < bytes;
            index++
        )
            candidate =
                (candidate << 8n) |
                BigInt(
                    randomInteger(
                        0,
                        255,
                    ),
                );

        candidate >>=
            BigInt(
                excessBits,
            );

        if (candidate < range)
            return minimum + candidate;
    }
}


function bitLength(
    value: bigint,
): number {
    let bits = 0;
    let remaining =
        value;

    while (remaining > 0n) {
        remaining >>= 1n;
        bits++;
    }

    return bits;
}


function minBigInt(
    first: bigint,
    second: bigint,
): bigint {
    return first < second
        ? first
        : second;
}


function maxBigInt(
    first: bigint,
    second: bigint,
): bigint {
    return first > second
        ? first
        : second;
}