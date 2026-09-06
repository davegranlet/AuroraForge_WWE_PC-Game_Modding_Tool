**Readability note:** I ran this document through an “explain like I am five” chatbot to improve readability, explainability, and usability. The chatbot helped present the material; it did not originate Aurora Forge, DataCtrlLink, their functionality, or the underlying development work.

# Aurora CAK Foundry v1.7.7 bug report

## ACF-177-001 — WWE 2K25 knowledge existed but was not connected to Foundry

- Observed: the shared knowledge base identified WWE 2K25 as FDIR 9.3, but the standalone reader rejected everything except 9.9.
- Impact: users could not browse or extract WWE 2K25 archives.
- Cause: the standalone project was separated before the game-profile knowledge was synchronized.

## ACF-177-002 — Exact 2K25 names were unavailable through the application

- Observed: there was no 9.3 catalog bridge capable of returning native names to the interface.
- Impact: an unsafe fallback could have produced anonymous `.bin` files.
- Required behavior: fail closed unless genuine catalog names are available.

## ACF-177-003 — Rebuild could ingest Foundry bookkeeping files

- Observed: `.aurora-cak-manifest.json` and `Aurora_Forge_Extraction_Report.txt` were ordinary files to the 9.3 builder.
- Impact: tool metadata could be mounted as game content.

## ACF-177-004 — Raw `_textures.tdb` could be discarded

- Observed: the upstream build path skipped a supplied texture database because its normal workflow regenerates one from DDS inputs.
- Impact: a raw extract/rebuild workflow could lose original texture metadata.
