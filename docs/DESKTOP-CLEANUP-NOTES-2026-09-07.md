# Aurora Forge Desktop Cleanup Notes

Updated: September 7, 2026

This is an internal cleanup note. It does not need the public readability notice.

## What Changed

- Historical `portable-release` contents were moved out of the active desktop repo and preserved locally under the workspace release archive.
- Generated `build` and `dist` directories were moved out of the active desktop repo and preserved locally under the workspace release archive.
- The untracked generated `app/tools/cak-v93` runtime was moved out of the active desktop repo.
- The untracked generated `third_party/Nenkai-Bakery/CakeTool/bin` and `obj` outputs were moved out of the active desktop repo.
- `.gitignore` now excludes generated third-party build outputs, generated CAK runtime output, PDBs, and local PAC request files.

## Size Result

The active desktop folder dropped from roughly 6.6 GB of local folders to roughly 520 MB.

Remaining large tracked areas:

- `tools`: mostly helper source/build support and tracked helper binaries.
- `app`: user-facing assets, known path catalogs, tutorials, bundled helper executables, and UI source.
- `node_modules`: local dependency install, ignored by Git.

## Next Cleanup Gate

The next size reduction should be architectural, not just file cleanup:

- Replace duplicated bundled helper runtimes with release-time fetch/copy steps from the standalone projects.
- Keep Aurora CAK Foundry, DDS Converter, PAC research, and addon loaders as separate source repositories.
- Let the desktop app consume versioned standalone outputs at packaging time instead of carrying duplicate generated tool folders.
- Keep research scripts and source under the owning standalone/research repositories, then link to them from desktop docs.

## Do Not Commit

- WWE game files.
- Oodle.
- Extracted game assets.
- Captured runtime data.
- Decompiler projects.
- Local path inventories.
- Historical release ZIPs.
- Generated build/staging folders.
