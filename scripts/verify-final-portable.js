const fs = require('fs');
const path = require('path');
const cp = require('child_process');

const root = path.join(__dirname, '..');
const appFolder = path.join(root, 'dist', 'Aurora Forge-win32-x64');
const zipPath = path.join(root, 'portable-release', 'Aurora-Forge-1.7Major-RC1-Windows-x64.zip');
const asarPath = path.join(appFolder, 'resources', 'app.asar');
const unpackedTools = path.join(appFolder, 'resources', 'app.asar.unpacked', 'app', 'tools');

function assert(ok, msg) {
  if (!ok) {
    console.error('FAIL:', msg);
    process.exitCode = 1;
  } else {
    console.log('OK:', msg);
  }
}

function exists(...parts) {
  return fs.existsSync(path.join(...parts));
}

assert(exists(appFolder), 'portable app folder exists');
assert(exists(appFolder, 'Aurora Forge.exe'), 'portable EXE exists');
assert(exists(appFolder, 'resources'), 'resources folder exists');
assert(exists(appFolder, 'locales'), 'locales folder exists');
assert(exists(appFolder, 'README_RUN_PORTABLE_APP.txt'), 'portable runtime README exists');

const hasAsar = exists(appFolder, 'resources', 'app.asar');
const hasUnpackedApp = exists(appFolder, 'resources', 'app');
assert(hasAsar || hasUnpackedApp, 'packaged app runtime exists in resources');
assert(exists(unpackedTools, 'cak-helper', 'AuroraCakHelper.exe'), 'CAK helper is physically unpacked for Windows execution');
assert(exists(unpackedTools, 'texconv', 'texconv.exe'), 'DirectXTex converter is physically unpacked for Windows execution');
assert(exists(appFolder, 'chrome_100_percent.pak') || exists(appFolder, 'chrome_200_percent.pak'), 'Electron chrome pak runtime files exist');
assert(exists(appFolder, 'icudtl.dat'), 'Electron icudtl.dat exists');
assert(exists(appFolder, 'v8_context_snapshot.bin') || exists(appFolder, 'snapshot_blob.bin'), 'Electron V8 snapshot runtime file exists');

assert(!exists(appFolder, 'package-lock.json'), 'portable folder does not expose package-lock.json at root');
assert(!exists(appFolder, 'node_modules'), 'portable folder does not include root node_modules');
assert(!exists(appFolder, 'BUILD_TRUE_PORTABLE_WINDOWS.bat'), 'portable folder does not include build scripts at root');

assert(exists(zipPath), 'final portable ZIP exists');

try {
  const list = cp.execFileSync('powershell', [
    '-NoProfile',
    '-Command',
    `Add-Type -AssemblyName System.IO.Compression.FileSystem; [IO.Compression.ZipFile]::OpenRead('${zipPath.replace(/'/g, "''")}').Entries.FullName`
  ], { encoding: 'utf8' });
  const entries = list.split(/\r?\n/).map(function (entry) {
    return entry.trim().replace(/\\/g, '/');
  }).filter(Boolean);
  const hasExact = function (name) { return entries.includes(name); };
  const hasPrefix = function (prefix) { return entries.some(function (entry) { return entry === prefix || entry.startsWith(prefix); }); };
  const hasRootForbidden = function (name) { return entries.some(function (entry) { return entry === name || entry.startsWith(name + '/'); }); };

  assert(hasExact('Aurora Forge.exe'), 'portable ZIP contains EXE');
  assert(hasExact('README_RUN_PORTABLE_APP.txt'), 'portable ZIP contains runtime README');
  assert(hasPrefix('resources/'), 'portable ZIP contains required Electron resources runtime entries');
  assert(hasExact('resources/app.asar.unpacked/app/tools/cak-helper/AuroraCakHelper.exe'), 'portable ZIP contains runnable unpacked CAK helper');
  assert(hasExact('resources/app.asar.unpacked/app/tools/texconv/texconv.exe'), 'portable ZIP contains runnable unpacked DirectXTex converter');
  assert(hasPrefix('locales/'), 'portable ZIP contains required Electron locales runtime entries');
  assert(!hasRootForbidden('package-lock.json'), 'portable ZIP does not include package-lock.json at root');
  assert(!hasRootForbidden('BUILD_TRUE_PORTABLE_WINDOWS.bat'), 'portable ZIP does not include build batch file');
  assert(!hasRootForbidden('scripts'), 'portable ZIP does not include builder scripts folder');
  assert(!hasRootForbidden('node_modules'), 'portable ZIP does not include root node_modules folder');
  assert(!hasRootForbidden('build'), 'portable ZIP does not include build staging folder');
} catch (err) {
  console.warn('WARN: Could not inspect ZIP with PowerShell:', err.message);
}

try {
  let packagedEntries = [];
  if (exists(asarPath)) {
    packagedEntries = require('@electron/asar').listPackage(asarPath);
  } else {
    const looseRoot = path.join(appFolder, 'resources', 'app');
    const walk = function (directory) {
      for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        const full = path.join(directory, entry.name);
        if (entry.isDirectory()) walk(full);
        else packagedEntries.push(path.relative(looseRoot, full));
      }
    };
    walk(looseRoot);
  }
  packagedEntries = packagedEntries.map(function (entry) {
    return entry.replace(/\\/g, '/').replace(/^\/+/, '');
  });
  const containsSuffix = function (suffix) {
    return packagedEntries.some(function (entry) { return entry.endsWith(suffix); });
  };
  assert(containsSuffix('app/project-manager.html'), 'packaged runtime contains consolidated Projects');
  assert(containsSuffix('app/creative-studios.html'), 'packaged runtime contains Prompt Builders hub');
  assert(containsSuffix('app/tools.html'), 'packaged runtime contains Tools hub');
  assert(containsSuffix('app/faq.html'), 'packaged runtime contains prompt-generator FAQ');
  assert(containsSuffix('app/complete-character-modding-guide.html'), 'packaged runtime contains complete character guide');
  assert(containsSuffix('app/data/wwe2k26-modding-facts.json'), 'packaged runtime contains current modding fact library');
  assert(containsSuffix('app/tutorials.html'), 'packaged runtime contains consolidated Tutorials');
  assert(containsSuffix('app/setup.html'), 'packaged runtime contains consolidated Setup');
  assert(containsSuffix('app/assets/js/easy-guide-data.js'), 'packaged runtime contains beginner lesson data');
  assert(containsSuffix('app/assets/js/easy-guide.js'), 'packaged runtime contains beginner lesson logic');
  assert(containsSuffix('app/training/community-reference/tribute26-replace-slot-checkbox.png'), 'packaged runtime contains the Tribute slot-replacement reference');
  assert(containsSuffix('app/training/community-reference/tribute26-entrance-template-editor.png'), 'packaged runtime contains the Tribute entrance-template reference');
  assert(containsSuffix('app/training/community-reference/tribute26-prop-profile-generator.mp4'), 'packaged runtime contains the compressed Tribute prop tutorial');
  assert(containsSuffix('app/caw-character-builder.html'), 'packaged runtime contains Creator Suite');
  assert(containsSuffix('app/character-viewer.html'), 'packaged runtime contains Character Viewer');
  assert(containsSuffix('app/dds-converter.html'), 'packaged runtime contains automatic DDS Converter');
  assert(containsSuffix('app/assets/js/dds-converter.js'), 'packaged runtime contains DDS Converter interface logic');
  assert(containsSuffix('app/cak-explorer.html'), 'packaged runtime contains Game Archive Explorer');
  assert(containsSuffix('app/assets/js/cak-explorer.js'), 'packaged runtime contains Game Archive Explorer interface logic');
  assert(containsSuffix('electron/archive-repackager.js'), 'packaged runtime contains the verified project repackager');
  assert(containsSuffix('app/data/cak-known-paths.json'), 'packaged runtime contains the real-path CAK catalog');
  assert(containsSuffix('app/tools/cak-helper/AuroraCakHelper.exe'), 'packaged runtime contains self-contained x64 CAK extraction helper');
  assert(containsSuffix('electron/cak-reader.js'), 'packaged runtime contains read-only CAK catalog reader');
  assert(containsSuffix('app/tools/texconv/texconv.exe'), 'packaged runtime contains Microsoft DirectXTex converter');
  assert(containsSuffix('app/tools/texconv/LICENSE.txt'), 'packaged runtime contains DirectXTex MIT license');
  assert(containsSuffix('app/tools/texconv/SOURCE.txt'), 'packaged runtime contains DirectXTex source and checksum record');
  assert(containsSuffix('app/assets/js/character-viewer.js'), 'packaged runtime contains Character Viewer logic');
  assert(containsSuffix('app/assets/vendor/three/three.module.min.js'), 'packaged runtime contains local Three.js runtime');
  assert(containsSuffix('app/assets/vendor/three/three.core.min.js'), 'packaged runtime contains local Three.js core runtime');
  assert(containsSuffix('app/assets/vendor/three/THREE-LICENSE.txt'), 'packaged runtime contains Three.js license');
  assert(containsSuffix('app/tool-center.html'), 'packaged runtime contains old-link compatibility page for Setup');
  assert(containsSuffix('app/arena-ring-branding-studio.html'), 'packaged runtime contains active Arena studio');
  assert(containsSuffix('app/faction-pack-builder.html'), 'packaged runtime contains active Faction studio');
  assert(containsSuffix('app/reference-cleanup-pipeline.html'), 'packaged runtime contains active Reference Cleanup workflow');
  assert(containsSuffix('app/downloads/Aurora_Forge_Reader_Handbook.docx'), 'packaged runtime contains the Reader Handbook DOCX');
  assert(containsSuffix('app/downloads/Aurora_Forge_Reader_Handbook.pdf'), 'packaged runtime contains the Reader Handbook PDF');
  assert(!packagedEntries.some(function (entry) {
    return /(^|\/)(face-texture-tutorial|texture-install-training-pack)\.html$/i.test(entry);
  }), 'packaged runtime does not contain replaced tutorial pages');
  assert(!packagedEntries.some(function (entry) {
    return /texture-install-training-pack.*\.zip$/i.test(entry);
  }), 'packaged runtime does not contain legacy tutorial-pack ZIPs');
} catch (err) {
  console.error('FAIL: Could not inspect packaged app runtime:', err.message);
  process.exitCode = 1;
}

if (process.exitCode) process.exit(process.exitCode);
