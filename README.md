# Aurora Forge

Build instructions: see [BUILDING.md](BUILDING.md).

Aurora Forge is a local WWE 2K26 prompt generator and workflow-preparation workspace.

You choose or describe what you want to create. Aurora Forge turns those choices into structured instructions, reference notes, project files, and handoff packs. You then decide which compatible AI or image tool will carry out the request.

**Aurora Forge prepares the instructions. Your chosen AI executes them.**

It is not an AI chatbot, does not automatically send prompts to an AI provider, and is not a research product.

## Main capabilities

- Guided prompt builders for WWE 2K26 characters, faces, masks, tattoos, gear, logos, belts, arenas, entrances, materials, factions, and cleanup workflows
- Editable prompt review, copy, download, project JSON, and handoff-pack workflows
- Local project organization and save/load tools
- WWE 2K26 workflow guidance and validation references
- Read-only CAK catalog browsing and Windows extraction support
- Checksum-verified mod-project repackaging on Windows and Linux
- Windows DDS conversion through Microsoft DirectXTex
- Native Windows x64 and Linux x64 desktop packages

## Development

Requirements: Node.js 24 or a compatible current Node.js release and npm.

```text
npm ci
npm run verify
npm run verify:repack
```

Windows-specific native verification:

```text
npm run verify:dds
npm run verify:cak
```

Build packages:

```text
npm run build:portable
npm run build:linux
```

## Platform notes

The Linux edition natively supports prompt building, projects, saving/export, references, validation guidance, CAK catalog browsing/search, and portable mod-project repackaging. DDS conversion and Oodle-based CAK extraction remain Windows-only because their underlying helper binaries are Windows-native.

Aurora Forge is open source under the MIT License. The Windows extraction helper is built from the source in `tools/AuroraCakHelper/`; the game-owned decompression library is never bundled.

See [RELEASE_NOTES_1.7_MAJOR_RC1.md](RELEASE_NOTES_1.7_MAJOR_RC1.md) and [FAQ.md](FAQ.md) for the current release details.
