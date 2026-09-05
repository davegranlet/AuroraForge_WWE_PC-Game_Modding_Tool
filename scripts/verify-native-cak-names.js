'use strict';

const fs = require('fs');
const path = require('path');
const { openArchive, decodePairs, fnv1a64 } = require('../electron/cak-reader');
const catalog = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'app', 'data', 'cak-known-paths.json'), 'utf8'));

function decodeStringTable(input) {
  const output = Buffer.from(input);
  const u64 = (value) => BigInt.asUintN(64, value);
  const rol64 = (value, shiftValue) => {
    const shift = BigInt(shiftValue & 63);
    return shift === 0n ? u64(value) : u64((u64(value) << shift) | (u64(value) >> (64n - shift)));
  };
  let cursor = 1;
  let processed = 0;
  while (cursor + 1 < output.length) {
    cursor += 1;
    const length = output[cursor];
    cursor += 1;
    if (cursor + length > output.length) throw new Error('The CAK string table contains an invalid name length.');
    const recordPosition = BigInt(processed + 2);
    for (let index = 0; index < length; index += 1) {
      let state = u64(BigInt(index) * -0x61c8864680b583ebn);
      state = u64(state ^ u64((recordPosition << 32n) ^ recordPosition));
      let mask = u64((state ^ (state >> 33n)) * 0xc2b2ae3d27d4eb4fn);
      mask = rol64(mask, index);
      mask = u64((mask ^ (mask >> 29n)) * 0x165667b19e3779f9n);
      mask = u64(mask ^ (mask >> 32n));
      const shifted = (output[cursor] - Number((mask >> 24n) & 0xffn)) & 0xff;
      output[cursor] = shifted ^ Number(mask & 0xffn);
      cursor += 1;
    }
    processed += 2 + length;
  }
  return output;
}

function readRecord(table, offset) {
  if (offset < 0 || offset >= table.length) return '';
  const length = table[offset];
  const end = offset + 1 + length;
  if (end >= table.length || table[end] !== 0) return '';
  return table.subarray(offset + 1, end).toString('utf8');
}

function verifyArchive(archivePath) {
  const session = openArchive(archivePath, {});
  const fd = fs.openSync(archivePath, 'r');
  const encoded = Buffer.alloc(session.header[15]);
  try {
    if (fs.readSync(fd, encoded, 0, encoded.length, session.header[17]) !== encoded.length) throw new Error('String table ended early.');
  } finally {
    fs.closeSync(fd);
  }
  const table = decodeStringTable(decodePairs(encoded, session.key));
  const folderPaths = new Map();
  for (const folder of session.folders) folderPaths.set(folder.id, readRecord(table, folder.stringOffset));
  let namedFolders = 0;
  let namedFiles = 0;
  let storedFiles = 0;
  let unionNamedStoredFiles = 0;
  const unionMissingStoredFiles = [];
  const verifiedFolders = [];
  const storedCandidates = [];
  const failures = [];
  for (const folder of session.folders) {
    const value = folderPaths.get(folder.id);
    if (folder.hash && folder.hash !== '0000000000000000' && value && fnv1a64(value.toLowerCase()) === folder.hash) {
      namedFolders += 1;
      verifiedFolders.push([folder.hash, value]);
    }
    else if (folder.hash && folder.hash !== '0000000000000000') failures.push({ kind: 'folder', id: folder.id, hash: folder.hash, value });
  }
  for (const file of session.files) {
    if (!file.hash) continue;
    const leaf = readRecord(table, file.stringOffset);
    const value = [folderPaths.get(file.folderIndex), leaf].filter(Boolean).join('/');
    const nativeVerified = Boolean(leaf && fnv1a64(value.toLowerCase()) === file.hash);
    if (nativeVerified) namedFiles += 1;
    else failures.push({ kind: 'file', id: file.id, hash: file.hash, value, leaf, folderIndex: file.folderIndex });
    if (file.extractable) {
      storedFiles += 1;
      storedCandidates.push({ id: file.id, hash: file.hash, type: file.type, nativeVerified, nativeValue: value, leaf, folderHash: session.folders[file.folderIndex]?.hash || '' });
      if (nativeVerified || catalog[file.hash]) unionNamedStoredFiles += 1;
      else unionMissingStoredFiles.push({ id: file.id, hash: file.hash, type: file.type, nativeValue: value, folderHash: session.folders[file.folderIndex]?.hash || '' });
    }
  }
  return { archive: path.basename(archivePath), filesWithHashes: session.files.filter((item) => item.hash && item.hash !== '0000000000000000').length, namedFiles, storedFiles, unionNamedStoredFiles, unionMissingStoredFiles, unionMissingStoredCount: unionMissingStoredFiles.length, foldersWithHashes: session.folders.filter((item) => item.hash && item.hash !== '0000000000000000').length, namedFolders, failureSamples: failures.slice(0, 3), failureCount: failures.length, verifiedFolders, storedCandidates };
}

const game = path.resolve(process.argv[2] || '');
const reports = fs.readdirSync(game).filter((name) => /^bakedfile\d+\.cak$/i.test(name)).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })).map((name) => verifyArchive(path.join(game, name)));
const allFolders = new Map();
for (const report of reports) for (const [hash, value] of report.verifiedFolders) if (!allFolders.has(hash)) allFolders.set(hash, value);
let crossArchiveNamedStoredFiles = 0;
const crossArchiveMissingStoredFiles = [];
for (const report of reports) {
  for (const file of report.storedCandidates) {
    let resolved = file.nativeVerified || Boolean(catalog[file.hash]);
    if (!resolved && file.leaf && allFolders.has(file.folderHash)) {
      const value = `${allFolders.get(file.folderHash)}/${file.leaf}`;
      resolved = fnv1a64(value.toLowerCase()) === file.hash;
    }
    if (resolved) crossArchiveNamedStoredFiles += 1;
    else crossArchiveMissingStoredFiles.push({ archive: report.archive, id: file.id, hash: file.hash, type: file.type, leaf: file.leaf, folderHash: file.folderHash });
  }
  delete report.verifiedFolders;
  delete report.storedCandidates;
}
const totals = reports.reduce((sum, item) => ({ filesWithHashes: sum.filesWithHashes + item.filesWithHashes, namedFiles: sum.namedFiles + item.namedFiles, storedFiles: sum.storedFiles + item.storedFiles, unionNamedStoredFiles: sum.unionNamedStoredFiles + item.unionNamedStoredFiles, unionMissingStored: sum.unionMissingStored + item.unionMissingStoredCount, foldersWithHashes: sum.foldersWithHashes + item.foldersWithHashes, namedFolders: sum.namedFolders + item.namedFolders, failures: sum.failures + item.failureCount }), { filesWithHashes: 0, namedFiles: 0, storedFiles: 0, unionNamedStoredFiles: 0, unionMissingStored: 0, foldersWithHashes: 0, namedFolders: 0, failures: 0 });
totals.crossArchiveNamedStoredFiles = crossArchiveNamedStoredFiles;
totals.crossArchiveMissingStored = crossArchiveMissingStoredFiles.length;
console.log(JSON.stringify({ game, reports, totals, crossArchiveMissingStoredFiles }, null, 2));
