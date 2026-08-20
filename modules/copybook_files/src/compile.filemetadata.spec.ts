import {
    errorsOrThrow,
    valueOrThrow,
} from "@cobol-ts/errors";
import {compileFileMetadata} from "./compile.filemetadata";
import {AuthoringFileMetadata} from "./file.characteristic.dom";

describe(
    "compileFileMetadata",
    () => {
        it(
            "compiles fields to absolute offsets",
            () => {
                const metadata: AuthoringFileMetadata = {
                    entries: [
                        {
                            kind: "field",
                            name: "NAME",
                            size: 5,
                            type: {
                                kind: "text",
                                encoding: "ascii",
                            },
                        },

                        {
                            kind: "field",
                            name: "COUNT",
                            size: 4,
                            type: {
                                kind: "integer",
                                encoding: "binary-integer",
                                byteOrder: "big-endian",
                                semantics: "native",
                                signed: true,
                            },
                        },

                        {
                            kind: "field",
                            name: "BALANCE",
                            size: 4,
                            type: {
                                kind: "decimal",
                                encoding: "packed-decimal",
                                digits: 7,
                                scale: 2,
                                signed: true,
                            },
                        },

                        {
                            kind: "field",
                            name: "RATE",
                            size: 4,
                            type: {
                                kind: "floating-point",
                                encoding: "ieee754",
                                precision: "single",
                                byteOrder: "big-endian",
                            },
                        },
                    ],
                };

                expect(
                    valueOrThrow(
                        compileFileMetadata(
                            metadata,
                        ),
                    ),
                ).toEqual({
                    size: 17,

                    fields: [
                        {
                            name: "NAME",
                            from: 0,
                            to: 5,
                            type: {
                                kind: "text",
                                encoding: "ascii",
                            },
                        },

                        {
                            name: "COUNT",
                            from: 5,
                            to: 9,
                            type: {
                                kind: "integer",
                                encoding: "binary-integer",
                                byteOrder: "big-endian",
                                semantics: "native",
                                signed: true,
                            },
                        },

                        {
                            name: "BALANCE",
                            from: 9,
                            to: 13,
                            type: {
                                kind: "decimal",
                                encoding: "packed-decimal",
                                digits: 7,
                                scale: 2,
                                signed: true,
                            },
                        },

                        {
                            name: "RATE",
                            from: 13,
                            to: 17,
                            type: {
                                kind: "floating-point",
                                encoding: "ieee754",
                                precision: "single",
                                byteOrder: "big-endian",
                            },
                        },
                    ],
                });
            },
        );


        it(
            "preserves field descriptions",
            () => {
                const metadata: AuthoringFileMetadata = {
                    entries: [
                        {
                            kind: "field",
                            name: "NAME",
                            description: "Customer name",
                            size: 10,
                            type: {
                                kind: "text",
                                encoding: "ascii",
                            },
                        },
                    ],
                };

                expect(
                    valueOrThrow(
                        compileFileMetadata(
                            metadata,
                        ),
                    ),
                ).toEqual({
                    size: 10,
                    fields: [
                        {
                            name: "NAME",
                            description: "Customer name",
                            from: 0,
                            to: 10,
                            type: {
                                kind: "text",
                                encoding: "ascii",
                            },
                        },
                    ],
                });
            },
        );


        it(
            "uses fillers when calculating offsets but does not emit them",
            () => {
                const metadata: AuthoringFileMetadata = {
                    entries: [
                        {
                            kind: "field",
                            name: "FIRST",
                            size: 3,
                            type: {
                                kind: "text",
                                encoding: "ascii",
                            },
                        },

                        {
                            kind: "filler",
                            size: 4,
                        },

                        {
                            kind: "field",
                            name: "SECOND",
                            size: 2,
                            type: {
                                kind: "text",
                                encoding: "ascii",
                            },
                        },
                    ],
                };

                expect(
                    valueOrThrow(
                        compileFileMetadata(
                            metadata,
                        ),
                    ),
                ).toEqual({
                    size: 9,
                    fields: [
                        {
                            name: "FIRST",
                            from: 0,
                            to: 3,
                            type: {
                                kind: "text",
                                encoding: "ascii",
                            },
                        },
                        {
                            name: "SECOND",
                            from: 7,
                            to: 9,
                            type: {
                                kind: "text",
                                encoding: "ascii",
                            },
                        },
                    ],
                });
            },
        );


        it(
            "compiles an empty file",
            () => {
                const metadata: AuthoringFileMetadata = {
                    entries: [],
                };

                expect(
                    valueOrThrow(
                        compileFileMetadata(
                            metadata,
                        ),
                    ),
                ).toEqual({
                    size: 0,
                    fields: [],
                });
            },
        );


        it(
            "compiles a file containing only filler",
            () => {
                const metadata: AuthoringFileMetadata = {
                    entries: [
                        {
                            kind: "filler",
                            size: 10,
                        },
                    ],
                };

                expect(
                    valueOrThrow(
                        compileFileMetadata(
                            metadata,
                        ),
                    ),
                ).toEqual({
                    size: 10,
                    fields: [],
                });
            },
        );


        it(
            "rejects a zero-sized field",
            () => {
                const metadata: AuthoringFileMetadata = {
                    entries: [
                        {
                            kind: "field",
                            name: "NAME",
                            size: 0,
                            type: {
                                kind: "text",
                                encoding: "ascii",
                            },
                        },
                    ],
                };

                expect(
                    errorsOrThrow(
                        compileFileMetadata(
                            metadata,
                        ),
                    ),
                ).toEqual([
                    "NAME: size must be greater than zero but was 0",
                ]);
            },
        );


        it(
            "rejects a negative-sized field",
            () => {
                const metadata: AuthoringFileMetadata = {
                    entries: [
                        {
                            kind: "field",
                            name: "NAME",
                            size: -3,
                            type: {
                                kind: "text",
                                encoding: "ascii",
                            },
                        },
                    ],
                };

                expect(
                    errorsOrThrow(
                        compileFileMetadata(
                            metadata,
                        ),
                    ),
                ).toEqual([
                    "NAME: size must be greater than zero but was -3",
                ]);
            },
        );


        it(
            "rejects a zero-sized filler",
            () => {
                const metadata: AuthoringFileMetadata = {
                    entries: [
                        {
                            kind: "filler",
                            size: 0,
                        },
                    ],
                };

                expect(
                    errorsOrThrow(
                        compileFileMetadata(
                            metadata,
                        ),
                    ),
                ).toEqual([
                    "filler: size must be greater than zero but was 0",
                ]);
            },
        );


        it(
            "accumulates errors from multiple entries",
            () => {
                const metadata: AuthoringFileMetadata = {
                    entries: [
                        {
                            kind: "field",
                            name: "BAD-ONE",
                            size: 0,
                            type: {
                                kind: "text",
                                encoding: "ascii",
                            },
                        },

                        {
                            kind: "filler",
                            size: -2,
                        },

                        {
                            kind: "field",
                            name: "BAD-TWO",
                            size: -5,
                            type: {
                                kind: "integer",
                                encoding: "binary-integer",
                                byteOrder: "big-endian",
                                semantics: "native",
                                signed: false,
                            },
                        },
                    ],
                };

                expect(
                    errorsOrThrow(
                        compileFileMetadata(
                            metadata,
                        ),
                    ),
                ).toEqual([
                    "BAD-ONE: size must be greater than zero but was 0",
                    "filler: size must be greater than zero but was -2",
                    "BAD-TWO: size must be greater than zero but was -5",
                ]);
            },
        );
    },
);