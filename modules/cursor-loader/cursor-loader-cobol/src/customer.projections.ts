import {defineProjection} from "@cobol-ts/cursor-projection";

/**
 * Application-facing, borrowed projection contracts for the customer fixtures.
 *
 * During the debug phase a number is an encoded (from,to) pair, NOT a decoded
 * COBOL integer. Strings are 'from/to/hex-bytes', NOT decoded text. These
 * contracts deliberately use the real projection framework's accessor shape.
 */
export interface SimpleCustomer {
    id(): number;
    name(): string;
    status(): string;
}

export interface NestedCustomer {
    id(): number;
    firstName(): string;
    lastName(): string;
    status(): string;
}

export interface AlignedCustomer {
    id(): string;
    balance(): number;
    status(): string;
}

/**
 * Only non-repeated members are projected for now. The name index contains
 * TELEPHONES and both REDEFINES interpretations, but selecting an occurrence
 * needs a separate indexed-path convention.
 */
export interface FixedOccursCustomer {
    id(): number;
    status(): string;
}

/** The STATUS path is valid but its physical position depends on ITEM-COUNT. */
export interface OdoCustomer {
    itemCount(): number;
    id(): number;
    name(): string;
    status(): string;
}

export const customerSimpleProjection = defineProjection<SimpleCustomer>({
    id: {type: "integer", path: ["CUSTOMER", "CUSTOMER-ID"]},
    name: {type: "string", path: ["CUSTOMER", "CUSTOMER-NAME"]},
    status: {type: "character", path: ["CUSTOMER", "STATUS"]}
});

export const customerNestedProjection = defineProjection<NestedCustomer>({
    id: {type: "integer", path: ["CUSTOMER", "CUSTOMER-ID"]},
    firstName: {type: "string", path: ["CUSTOMER", "CONTACT", "FIRST-NAME"]},
    lastName: {type: "string", path: ["CUSTOMER", "CONTACT", "LAST-NAME"]},
    status: {type: "character", path: ["CUSTOMER", "STATUS"]}
});

export const customerAlignedProjection = defineProjection<AlignedCustomer>({
    id: {type: "string", path: ["CUSTOMER", "CUSTOMER-ID"]},
    balance: {type: "integer", path: ["CUSTOMER", "BALANCE"]},
    status: {type: "character", path: ["CUSTOMER", "STATUS"]}
});

export const customerFixedOccursProjection = defineProjection<FixedOccursCustomer>({
    id: {type: "integer", path: ["CUSTOMER", "CUSTOMER-ID"]},
    status: {type: "character", path: ["CUSTOMER", "STATUS"]}
});

export const customerOdoProjection = defineProjection<OdoCustomer>({
    itemCount: {type: "integer", path: ["CUSTOMER", "ITEM-COUNT"]},
    id: {type: "integer", path: ["CUSTOMER", "CUSTOMER-ID"]},
    name: {type: "string", path: ["CUSTOMER", "CUSTOMER-NAME"]},
    status: {type: "character", path: ["CUSTOMER", "STATUS"]}
});
