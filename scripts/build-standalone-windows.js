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
  { id: 'cak', product: 'Aurora Forge CAK Extractor Repackager', main: 'electron/standalone-cak-main.js', page: 'cak-explorer.html', script: 'cak-explorer.js', data: true, tool: 'cak-helper', zip: 'Aurora-Forge-CAK-Extractor-Repackager-1.7Major-RC1-Windows-x64.zip' },
  { id: 'dds', product: 'Aurora Forge DDS Converter', main: 'electron/standalone-dds-main.js', page: 'dds-converter.html', script: 'dds-converter.js', tool: 'texconv', zip: 'Aurora-Forge-DDS-Converter-1.7Major-RC1-Windows-x64.zip' }
];

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const from = path.join(src, entry.name);
    const to = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(from, to);
    else fs.copyFileSync(from, to);
  }
}

function createStandaloneStaging(variant) {
  const target = path.join(root, 'build', `standalone-${variant.id}`);
  fs.rmSync(target, { recursive: true, force: true });
  fs.mkdirSync(path.join(target, 'app', 'assets', 'css'), { recursive: true });
  fs.mkdirSync(path.join(target, 'app', 'assets', 'js'), { recursive: true });
  fs.mkdirSync(path.join(target, 'app', 'assets', 'img'), { recursive: true });
  copyDir(path.join(runtime, 'electron'), path.join(target, 'electron'));
  fs.copyFileSync(path.join(runtime, 'app', 'assets', 'css', 'style.css'), path.join(target, 'app', 'assets', 'css', 'style.css'));
  fs.copyFileSync(path.join(runtime, 'app', 'assets', 'js', variant.script), path.join(target, 'app', 'assets', 'js', variant.script));
  fs.copyFileSync(path.join(runtime, 'app', 'assets', 'img', 'app-icon.ico'), path.join(target, 'app', 'assets', 'img', 'app-icon.ico'));
  let html = fs.readFileSync(path.join(runtime, 'app', variant.page), 'utf8');
  html = html.replace(/<body class="([^"]*)">/, '<body class="$1 standalone-tool">');
  html = html.replace(/\s*<aside class="app-sidebar">[\s\S]*?<\/aside>/, '');
  html = html.replace(/\s*<div class="ai-actions"><a class="ai-btn secondary" href="tutorials\.html[\s\S]*?<\/div>/, '');
  html = html.replace(/\s*<script src="assets\/js\/(?:app-config-loader|desktop-bridge)\.js[^>]*><\/script>/g, '');
  fs.writeFileSync(path.join(target, 'app', variant.page), html);
  if (variant.data) {
    fs.mkdirSync(path.join(target, 'app', 'data'), { recursive: true });
    fs.copyFileSync(path.join(runtime, 'app', 'data', 'cak-known-paths.json'), path.join(target, 'app', 'data', 'cak-known-paths.json'));
  }
  copyDir(path.join(runtime, 'app', 'tools', variant.tool), path.join(target, 'app', 'tools', variant.tool));
  const pkg = JSON.parse(fs.readFileSync(path.join(runtime, 'package.json'), 'utf8'));
  pkg.name = `aurora-forge-${variant.id}-standalone`;
  pkg.productName = variant.product;
  pkg.description = `${variant.product}. Independent portable tool release.`;
  pkg.main = variant.main;
  fs.writeFileSync(path.join(target, 'package.json'), JSON.stringify(pkg, null, 2) + '\n');
  fs.writeFileSync(path.join(target, 'README.txt'), `${variant.product}\n\nIndependent portable application. The full Aurora Forge application is not required.\n`);
  if (html.includes('class="app-sidebar"') || /href="(?:index|project-manager|creative-studios|tools|tutorials|setup|about)\.html/.test(html)) {
    throw new Error(`${variant.product} still contains full Aurora Forge navigation.`);
  }
  return target;
}

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

// Always regenerate staging. Reusing it can silently ship stale launchers, styles, or tool resources.
run(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'prepare:runtime']);
fs.mkdirSync(release, { recursive: true });

for (const variant of variants) {
  const standalone = createStandaloneStaging(variant);
  run(packager, [path.relative(root, standalone), variant.product, '--platform=win32', '--arch=x64', '--out=dist', '--overwrite', '--asar.unpackDir=app/tools', '--icon=app/assets/img/app-icon.ico', `--app-version=${version}`, `--build-version=${version}`]);
  const source = path.join(dist, `${variant.product}-win32-x64`);
  const destination = path.join(release, variant.zip);
  if (fs.existsSync(destination)) fs.rmSync(destination, { force: true });
  run('powershell.exe', ['-NoProfile', '-Command', `Compress-Archive -Path '${source.replace(/'/g, "''")}\\*' -DestinationPath '${destination.replace(/'/g, "''")}' -CompressionLevel Optimal -Force`]);
  console.log(`Created ${destination}`);
}
