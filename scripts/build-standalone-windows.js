'use strict';

const fs = require('fs');
const path = require('path');
const cp = require('child_process');

const root = path.join(__dirname, '..');
const runtime = path.join(root, 'build', 'runtime-staging');
const dist = path.join(root, 'dist');
const release = path.join(root, 'portable-release');
const packager = path.join(root, 'node_modules', '.bin', process.platform === 'win32' ? 'electron-packager.cmd' : 'electron-packager');
const version = '1.7.0';
const variants = [
  { product: 'Aurora Forge CAK Extractor Repackager', main: 'electron/standalone-cak-main.js', zip: 'Aurora-Forge-CAK-Extractor-Repackager-1.7Major-RC1-Windows-x64.zip' },
  { product: 'Aurora Forge DDS Converter', main: 'electron/standalone-dds-main.js', zip: 'Aurora-Forge-DDS-Converter-1.7Major-RC1-Windows-x64.zip' }
];

function run(command, args) {
  let executable = command;
  let commandArgs = args;
  if (process.platform === 'win32' && /\.cmd$/i.test(command)) {
    executable = process.env.ComSpec || 'C:\\Windows\\System32\\cmd.exe';
    commandArgs = ['/d', '/c', 'call', command, ...args];
  }
  const result = cp.spawnSync(executable, commandArgs, { cwd: root, stdio: 'inherit', shell: false, windowsHide: true });
  if (result.status !== 0) throw new Error(`${command} failed with exit code ${result.status}`);
}

if (!fs.existsSync(runtime)) run('npm', ['run', 'prepare:runtime']);
fs.mkdirSync(release, { recursive: true });

for (const variant of variants) {
  const pkgPath = path.join(runtime, 'package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  pkg.productName = variant.product;
  pkg.description = `${variant.product} standalone portable release.`;
  pkg.main = variant.main;
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
  run(packager, ['build/runtime-staging', variant.product, '--platform=win32', '--arch=x64', '--out=dist', '--overwrite', '--asar.unpackDir=app/tools', '--icon=app/assets/img/app-icon.ico', `--app-version=${version}`, `--build-version=${version}`]);
  const source = path.join(dist, `${variant.product}-win32-x64`);
  const destination = path.join(release, variant.zip);
  if (fs.existsSync(destination)) fs.rmSync(destination, { force: true });
  run('powershell.exe', ['-NoProfile', '-Command', `Compress-Archive -Path '${source.replace(/'/g, "''")}\\*' -DestinationPath '${destination.replace(/'/g, "''")}' -CompressionLevel Optimal -Force`]);
  console.log(`Created ${destination}`);
}
