**Readability note:** I ran this document through an “explain like I am five” chatbot to improve readability, explainability, and usability. The chatbot helped present the material; it did not originate Aurora Forge, DataCtrlLink, their functionality, or the underlying development work.

# Aurora CAK Foundry changelog

## Current verification status — release blockers cleared

- Fixed a filename-dependent rebuild failure where a leading zero was dropped from WWE 2K26's fixed 32-byte v9.9 key seed.
- Added a regression vector for the affected filename shape and reran protected CAK build, reopen, and byte-for-byte payload verification.

- Complete merged-root extraction is verified on the current v1.16 installation at `D:\games\WWE 2K26`: 15/15 archives, 412,095 stored payloads, 279 zero-payload references, 0 failures, and 96,368 deterministic collision records.
- Representative real-install rebuild/reopen verification passes for every supported storage profile, including preserved file/folder hashes and byte-for-byte payload recovery.
- A full whole-game repack is intentionally not required. Repacking the 379 GB merged tree would add storage and time cost without increasing the proven coverage of the format boundary.
- The extractor's remaining work is release polish and repeatability, not an unresolved extraction or round-trip blocker.

## Next corrective update — native filename recovery

- Added independent decoding for the reversible filename table stored inside WWE 2K26 CAKs.
- Added hash-gated reconstruction: a native path is accepted only when it reproduces the archive's stored 64-bit path hash.
- Added cross-archive name recovery for secondary CAKs that omit names supplied by another bakedfile.
- Confirmed complete preflight name coverage for the original release (386,052/386,052 stored payloads) and current v1.16 (412,095/412,095 stored payloads).
- Changed full extraction to one merged folder representing game `/root`, with numeric bakedfile order and later-archive collision winners recorded.
- Preserved a hidden extraction manifest so `.tex`-hashed DDS output and other original identities can be rebuilt correctly.
- Verified the current v1.16 installation's complete merged extraction: 15/15 archives, 412,095 stored payloads, 279 zero-payload references, 0 extraction failures, and 96,368 deterministic same-path collision records.
- Added a real-install representative round-trip gate covering compressed/protected single- and multi-chunk payloads plus stored/plain, stored/protected, and stored/multi payloads. The rebuilt sample reopened with preserved file/folder hashes and byte-verified payloads. A full 379 GB whole-game repack is intentionally not required for release verification.

## Next corrective update — In development

### Fixed

- Full extraction now loads the bundled real-path catalog instead of passing an empty dictionary.
- Extract All fails before writing files when filename coverage is below 100% or any archive is rejected.
- Full-game extraction writes one merged folder representing game `/root`.
- Added safe repair support for already-decoded hash-named output.
- Added live extraction progress with percentage, current archive, totals, successes, and failures.

### Verification status

- Original release: all 15 root CAKs validate; all 386,052 stored payload records have resolved paths after cross-archive native decoding and verified-catalog fallback.
- v1.14: all 15 root CAKs validate; all 407,815 stored payload records have resolved paths.
- Current v1.16: all 15 root CAKs validate; all 412,095 stored payload records have resolved paths after cross-archive native decoding and verified-catalog fallback.
- Real named extraction passes on stored and compressed payloads from the original release.
- Protected CAK rebuild/reopen validation passes with byte-for-byte payload recovery.
- Full merged-root extraction and representative endpoint rebuild verification are cleared. A whole-game repack remains intentionally out of scope; only bounded test chunks are required for release verification.

See `CAK-FOUNDRY-BUG-LOG.md` for defect-level evidence and remaining release blockers.
