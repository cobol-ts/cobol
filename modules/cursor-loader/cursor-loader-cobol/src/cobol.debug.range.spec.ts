import {cobolDebugRangeFromBits, cobolDebugRangeNumber, cobolDebugRangeString} from "./cobol.debug.range";
import type {ProjectionPhysicalRecord} from "@cobol-ts/cursor-loader-types";

function record(startByte: number, endByte: number): ProjectionPhysicalRecord {
    return {
        buffers: [Uint8Array.from([0xaa, 0xbb, 0xcc]), Uint8Array.from([0xdd, 0xee, 0xff])],
        startByte, endByte, lastValidByte: 6,
        source: "fixture.bin", recordNumber: 1
    };
}

test("debug number encodes exclusive byte positions in two unsigned 16-bit halves", () => {
    expect(cobolDebugRangeNumber({from: 10, to: 14})).toBe(10 * 65536 + 14);
    expect(cobolDebugRangeNumber({from: 0, to: 65535})).toBe(65535);
    expect(() => cobolDebugRangeNumber({from: 0, to: 65536})).toThrow(/16-bit/);
});

test("string debug output respects record start and crosses buffer boundaries", () => {
    // Record is logical bytes 1..5; selected field bytes 1..3 inside that record.
    expect(cobolDebugRangeString(record(1, 5), {from: 1, to: 3}))
        .toBe("1/3/cc dd");
});

test("refuses to read beyond a record even when following bytes are in the buffer", () => {
    expect(() => cobolDebugRangeString(record(1, 4), {from: 0, to: 4}))
        .toThrow(/beyond/);
});

test("does not silently round bit offsets into bytes", () => {
    expect(cobolDebugRangeFromBits(80, 32)).toEqual({from: 10, to: 14});
    expect(() => cobolDebugRangeFromBits(81, 32)).toThrow(/byte-aligned/);
});
