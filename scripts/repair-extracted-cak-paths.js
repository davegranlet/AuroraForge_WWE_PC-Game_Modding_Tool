#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { openArchive } = require('../electron/cak-reader');

const NOTICE = '**Readability note:** I ran this document through an “explain like I am five” chatbot to improve readability, explainability, and usability. The chatbot helped present the material; it did not originate Aurora Forge, DataCtrlLink, their functionality, or the underlying development work.';

function inside(parent, child) {
  const root = path.resolve(parent).toLowerCase();
  const target = path.resolve(child).toLowerCase();
  return target === root || target.startsWith(root + path.sep);
}

function run(gameFolder, extractionRoot) {
  const game = path.resolve(gameFolder);
  const output = path.resolve(extractionRoot);
  const dictionary = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'app', 'data', 'cak-known-paths.json'), 'utf8'));
  if (!fs.existsSync(path.join(game, 'WWE2K26_x64.exe'))) throw new Error('The source is not a WWE 2K26 installation.');
  if (!fs.existsSync(output) || !fs.statSync(output).isDirectory()) throw new Error('The extraction folder was not found.');
  if (inside(game, output)) throw new Error('The extraction folder must be outside the game installation.');

  const totals = { examined: 0, renamed: 0, alreadyCorrect: 0, unresolved: 0, absent: 0, collisions: 0, manifestsUpdated: 0 };
  const archives = fs.readdirSync(game).filter((name) => /^bakedfile\d+\.cak$/i.test(name)).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  for (const archiveName of archives) {
    const archiveStem = path.basename(archiveName, '.cak');
    const payloadRoot = path.join(output, archiveStem, 'Payloads');
    if (!fs.existsSync(payloadRoot)) continue;
    const raw = openArchive(path.join(game, archiveName), {});
    const named = openArchive(path.join(game, archiveName), dictionary);
    const namedByHash = new Map(named.files.filter((file) => file.hash).map((file) => [file.hash, file]));
    for (const sourceFile of raw.files.filter((file) => file.extractable)) {
      const source = path.join(payloadRoot, ...sourceFile.name.split('/'));
      const targetFile = namedByHash.get(sourceFile.hash);
      const target = targetFile && targetFile.nameResolved ? path.join(payloadRoot, ...targetFile.name.split('/')) : '';
      if (!fs.existsSync(source)) {
        if (target && fs.existsSync(target)) totals.alreadyCorrect += 1;
        else totals.absent += 1;
        continue;
      }
      totals.examined += 1;
      if (!target) { totals.unresolved += 1; continue; }
      if (!inside(payloadRoot, target)) throw new Error(`Unsafe catalog path refused: ${targetFile.name}`);
      if (fs.existsSync(target)) { totals.collisions += 1; continue; }
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.renameSync(source, target);
      totals.renamed += 1;
    }

    const manifestPath = path.join(payloadRoot, '.aurora-cak-manifest.json');
    if (fs.existsSync(manifestPath)) {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      if (!Array.isArray(manifest.entries)) throw new Error(`Malformed extraction manifest: ${manifestPath}`);
      for (const entry of manifest.entries) {
        const match = namedByHash.get(String(entry.fileHash || '').toLowerCase());
        if (match && match.nameResolved) { entry.relativePath = match.name; entry.nameResolved = true; entry.type = match.type; }
      }
      fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
      totals.manifestsUpdated += 1;
    }
  }
  const report = [NOTICE, '', 'Aurora Forge extracted-path repair report', '', ...Object.entries(totals).map(([key, value]) => `${key}: ${value}`)].join('\n') + '\n';
  fs.writeFileSync(path.join(output, 'Aurora_Forge_Path_Repair_Report.txt'), report, 'utf8');
  return totals;
}

if (require.main === module) {
  try {
    if (process.argv.length < 4) throw new Error('usage: node scripts/repair-extracted-cak-paths.js <game-folder> <extraction-root>');
    console.log(JSON.stringify(run(process.argv[2], process.argv[3]), null, 2));
  } catch (error) {
    process.stderr.write(`CAK path repair failed: ${error.message}\n`);
    process.exitCode = 1;
  }
}

module.exports = { run };
