# ODO physical framing acceptance fixtures

These binary fixtures are **test-authored CP037 source bytes**, not externally obtained mainframe records. None is encoded by the production COBOL codec. The AWS Employee/CardDemo tests remain our independent external oracles.

* `ODO.cpy` has a one-digit count, 0–3 two-byte items, and a trailing one-byte field.
* `active-shift.rdw` contains three unblocked, RDW-prefixed records. Their RDW bytes are `00 06 00 00`, `00 0a 00 00` and `00 08 00 00`. The COBOL payloads are the original `active-shift.fb` slices: `0Z`, `2AABBY`, `1CCX`. Total physical size is 24 bytes; no RDW is part of the COBOL layout.
* `reserved-max.fb` contains two FB/8 records; each reserves 3 × 2 bytes irrespective of the active count. The trailing field remains at offset 7, not immediately after active items.
* `invalid-length.rdw`, `truncated-header.rdw`, `truncated-payload.rdw` and `unsupported-control.rdw` drive negative framing cases.

`active-shift.fb` is kept as the original unframed 12-byte data reference; the production `rdw` reader does **not** accept it as an RDW stream.

Every acceptance test uses ordinary Jest `test()`, never `test.failing()` or conditional skipping. Reader framing is explicit: `{kind:'rdw'}` or `{kind:'fixed',recordLength:8}`. Other integrations omit framing and continue using constant compiled FB lengths.
