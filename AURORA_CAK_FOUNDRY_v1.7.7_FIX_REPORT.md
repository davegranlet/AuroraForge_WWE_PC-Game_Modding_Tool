**Readability note:** I ran this document through an “explain like I am five” chatbot to improve readability, explainability, and usability. The chatbot helped present the material; it did not originate Aurora Forge, DataCtrlLink, their functionality, or the underlying development work.

# Aurora CAK Foundry v1.7.7 fix and verification report

## ACF-177-001 fixed

Added an explicit FDIR 9.3 backend and game detection. The 9.9 reader remains separate and unchanged.

Verification: all 15 WWE 2K25 v1.23 archives opened; 386,873 files and 93,738 folders parsed; 0 archive failures.

## ACF-177-002 fixed

The 9.3 backend exports decoded native catalog names directly to Foundry. Extract All never substitutes invented filenames.

Verification: 386,873 of 386,873 entries resolved; `bakedfile02.cak` extracted 53 of 53 named files with 0 failures.

## ACF-177-003 fixed

The 9.3 builder explicitly excludes both Foundry bookkeeping files.

Verification: a source containing both bookkeeping files rebuilt with one intended payload; the catalog contained exactly one payload.

## ACF-177-004 fixed

The raw 9.3 build path now preserves a supplied `_textures.tdb`; automatic generation remains available for the DDS conversion workflow when no database was supplied.

## Rebuild verification

A representative named WWE 2K25 payload was built, reopened, extracted, and compared with SHA-256. Source and recovered hashes matched. In-game acceptance remains **Experimental** pending a user mount test.
