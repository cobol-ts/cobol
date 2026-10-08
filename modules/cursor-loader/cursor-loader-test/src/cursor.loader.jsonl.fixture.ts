import {defineProjection} from "@cobol-ts/cursor-projection";


export interface Customer {
    id(): number;
    name(): string;
    age(): number;
    addressLine1(): string;
    addressLine2(): string;
    postcode(): string;
    status(): string;
    balance(): number;
}


export interface MinimalCustomer {
    id(): number;
    status(): string;
}


export const customerProjection = defineProjection<Customer>({
    id: {type: "integer"},
    name: {type: "string"},
    age: {type: "integer"},
    addressLine1: {
        type: "string",
        path: ["address", "line1"]
    },
    addressLine2: {
        type: "string",
        path: ["address", "line2"]
    },
    postcode: {
        type: "string",
        path: ["address", "postcode"]
    },
    status: {type: "character"},
    balance: {type: "float"}
});


export const minimalCustomerProjection = defineProjection<MinimalCustomer>({
    id: {type: "integer"},
    status: {type: "character"}
});
