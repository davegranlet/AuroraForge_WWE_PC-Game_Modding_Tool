# Aurora Forge 1.6.0.m — Prompt Builder Edition

Aurora Forge is a WWE 2K26 prompt-building and workflow-preparation workspace. It helps a user turn project choices into a detailed prompt and supporting handoff pack. The user chooses where to use that prompt; Aurora Forge does not act as the AI that creates the final artwork.

## Changes in this release

- Reframed the home screen, About page, navigation, menu, manifest, and portable instructions around the prompt-generator purpose.
- Renamed the primary creation area from **Creative Studios** to **Prompt Builders**.
- Added a complete in-app FAQ explaining what Aurora Forge does, what it does not do, and how exported prompts are used.
- Added visible prompt review and copy/export controls to the Luchador Mask and Face Texture workflows.
- Improved clipboard failure handling in active studio workflows.
- Removed the unrelated **100% NOT Tribute** preview and its dedicated assets from this release. The original handoff archive remains unchanged and preserves those files.
- Replaced confusing “new chat” wording with provider-neutral language such as “your chosen compatible AI.”
- Added a native Linux x64 build.
- Added Linux capability detection. Windows-only DirectXTex conversion and Oodle-based extraction are disabled with a clear explanation; the rest of the workspace remains available.
- Fixed final ZIP checksum generation on PowerShell environments without `Get-FileHash`.

## Platform packages

- Windows x64: extract the ZIP and run `Aurora Forge.exe`.
- Linux x64: extract the tarball and run `./Aurora Forge`.

## Verification

- Source/package verification: passed.
- JavaScript syntax checks: passed.
- Dependency audit: 0 known vulnerabilities.
- Real DDS PNG → BC7 DDS → PNG round-trip: passed on Windows.
- Real CAK extraction fixtures, stored and compressed: passed on Windows.
- Windows portable package structure and contents: passed.
- Linux archive executable permissions and package structure: passed.

## Linux limitations

The prompt builders, projects, local saving/export, documentation, validation guidance, and read-only CAK catalog browsing/search are native Linux features. DirectXTex `texconv` and the WWE/Oodle extraction path depend on Windows-native binaries, so DDS conversion and CAK extraction remain available only in the Windows build.
