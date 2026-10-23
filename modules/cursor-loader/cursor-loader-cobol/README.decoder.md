# Fixed-record decoded-value integration (23 October 2026)

The production opt-in details constructors `createCobolDecodedFixedDetails` and
`createCobolDecodedProjectionDetails` use `@cobol-ts/codec`. They preserve
original bytes, compiled geometry, pooled state, nested arrays, ODO count
resolution, and the existing projection lifetime model.

During selected projection-path compilation, a field's PICTURE, effective
inherited USAGE, sign and compiled field width are used to compile a decoder
exactly once per stable compiled elementary node. On every scalar access the
existing `fieldRange()` finds the current geometry and a *pooled* fragmented
byte cursor decodes the borrowed range. This decoder does not receive a
contiguous copy and works when even individual field bytes are in different
buffers. For now, `createCobolFixedDetails` / `createCobolProjectionDetails`
keep their diagnostic-range values, for compatibility with existing detailed
geometry tests.

The decoded FB test uses actual original EBCDIC hex fixture bytes,
`createFileCursor()`, a real compiled copybook and 3-byte physical reads. Other
decoded cases exercise COMP signed negative values across buffer boundaries,
fixed OCCURS/REDEFINES and nested three-level ODO with a split scalar field.
A zero-byte phantom record at exact-buffer EOF was also corrected in the
generic record cursor; the new FB test is its regression oracle.

This is **a first decoded-value milestone, not all possible COBOL encodings**.
Only the documented subset in `@cobol-ts/codec/README.md` has production
decoders. In particular source compiler conventions, code pages and decimal
precision must be agreed before accepting real client data. ODO test fixtures
are bound completed records, not variable-record file-framing integration.
