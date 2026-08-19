const fs = require('fs');
const path = require('path');
const cp = require('child_process');
const crypto = require('crypto');

const root = path.join(__dirname, '..');
const appFolder = path.join(root, 'dist', 'Aurora Forge-linux-x64');
const releaseDir = path.join(root, 'portable-release');
const archiveName = 'Aurora-Forge-1.7Major-RC1-Linux-x64.tar.gz';
const archivePath = path.join(releaseDir, archiveName);

function run(command, args) {
  let executable = command;
  let commandArgs = args;
  if (process.platform === 'win32' && /\.cmd$/i.test(command)) {
    executable = process.env.ComSpec || 'C:\\Windows\\System32\\cmd.exe';
    commandArgs = ['/d', '/c', 'call', command, ...args];
  }
  const result = cp.spawnSync(executable, commandArgs, { cwd: root, encoding: 'utf8', shell: false, windowsHide: true, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} exited with code ${result.status}`);
}

run(process.execPath, ['scripts/prepare-runtime-staging.js']);
const packager = path.join(root, 'node_modules', '.bin', process.platform === 'win32' ? 'electron-packager.cmd' : 'electron-packager');
run(packager, ['build/runtime-staging', 'Aurora Forge', '--platform=linux', '--arch=x64', '--out=dist', '--overwrite', '--asar.unpackDir=app/tools', '--icon=app/assets/img/app-icon-256.png', '--app-version=1.7.0', '--build-version=1.7.0']);

const readme = [
  'Aurora Forge 1.7 Major RC1 — Native Linux x64', '',
  'Run:', '  ./aurora-forge', '',
  'If your file manager removed the executable permission:', '  chmod +x aurora-forge', '',
  'Aurora Forge is a WWE 2K26 prompt generator and workflow-preparation workspace.',
  'It builds prompts and handoff packs for the compatible AI tool you choose.', '',
  'Linux-native capabilities include prompt builders, prompt review/export, projects, setup, references, validation guidance, and CAK catalog browsing/search.',
  'DDS conversion and CAK extraction are disabled on Linux because the included DirectXTex and WWE/Oodle helpers are Windows-native. They remain available in the Windows package.',
  'No prompt is sent to an AI provider automatically.'
].join('\n');
fs.writeFileSync(path.join(appFolder, 'README_LINUX.txt'), readme + '\n', 'utf8');
fs.mkdirSync(releaseDir, { recursive: true });
if (fs.existsSync(archivePath)) fs.rmSync(archivePath, { force: true });

if (process.platform === 'win32') {
  run('python', ['scripts/create-linux-archive.py', appFolder, archivePath]);
} else {
  run('tar', ['-czf', archivePath, '-C', appFolder, '.']);
}
const hash = crypto.createHash('sha256').update(fs.readFileSync(archivePath)).digest('hex');
fs.writeFileSync(archivePath + '.sha256.txt', `${hash}  ${archiveName}\n`, 'ascii');
console.log(`Linux archive created: ${archivePath}`);
console.log(`SHA-256: ${hash}`);
