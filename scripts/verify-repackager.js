'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { buildCak, verifyCak, scanBakeFolder, encodePairs } = require('../electron/archive-repackager');
const { decodePairs } = require('../electron/cak-reader');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aurora-cak-bake-'));
try {
  const source = path.join(root, 'BakeMe');
  fs.mkdirSync(path.join(source, 'Characters', '100_Test', 'Textures'), { recursive: true });
  fs.writeFileSync(path.join(source, 'Characters', '100_Test', 'profile.jsfb'), Buffer.from('JSFB test profile'));
  fs.writeFileSync(path.join(source, 'Characters', '100_Test', 'Textures', 'body_color.dds'), Buffer.from('DDS test texture'));
  const sample = Buffer.from('catalog encryption round trip'), key = 0x1234abcd;
  if (!decodePairs(encodePairs(sample, key), key).equals(sample)) throw new Error('Catalog encoder round trip failed.');
  const output = path.join(root, 'aurora-test.cak');
  const result = buildCak(source, output);
  verifyCak(output, scanBakeFolder(source));
  if (!result.verified || result.fileCount !== 2 || result.folderCount !== 4) throw new Error('CAK baker returned the wrong catalog totals.');
  if (fs.readFileSync(output).subarray(0, 4).toString('ascii') !== 'FDIR') throw new Error('Output is not a CAK FDIR archive.');
  console.log(`Aurora Forge CAK baker verification passed (${result.fileCount} files; ${result.folderCount} folders; FDIR catalog reopened).`);
} finally { fs.rmSync(root, { recursive: true, force: true }); }
