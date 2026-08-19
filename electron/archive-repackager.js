'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const CRC_TABLE = Array.from({ length: 256 }, (_, value) => {
  let crc = value;
  for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  return crc >>> 0;
});

function updateCrc32(crc, buffer) {
  let value = crc;
  for (const byte of buffer) value = (value >>> 8) ^ CRC_TABLE[(value ^ byte) & 0xff];
  return value >>> 0;
}

function listSourceFiles(root) {
  const files = [];
  const stack = [root];
  while (stack.length) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) { stack.push(full); continue; }
      if (!entry.isFile()) continue;
      const relative = path.relative(root, full).replace(/\\/g, '/');
      if (!relative || relative.split('/').includes('..')) throw new Error('A source file escapes the selected folder.');
      files.push({ full, relative });
    }
  }
  return files.sort((left, right) => left.relative.localeCompare(right.relative));
}

function inspectFile(file) {
  const hash = crypto.createHash('sha256');
  let crc = 0xffffffff;
  let size = 0;
  const fd = fs.openSync(file.full, 'r');
  const buffer = Buffer.alloc(1024 * 1024);
  try {
    let count;
    while ((count = fs.readSync(fd, buffer, 0, buffer.length, null)) > 0) {
      const chunk = buffer.subarray(0, count);
      hash.update(chunk);
      crc = updateCrc32(crc, chunk);
      size += count;
    }
  } finally { fs.closeSync(fd); }
  if (size > 0xffffffff) throw new Error(`${file.relative} exceeds the 4 GB RC1 package limit.`);
  return { ...file, size, crc: (crc ^ 0xffffffff) >>> 0, sha256: hash.digest('hex') };
}

function virtualManifest(files) {
  const value = {
    format: 'Aurora Forge Repack Manifest',
    version: 1,
    purpose: 'Portable mod-project package. This is not a replacement game CAK.',
    files: files.map((file) => ({ path: file.relative, bytes: file.size, sha256: file.sha256 }))
  };
  const data = Buffer.from(JSON.stringify(value, null, 2) + '\n', 'utf8');
  let crc = updateCrc32(0xffffffff, data);
  return { relative: 'Aurora_Forge_Repack_Manifest.json', data, size: data.length, crc: (crc ^ 0xffffffff) >>> 0, sha256: crypto.createHash('sha256').update(data).digest('hex') };
}

function writeAll(fd, buffer) { let offset = 0; while (offset < buffer.length) offset += fs.writeSync(fd, buffer, offset, buffer.length - offset); }

function localHeader(file) {
  const name = Buffer.from(file.relative, 'utf8');
  const header = Buffer.alloc(30 + name.length);
  header.writeUInt32LE(0x04034b50, 0); header.writeUInt16LE(20, 4); header.writeUInt16LE(0x800, 6);
  header.writeUInt16LE(0, 8); header.writeUInt16LE(0, 10); header.writeUInt16LE(0x21, 12);
  header.writeUInt32LE(file.crc, 14); header.writeUInt32LE(file.size, 18); header.writeUInt32LE(file.size, 22);
  header.writeUInt16LE(name.length, 26); header.writeUInt16LE(0, 28); name.copy(header, 30);
  return header;
}

function centralHeader(file) {
  const name = Buffer.from(file.relative, 'utf8');
  const header = Buffer.alloc(46 + name.length);
  header.writeUInt32LE(0x02014b50, 0); header.writeUInt16LE(0x0314, 4); header.writeUInt16LE(20, 6); header.writeUInt16LE(0x800, 8);
  header.writeUInt16LE(0, 10); header.writeUInt16LE(0, 12); header.writeUInt16LE(0x21, 14);
  header.writeUInt32LE(file.crc, 16); header.writeUInt32LE(file.size, 20); header.writeUInt32LE(file.size, 24);
  header.writeUInt16LE(name.length, 28); header.writeUInt16LE(0, 30); header.writeUInt16LE(0, 32); header.writeUInt16LE(0, 34);
  header.writeUInt16LE(0, 36); header.writeUInt32LE(0, 38); header.writeUInt32LE(file.localOffset, 42); name.copy(header, 46);
  return header;
}

function buildPackage(sourceRoot, outputPath) {
  const root = path.resolve(sourceRoot);
  const target = path.resolve(outputPath);
  if (!fs.statSync(root).isDirectory()) throw new Error('Choose a readable source folder.');
  if (target.toLowerCase().startsWith(root.toLowerCase() + path.sep)) throw new Error('Save the package outside the source folder.');
  const sourceFiles = listSourceFiles(root);
  if (!sourceFiles.length) throw new Error('The selected source folder is empty.');
  if (sourceFiles.some((file) => file.relative.toLowerCase() === 'aurora_forge_repack_manifest.json')) {
    throw new Error('Remove the existing Aurora Forge repack manifest before building a new package.');
  }
  if (sourceFiles.length >= 65535) throw new Error('The RC1 repackager supports fewer than 65,535 files per package.');
  const inspected = sourceFiles.map(inspectFile);
  const files = [...inspected, virtualManifest(inspected)];
  const temporary = target + '.aurora-part';
  const fd = fs.openSync(temporary, 'w');
  let position = 0;
  try {
    for (const file of files) {
      file.localOffset = position;
      const header = localHeader(file); writeAll(fd, header); position += header.length;
      if (file.data) { writeAll(fd, file.data); position += file.data.length; }
      else {
        const input = fs.openSync(file.full, 'r');
        const buffer = Buffer.alloc(1024 * 1024);
        try { let count; while ((count = fs.readSync(input, buffer, 0, buffer.length, null)) > 0) { writeAll(fd, buffer.subarray(0, count)); position += count; } }
        finally { fs.closeSync(input); }
      }
      if (position > 0xffffffff) throw new Error('The RC1 package exceeds the 4 GB ZIP32 limit.');
    }
    const centralOffset = position;
    for (const file of files) { const header = centralHeader(file); writeAll(fd, header); position += header.length; }
    const centralSize = position - centralOffset;
    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(0, 4); end.writeUInt16LE(0, 6);
    end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10); end.writeUInt32LE(centralSize, 12); end.writeUInt32LE(centralOffset, 16); end.writeUInt16LE(0, 20);
    writeAll(fd, end);
  } finally { fs.closeSync(fd); }
  let verified;
  const backup = target + '.aurora-backup';
  try {
    verified = verifyPackage(temporary);
    if (fs.existsSync(backup)) throw new Error('A previous package backup must be moved or removed before replacing this file.');
    const replacing = fs.existsSync(target);
    if (replacing) fs.renameSync(target, backup);
    try {
      fs.renameSync(temporary, target);
      if (replacing) fs.unlinkSync(backup);
    } catch (error) {
      if (replacing && fs.existsSync(backup) && !fs.existsSync(target)) fs.renameSync(backup, target);
      throw error;
    }
  } catch (error) {
    try { fs.unlinkSync(temporary); } catch (_cleanupError) {}
    throw error;
  }
  return { outputPath: target, fileCount: inspected.length, bytes: fs.statSync(target).size, verified };
}

function verifyPackage(packagePath) {
  const fd = fs.openSync(packagePath, 'r');
  const header = Buffer.alloc(30);
  const chunk = Buffer.alloc(1024 * 1024);
  let offset = 0;
  let files = 0;
  try {
    while (fs.readSync(fd, header, 0, 30, offset) === 30 && header.readUInt32LE(0) === 0x04034b50) {
      const nameLength = header.readUInt16LE(26);
      const extraLength = header.readUInt16LE(28);
      const size = header.readUInt32LE(18);
      const expectedCrc = header.readUInt32LE(14);
      const dataStart = offset + 30 + nameLength + extraLength;
      let remaining = size;
      let position = dataStart;
      let crc = 0xffffffff;
      while (remaining > 0) {
        const wanted = Math.min(chunk.length, remaining);
        const count = fs.readSync(fd, chunk, 0, wanted, position);
        if (count !== wanted) throw new Error('The completed package failed its boundary check.');
        crc = updateCrc32(crc, chunk.subarray(0, count));
        position += count;
        remaining -= count;
      }
      if (((crc ^ 0xffffffff) >>> 0) !== expectedCrc) throw new Error('The completed package failed its checksum check.');
      files += 1;
      offset = dataStart + size;
    }
    const signature = Buffer.alloc(4);
    if (fs.readSync(fd, signature, 0, 4, offset) !== 4 || signature.readUInt32LE(0) !== 0x02014b50) {
      throw new Error('The completed package has no readable central directory.');
    }
  } finally {
    fs.closeSync(fd);
  }
  if (!files) throw new Error('The completed package contains no files.');
  return true;
}

module.exports = { buildPackage, verifyPackage, listSourceFiles };
