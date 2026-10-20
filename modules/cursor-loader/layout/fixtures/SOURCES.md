# Published COBOL acceptance fixtures

These are COBOL layout examples **transcribed from publicly visible documentation** (not a downloaded upstream repository snapshot). IBM's first fragment consists of 05-level items, so a single `01 EXAMPLE-RECORD.` wrapper was added to form a standalone copybook. `ibm-zos-error-messages.cpy` turns IBM's split `VALUE` lines into one line per entry without changing storage clauses. The AWS layout matches the sample record described in the project's documentation; whitespace has been normalised. Preserve the original public links when incorporating these fixtures.

| File | Public source | Role |
| --- | --- | --- |
| `ibm-redefinition-example.cpy` | https://www.ibm.com/docs/en/i/7.4?topic=clause-redefinition-process | Two views of six shared bytes followed by a four-byte sequential field; **positive** |
| `ibm-zos-error-messages.cpy` | https://www.ibm.com/docs/en/cobol-zos/6.4?topic=table-example-perform-indexing | Eight 25-byte FILLER message entries with literal values; **positive** |
| `aws-rec-outfile.cpy` | https://github.com/aws-samples/mainframe-data-utilities/blob/main/docs/99-README-v1.md | AWS-supplied mainframe test layout with PIC editing, COMP, COMP-3, OCCURS and REDEFINES; **intentionally red** until `PIC -9(18)` is sized |

Expected complete record sizes are determined independently of the compiler: 10 bytes, 200 bytes and 150 bytes respectively.

## Scope and limitations

- These are published **examples**, not evidence that the original COBOL source was compiled here on IBM z/OS.
- The first two positive tests are full parser → compiler → indexed locator tests, not byte-decoding/projection tests. The synthetic 10-byte buffer confirms slices in the IBM overlay example; it is not an IBM-provided binary record.
- The AWS example is a full published layout **excerpt**, not the raw `LegacyReference/COBPACK2.cpy` file; its unsupported edited PICTURE is a real reader coverage gap.
- The full Jest suite was not runnable from the user's ZIP because the archive omits several local workspace dependencies. The separate manual verification of the positive fixtures used the actual parser, layout compiler, evaluator and locator TypeScript source with temporary stand-ins for the missing `errors`, `trees` and `partial_functions` packages. Run this Jest spec in the complete repository to remove that qualification.
- **Next acceptance level:** fetch the original `.cpy` and accompanying EBCDIC binary fixtures at the listed upstream repositories; compile the entire source without manual rewriting, then check actual offsets and decoded values against independently supplied output.

### Diagnostic result from the supplied archive

On the unmodified `defaultCobolPrimitiveSizer`, the full AWS fixture fails at `PIC -9(18)`. Using `CobolLayoutOptions.primitiveSizer` to supply just that field's independent 152-bit display width, the original full layout compiles to **1200 bits (150 bytes)** and passes the independently calculated positions of both overlap branches, the repeated field, binary fields and packed fields. The regression suite includes both an intentionally failing default-configuration acceptance case and a currently passing adapter-isolation case. This separates missing format coverage from a geometry defect.
