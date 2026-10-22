import {
    type Errors,
    isValue
} from "@cobol-ts/errors";

import {
    createErrorsOrFileCursor,
    createFileCursor,
    createIgnoringFileCursor,
    createThrowingFileCursor
} from "./cursor.file";

import {
    type FileCursorResult
} from "./cursor.file.result";

import {
    type Customer,
    createTestFile,
    createTestInfrastructure,
    customerFileDefinition,
    testParserRegistry
} from "./cursor.file.fixture";


function cursorValue<T>(
    result: IteratorResult<T,void>
): T {
    if (result.done === true) {
        throw new Error(
            "Expected cursor value"
        );
    }

    return result.value;
}


function projectedValue<T>(
    result:
        FileCursorResult<T>
        | string[]
): FileCursorResult<T> {
    if (Array.isArray(result)) {
        throw new Error(
            `Expected projected value but got errors: ${result.join(", ")}`
        );
    }

    return result;
}


describe("createFileCursor",() => {
    test("fixture compiles named paths and rejects unsupported numeric selectors",() => {
        const compile =
            testParserRegistry.test.parser.compileProjectionPath;

        expect(
            compile(undefined,undefined,["name"])
        ).toEqual(["name"]);

        expect(
            () => compile(undefined,undefined,["name",0])
        ).toThrow("Unknown test projection path: name.0");
    });

    test("selects the parser through the registry and returns a projected value",async () => {
        const cursor =
            createFileCursor(
                customerFileDefinition,
                createTestFile("A"),
                createTestInfrastructure()
            );

        const result =
            projectedValue(
                cursorValue(
                    await cursor.next()
                )
            );

        expect(
            result.result.name()
        ).toBe(
            "Alice"
        );

        result.close();

        await expectFinished(
            cursor
        );
    });


    test("returns string errors and continues with the next row",async () => {
        const cursor =
            createFileCursor(
                customerFileDefinition,
                createTestFile("!A"),
                createTestInfrastructure()
            );

        const error =
            cursorValue(
                await cursor.next()
            );

        expect(error).toEqual([
            "bad row"
        ]);

        const result =
            projectedValue(
                cursorValue(
                    await cursor.next()
                )
            );

        expect(
            result.result.name()
        ).toBe(
            "Alice"
        );

        result.close();

        await expectFinished(
            cursor
        );
    });


    test("clears the lazy projection when the result closes",async () => {
        const cursor =
            createFileCursor(
                customerFileDefinition,
                createTestFile("A"),
                createTestInfrastructure()
            );

        const result =
            projectedValue(
                cursorValue(
                    await cursor.next()
                )
            );

        expect(
            result.result.name()
        ).toBe(
            "Alice"
        );

        result.close();

        expect(
            () => result.result.name()
        ).toThrow(
            "Projection is not bound"
        );

        await expectFinished(
            cursor
        );
    });
});


describe("createErrorsOrFileCursor",() => {
    test("wraps a successful row in ErrorsOr",async () => {
        const cursor =
            createErrorsOrFileCursor(
                customerFileDefinition,
                createTestFile("A"),
                createTestInfrastructure()
            );

        const result =
            cursorValue(
                await cursor.next()
            );

        if (!isValue(result)) {
            throw new Error(
                "Expected value"
            );
        }

        expect(
            result.value.result.name()
        ).toBe(
            "Alice"
        );

        result.value.close();

        await expectFinished(
            cursor
        );
    });


    test("returns Errors unchanged",async () => {
        const cursor =
            createErrorsOrFileCursor(
                customerFileDefinition,
                createTestFile("!"),
                createTestInfrastructure()
            );

        const result =
            cursorValue(
                await cursor.next()
            );

        expect(result).toEqual({
            errors: [
                "bad row"
            ],

            reference:
                "row-1"
        });

        await expectFinished(
            cursor
        );
    });
});


describe("createThrowingFileCursor",() => {
    test("throws ErrorsException for a row error",async () => {
        const cursor =
            createThrowingFileCursor(
                customerFileDefinition,
                createTestFile("!"),
                createTestInfrastructure()
            );

        await expect(
            cursor.next()
        ).rejects.toEqual(
            expect.objectContaining({
                name:
                    "ErrorsException",

                errors: [
                    "bad row"
                ],

                reference:
                    "row-1"
            })
        );
    });


    test("returns successful rows normally",async () => {
        const cursor =
            createThrowingFileCursor(
                customerFileDefinition,
                createTestFile("A"),
                createTestInfrastructure()
            );

        const result =
            cursorValue(
                await cursor.next()
            );

        expect(
            result.result.name()
        ).toBe(
            "Alice"
        );

        result.close();

        await expectFinished(
            cursor
        );
    });
});


describe("createIgnoringFileCursor",() => {
    test("skips errors and continues to the next successful row",async () => {
        const cursor =
            createIgnoringFileCursor(
                customerFileDefinition,
                createTestFile("!A"),
                createTestInfrastructure()
            );

        const result =
            cursorValue(
                await cursor.next()
            );

        expect(
            result.result.name()
        ).toBe(
            "Alice"
        );

        result.close();

        await expectFinished(
            cursor
        );
    });


    test("calls onError with the full Errors object",async () => {
        const received:
            Errors[] =
            [];

        const cursor =
            createIgnoringFileCursor(
                customerFileDefinition,
                createTestFile("!"),
                createTestInfrastructure(),
                error => received.push(error)
            );

        const next =
            await cursor.next();

        expect(
            next.done
        ).toBe(
            true
        );

        expect(received).toEqual([
            {
                errors: [
                    "bad row"
                ],

                reference:
                    "row-1"
            }
        ]);
    });


    test("does not swallow configuration failures",async () => {
        const received:
            Errors[] =
            [];

        const cursor =
            createIgnoringFileCursor(
                customerFileDefinition,
                createTestFile("A"),
                createTestInfrastructure(
                    () => {
                        throw new Error(
                            "bad configuration"
                        );
                    }
                ),
                error => received.push(error)
            );

        await expect(
            cursor.next()
        ).rejects.toThrow(
            "bad configuration"
        );

        expect(received).toEqual([]);
    });
});


async function expectFinished<T>(
    cursor: AsyncGenerator<T,void,void>
): Promise<void> {
    expect(
        (await cursor.next()).done
    ).toBe(
        true
    );
}