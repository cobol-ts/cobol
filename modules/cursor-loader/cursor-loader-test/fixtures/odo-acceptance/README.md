# ODO acceptance fixtures — constructed, not external

These files are minimal **test-authored** CP037 byte sequences. They are not claimed to be original mainframe datasets and are not checked against a third-party output oracle. They exercise future record framing through the same public `readCobolFile` API. Encoding used Python's standard-library `cp037` codec, not the implementation under test.

* `active-shift.fb` is 12 bytes containing three records: `0Z` (2 bytes), `2AABBY` (6 bytes), and `1CCX` (4 bytes). The count determines the active stored extent and hence the start of the next record.
* `reserved-max.fb` is 16 bytes containing two FB/8 records: `0      Z` and `2AABB  Y`. Space is reserved for three 2-byte occurrences even when fewer are active; the trailer remains at byte 7 in each record.

The tests are marked `test.failing` because `readCobolFile` currently delegates to `createCobolDecodedFixedDetails`, which refuses symbolic ODO record lengths. A passing implementation of either scenario should make its test fail under Jest's inverted `test.failing` expectation. At that point, change the test to normal `test`, and expose any required framing policy in the public reader.

**These are two distinct physical storage contracts.** Do not make the fixed-reserved test pass by silently treating the file as variable-size, or vice versa. Neither test assumes a generic RDW; RDW-framed V/VB can be a third acceptance dataset once genuine RDW bytes and copybook are available.
