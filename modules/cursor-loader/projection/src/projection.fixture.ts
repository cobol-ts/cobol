import {
    type PhysicalRecordDebugRenderer,
    type ProjectionSupport, utf8RangeToString
} from "@cobol-ts/cursor-loader-types";

import {defineProjection} from "./create.projection";


type Representation =
    Readonly<Record<string,unknown>>;


export interface Customer {
    id(): number;
    age(): number;
    name(): string;
    initial(): string;
    balance(): number;
}


export interface OrderSummary {
    orderId(): number;
    customerName(): string;
    total(): number;
}


export const customerProjection = defineProjection<Customer>({
    id: {
        type: "integer"
    },

    age: {
        type: "integer"
    },

    name: {
        type: "string"
    },

    initial: {
        type: "character"
    },

    balance: {
        type: "float"
    }
});


export const orderSummaryProjection = defineProjection<OrderSummary>({
    orderId: {
        type: "integer",
        path: [
            "order",
            "id"
        ]
    },

    customerName: {
        type: "string",
        path: [
            "order",
            "customer",
            "name"
        ]
    },

    total: {
        type: "float",
        path: [
            "order",
            "total"
        ]
    }
});


export const fakeParser = {
    compileProjectionPath(
        _details: undefined,
        _context,
        path: readonly string[]
    ): readonly string[] {
        return path;
    },

    integer(
        representation: Representation,
        _details: undefined,
        path: readonly string[]
    ): number {
        const value = valueAtPath(representation,path);

        if (
            typeof value !== "number"
            || !Number.isInteger(value)
        ) {
            throw new Error(
                `Expected integer at ${path.join(".")}`
            );
        }

        return value;
    },

    float(
        representation: Representation,
        _details: undefined,
        path: readonly string[]
    ): number {
        const value = valueAtPath(representation,path);

        if (typeof value !== "number") {
            throw new Error(
                `Expected float at ${path.join(".")}`
            );
        }

        return value;
    },

    character(
        representation: Representation,
        _details: undefined,
        path: readonly string[]
    ): string {
        const value = valueAtPath(representation,path);

        if (
            typeof value !== "string"
            || value.length !== 1
        ) {
            throw new Error(
                `Expected character at ${path.join(".")}`
            );
        }

        return value;
    },

    string(
        representation: Representation,
        _details: undefined,
        path: readonly string[]
    ): string {
        const value = valueAtPath(representation,path);

        if (typeof value !== "string") {
            throw new Error(
                `Expected string at ${path.join(".")}`
            );
        }

        return value;
    },

    toDebugString: utf8RangeToString
} satisfies ProjectionSupport<
    Representation,
    undefined,
    readonly string[]
> & PhysicalRecordDebugRenderer;


function valueAtPath(
    representation: Representation,
    path: readonly string[]
): unknown {
    let value: unknown =
        representation;

    for (const part of path) {
        if (
            typeof value !== "object"
            || value === null
            || Array.isArray(value)
        ) {
            return undefined;
        }

        value =
            (
                value as Readonly<Record<string,unknown>>
            )[part];
    }

    return value;
}