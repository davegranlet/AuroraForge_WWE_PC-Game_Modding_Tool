#!/usr/bin/env node
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const cp = require('child_process');
const { openArchive, buildNativeDictionary } = require('../electron/cak-reader');
const { buildCak, verifyCak } = require('../electron/archive-repackager');

const game = path.resolve(process.argv[2] || 'D:/games/WWE 2K26');
const root = path.join(__dirname, '..');
const helper = path.join(root, 'app', 'tools', 'cak-helper', 'AuroraCakHelper.exe');
const oodle = path.join(game, 'oo2core_9_win64.dll');
const catalog = JSON.parse(fs.readFileSync(path.join(root, 'app', 'data', 'cak-known-paths.json'), 'utf8'));
if (!fs.existsSync(helper) || !fs.existsSync(oodle)) throw new Error('CAK helper or game-owned Oodle is missing.');

function profile(file) {
  return `${file.compressed ? 'compressed' : 'stored'}/${file.protected ? 'protected' : 'plain'}/${file.chunkCount > 1 ? 'multi' : 'single'}`;
}
function invoke(request, requestPath) {
  fs.writeFileSync(requestPath, JSON.stringify(request));
  const result = cp.spawnSync(helper, [requestPath], { encoding: 'utf8', windowsHide: true, maxBuffer: 16 * 1024 * 1024 });
  if (result.error || result.status !== 0) throw new Error(String(result.stderr || result.stdout || result.error || 'CAK helper failed').trim());
  const parsed = JSON.parse(String(result.stdout || '').trim());
  const item = parsed.results?.[0];
  if (!item?.Ok) throw new Error(item?.Error || 'CAK helper rejected sample payload.');
}

const archives = fs.readdirSync(game)
  .filter((name) => name.toLowerCase().startsWith('bakedfile') && name.toLowerCase().endsWith('.cak'))
  .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
  .map((name) => path.join(game, name));
const dictionary = { ...catalog, ...buildNativeDictionary(archives) };
const sessions = archives.map((archivePath) => openArchive(archivePath, dictionary));
const required = new Set(['compressed/protected/single', 'compressed/protected/multi', 'stored/protected/single', 'stored/plain/single', 'stored/plain/multi']);
const selected = new Map();
for (const session of sessions) {
  for (const file of session.files.filter((item) => item.extractable && item.expandedSize > 0)) {
    const key = profile(file);
    if (!required.has(key)) continue;
    const current = selected.get(key);
    if (!current || file.expandedSize < current.file.expandedSize) selected.set(key, { session, file, key });
  }
}
if (selected.size !== required.size) throw new Error(`Missing storage profile sample(s): ${[...required].filter((key) => !selected.has(key)).join(', ')}`);

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'aurora-cak-sample-roundtrip-'));
try {
  const source = path.join(temp, 'BakeMe');
  fs.mkdirSync(source, { recursive: true });
  const entries = [];
  for (const [index, sample] of [...selected.values()].entries()) {
    const { session, file } = sample;
    const relativePath = `samples/${sample.key}/${file.name.split('/').pop()}`;
    invoke({ archivePath: session.archivePath, oodlePath: oodle, outputRoot: source, archiveKey: session.key, overwrite: false,
      entries: [{ id: file.id, offset: Number(file.offset), storedSize: file.storedSize, expandedSize: file.expandedSize, compressed: file.compressed, protected: file.protected, relativePath, chunks: file.chunks }] }, path.join(temp, `extract-${index}.json`));
    entries.push({ relativePath, fileHash: file.hash, folderIndex: file.folderIndex, folderHash: session.folders[file.folderIndex]?.hash || '', type: file.type, nameResolved: true, sourceArchive: session.archiveName });
  }
  fs.writeFileSync(path.join(source, '.aurora-cak-manifest.json'), JSON.stringify({ schema: 'aurora-forge-cak-extraction-manifest/v1', entries }, null, 2));
  const output = path.join(temp, 'sample-roundtrip.cak');
  const built = buildCak(source, output, { oodlePath: oodle, helperPath: helper });
  const reopened = openArchive(output, {});
  for (const entry of entries) {
    const found = reopened.files.find((candidate) => candidate.hash === entry.fileHash);
    if (!found) throw new Error(`Rebuilt sample lost file hash ${entry.fileHash}.`);
    if (reopened.folders[found.folderIndex]?.hash !== entry.folderHash) throw new Error(`Rebuilt sample lost folder hash for ${entry.relativePath}.`);
  }
  const verified = verifyCak(output, buildCak ? undefined : undefined);
  console.log(JSON.stringify({ samples: entries.length, profiles: [...selected.keys()].sort(), payloadVerified: built.payloadVerified, reopenedFiles: reopened.files.length, outputBytes: fs.statSync(output).size, catalogRoundTrip: verified.catalogRoundTrip }));
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}
