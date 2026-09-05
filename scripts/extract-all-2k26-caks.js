#!/usr/bin/env node
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const cp = require('child_process');
const { openArchive, buildNativeDictionary } = require('../electron/cak-reader');
const NOTICE = '**Readability note:** I ran this document through an “explain like I am five” chatbot to improve readability, explainability, and usability. The chatbot helped present the material; it did not originate Aurora Forge, DataCtrlLink, their functionality, or the underlying development work.';
// Keep requests bounded, but avoid reopening multi-gigabyte CAKs for every
// small UI-sized batch. The helper reads the archive once per request, so a
// 50,000-entry batch makes full-game extraction practical while keeping the
// request/report sizes well below the helper's limits.
const BATCH_SIZE = 50000;
function inside(parent, child) { const root = path.resolve(parent).toLowerCase(), target = path.resolve(child).toLowerCase(); return target === root || target.startsWith(root + path.sep); }
function invoke(helper, request, requestPath) {
  fs.writeFileSync(requestPath, JSON.stringify(request), 'utf8');
  const result = cp.spawnSync(helper, [requestPath], { encoding: 'utf8', windowsHide: true, maxBuffer: 64 * 1024 * 1024 });
  if (result.error) throw result.error;
  try { return JSON.parse(String(result.stdout || '').trim()).results || []; }
  catch { throw new Error(String(result.stderr || result.stdout || 'The CAK helper returned no readable report.').trim()); }
}
function run(gameFolder, outputRoot, helperPath) {
  const game = path.resolve(gameFolder), output = path.resolve(outputRoot), helper = path.resolve(helperPath);
  const dictionaryPath = path.join(__dirname, '..', 'app', 'data', 'cak-known-paths.json');
  let bundledDictionary = {};
  try { bundledDictionary = JSON.parse(fs.readFileSync(dictionaryPath, 'utf8')); } catch (_error) { bundledDictionary = {}; }
  if (!fs.existsSync(path.join(game, 'WWE2K26_x64.exe'))) throw new Error('The source is not a WWE 2K26 installation.');
  if (inside(game, output)) throw new Error('The extraction output must be outside the game installation.');
  if (!fs.existsSync(helper)) throw new Error('AuroraCakHelper.exe was not found.');
  const oodlePath = path.join(game, 'oo2core_9_win64.dll');
  if (!fs.existsSync(oodlePath)) throw new Error('The game-owned Oodle library was not found.');
  if (fs.existsSync(output) && fs.readdirSync(output).length) throw new Error('The complete-extraction output folder must be empty.');
  const archives = fs.readdirSync(game).filter((name) => /^bakedfile\d+\.cak$/i.test(name)).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  if (!archives.length) throw new Error('No bakedfile CAKs were found.');
  const archivePaths = archives.map((name) => path.join(game, name));
  const dictionary = { ...bundledDictionary, ...buildNativeDictionary(archivePaths) };
  const sessions = archivePaths.map((archivePath) => openArchive(archivePath, dictionary));
  const unresolved = sessions.flatMap((session) => session.files.filter((file) => file.extractable && !file.nameResolved).map((file) => ({ archive: session.archiveName, id: file.id, hash: file.hash || '' })));
  if (unresolved.length) throw new Error(`Extraction stopped before writing: ${unresolved.length.toLocaleString()} stored payload(s) still lack genuine names.`);
  fs.mkdirSync(output, { recursive: true });
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'aurora-full-cak-extract-'));
  const totals = { archives: archives.length, records: 0, payloads: 0, externalReferences: 0, succeeded: 0, failed: 0, collisions: 0, expandedBytes: 0 };
  const manifestEntries = new Map();
  const pathOwners = new Map();
  const collisions = [];
  try {
    for (const [archiveIndex, session] of sessions.entries()) {
      const archiveName = session.archiveName, files = session.files.filter((file) => file.extractable), external = session.files.filter((file) => !file.extractable);
      const entries = [], failures = [];
      console.log(`[${archiveIndex + 1}/${archives.length}] ${archiveName}: ${files.length.toLocaleString()} stored payload(s), ${external.length.toLocaleString()} zero-payload record(s)`);
      for (let start = 0; start < files.length; start += BATCH_SIZE) {
        const batch = files.slice(start, start + BATCH_SIZE);
        const results = invoke(helper, { archivePath: session.archivePath, oodlePath, outputRoot: output, archiveKey: session.key, overwrite: true, entries: batch.map((file) => ({ id: file.id, offset: Number(file.offset), storedSize: file.storedSize, expandedSize: file.expandedSize, compressed: file.compressed, protected: file.protected, relativePath: file.name, chunks: file.chunks })) }, path.join(temp, `${path.basename(archiveName, '.cak')}-${start}.json`));
        const succeededIds = new Set(results.filter((item) => item.Ok).map((item) => item.Id));
        for (const file of batch) if (succeededIds.has(file.id)) {
          const folder = session.folders[file.folderIndex];
          const entry = { relativePath: file.name, fileHash: file.hash, folderIndex: file.folderIndex, folderHash: folder?.hash || '', type: file.type, nameResolved: Boolean(file.nameResolved), sourceArchive: archiveName };
          const key = file.name.toLowerCase();
          if (pathOwners.has(key)) collisions.push({ relativePath: file.name, replacedArchive: pathOwners.get(key), winningArchive: archiveName });
          pathOwners.set(key, archiveName);
          manifestEntries.set(key, entry);
          entries.push(entry);
        }
        failures.push(...results.filter((item) => !item.Ok).map((item) => ({ id: item.Id, error: item.Error })));
        totals.succeeded += results.filter((item) => item.Ok).length; totals.failed += results.filter((item) => !item.Ok).length;
        if ((start / BATCH_SIZE) % 20 === 0 || start + batch.length === files.length) console.log(`  ${Math.min(start + batch.length, files.length).toLocaleString()}/${files.length.toLocaleString()} processed; failures ${failures.length}`);
      }
      totals.records += session.files.length; totals.payloads += files.length; totals.externalReferences += external.length; totals.expandedBytes += files.reduce((sum, file) => sum + file.expandedSize, 0);
    }
    totals.collisions = collisions.length;
    const manifest = { readabilityNote: NOTICE.slice('**Readability note:** '.length), schema: 'aurora-forge-cak-extraction-manifest/v1', purpose: 'Preserves original CAK hashes while presenting usable decoded filenames. Later archives win same-path collisions.', sourceArchives: archives, entries: [...manifestEntries.values()] };
    fs.writeFileSync(path.join(output, '.aurora-cak-manifest.json'), JSON.stringify(manifest, null, 2) + '\n', 'utf8');
    const reportPath = path.join(path.dirname(output), `${path.basename(output)}-Aurora-Extraction-Report.txt`);
    fs.writeFileSync(reportPath, [NOTICE, '', 'Aurora Forge complete WWE 2K26 CAK extraction', '', `Game root: ${game}`, `Merged extraction root: ${output}`, 'Load order: ' + archives.join(' -> '), '', ...Object.entries(totals).map(([key, value]) => `${key}: ${value}`), '', 'Collisions (later archive won):', ...collisions.map((item) => `${item.relativePath}: ${item.replacedArchive} -> ${item.winningArchive}`)].join('\n') + '\n', 'utf8');
    console.log(JSON.stringify(totals));
    if (totals.failed) process.exitCode = 2;
    return totals;
  } finally { fs.rmSync(temp, { recursive: true, force: true }); }
}
if (require.main === module) try {
  if (process.argv.length < 4) throw new Error('usage: node scripts/extract-all-2k26-caks.js <game-folder> <empty-output-folder> [AuroraCakHelper.exe]');
  run(process.argv[2], process.argv[3], process.argv[4] || path.join(__dirname, '..', 'app', 'tools', 'cak-helper', 'AuroraCakHelper.exe'));
} catch (error) { process.stderr.write(`Complete CAK extraction failed: ${error.message}\n`); process.exitCode = 1; }
module.exports = { run };
