# Additional COBOL integration tests — incremental files

Copy the contained `modules/cursor-loader/cursor-loader-test` files into the same path in your repository. This is an additive patch; it does not touch packages you removed, the cursor, layout compiler or codecs.

1. Run `node modules/cursor-loader/cursor-loader-test/scripts/fetch-carddemo-fixtures.mjs` with Internet access to fetch **original** AWS CardDemo EBCDIC files, their ASCII counterparts and COBOL copybooks at the pinned Git revision. The fetcher creates an integrity manifest. (This environment could not retrieve the upstream binary assets, so they are deliberately not fabricated or bundled.)
2. Run `yarn test` in `modules/cursor-loader/cursor-loader-test` to exercise the four new external datasets alongside existing AWS Employee tests. The CardDemo suite is skipped if you haven't fetched it.
3. The two ODO acceptance tests use explicit test-authored CP037 fixtures. Both are tagged `test.failing`: they specify current gaps without keeping all Jest tests red. When support is implemented, remove `.failing` as appropriate.

Caveat: expected CardDemo comparisons are based on field slices of the upstream ASCII files; source alignment hasn't been executable-verified here since binary downloads were unavailable. If a mismatch appears, inspect the source ASCII and copybook before changing the expected values.
