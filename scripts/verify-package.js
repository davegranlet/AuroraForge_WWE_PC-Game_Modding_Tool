const fs = require('fs');
const path = require('path');
const cp = require('child_process');
const crypto = require('crypto');

const root = path.join(__dirname, '..');
const appRoot = path.join(root, 'app');
let failures = 0;

function ok(condition, message) {
  if (condition) console.log('OK:', message);
  else {
    console.error('FAIL:', message);
    failures += 1;
  }
}
function read(...parts) {
  return fs.readFileSync(path.join(root, ...parts), 'utf8');
}
function exists(...parts) {
  return fs.existsSync(path.join(root, ...parts));
}
function json(...parts) {
  return JSON.parse(read(...parts));
}
function count(text, value) {
  return text.split(value).length - 1;
}

const pkg = json('package.json');
const lock = json('package-lock.json');
const manifest = json('app', 'app-manifest.json');
const config = json('app', 'config', 'app-config.json');
const mainJs = read('electron', 'main.js');
const preloadJs = read('electron', 'preload.js');
const guideDataJs = read('app', 'assets', 'js', 'easy-guide-data.js');

ok(pkg.version === '1.6.0-rc.1', 'standards-safe package version is 1.6.0-rc.1');
ok(lock.version === '1.6.0-rc.1' && lock.packages[''].version === '1.6.0-rc.1', 'package-lock root version matches');
ok(manifest.release === '1.6.0 RC1' && manifest.releaseTitle === 'Prompt Builder Edition', 'manifest identifies visible Prompt Builder Edition');
ok(config.release === '1.6.0 RC1' && config.releaseTitle === 'Prompt Builder Edition', 'app config identifies visible Prompt Builder Edition');
ok(pkg.devDependencies.electron === '43.2.0', 'Electron is exactly pinned');
ok(pkg.devDependencies['@electron/packager'] === '20.0.4', 'Electron Packager is exactly pinned');
ok(pkg.dependencies.three === '0.185.1', 'Three.js is exactly pinned');
ok(!JSON.stringify(pkg).includes('"latest"'), 'no latest dependency ranges are used');
ok(!JSON.stringify(pkg).includes('electron-builder'), 'electron-builder is not used');

const required = [
  'app/index.html',
  'app/project-manager.html',
  'app/creative-studios.html',
  'app/tools.html',
  'app/faq.html',
  'app/tutorials.html',
  'app/complete-character-modding-guide.html',
  'app/data/wwe2k26-modding-facts.json',
  'app/handbook-reader.html',
  'app/setup.html',
  'app/about.html',
  'app/caw-character-builder.html',
  'app/lmask-project-studio.html',
  'app/face-texture-studio.html',
  'app/tattoo-pipeline.html',
  'app/character-viewer.html',
  'app/face-calibration-workflow.html',
  'app/mod-file-inspector.html',
  'app/dds-converter.html',
  'app/assets/js/dds-converter.js',
  'app/cak-explorer.html',
  'app/data/cak-known-paths.json',
  'app/assets/js/cak-explorer.js',
  'app/tools/cak-helper/AuroraCakHelper.exe',
  'app/tools/cak-helper/README.txt',
  'electron/cak-reader.js',
  'electron/archive-repackager.js',
  'electron/archive-repackager.js',
  'tools/AuroraCakHelper/AuroraCakHelper.csproj',
  'tools/AuroraCakHelper/Program.cs',
  'LICENSE',
  'app/tools/texconv/texconv.exe',
  'app/tools/texconv/LICENSE.txt',
  'app/tools/texconv/SOURCE.txt',
  'app/assets/js/easy-guide-data.js',
  'app/assets/js/easy-guide.js',
  'app/assets/js/handbook-reader.js',
  'app/assets/js/tool-center.js',
  'app/training/community-reference/tribute26-replace-slot-checkbox.png',
  'app/training/community-reference/tribute26-entrance-template-editor.png',
  'app/training/community-reference/tribute26-prop-profile-generator.mp4',
  'app/downloads/Aurora_Forge_Reader_Handbook.docx',
  'app/downloads/Aurora_Forge_Reader_Handbook.pdf',
  'electron/main.js',
  'electron/preload.js'
];
required.forEach((item) => ok(exists(item), item + ' exists'));

const allFiles = [];
function walk(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(full);
    else allFiles.push(full);
  }
}
walk(appRoot);
ok(!allFiles.some((file) => file.toLowerCase().endsWith('.php')), 'no PHP files are present');
ok(!allFiles.some((file) => /\.(dds|mcd|mtls|jmtl|ycl|cak)$/i.test(file)), 'no extracted game or proprietary character assets are bundled');

const expectedPrimary = [
  'index.html',
  'project-manager.html',
  'creative-studios.html',
  'tools.html',
  'tutorials.html',
  'setup.html',
  'about.html'
];
ok(manifest.primaryNavigation.length === 7, 'manifest contains seven primary navigation items');
ok(JSON.stringify(manifest.primaryNavigation.map((item) => item.file)) === JSON.stringify(expectedPrimary), 'manifest primary navigation order is correct');
ok(manifest.creativeStudios.length === 13, 'manifest groups thirteen creative studios');
ok(manifest.tools.length === 5, 'manifest groups five built-in tools');

const compatibilityPages = new Set(['desktop-dashboard.html', 'tool-center.html', 'knowledgebase.html']);
const normalHtmlFiles = fs.readdirSync(appRoot).filter((name) =>
  name.endsWith('.html') && !compatibilityPages.has(name)
);
const studioFiles = new Set(manifest.creativeStudios.map((item) => item.file).concat([
  'creative-studios.html', 'lmask-idea-library.html', 'lmask-mapping-handoff.html', 'luchador-mask-generator.html'
]));
const toolFiles = new Set(manifest.tools.map((item) => item.file).concat(['tools.html']));

normalHtmlFiles.forEach((file) => {
  const html = fs.readFileSync(path.join(appRoot, file), 'utf8');
  const navMatch = html.match(/<nav class="app-side-nav" aria-label="Primary app navigation">([\s\S]*?)<\/nav>/);
  ok(Boolean(navMatch), file + ' has primary navigation');
  if (!navMatch) return;
  const nav = navMatch[1];
  expectedPrimary.forEach((href) => ok(count(nav, `href="${href}"`) === 1, `${file} contains one ${href} navigation link`));
  ok(count(nav, 'app-nav-link active') === 1, file + ' has one active main section');
  ok(!/Workspace|External Tools|More studios|Easy Guide<\/strong>|Creator Suite<\/strong>/i.test(nav), file + ' navigation contains no old top-level labels');
  ok(!/desktop-dashboard\.html|tool-center\.html|knowledgebase\.html/i.test(nav), file + ' navigation contains no replaced destinations');

  if (studioFiles.has(file)) ok(nav.includes('class="app-nav-link active" href="creative-studios.html"'), file + ' highlights Creative Studios');
  if (toolFiles.has(file)) ok(nav.includes('class="app-nav-link active" href="tools.html"'), file + ' highlights Tools');
});

const projectsHtml = read('app', 'project-manager.html');
ok(projectsHtml.includes('Project folders') && projectsHtml.includes('id="pmOpenExportsFolder"'), 'Projects contains former Workspace folder actions');
ok(projectsHtml.includes('Change Folder Locations') && projectsHtml.includes('setup.html#storage'), 'Projects routes location changes to Setup');
ok(!projectsHtml.includes('onclick='), 'Projects uses CSP-safe button handlers');
ok(read('app', 'assets', 'js', 'project-manager.js').includes('pmCreateFolder') && read('app', 'assets', 'js', 'project-manager.js').includes('pmSaveSummary'), 'Projects button handlers are registered');
ok(read('app', 'desktop-dashboard.html').includes('url=project-manager.html'), 'old Workspace link redirects to Projects');

const setupHtml = read('app', 'setup.html');
['storage', 'game-locations', 'external-programs', 'preferences', 'setup-check'].forEach((id) => {
  ok(setupHtml.includes(`id="${id}"`), 'Setup contains ' + id + ' section');
});
ok(setupHtml.includes('storageLocationGrid') && setupHtml.includes('externalToolGrid'), 'Setup contains storage and external-program controls');
ok(!setupHtml.includes('onclick='), 'Setup uses CSP-safe button handlers');
ok(read('app', 'assets', 'js', 'setup.js').includes('setupCheckEverything') && read('app', 'assets', 'js', 'setup.js').includes('setupSavePreferences'), 'Setup button handlers are registered');
ok(read('app', 'tool-center.html').includes('url=setup.html#external-programs'), 'old External Tools link redirects to Setup');
ok(mainJs.includes('projectsFolder') && mainJs.includes('exportsFolder'), 'Electron supports persistent Projects and Exports locations');
ok(mainJs.includes('Version 1.6.0 RC1'), 'Electron About uses visible release 1.6.0 RC1');
ok(!mainJs.includes('toggleDevTools'), 'normal Electron menu does not expose developer tools');

const studiosHtml = read('app', 'creative-studios.html');
manifest.creativeStudios.forEach((studio) => {
  ok(studiosHtml.includes(`href="${studio.file}"`), 'Creative Studios links ' + studio.title);
});
['character-studios', 'clothing-studios', 'graphics-studios', 'show-studios'].forEach((id) => {
  ok(studiosHtml.includes(`id="${id}"`), 'Creative Studios contains ' + id + ' group');
});

const toolsHtml = read('app', 'tools.html');
manifest.tools.forEach((tool) => ok(toolsHtml.includes(`href="${tool.file}"`), 'Tools links ' + tool.title));
ok(!toolsHtml.includes('tool-center.html'), 'Tools does not treat external programs as built-in tools');
const ddsHtml = read('app', 'dds-converter.html');
const ddsJs = read('app', 'assets', 'js', 'dds-converter.js');
['ddsChooseInputs', 'ddsChooseOutput', 'ddsRunConversion', 'ddsConversionResults'].forEach((id) => ok(ddsHtml.includes(`id="${id}"`), 'DDS Converter contains ' + id));
['getDdsConverterStatus', 'chooseDdsConverterInputs', 'runDdsConversion', 'openDdsConverterOutput'].forEach((method) => ok(preloadJs.includes(method), 'preload exposes scoped DDS method ' + method));
['desktop:dds-converter-status', 'desktop:dds-converter-run', 'inspectDdsFile', 'inspectPngFile', 'Included Microsoft DirectXTex converter'].forEach((token) => ok(mainJs.includes(token), 'Electron DDS backend contains ' + token));
['Choose a separate output folder.', 'duplicate names from different folders', 'separate from the original DDS reference folder'].forEach((token) => ok(mainJs.includes(token), 'DDS safety guard contains: ' + token));
ok(!/require\(['"](?:fs|child_process)['"]\)|electronAPI|ipcRenderer/.test(ddsJs), 'DDS renderer has no direct filesystem, process, or IPC access');
const texconvHash = crypto.createHash('sha256').update(fs.readFileSync(path.join(appRoot, 'tools', 'texconv', 'texconv.exe'))).digest('hex').toUpperCase();
ok(texconvHash === 'DCFDEC10244E02CF5037FBA089C55FB7E1326B1C8181742D77D15FA5CB5EEF06', 'bundled official texconv binary matches recorded SHA-256');
ok(read('app', 'tools', 'texconv', 'SOURCE.txt').includes('may2026') && read('app', 'tools', 'texconv', 'LICENSE.txt').includes('MIT License'), 'DirectXTex source and MIT license are included');

const cakHtml = read('app', 'cak-explorer.html');
const cakJs = read('app', 'assets', 'js', 'cak-explorer.js');
const cakReaderJs = read('electron', 'cak-reader.js');
const cakNames = json('app', 'data', 'cak-known-paths.json');
['cakArchiveSelect', 'cakResults', 'cakChooseOutput', 'cakExtract', 'cakDevDetails'].forEach((id) => ok(cakHtml.includes(`id="${id}"`), 'Game Archive Explorer contains ' + id));
['getCakExplorerStatus', 'chooseCakArchive', 'openCakArchive', 'searchCakArchive', 'extractCakEntries'].forEach((method) => ok(preloadJs.includes(method), 'preload exposes scoped CAK method ' + method));
['desktop:cak-explorer-open', 'desktop:cak-explorer-search', 'desktop:cak-explorer-extract', 'Extraction into the game folder is blocked'].forEach((token) => ok(mainJs.includes(token), 'Electron CAK backend contains ' + token));
['decodePairs', 'recoverKey', 'parseFiles', 'parseFolders', 'buildNameCandidates'].forEach((token) => ok(cakReaderJs.includes(token), 'CAK reader contains ' + token));
ok(!/require\(['"](?:fs|child_process)['"]\)|ipcRenderer/.test(cakJs), 'CAK renderer has no direct filesystem, process, or IPC access');
ok(guideDataJs.includes("id: 'cak-explorer'"), 'Tutorials include child-friendly CAK extraction lesson');
ok(fs.statSync(path.join(appRoot, 'tools', 'cak-helper', 'AuroraCakHelper.exe')).size > 1000000, 'self-contained x64 extraction helper is included');
ok(pkg.scripts['pack:win'].includes('--asar.unpackDir=app/tools'), 'portable build unpacks executable tools from app.asar');
ok(mainJs.includes("process.resourcesPath, 'app.asar.unpacked', 'app', 'tools'"), 'packaged runtime resolves executable tools from app.asar.unpacked');
ok(Object.keys(cakNames).length === 393413, 'bundled CAK catalog contains exactly 393,413 confirmed registry paths');
const normalizedCakNames = Object.values(cakNames).map((name) => name.toLowerCase());
ok(normalizedCakNames.includes('characters/996_roxanne_perez/996_default_attire/996_attire.mtls'), 'catalog retains a verified WWE 2K26 character material-list path');
ok(normalizedCakNames.some((name) => name.startsWith('cas/')) && normalizedCakNames.some((name) => name.startsWith('arena/')), 'catalog includes newly resolved CAS and arena path families');
ok(cakReaderJs.includes('variantsFor') && cakReaderJs.includes("/^root\\//i"), 'developer catalog builder safely handles extraction trees wrapped in a Root folder');
ok(cakHtml.includes('value="resolved"') && cakHtml.includes('Unresolved entries (advanced)'), 'archive page separates ready files from unresolved research entries');
ok(cakReaderJs.includes("options.scope) ? options.scope : 'resolved'"), 'archive searches default to real-path files only');
ok(mainJs.includes('does not have a verified path in this Aurora Forge release'), 'normal extraction blocks unresolved hash-name entries and directs users to catalog updates');
ok(!mainJs.includes('findExistingExtractRoots'), 'archive opening never auto-scans a large extracted-files tree');
ok(mainJs.includes('currentCakSession = cakReader.openArchive(selected, readCakDictionary())'), 'archive opening uses the bundled dictionary immediately');
ok(!mainJs.includes('cakDictionaryPath') && !mainJs.includes('writeCakDictionary'), 'runtime catalog cannot be overridden by stale local name data');
ok(!mainJs.includes('desktop:cak-explorer-build-dictionary'), 'Electron exposes no end-user extraction-tree scanner');
ok(!preloadJs.includes('buildCakNameDictionary') && !cakJs.includes('cakBuildNames') && !cakHtml.includes('cakBuildNames'), 'archive interface exposes no end-user name-learning workflow');
ok(!setupHtml.includes('crossGenerationGrid') && !read('app', 'assets', 'js', 'tool-center.js').includes('extracts26'), 'Setup does not ask users for extracted game folders');
ok(cakHtml.includes('catalog update supplies them'), 'archive page explains release-managed name updates');
ok(cakHtml.includes('id="cakDevDetails" hidden'), 'normal archive page keeps technical session details out of view');
ok(cakJs.includes('item.nameResolved') && cakJs.includes('real filename before extraction'), 'archive interface disables unresolved selections');

const faqHtml = read('app', 'faq.html');
ok(faqHtml.includes('Is Aurora Forge an AI chatbot?') && faqHtml.includes('Does Aurora Forge generate the finished artwork?'), 'FAQ explains the prompt-generator boundary');
ok(faqHtml.includes('does not send prompts automatically') && faqHtml.includes('user controls if, when, and where'), 'FAQ explains provider choice and local control');

const tutorialsHtml = read('app', 'tutorials.html');
ok(tutorialsHtml.includes('easy-guide-list') && tutorialsHtml.includes('easy-guide-search'), 'Tutorials contains searchable Easy Guide lessons');
ok(count(tutorialsHtml, 'tutorial-video-choice') === 5, 'Tutorials contains five animated video choices');
ok(tutorialsHtml.includes('Open Complete Handbook') && tutorialsHtml.includes('Download Reader PDF'), 'Tutorials makes the reader and PDF the primary handbook options');
ok(tutorialsHtml.includes('Aurora_Forge_Reader_Handbook.docx'), 'Tutorials provides the editable Reader Handbook DOCX');
ok(tutorialsHtml.includes('complete-character-modding-guide.html') && tutorialsHtml.includes('DDS ↔ PNG Without Photoshop'), 'Tutorials links the complete character and texconv paths');
const completeGuideHtml = read('app', 'complete-character-modding-guide.html');
['Install CakeHook', 'Install and connect CakeView', 'Install and connect Tribute 26', 'Convert DDS and PNG without Photoshop', 'Add the moveset', 'Add entrance, victory, music, and graphics', 'Make the first manual bake', 'Test the whole character'].forEach((phrase) => ok(completeGuideHtml.includes(phrase), 'complete character guide includes: ' + phrase));
ok(completeGuideHtml.includes('Microsoft.DirectXTex.Texconv') && completeGuideHtml.includes('BC7_UNORM') && completeGuideHtml.includes('exact matching format'), 'DDS tutorial installs texconv and teaches target-format matching');
ok(guideDataJs.includes("id: 'dds-without-photoshop'"), 'Easy lessons include Photoshop-free DDS conversion');
const handbookHtml = read('app', 'handbook-reader.html');
const handbookPdf = fs.readFileSync(path.join(appRoot, 'downloads', 'Aurora_Forge_Reader_Handbook.pdf'));
ok(handbookHtml.includes('id="handbook-search"') && handbookHtml.includes('handbook-reader.js'), 'complete handbook has in-app search and reader controls');
ok(handbookHtml.includes('class="app-nav-link active" href="tutorials.html"'), 'complete handbook remains inside Tutorials');
ok(handbookPdf.subarray(0, 4).toString('ascii') === '%PDF', 'reader edition is a valid PDF file');
[
  'Build Your Modding Folders',
  'Install One Ready-Made Mod',
  'Build and Calibrate a Face Texture',
  'Build a Luchador Mask Texture Set',
  'Add Theme Music',
  'Build an Arena and Ring-Branding Package',
  'Diagnose by Symptom'
].forEach((phrase) => ok(handbookHtml.includes(phrase), 'reader handbook includes tutorial: ' + phrase));
ok(!/production placeholder|internal review note/i.test(handbookHtml), 'public handbook omits internal production wording');
ok(read('app', 'knowledgebase.html').includes('url=tutorials.html'), 'old knowledgebase link redirects to Tutorials');
const guideCount = (guideDataJs.match(/\bid:\s*'/g) || []).length;
ok(guideCount === 47, 'Tutorials includes exactly 47 child-friendly lessons');
[
  'alternate-attire-render',
  'ready-made-arena',
  'tribute-update-merge',
  'character-gfx',
  'animation-package',
  'quick-port-wrestler',
  'port-arena',
  'port-show-assets',
  'port-belt',
  'custom-move-package',
  'invisible-character-materials',
  'arena-prop-maps',
  'forced-entrance-gfx',
  'announcer-tts',
  'face-paint-material-check',
  'replace-character-slot',
  'protect-default-data',
  'entrance-template-editor',
  'tribute-prop-profile-generator',
  'shiny-black-character-workaround'
].forEach((guideId) => ok(guideDataJs.includes(`id: '${guideId}'`), 'Tutorials includes beginner lesson ' + guideId));
ok(guideDataJs.includes('training/community-reference/tribute26-prop-profile-generator.mp4'), 'Prop Profile Generator lesson links the included community video');
ok(guideDataJs.includes('training/community-reference/tribute26-replace-slot-checkbox.png'), 'slot replacement lesson links the supplied Tribute screenshot');
ok(guideDataJs.includes('training/community-reference/tribute26-entrance-template-editor.png'), 'entrance template lesson links the supplied Tribute screenshot');
ok(read('app', 'assets', 'js', 'easy-guide.js').includes('visualCard') && read('app', 'assets', 'js', 'easy-guide.js').includes('mediaVideo'), 'Tutorial renderer supports allowlisted local pictures and video');
['Get ready', 'Do this', 'You should see', 'Stop and check', 'Sources and videos'].forEach((label) => {
  ok(read('app', 'assets', 'js', 'easy-guide.js').includes(label), 'Tutorial renderer includes ' + label);
});

const aboutHtml = read('app', 'about.html');
ok(aboutHtml.includes('v1.6.0 RC1'), 'About displays visible version 1.6.0 RC1');
ok(aboutHtml.includes('Microsoft DirectXTex') && aboutHtml.includes('MIT License'), 'About credits the bundled open-source converter');
ok(aboutHtml.includes('extraction helper') && aboutHtml.includes('MIT License'), 'About identifies the source-available extraction helper');
ok(!normalHtmlFiles.some((file) => /internal production notes/i.test(read('app', file))), 'public app contains no internal production notes');
ok(pkg.license === 'MIT' && read('LICENSE').includes('MIT License'), 'Aurora Forge is published under the MIT License');
ok(cakHtml.includes('id="repackBuild"') && preloadJs.includes('buildRepackPackage') && mainJs.includes('archiveRepackager.buildPackage'), 'Game Archive Explorer includes the verified project repackager');

ok(mainJs.includes('contextIsolation: true') && mainJs.includes('sandbox: true') && mainJs.includes('nodeIntegration: false'), 'Electron renderer security settings are enabled');
ok(!preloadJs.includes('require(\'fs\')') && !preloadJs.includes('require("fs")'), 'preload exposes no direct filesystem module');
ok(mainJs.includes('assertKnownToolId') && mainJs.includes('TOOL_DEFINITIONS'), 'external-program choices use an allowlist');
ok(!mainJs.includes('downloadURL') && !mainJs.includes('autoUpdater'), 'Setup does not download or silently update third-party programs');

const htmlFiles = fs.readdirSync(appRoot).filter((name) => name.endsWith('.html'));
for (const file of htmlFiles) {
  const html = fs.readFileSync(path.join(appRoot, file), 'utf8');
  const refs = [...html.matchAll(/(?:href|src)="([^"]+)"/g)].map((match) => match[1]);
  for (const ref of refs) {
    if (/^(?:https?:|mailto:|data:|blob:|#)/i.test(ref)) continue;
    const clean = ref.split('#')[0].split('?')[0];
    if (!clean) continue;
    ok(fs.existsSync(path.resolve(appRoot, clean)), `${file} reference exists: ${clean}`);
  }
}

const syntaxFiles = [
  'electron/main.js',
  'electron/preload.js',
  'electron/cak-reader.js',
  'app/assets/js/project-manager.js',
  'app/assets/js/setup.js',
  'app/assets/js/tool-center.js',
  'app/assets/js/easy-guide.js',
  'app/assets/js/handbook-reader.js',
  'app/assets/js/caw-builder.js',
  'app/assets/js/active-studio-workflow.js',
  'app/assets/js/character-viewer.js',
  'app/assets/js/dds-converter.js',
  'app/assets/js/cak-explorer.js',
  'scripts/build-true-portable-windows.js',
  'scripts/prepare-runtime-staging.js',
  'scripts/verify-final-portable.js',
  'scripts/verify-dds-converter.js'
  ,'scripts/verify-cak-extraction.js'
  ,'scripts/verify-repackager.js'
  ,'scripts/build-cross-generation-path-catalog.js'
  ,'scripts/audit-extracted-layouts.js'
];
syntaxFiles.forEach((file) => {
  const result = cp.spawnSync(process.execPath, ['--check', path.join(root, file)], { encoding: 'utf8' });
  ok(result.status === 0, file + ' passes JavaScript syntax check');
  if (result.status !== 0) console.error(result.stderr);
});

if (failures) {
  console.error(`\nAurora Forge verification failed with ${failures} problem(s).`);
  process.exit(1);
}
console.log('\nAurora Forge v1.6.0 RC1 source verification passed.');
