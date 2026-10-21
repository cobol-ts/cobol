import {parseCopybook, type CopybookAst} from "@cobol-ts/copybook";
import {compileCobolLayout, type CompiledCobolEntry} from "@cobol-ts/layout";
import {valueOrThrow} from "@cobol-ts/errors";
import type {ProjectionField} from "@cobol-ts/cursor-loader-types";
import {
    customerSimpleProjection, customerNestedProjection, customerAlignedProjection,
    customerFixedOccursProjection, customerOdoProjection
} from "./customer.projections";

/** Independently specified oracle: byte offsets are record-relative, end-exclusive. */
export type CustomerFieldSlice = Readonly<{
    path: readonly (string | number)[];
    from: number;
    to: number;
    hex: string;
}>;

export type CustomerRecordFixture = Readonly<{
    label: string;
    /** Original bytes, not a COBOL value decoded and then re-encoded by the layout. */
    bytes: Uint8Array;
    /** Expected total record length, independently specified. */
    length: number;
    /** Expected field locations and contents, independently specified. */
    slices: readonly CustomerFieldSlice[];
    /** For future ODO evaluation tests, not used by the name index. */
    itemCount?: number;
}>;

export type CustomerFixture = Readonly<{
    label: string;
    copybook: string;
    ast: CopybookAst;
    layout: readonly CompiledCobolEntry[];
    /** Typed application mapping, canonicalised by the actual projection factory. */
    projection: Readonly<Record<string, ProjectionField>>;
    records: readonly CustomerRecordFixture[];
}>;

/**
 * Turn a byte-oriented hexadecimal fixture into source bytes. Hex is deliberately
 * supplied literally: no production COBOL encoder or compiled layout is involved.
 */
export function customerHexBytes(hex: string): Uint8Array {
    const words = hex.trim().split(/\s+/);
    if (words.some(word => !/^[0-9A-Fa-f]{2}$/.test(word))) {
        throw new Error(`Invalid customer fixture hex: ${hex}`);
    }
    return Uint8Array.from(words.map(word => parseInt(word, 16)));
}

const record = (
    label: string,
    length: number,
    hex: string,
    slices: readonly CustomerFieldSlice[],
    itemCount?: number
): CustomerRecordFixture => ({label, length, bytes: customerHexBytes(hex), slices, itemCount});

/**
 * This is the production compilation path, run exactly once per fixture:
 *   copybook source -> parseCopybook -> CopybookAst -> compileCobolLayout -> layout.
 * Errors in the parser/compiler fail fixture construction immediately.
 */
const customerFixture = (
    label: string,
    copybook: string,
    projection: Readonly<Record<string, ProjectionField>>,
    records: readonly CustomerRecordFixture[]
): CustomerFixture => {
    const ast = valueOrThrow(parseCopybook(copybook));
    const layout = valueOrThrow(compileCobolLayout(ast, `${label}.cpy`));
    return {label, copybook, ast, layout, projection, records};
};

/** Stage 1: flat fixed-length DISPLAY fields. Two 15-byte EBCDIC-037 records. */
export const customerSimple = customerFixture("customer-simple", [
    "01 CUSTOMER.",
    "   05 CUSTOMER-ID PIC 9(4).",
    "   05 CUSTOMER-NAME PIC X(10).",
    "   05 STATUS PIC X."
].join("\n"), customerSimpleProjection, [
    record("Alice", 15,
        // 0001 | ALICE_____ | A
        "F0 F0 F0 F1  C1 D3 C9 C3 C5 40 40 40 40 40  C1", [
            {path: ["CUSTOMER", "CUSTOMER-ID"], from: 0, to: 4, hex: "F0 F0 F0 F1"},
            {path: ["CUSTOMER", "CUSTOMER-NAME"], from: 4, to: 14, hex: "C1 D3 C9 C3 C5 40 40 40 40 40"},
            {path: ["CUSTOMER", "STATUS"], from: 14, to: 15, hex: "C1"}
        ]),
    record("Bob", 15,
        // 0042 | BOB_______ | I
        "F0 F0 F4 F2  C2 D6 C2 40 40 40 40 40 40 40  C9", [
            {path: ["CUSTOMER", "CUSTOMER-ID"], from: 0, to: 4, hex: "F0 F0 F4 F2"},
            {path: ["CUSTOMER", "CUSTOMER-NAME"], from: 4, to: 14, hex: "C2 D6 C2 40 40 40 40 40 40 40"},
            {path: ["CUSTOMER", "STATUS"], from: 14, to: 15, hex: "C9"}
        ])
]);

/** Stage 2: groups and inaccessible FILLER. Two 21-byte EBCDIC records. */
export const customerNested = customerFixture("customer-nested", [
    "01 CUSTOMER.",
    "   05 CUSTOMER-ID PIC 9(4).",
    "   05 CONTACT.",
    "      10 FIRST-NAME PIC X(6).",
    "      10 LAST-NAME PIC X(8).",
    "   05 FILLER PIC X(2).",
    "   05 STATUS PIC X."
].join("\n"), customerNestedProjection, [
    record("Alice Smith", 21,
        // 1001 | ALICE_ | SMITH___ | FILLER(2) | A
        "F1 F0 F0 F1  C1 D3 C9 C3 C5 40  E2 D4 C9 E3 C8 40 40 40  40 40  C1", [
            {path: ["CUSTOMER", "CUSTOMER-ID"], from: 0, to: 4, hex: "F1 F0 F0 F1"},
            {path: ["CUSTOMER", "CONTACT", "FIRST-NAME"], from: 4, to: 10, hex: "C1 D3 C9 C3 C5 40"},
            {path: ["CUSTOMER", "CONTACT", "LAST-NAME"], from: 10, to: 18, hex: "E2 D4 C9 E3 C8 40 40 40"},
            {path: ["CUSTOMER", "STATUS"], from: 20, to: 21, hex: "C1"}
        ]),
    record("Bob Jones", 21,
        "F2 F0 F0 F2  C2 D6 C2 40 40 40  D1 D6 D5 C5 E2 40 40 40  40 40  C9", [
            {path: ["CUSTOMER", "CUSTOMER-ID"], from: 0, to: 4, hex: "F2 F0 F0 F2"},
            {path: ["CUSTOMER", "CONTACT", "FIRST-NAME"], from: 4, to: 10, hex: "C2 D6 C2 40 40 40"},
            {path: ["CUSTOMER", "CONTACT", "LAST-NAME"], from: 10, to: 18, hex: "D1 D6 D5 C5 E2 40 40 40"},
            {path: ["CUSTOMER", "STATUS"], from: 20, to: 21, hex: "C9"}
        ])
]);

/** Stage 3: generated SYNCHRONIZED padding. COMP bytes are literal and not decoded. */
export const customerAligned = customerFixture("customer-aligned", [
    "01 CUSTOMER.",
    "   05 CUSTOMER-ID PIC X(3).",
    "   05 BALANCE PIC S9(9) COMP SYNCHRONIZED.",
    "   05 STATUS PIC X."
].join("\n"), customerAlignedProjection, [
    record("Positive", 9,
        // A01 | padding 00 | big-endian COMP +1 | A
        "C1 F0 F1  00  00 00 00 01  C1", [
            {path: ["CUSTOMER", "CUSTOMER-ID"], from: 0, to: 3, hex: "C1 F0 F1"},
            {path: ["CUSTOMER", "BALANCE"], from: 4, to: 8, hex: "00 00 00 01"},
            {path: ["CUSTOMER", "STATUS"], from: 8, to: 9, hex: "C1"}
        ]),
    record("Negative", 9,
        // B02 | padding 00 | big-endian COMP -1 | I
        "C2 F0 F2  00  FF FF FF FF  C9", [
            {path: ["CUSTOMER", "CUSTOMER-ID"], from: 0, to: 3, hex: "C2 F0 F2"},
            {path: ["CUSTOMER", "BALANCE"], from: 4, to: 8, hex: "FF FF FF FF"},
            {path: ["CUSTOMER", "STATUS"], from: 8, to: 9, hex: "C9"}
        ])
]);

/** Stage 4: fixed OCCURS and REDEFINES within the repeated occurrence body. */
export const customerFixedOccurs = customerFixture("customer-fixed-occurs", [
    "01 CUSTOMER.",
    "   05 CUSTOMER-ID PIC 9(4).",
    "   05 TELEPHONES OCCURS 2 TIMES.",
    "      10 PHONE-RAW PIC X(6).",
    "      10 PHONE-PARTS REDEFINES PHONE-RAW.",
    "         15 PHONE-KIND PIC X.",
    "         15 PHONE-NUMBER PIC X(5).",
    "   05 STATUS PIC X."
].join("\n"), customerFixedOccursProjection, [
    record("Alice", 17,
        // 1001 | home | mobile | A
        "F1 F0 F0 F1  C8 F1 F2 F3 F4 F5  D4 F6 F7 F8 F9 F0  C1", [
            {path: ["CUSTOMER", "CUSTOMER-ID"], from: 0, to: 4, hex: "F1 F0 F0 F1"},
            {path: ["CUSTOMER", "TELEPHONES", 0, "PHONE-RAW"], from: 4, to: 10, hex: "C8 F1 F2 F3 F4 F5"},
            {path: ["CUSTOMER", "TELEPHONES", 0, "PHONE-PARTS", "PHONE-KIND"], from: 4, to: 5, hex: "C8"},
            {path: ["CUSTOMER", "TELEPHONES", 1, "PHONE-PARTS", "PHONE-NUMBER"], from: 11, to: 16, hex: "F6 F7 F8 F9 F0"},
            {path: ["CUSTOMER", "STATUS"], from: 16, to: 17, hex: "C1"}
        ]),
    record("Bob", 17,
        "F2 F0 F0 F2  E6 F5 F4 F3 F2 F1  C2 F1 F1 F2 F2 F3  C9", [
            {path: ["CUSTOMER", "CUSTOMER-ID"], from: 0, to: 4, hex: "F2 F0 F0 F2"},
            {path: ["CUSTOMER", "TELEPHONES", 0, "PHONE-PARTS", "PHONE-KIND"], from: 4, to: 5, hex: "E6"},
            {path: ["CUSTOMER", "TELEPHONES", 1, "PHONE-RAW"], from: 10, to: 16, hex: "C2 F1 F1 F2 F2 F3"},
            {path: ["CUSTOMER", "STATUS"], from: 16, to: 17, hex: "C9"}
        ])
]);

/**
 * Stage 5: legal fixed-position controller + ODO + REDEFINES inside the ODO body.
 * The overlay is *inside* PURCHASES; no direct REDEFINES participant declares ODO.
 * The two records exercise zero and maximum active occurrences.
 */
export const customerOdoRedefines = customerFixture("customer-odo-redefines", [
    "01 CUSTOMER.",
    "   05 ITEM-COUNT PIC 9.",
    "   05 CUSTOMER-ID PIC 9(4).",
    "   05 CUSTOMER-NAME PIC X(8).",
    "   05 PURCHASES OCCURS 0 TO 3 TIMES DEPENDING ON ITEM-COUNT.",
    "      10 PURCHASE-RAW PIC X(3).",
    "      10 PURCHASE-PARTS REDEFINES PURCHASE-RAW.",
    "         15 SKU PIC X(2).",
    "         15 QUANTITY PIC 9.",
    "   05 STATUS PIC X."
].join("\n"), customerOdoProjection, [
    record("No purchases", 14,
        // count 0 | 1001 | ALICE___ | A
        "F0  F1 F0 F0 F1  C1 D3 C9 C3 C5 40 40 40  C1", [
            {path: ["CUSTOMER", "ITEM-COUNT"], from: 0, to: 1, hex: "F0"},
            {path: ["CUSTOMER", "CUSTOMER-ID"], from: 1, to: 5, hex: "F1 F0 F0 F1"},
            {path: ["CUSTOMER", "CUSTOMER-NAME"], from: 5, to: 13, hex: "C1 D3 C9 C3 C5 40 40 40"},
            {path: ["CUSTOMER", "STATUS"], from: 13, to: 14, hex: "C1"}
        ], 0),
    record("Three purchases", 23,
        // count 3 | 2002 | BOB_____ | AB1 CD2 EF3 | I
        "F3  F2 F0 F0 F2  C2 D6 C2 40 40 40 40 40  C1 C2 F1  C3 C4 F2  C5 C6 F3  C9", [
            {path: ["CUSTOMER", "ITEM-COUNT"], from: 0, to: 1, hex: "F3"},
            {path: ["CUSTOMER", "CUSTOMER-ID"], from: 1, to: 5, hex: "F2 F0 F0 F2"},
            {path: ["CUSTOMER", "CUSTOMER-NAME"], from: 5, to: 13, hex: "C2 D6 C2 40 40 40 40 40"},
            {path: ["CUSTOMER", "PURCHASES", 0, "PURCHASE-RAW"], from: 13, to: 16, hex: "C1 C2 F1"},
            {path: ["CUSTOMER", "PURCHASES", 1, "PURCHASE-PARTS", "SKU"], from: 16, to: 18, hex: "C3 C4"},
            {path: ["CUSTOMER", "PURCHASES", 2, "PURCHASE-PARTS", "QUANTITY"], from: 21, to: 22, hex: "F3"},
            {path: ["CUSTOMER", "STATUS"], from: 22, to: 23, hex: "C9"}
        ], 3)
]);

export const customerFixtures: readonly CustomerFixture[] = [
    customerSimple, customerNested, customerAligned, customerFixedOccurs, customerOdoRedefines
];
