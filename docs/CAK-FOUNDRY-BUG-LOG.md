**Readability note:** I ran this document through an “explain like I am five” chatbot to improve readability, explainability, and usability. The chatbot helped present the material; it did not originate Aurora Forge, DataCtrlLink, their functionality, or the underlying development work.

# Aurora CAK Foundry bug ledger

This ledger records confirmed Aurora CAK Foundry defects, their user impact, root cause, correction, repair path, and verification status. A fix is not considered release-ready until compiled extraction and rebuild tests pass against every supported WWE 2K26 build.

## Independent-evidence rule

- Filename recovery must use the developer's game installations, game-owned metadata, and Aurora Forge's independently written CAK implementation.
- Third-party modding tools are not implementation dependencies and are not used to derive or validate Aurora CAK Foundry behavior.
- Hashes are not treated as reversible names. A filename remains unresolved until direct game evidence proves its path and extension.

## Release-blocking defects

### AFCAK-001 — Full extraction did not load the bundled filename catalog

- **Status:** Fix implemented; full extraction/rebuild verification pending.
- **Discovery:** A full original-release extraction produced paths such as `Unresolved/bakedfile80/folder_000005_516d19422537b595/file_000001_0585ad6956507252.bin`, even though the bundled catalog already mapped that hash to `Arena/Commonness/Ring_Mat/Black_Dirty/Textures/ring_mat_nrm.dds`.
- **User impact:** The full-extraction output contained generated hash filenames instead of genuine virtual paths and extensions. The result preserved bytes and hashes but was not usable as a normal extracted game tree and wrongly appeared complete.
- **Scope:** The standalone batch script `scripts/extract-all-2k26-caks.js`. The normal GUI archive reader already loaded `app/data/cak-known-paths.json`; the new batch path did not.
- **Root cause:** The batch script called `openArchive(archivePath, {})`, explicitly passing an empty dictionary and bypassing the completed filename catalog.
- **Triggering change:** Extract All was expanded from resolved entries to every stored payload without first enforcing complete real-name coverage.
- **Correction:** The batch script now loads the bundled catalog and fails closed if that catalog is absent or empty. GUI Extract All now preflights every CAK and refuses to write payloads if any stored payload is unresolved or any archive fails validation.
- **Output correction:** Extract All now targets one merged output folder representing game `/root`, rather than archive-named `Payloads/Unresolved` trees. Verified archive order controls same-path winners.
- **Existing-output repair:** `scripts/repair-extracted-cak-paths.js` can relabel already-decoded files by verified archive ID/hash without decompressing them again. It refuses overwrites and does not alter game files.
- **Regression checks required:** Verify that the two reported hashes resolve to `ring_mat_color.dds` and `ring_mat_nrm.dds`; verify 100% path coverage before extraction; verify no `Unresolved` output is created by Extract All; verify merged-path collision reporting; and verify extraction → rebuild → reopen returns every tested payload byte-for-byte under its original hash.
- **Current evidence:** The two reported bakedfile80 hashes resolve correctly. Preflight and full merged extraction report 412,095 of 412,095 stored payloads named for current v1.16, across all 15 archives, with zero extraction failures. A representative real-install rebuild/reopen covers all five storage profiles and verifies preserved file/folder hashes plus payload bytes. A full 379 GB whole-game repack is intentionally not a release gate; release verification uses complete extraction plus representative rebuild coverage.

### AFCAK-002 — Long extraction had no live progress display

- **Status:** Fix implemented; packaged UI verification pending.
- **Discovery:** Large extraction jobs could appear frozen until an entire helper request completed.
- **User impact:** Users could not see current archive, processed/total files, percentage, successes, or failures.
- **Root cause:** The GUI sent archive-sized requests and exposed no bounded progress events to the renderer.
- **Correction:** Extraction is divided into bounded 500-file batches. The renderer receives scoped progress events and displays a progress bar with percentage, current archive, processed/total files, successes, and failures.
- **Verification required:** Launch the packaged Foundry from a clean folder and confirm visible progress advances during a real multi-batch extraction.

### AFCAK-003 — The reader ignored the reversible native CAK name table

- **Status:** Fix implemented; complete endpoint verification pending.
- **Discovery:** Every file and folder record carries a string-table offset, but the reader validated that offset without decoding or using the referenced name record.
- **User impact:** Aurora depended too heavily on a bundled catalog and could mislabel new or version-exclusive content as unresolved even when its name was stored in the CAK itself.
- **Root cause:** The baker implemented the game format's reversible name-table transform, while the reader implemented only the outer catalog transform and hash tables.
- **Correction:** The reader now performs the inverse name-table transform, reads native folder paths and file leaves, reconstructs full paths, and accepts each result only when its lowercase path reproduces the stored FNV-1a 64-bit hash. Extract All builds a cross-archive native dictionary before opening its final sessions because some secondary CAKs intentionally omit names supplied by another game CAK.
- **Verification evidence:** Native decoding plus the existing verified fallback catalog names every stored endpoint payload: 386,052/386,052 for the original release and 412,095/412,095 for current v1.16, with zero unresolved stored payloads.
- **Remaining release gate:** Keep the complete merged-root extraction and collision report passing on supported endpoints, and retain representative manifest-preserving rebuild/reopen coverage across every storage profile. A whole-game repack is not required.

### AFCAK-004 — Some valid output filenames produced a 31-byte key seed

- **Status:** Fixed and covered by a regression test.
- **Discovery:** Building a CAK could stop with `The WWE 2K26 key hash requires a 32-byte seed table.`
- **User impact:** A user could extract normally but be unable to rebuild solely because of the chosen output filename.
- **Root cause:** The first lane of the v9.9 filename-derived seed is a 64-bit hexadecimal value. JavaScript hexadecimal conversion removed a leading zero for some filenames, shortening the fixed 32-byte ASCII seed to 31 bytes.
- **Correction:** The 64-bit lane is now explicitly left-padded to all 16 hexadecimal characters before the remaining two 8-character lanes are appended.
- **Verification evidence:** `mod23.cak` reproduces the former leading-zero failure. It now derives the stable key `f755512d`; the baker then rebuilds, reopens, and recovers every protected test payload byte-for-byte.

## Verification rule

Aurora CAK Foundry must not describe a build as fully supported unless every root game CAK validates, every physically stored payload has its genuine virtual path, decoded output is byte-verified, and representative rebuilt test archives covering every storage profile reopen with matching hashes and payload bytes. A full whole-game repack is not required when complete extraction and representative round-trip coverage are both passing.
