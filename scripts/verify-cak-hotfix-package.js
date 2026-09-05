'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const asar = require('@electron/asar');

const packageRoot = path.resolve(process.argv[2] || '');
const asarPath = path.join(packageRoot, 'resources', 'app.asar');
if (!fs.existsSync(asarPath)) throw new Error('The clean package does not contain resources/app.asar.');

const work = fs.mkdtempSync(path.join(os.tmpdir(), 'aurora-cak-176-runtime-'));
try {
  asar.extractAll(asarPath, work);
  const source = path.join(work, 'BakeMe');
  fs.mkdirSync(path.join(source, 'Test'), { recursive: true });
  fs.writeFileSync(path.join(source, 'Test', 'payload.bin'), Buffer.from('packaged v1.7.6 regression payload'));
  const repackager = require(path.join(work, 'electron', 'archive-repackager.js'));
  const output = path.join(work, 'mod23.cak');
  const result = repackager.buildCak(source, output);
  if (!result.verified || !result.payloadVerified || result.archiveKey !== 0xf755512d) throw new Error('The packaged leading-zero round trip failed.');
  console.log(JSON.stringify({ archive: path.basename(output), key: result.archiveKey.toString(16), files: result.fileCount, payloadVerified: result.payloadVerified }));
} finally {
  fs.rmSync(work, { recursive: true, force: true });
}
