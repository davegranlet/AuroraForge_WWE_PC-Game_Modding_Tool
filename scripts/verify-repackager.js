'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { buildPackage, verifyPackage } = require('../electron/archive-repackager');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aurora-repack-'));
try {
  const source = path.join(root, 'project');
  fs.mkdirSync(path.join(source, 'Characters', 'Test'), { recursive: true });
  fs.writeFileSync(path.join(source, 'Characters', 'Test', 'sample.bin'), Buffer.from([0, 1, 2, 3, 254, 255]));
  fs.writeFileSync(path.join(source, 'README.txt'), 'Aurora Forge repackager round-trip test.\n', 'utf8');
  const first = path.join(root, 'first.zip');
  const second = path.join(root, 'second.zip');
  const firstResult = buildPackage(source, first);
  const secondResult = buildPackage(source, second);
  if (!firstResult.verified || !verifyPackage(first)) throw new Error('The first package did not pass verification.');
  if (!fs.readFileSync(first).equals(fs.readFileSync(second))) throw new Error('Identical source folders did not produce identical packages.');
  console.log(`Aurora Forge repackager verification passed (${firstResult.fileCount} files; deterministic ZIP round trip).`);
} finally { fs.rmSync(root, { recursive: true, force: true }); }
