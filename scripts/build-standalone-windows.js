'use strict';

const fs = require('fs');
const path = require('path');
const cp = require('child_process');

const root = path.join(__dirname, '..');
const runtime = path.join(root, 'build', 'runtime-staging');
const dist = path.join(root, 'dist');
const release = path.join(root, 'portable-release');
const packager = path.join(root, 'node_modules', '.bin', process.platform === 'win32' ? 'electron-packager.cmd' : 'electron-packager');
const version = '1.7.5';
const variants = [
  { id: 'cak', product: 'Aurora CAK Foundry', version: '1.7.6c', runtimeVersion: '1.7.6', releaseNotes: 'CAK_FOUNDRY_RELEASE_NOTES_1.7.6c.md', bugReport: 'AURORA_CAK_FOUNDRY_v1.7.6c_BUG_REPORT.md', fixReport: 'AURORA_CAK_FOUNDRY_v1.7.6c_FIX_REPORT.md', main: 'electron/standalone-cak-main.js', page: 'cak-explorer.html', script: 'cak-explorer.js', data: true, tool: 'cak-helper', zip: 'Aurora-CAK-Foundry-v1.7.6c-Windows-x64.zip' },
  { id: 'dds', product: 'Aurora Forge DDS Converter', version: '1.7.5a', runtimeVersion: '1.7.5', main: 'electron/standalone-dds-main.js', page: 'dds-converter.html', script: 'dds-converter.js', tool: 'texconv', zip: 'Aurora-Forge-DDS-Converter-v1.7.5a-Windows-x64.zip' },
  { id: 'pac19', product: 'Aurora Forge WWE 2K19 Project', version: '0.1.01a', runtimeVersion: '0.1.1', channel: 'Research Preview', main: 'electron/standalone-pac19-main.js', page: 'pac19-explorer.html', script: 'pac19-explorer.js', tool: 'pac19-helper', helperScript: 'build:pac19-helper', supportScripts: ['analyze-2k19-motion.js'], zip: 'Aurora-Forge-WWE2K19-Project-v0.1.01a-Research-Preview-Windows-x64.zip' },
  { id: 'cak20', product: 'Aurora Forge WWE 2K20 CAK Workbench', version: '1.7.5a', runtimeVersion: '1.7.5', main: 'electron/standalone-cak20-main.js', page: 'cak20-explorer.html', script: 'cak20-explorer.js', zip: 'Aurora-Forge-WWE2K20-CAK-Workbench-v1.7.5a-Windows-x64.zip' }
];
const requestedVariant = process.argv[2] || '';
const selectedVariants = requestedVariant ? variants.filter((variant) => variant.id === requestedVariant) : variants;
if (!selectedVariants.length) throw new Error(`Unknown standalone tool: ${requestedVariant}`);
for (const variant of variants) {
  if (!variant.id || !variant.product || !variant.version || !variant.runtimeVersion || !variant.zip) throw new Error('Every standalone project must define an immutable release identity.');
  if (!variant.zip.includes(`v${variant.version}`)) throw new Error(`${variant.product}: artifact filename does not contain public version ${variant.version}.`);
}

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
  fs.mkdirSync(path.join(target, 'scripts'), { recursive: true });
  fs.copyFileSync(path.join(root, 'scripts', 'analyze-2k19-motion.js'), path.join(target, 'scripts', 'analyze-2k19-motion.js'));
  copyDir(path.join(runtime, 'electron'), path.join(target, 'electron'));
  const publicVersion = variant.version;
  const runtimeVersion = variant.runtimeVersion;
  const launcherPath = path.join(target, variant.main);
  const launcher = fs.readFileSync(launcherPath, 'utf8').replace(
    /process\.env\.AURORA_WINDOW_TITLE = '[^']*';/,
    `process.env.AURORA_WINDOW_TITLE = '${variant.product} v${publicVersion}${variant.channel ? ` ${variant.channel}` : ''}';`
  );
  fs.writeFileSync(launcherPath, launcher, 'utf8');
  fs.copyFileSync(path.join(runtime, 'app', 'assets', 'css', 'style.css'), path.join(target, 'app', 'assets', 'css', 'style.css'));
  fs.copyFileSync(path.join(runtime, 'app', 'assets', 'js', variant.script), path.join(target, 'app', 'assets', 'js', variant.script));
  fs.copyFileSync(path.join(runtime, 'app', 'assets', 'img', 'app-icon.ico'), path.join(target, 'app', 'assets', 'img', 'app-icon.ico'));
  // The shared Electron main process imports this fail-closed compatibility
  // profile during startup, even when a standalone tool does not expose loader
  // controls. Keep the exact reviewed profile in every standalone runtime.
  fs.mkdirSync(path.join(target, 'app', 'data', 'compatibility'), { recursive: true });
  fs.copyFileSync(
    path.join(runtime, 'app', 'data', 'compatibility', 'secure-datacrtllink.json'),
    path.join(target, 'app', 'data', 'compatibility', 'secure-datacrtllink.json')
  );
  let html = fs.readFileSync(path.join(runtime, 'app', variant.page), 'utf8');
  html = html.replace(/<body class="([^"]*)">/, '<body class="$1 standalone-tool">');
  html = html.replace(/\s*<aside class="app-sidebar">[\s\S]*?<\/aside>/, '');
  html = html.replace(/\s*<div class="ai-actions"><a class="ai-btn secondary" href="tutorials\.html[\s\S]*?<\/div>/, '');
  html = html.replace(/\s*<script src="assets\/js\/(?:app-config-loader|desktop-bridge)\.js[^>]*><\/script>/g, '');
  fs.writeFileSync(path.join(target, 'app', variant.page), html);
  if (variant.data) {
    fs.copyFileSync(path.join(runtime, 'app', 'data', 'cak-known-paths.json'), path.join(target, 'app', 'data', 'cak-known-paths.json'));
  }
  if (variant.tool) copyDir(path.join(runtime, 'app', 'tools', variant.tool), path.join(target, 'app', 'tools', variant.tool));
  if (variant.id === 'cak') {
    const texconvSrc = path.join(runtime, 'app', 'tools', 'texconv');
    const texconvDst = path.join(target, 'app', 'tools', 'texconv');
    if (fs.existsSync(texconvSrc)) copyDir(texconvSrc, texconvDst);
    const rootDocs = ['FAQ.md', 'RELEASE_NOTES_1.7.5.md', 'CAK_FOUNDRY_RELEASE_NOTES_1.7.5.md', variant.releaseNotes, variant.bugReport, variant.fixReport, 'INSTALLATION_AND_ROLLBACK.md'].filter(Boolean);
    for (const name of rootDocs) {
      const s = path.join(root, name);
      if (fs.existsSync(s)) fs.copyFileSync(s, path.join(target, name));
    }
    const tpnDirSrc = path.join(runtime, 'app', 'tools', 'pac19-helper');
    const tpnDirDst = path.join(target, 'THIRD-PARTY-NOTICES');
    fs.mkdirSync(tpnDirDst, { recursive: true });
    const dxLicenseSrc = path.join(runtime, 'app', 'tools', 'texconv', 'LICENSE.txt');
    if (fs.existsSync(dxLicenseSrc)) fs.copyFileSync(dxLicenseSrc, path.join(tpnDirDst, 'DirectXTex-LICENSE.txt'));
  }
  if (variant.supportScripts) {
    for (const script of variant.supportScripts) {
      fs.copyFileSync(path.join(root, 'scripts', script), path.join(target, 'scripts', script));
    }
  }
  const pkg = JSON.parse(fs.readFileSync(path.join(runtime, 'package.json'), 'utf8'));
  const standaloneVersion = runtimeVersion;
  pkg.name = `aurora-forge-${variant.id}-standalone`;
  pkg.version = standaloneVersion;
  pkg.productName = variant.product;
  pkg.description = `${variant.product}. Independent portable tool release.`;
  pkg.main = variant.main;
  pkg.auroraRelease = { project: variant.id, product: variant.product, publicVersion, runtimeVersion, channel: variant.channel || 'Ready', artifact: variant.zip };
  fs.writeFileSync(path.join(target, 'package.json'), JSON.stringify(pkg, null, 2) + '\n');
  const identity = {
    readabilityNote: 'I ran this document through an “explain like I am five” chatbot to improve readability, explainability, and usability. The chatbot helped present the material; it did not originate Aurora Forge, DataCtrlLink, their functionality, or the underlying development work.',
    schema: 'aurora-release-identity/v1', project: variant.id, product: variant.product,
    publicVersion, runtimeVersion, channel: variant.channel || 'Ready', artifact: variant.zip
  };
  fs.mkdirSync(path.join(target, 'app', 'data'), { recursive: true });
  fs.writeFileSync(path.join(target, 'app', 'data', 'release-identity.json'), JSON.stringify(identity, null, 2) + '\n', 'utf8');
  fs.writeFileSync(path.join(target, 'RELEASE_IDENTITY.txt'), `**Readability note:** ${identity.readabilityNote}\n\nProduct: ${identity.product}\nPublic version: ${identity.publicVersion}\nRuntime version: ${identity.runtimeVersion}\nChannel: ${identity.channel}\nArtifact: ${identity.artifact}\n`, 'utf8');
  const standaloneReadme = variant.id === 'cak'
    ? fs.readFileSync(path.join(root, variant.releaseNotes || 'CAK_FOUNDRY_RELEASE_NOTES_1.7.5.md'), 'utf8')
    : `**Readability note:** I ran this document through an “explain like I am five” chatbot to improve readability, explainability, and usability. The chatbot helped present the material; it did not originate Aurora Forge, DataCtrlLink, their functionality, or the underlying development work.\n\n${variant.product}${variant.channel ? ` v${standaloneVersion} ${variant.channel}` : ''}\n\nIndependent portable application. The full Aurora Forge application is not required.\n`;
  fs.writeFileSync(path.join(target, 'README.txt'), standaloneReadme);
  fs.copyFileSync(path.join(root, 'LICENSE'), path.join(target, 'AURORA-FORGE-LICENSE.txt'));
  if (!fs.existsSync(path.join(target, 'app', 'data', 'compatibility', 'secure-datacrtllink.json'))) {
    throw new Error(`${variant.product} is missing the shared startup compatibility profile.`);
  }
  for (const script of variant.supportScripts || []) {
    if (!fs.existsSync(path.join(target, 'scripts', script))) throw new Error(`${variant.product} is missing required support script ${script}.`);
  }
  if (html.includes('class="app-sidebar"') || /href="(?:index|project-manager|creative-studios|tools|tutorials|setup|about)\.html/.test(html)) {
    throw new Error(`${variant.product} still contains full Aurora Forge navigation.`);
  }
  return target;
}
/////if you are reading this you are a nerd :)
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

function normalizeZipTimestamps(directory) {
  const safeDate = new Date();
  function walk(target) {
    const stat = fs.statSync(target);
    if (stat.isDirectory()) {
      for (const entry of fs.readdirSync(target)) walk(path.join(target, entry));
    }
    fs.utimesSync(target, safeDate, safeDate);
  }
  walk(directory);
}

// Always regenerate staging. Reusing it can silently ship stale launchers, styles, or tool resources.
for (const helperScript of [...new Set(selectedVariants.map((variant) => variant.helperScript).filter(Boolean))]) {
  run(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', helperScript]);
}
run(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'prepare:runtime']);
fs.mkdirSync(release, { recursive: true });

for (const variant of selectedVariants) {
  const standaloneVersion = variant.version;
  const runtimeVersion = variant.runtimeVersion;
  const standalone = createStandaloneStaging(variant);
  run(packager, [path.relative(root, standalone), variant.product, '--platform=win32', '--arch=x64', '--out=dist', '--overwrite', '--asar.unpackDir=app/tools', '--icon=app/assets/img/app-icon.ico', `--app-version=${runtimeVersion}`, `--build-version=${runtimeVersion}`]);
  const source = path.join(dist, `${variant.product}-win32-x64`);
  fs.copyFileSync(path.join(standalone, 'README.txt'), path.join(source, 'README.txt'));
  fs.copyFileSync(path.join(standalone, 'AURORA-FORGE-LICENSE.txt'), path.join(source, 'AURORA-FORGE-LICENSE.txt'));
  fs.copyFileSync(path.join(standalone, 'RELEASE_IDENTITY.txt'), path.join(source, 'RELEASE_IDENTITY.txt'));
  if (variant.id === 'cak') {
    const rootDocs = ['FAQ.md', 'RELEASE_NOTES_1.7.5.md', 'CAK_FOUNDRY_RELEASE_NOTES_1.7.5.md', variant.releaseNotes, variant.bugReport, variant.fixReport, 'INSTALLATION_AND_ROLLBACK.md'].filter(Boolean);
    for (const name of rootDocs) {
      const s = path.join(root, name);
      if (fs.existsSync(s)) fs.copyFileSync(s, path.join(source, name));
    }
    const portableReadme = `**Readability note:** I ran this document through an “explain like I am five” chatbot to improve readability, explainability, and usability. The chatbot helped present the material; it did not originate Aurora Forge, DataCtrlLink, their functionality, or the underlying development work.\n\nAurora CAK Foundry — Portable Windows App\n\nHow to run:\n1. Extract this ZIP.\n2. Double-click Aurora CAK Foundry.exe.\n\nKeep the extracted files together. The EXE depends on the included resources, locales, DLL, and PAK runtime files.\n\nAurora CAK Foundry reads selected CAK archives without changing them.\nIt writes only to a separate output folder and uses the Oodle library from your own installed game. No game archive or Oodle DLL is bundled in Aurora CAK Foundry.\n\nVersion: ${standaloneVersion}\n`;
    fs.writeFileSync(path.join(source, 'README_RUN_PORTABLE_APP.txt'), portableReadme);
    const tpnDirDst = path.join(source, 'THIRD-PARTY-NOTICES');
    fs.mkdirSync(tpnDirDst, { recursive: true });
    const dxLicenseSrc = path.join(runtime, 'app', 'tools', 'texconv', 'LICENSE.txt');
    if (fs.existsSync(dxLicenseSrc)) fs.copyFileSync(dxLicenseSrc, path.join(tpnDirDst, 'DirectXTex-LICENSE.txt'));
  }
  const destination = path.join(release, variant.zip);
  if (fs.existsSync(destination)) fs.rmSync(destination, { force: true });
  normalizeZipTimestamps(source);
  run('powershell.exe', ['-NoProfile', '-Command', `Compress-Archive -Path '${source.replace(/'/g, "''")}\\*' -DestinationPath '${destination.replace(/'/g, "''")}' -CompressionLevel Optimal -Force`]);
  console.log(`Created ${destination}`);
}
