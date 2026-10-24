# Independent AWS CardDemo integration corpus

Source: https://github.com/aws-samples/aws-mainframe-modernization-carddemo
Pinned revision: `59cc6c2fd7ebd7ef7925cad552a01a4b8b6e4d5e` (the same revision already documented by the project's layout test corpus).

The source repository includes original EBCDIC fixed-block record samples, COBOL copybooks and fixed-width ASCII counterparts. We deliberately **do not** reconstruct EBCDIC by encoding the ASCII examples; this would contaminate the decoding test's independence.

From `modules/cursor-loader/cursor-loader-test`, run:

```sh
node scripts/fetch-carddemo-fixtures.mjs
```

The script fetches the original bytes and copybooks from that upstream revision, checks that binary lengths are exact multiples of the published FB record lengths, checks for Git LFS pointers, and writes `manifest.json` with SHA-256 and original source URLs. The Jest suite reads these fixtures offline. Without `manifest.json`, the external CardDemo suite **fails** with an explicit setup error telling you to run the fetch script; it is never silently skipped.

The first tests decode up to 10 records each from four files, at several physical-buffer sizes, and compare **selected fields** against the independently supplied ASCII data. The ASCII counterpart is not assumed to have the same trailing FILLER length as its EBCDIC source, so comparisons are made on corresponding fields. This is narrower than the AWS Employee's complete CSV oracle; errors in the ASCII alignment are revealed as failed assertions rather than being adjusted silently.

If upstream filenames or data conventions change, the fetch script intentionally errors rather than guessing. No network activity occurs in `yarn test`.
