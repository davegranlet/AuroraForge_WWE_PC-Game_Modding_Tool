'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { openArchive, fnv1a64 } = require('./cak-reader');
const ROOT_HASH = 'd727c35cfb2bb5da';
const u32 = (v) => v >>> 0;
const rol32 = (v, s) => u32((v << (s & 31)) | (v >>> (32 - (s & 31))));
const imul = (a, b) => u32(Math.imul(a, b));

function encodePairs(input, initialKey) {
  const output = Buffer.alloc(input.length); let cursor = 0; let key = u32(initialKey);
  let counterA = 0; let firstState = 0; let stateB = 0; let previousFirst = 0;
  for (let block = 0; block < Math.floor(input.length / 8); block += 1) {
    key = u32(key ^ stateB);
    if (firstState !== 0) { stateB = u32(stateB + 0xc2b2ae35); key = u32(key ^ firstState); key = u32(rol32(key, 11) + 0x165667b1); }
    let mixed = u32(key ^ counterA ^ 0xa3c59ac3); mixed = imul(mixed, 0x85ebca6b); mixed = rol32(mixed, 7); mixed = u32(mixed ^ (mixed >>> 16));
    let mask = imul(mixed, 0xc2b2ae35); mask = u32(mask ^ (mask >>> 13));
    const cipherFirst = u32(input.readUInt32LE(cursor) ^ mask); output.writeUInt32LE(cipherFirst, cursor); cursor += 4;
    firstState = u32(cipherFirst ^ previousFirst);
    if (key !== 0) { firstState = u32(firstState ^ key); firstState = u32(rol32(firstState, 7) - 0x7a143595); previousFirst = u32(previousFirst + 0x9e3779b9); }
    mixed = u32((counterA - 0x61c88647) ^ firstState ^ 0x1b873593); counterA = u32(counterA + 0x3c6ef372);
    mixed = imul(mixed, 0x85ebca6b); mixed = rol32(mixed, 7); mixed = u32(mixed ^ (mixed >>> 16)); mask = imul(mixed, 0xc2b2ae35); mask = u32(mask ^ (mask >>> 13));
    const cipherSecond = u32(input.readUInt32LE(cursor) ^ mask); output.writeUInt32LE(cipherSecond, cursor); key = cipherSecond; cursor += 4;
  }
  const tailBase = input.length & ~7;
  for (let tailIndex = 0; tailIndex < (input.length & 7); tailIndex += 1) {
    const absoluteIndex = u32(tailBase + tailIndex); const indexMix = u32(imul(absoluteIndex, 0x27d4eb2d) + 0x7f4a7c15); stateB = u32(stateB ^ key);
    let rotation = u32(firstState ^ key) & 0xf; if (tailIndex === 0) rotation = 11;
    firstState = u32(firstState ^ stateB); firstState = rol32(firstState, rotation); firstState = u32(firstState - (tailIndex === 0 ? 0xe9a9984f : 0x7a143595));
    let mixed = u32(firstState ^ indexMix); mixed = u32(mixed ^ (mixed >>> 15)); const mask = imul(mixed, 0x85ebca6b);
    const cipherByte = input[tailBase + tailIndex] ^ (mask & 0xff) ^ ((mask >>> 13) & 0xff); output[tailBase + tailIndex] = cipherByte; key = cipherByte; stateB = imul(absoluteIndex, 0x9e3779b9);
  }
  return output;
}

function hash64(value) { const b = Buffer.alloc(8); b.writeBigUInt64LE(BigInt('0x' + value)); return b; }
function scanBakeFolder(sourceRoot) {
  const root = path.resolve(sourceRoot);
  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) throw new Error('Choose a readable BakeMe folder first.');
  const folders = [{ relative: '', leaf: '', parent: -1, children: [], files: [], hash: ROOT_HASH }]; const files = [];
  const walk = (full, folderId) => {
    for (const entry of fs.readdirSync(full, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (entry.isSymbolicLink()) continue; const target = path.join(full, entry.name); const relative = path.relative(root, target).replace(/\\/g, '/');
      if (!relative || relative.split('/').includes('..')) throw new Error('A BakeMe entry escapes the selected folder.');
      if (entry.isDirectory()) { const id = folders.length; folders.push({ relative, leaf: entry.name, parent: folderId, children: [], files: [], hash: fnv1a64(relative.toLowerCase()) }); folders[folderId].children.push(id); walk(target, id); }
      else if (entry.isFile()) { const size = fs.statSync(target).size; if (size > 0xffffffff) throw new Error(`${relative} exceeds the 4 GB per-file CAK limit.`); const id = files.length; files.push({ id, full: target, relative, leaf: entry.name, folderId, size, hash: fnv1a64(relative.toLowerCase()) }); folders[folderId].files.push(id); }
    }
  };
  walk(root, 0); if (!files.length) throw new Error('The selected BakeMe folder contains no files.'); return { root, folders, files };
}
function stringRecord(value) { const b = Buffer.from(value, 'utf8'); if (b.length > 255) throw new Error(`CAK entry name is too long: ${value}`); return Buffer.concat([Buffer.from([b.length]), b, Buffer.from([0])]); }
function fourCc(name) { const ext = path.extname(name).slice(1).toLowerCase(); const known = { mcd: 'mcd!', ycl: 'ycl!', tex: 'tex!', dds: 'tex!', mtls: 'mtls', jsfb: 'jsfb', jmtl: 'jsfb' }; return (known[ext] || (ext.length === 4 ? ext : '')).padEnd(4, '\0').slice(0, 4); }
function hashTable(items) { return Buffer.concat(items.map((item, index) => { const b = Buffer.alloc(12); hash64(item.hash).copy(b); b.writeInt32LE(index, 8); return b; })); }

function buildCatalog(scan, key) {
  const stringParts = [Buffer.from([0, 0])]; let stringOffset = 2;
  for (const folder of scan.folders) { folder.stringOffset = stringOffset; const part = stringRecord(folder.leaf); stringParts.push(part); stringOffset += part.length; }
  for (const file of scan.files) { file.stringOffset = stringOffset; const part = stringRecord(file.leaf); stringParts.push(part); stringOffset += part.length; }
  const strings = Buffer.concat(stringParts), folderHashes = hashTable(scan.folders), fileHashes = hashTable(scan.files);
  const folderTable = Buffer.concat(scan.folders.map((folder) => { const b = Buffer.alloc(20 + (folder.children.length + folder.files.length) * 4); hash64(folder.hash).copy(b); b.writeUInt32LE(folder.stringOffset, 8); b.writeUInt32LE(folder.children.length, 12); b.writeUInt32LE(folder.files.length, 16); folder.children.forEach((id, i) => b.writeInt32LE(id, 20 + i * 4)); folder.files.forEach((id, i) => b.writeInt32LE(id, 20 + folder.children.length * 4 + i * 4)); return b; }));
  const folderHashOffset = 92, fileHashOffset = folderHashOffset + folderHashes.length, fileTableOffset = fileHashOffset + fileHashes.length;
  const fileTableSize = scan.files.length * 39, folderTableOffset = fileTableOffset + fileTableSize, stringTableOffset = folderTableOffset + folderTable.length, payloadStart = stringTableOffset + strings.length;
  let payloadOffset = payloadStart;
  const fileTable = Buffer.concat(scan.files.map((file) => { const b = Buffer.alloc(39); b.writeUInt32LE(file.stringOffset, 0); b.writeUInt32LE(file.folderId, 4); b.writeUInt32LE(file.size, 8); b.write(fourCc(file.leaf), 12, 4, 'ascii'); b.writeBigUInt64LE(BigInt(payloadOffset), 16); b.writeUInt32LE(file.size, 24); b.writeUInt16LE(1, 28); b[33] = 4; b.writeUInt32LE(file.size, 34); file.offset = payloadOffset; payloadOffset += file.size; return b; }));
  const random = () => crypto.randomBytes(4).readUInt32LE();
  const words = [scan.files.length, scan.folders.length, scan.files.length, folderHashes.length, random(), folderHashOffset, fileHashes.length, random(), fileHashOffset, fileTable.length, random(), fileTableOffset, folderTable.length, random(), folderTableOffset, strings.length, random(), stringTableOffset, 0, 0, payloadStart];
  const header = Buffer.alloc(84); words.forEach((word, i) => header.writeUInt32LE(word >>> 0, i * 4));
  return { prefix: Buffer.concat([Buffer.from('FDIR'), Buffer.from([9, 9, 0, 0x81]), encodePairs(header, key)]), sections: [folderHashes, fileHashes, fileTable, folderTable, strings].map((b) => encodePairs(b, key)) };
}
function writeAll(fd, b) { let o = 0; while (o < b.length) o += fs.writeSync(fd, b, o, b.length - o); }
function buildCak(sourceRoot, outputPath) {
  const scan = scanBakeFolder(sourceRoot), output = path.resolve(outputPath);
  if (path.extname(output).toLowerCase() !== '.cak') throw new Error('The output filename must end in .cak.');
  if (output.startsWith(scan.root + path.sep)) throw new Error('Save the new CAK outside the selected BakeMe folder.');
  fs.mkdirSync(path.dirname(output), { recursive: true }); const temporary = output + '.aurora-part'; const key = crypto.randomBytes(4).readUInt32LE() || 1; const catalog = buildCatalog(scan, key); const fd = fs.openSync(temporary, 'w');
  try { writeAll(fd, catalog.prefix); catalog.sections.forEach((b) => writeAll(fd, b)); const buffer = Buffer.alloc(1024 * 1024); for (const file of scan.files) { const source = fs.openSync(file.full, 'r'); try { let n; while ((n = fs.readSync(source, buffer, 0, buffer.length, null)) > 0) writeAll(fd, buffer.subarray(0, n)); } finally { fs.closeSync(source); } } } finally { fs.closeSync(fd); }
  if (fs.existsSync(output)) fs.rmSync(output); fs.renameSync(temporary, output); const verification = verifyCak(output, scan);
  return { outputPath: output, sourceRoot: scan.root, fileCount: scan.files.length, folderCount: scan.folders.length, bytes: fs.statSync(output).size, ...verification };
}
function verifyCak(archivePath, expected) {
  const dictionary = {}; if (expected) { expected.folders.forEach((x) => { if (x.relative) dictionary[x.hash] = x.relative; }); expected.files.forEach((x) => { dictionary[x.hash] = x.relative; }); }
  const session = openArchive(archivePath, dictionary);
  if (expected && (session.files.length !== expected.files.length || session.folders.length !== expected.folders.length)) throw new Error('The new CAK failed its catalog round-trip check.');
  if (expected) for (const file of expected.files) { const reopened = session.files.find((x) => x.hash === file.hash); if (!reopened || reopened.storedSize !== file.size || (file.offset !== undefined && Number(reopened.offset) !== file.offset)) throw new Error(`The new CAK failed verification for ${file.relative}.`); }
  return { verified: true, archiveName: session.archiveName, archiveKey: session.key };
}
module.exports = { buildCak, verifyCak, scanBakeFolder, encodePairs };
