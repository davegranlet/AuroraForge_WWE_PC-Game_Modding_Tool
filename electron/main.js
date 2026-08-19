const { app, BrowserWindow, Menu, shell, ipcMain, dialog, protocol, net } = require('electron');
const path = require('path');
const fs = require('fs');
const cp = require('child_process');
const { pathToFileURL } = require('url');
const cakReader = require('./cak-reader');
const archiveRepackager = require('./archive-repackager');

const APP_ROOT = path.join(__dirname, '..', 'app');
const START_PAGE = process.env.AURORA_START_PAGE || 'index.html';
const WINDOW_TITLE = process.env.AURORA_WINDOW_TITLE || 'Aurora Forge';
const STANDALONE_TOOL = process.env.AURORA_STANDALONE_TOOL || '';
if (STANDALONE_TOOL) {
  app.setName(WINDOW_TITLE);
  app.setPath('userData', path.join(app.getPath('appData'), WINDOW_TITLE));
}
const DEFAULT_PROJECTS_DIR_NAME = 'Aurora Forge Projects';
const DEFAULT_EXPORTS_DIR_NAME = 'Aurora Forge Exports';
let lastDdsConverterOutputDir = '';
let lastBuiltCakPath = '';
let currentCakSession = null;
let lastCakOutputDir = '';
const DDS_FORMATS = Object.freeze({
  R8_UNORM: 61,
  R8G8_UNORM: 49,
  R8G8B8A8_UNORM: 28,
  R8G8B8A8_UNORM_SRGB: 29,
  B8G8R8A8_UNORM: 87,
  B8G8R8X8_UNORM: 88,
  B8G8R8A8_UNORM_SRGB: 91,
  B8G8R8X8_UNORM_SRGB: 93,
  BC1_UNORM: 71,
  BC1_UNORM_SRGB: 72,
  BC2_UNORM: 74,
  BC2_UNORM_SRGB: 75,
  BC3_UNORM: 77,
  BC3_UNORM_SRGB: 78,
  BC4_UNORM: 80,
  BC4_SNORM: 81,
  BC5_UNORM: 83,
  BC5_SNORM: 84,
  BC6H_UF16: 95,
  BC6H_SF16: 96,
  BC7_UNORM: 98,
  BC7_UNORM_SRGB: 99
});
const DXGI_TO_FORMAT = Object.freeze(Object.fromEntries(Object.entries(DDS_FORMATS).map(([name, value]) => [value, name])));
const FOURCC_TO_FORMAT = Object.freeze({ DXT1: 'BC1_UNORM', DXT3: 'BC2_UNORM', DXT5: 'BC3_UNORM', ATI1: 'BC4_UNORM', BC4U: 'BC4_UNORM', ATI2: 'BC5_UNORM', BC5U: 'BC5_UNORM' });
const TOOL_DEFINITIONS = Object.freeze({
  projectsFolder: { label: 'Projects folder', kind: 'directory' },
  exportsFolder: { label: 'Exports folder', kind: 'directory' },
  gameFolder: { label: 'WWE 2K26 game folder', kind: 'directory' },
  cakeView: { label: 'CakeView', kind: 'file' },
  tribute: { label: 'Tribute', kind: 'file' },
  blender: { label: 'Blender', kind: 'file' },
  imageEditor: { label: 'Image editor', kind: 'file' },
  texconv: { label: 'DirectXTex texconv', kind: 'file' },
  audioEditor: { label: 'Audio editor', kind: 'file' },
  videoTool: { label: 'Video/BK2 tool', kind: 'file' },
  modsFolder: { label: 'Mod workspace folder', kind: 'directory' },
  backupFolder: { label: 'Backup folder', kind: 'directory' }
});

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'wwe2k26',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true
    }
  }
]);

function sanitizeName(name) {
  return String(name || 'New Project')
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80) || 'New Project';
}

function defaultProjectsPath() {
  const configured = readToolConfig().projectsFolder;
  return configured || path.join(app.getPath('documents'), DEFAULT_PROJECTS_DIR_NAME);
}

function defaultExportsPath() {
  const configured = readToolConfig().exportsFolder;
  return configured || path.join(app.getPath('documents'), DEFAULT_EXPORTS_DIR_NAME);
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function toolConfigPath() {
  return path.join(app.getPath('userData'), 'aurora-external-tools.json');
}

function readCakDictionary() {
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(APP_ROOT, 'data', 'cak-known-paths.json'), 'utf8'));
    return raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  } catch (_error) { return {}; }
}

function resolveOodlePath(archivePath = '') {
  const config = readToolConfig();
  const candidates = [
    config.gameFolder ? path.join(config.gameFolder, 'oo2core_9_win64.dll') : '',
    archivePath ? path.join(path.dirname(archivePath), 'oo2core_9_win64.dll') : ''
  ].filter(Boolean);
  return candidates.find((candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isFile()) || '';
}

function bundledToolPath(...parts) {
  if (app.isPackaged) {
    const unpacked = path.join(process.resourcesPath, 'app.asar.unpacked', 'app', 'tools', ...parts);
    if (fs.existsSync(unpacked)) return unpacked;
  }
  return path.join(APP_ROOT, 'tools', ...parts);
}

function cakHelperPath() {
  return bundledToolPath('cak-helper', 'AuroraCakHelper.exe');
}

function readToolConfig() {
  try {
    const raw = JSON.parse(fs.readFileSync(toolConfigPath(), 'utf8'));
    const clean = {};
    Object.keys(TOOL_DEFINITIONS).forEach((id) => {
      if (raw && typeof raw[id] === 'string' && raw[id].trim()) clean[id] = raw[id].trim();
    });
    return clean;
  } catch (_error) {
    return {};
  }
}

function writeToolConfig(config) {
  const clean = {};
  Object.keys(TOOL_DEFINITIONS).forEach((id) => {
    if (config && typeof config[id] === 'string' && config[id].trim()) clean[id] = config[id].trim();
  });
  ensureDir(path.dirname(toolConfigPath()));
  fs.writeFileSync(toolConfigPath(), JSON.stringify(clean, null, 2) + '\n', 'utf8');
  return clean;
}

function assertKnownToolId(id) {
  if (!Object.prototype.hasOwnProperty.call(TOOL_DEFINITIONS, id)) {
    throw new Error('Unknown external tool identifier.');
  }
}

function toolConfigForRenderer() {
  const config = readToolConfig();
  const result = {};
  Object.keys(TOOL_DEFINITIONS).forEach((id) => {
    const configuredPath = config[id] || '';
    result[id] = {
      id,
      label: TOOL_DEFINITIONS[id].label,
      kind: TOOL_DEFINITIONS[id].kind,
      path: configuredPath,
      exists: Boolean(configuredPath && fs.existsSync(configuredPath))
    };
  });
  return result;
}

function findCaseInsensitiveEntry(directory, matcher) {
  if (!directory || !fs.existsSync(directory)) return '';
  const entries = fs.readdirSync(directory, { withFileTypes: true });
  const match = entries.find(matcher);
  return match ? path.join(directory, match.name) : '';
}

function findOnPath(executableName) {
  try {
    const locator = process.platform === 'win32' ? 'where.exe' : 'which';
    const result = cp.spawnSync(locator, [executableName], { encoding: 'utf8', windowsHide: true });
    if (result.status !== 0) return '';
    const first = String(result.stdout || '').split(/\r?\n/).map((line) => line.trim()).find(Boolean) || '';
    return first && fs.existsSync(first) ? path.resolve(first) : '';
  } catch (_error) {
    return '';
  }
}

function resolveTexconvPath() {
  if (process.platform !== 'win32') return { path: '', source: '', reason: 'DirectXTex texconv is Windows-only. Prompt building, projects, exports, reference tools, and CAK catalog browsing remain available on Linux.' };
  const configured = readToolConfig().texconv || '';
  if (configured && fs.existsSync(configured) && fs.statSync(configured).isFile()) {
    return { path: configured, source: 'Setup' };
  }
  const bundled = bundledToolPath('texconv', 'texconv.exe');
  if (fs.existsSync(bundled) && fs.statSync(bundled).isFile()) {
    return { path: bundled, source: 'Included Microsoft DirectXTex converter' };
  }
  const discovered = findOnPath('texconv.exe') || findOnPath('texconv');
  return discovered ? { path: discovered, source: 'Windows PATH' } : { path: '', source: '' };
}

function readFourCC(buffer, offset) {
  return buffer.toString('ascii', offset, offset + 4).replace(/\0/g, '').trim();
}

function inspectDdsFile(filePath) {
  const buffer = fs.readFileSync(filePath);
  if (buffer.length < 128 || buffer.toString('ascii', 0, 4) !== 'DDS ') throw new Error('Not a valid DDS file: ' + path.basename(filePath));
  const height = buffer.readUInt32LE(12);
  const width = buffer.readUInt32LE(16);
  const mipmaps = Math.max(1, buffer.readUInt32LE(28) || 1);
  const fourCC = readFourCC(buffer, 84);
  let dxgiFormat = null;
  let format = FOURCC_TO_FORMAT[fourCC] || '';
  let certainty = format ? 'legacy-inferred' : 'unknown';
  if (fourCC === 'DX10') {
    if (buffer.length < 148) throw new Error('DDS DX10 header is incomplete: ' + path.basename(filePath));
    dxgiFormat = buffer.readUInt32LE(128);
    format = DXGI_TO_FORMAT[dxgiFormat] || '';
    certainty = format ? 'exact' : 'unknown';
  }
  return { path: filePath, name: path.basename(filePath), width, height, mipmaps, fourCC: fourCC || 'none', dxgiFormat, format, certainty };
}

function inspectPngFile(filePath) {
  const buffer = fs.readFileSync(filePath);
  const signature = '89504e470d0a1a0a';
  if (buffer.length < 24 || buffer.subarray(0, 8).toString('hex') !== signature) throw new Error('Not a valid PNG file: ' + path.basename(filePath));
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

function runNativeProcess(executable, args) {
  return new Promise((resolve, reject) => {
    const isCommandScript = /\.(cmd|bat)$/i.test(executable);
    const quote = (value) => '"' + String(value).replace(/"/g, '""') + '"';
    const command = isCommandScript ? (process.env.ComSpec || 'C:\\Windows\\System32\\cmd.exe') : executable;
    const processArgs = isCommandScript ? ['/d', '/s', '/c', [quote(executable), ...args.map(quote)].join(' ')] : args;
    const child = cp.spawn(command, processArgs, { windowsHide: true, shell: false });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, stdout, stderr }));
  });
}

function assertExistingFiles(paths, extension) {
  if (!Array.isArray(paths) || !paths.length || paths.length > 250) throw new Error('Choose between 1 and 250 input files.');
  return paths.map((candidate) => {
    const resolved = path.resolve(String(candidate || ''));
    if (path.extname(resolved).toLowerCase() !== extension) throw new Error('Unexpected input type: ' + path.basename(resolved));
    if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) throw new Error('Input file was not found: ' + path.basename(resolved));
    return resolved;
  });
}

function isPathInside(childPath, parentPath) {
  const relative = path.relative(path.resolve(parentPath), path.resolve(childPath));
  return relative === '' || (!!relative && !relative.startsWith('..') && !path.isAbsolute(relative));
}

function uniquePath(baseDir, baseName) {
  let candidate = path.join(baseDir, baseName);
  if (!fs.existsSync(candidate)) return candidate;
  for (let i = 2; i < 1000; i += 1) {
    candidate = path.join(baseDir, `${baseName} ${i}`);
    if (!fs.existsSync(candidate)) return candidate;
  }
  throw new Error('Could not create a unique project folder name.');
}

function defaultReferenceModelsPath() {
  return path.join(app.getPath('documents'), 'Aurora Forge Reference Models');
}

function safeInsideAllowedRoots(filePath) {
  const allowedRoots = [defaultProjectsPath(), app.getPath('documents'), app.getPath('desktop')];
  return allowedRoots.some((rootPath) => isPathInside(filePath, rootPath));
}

function assertProjectJsonShape(project) {
  if (!project || typeof project !== 'object') throw new Error('Project JSON must be an object.');
  const candidate = project.project || project;
  if (!candidate || typeof candidate !== 'object') throw new Error('Project JSON missing project object.');
  if (!candidate.name && !project.name) throw new Error('Project JSON missing project name.');
  return true;
}

function registerAppProtocol() {
  protocol.handle('wwe2k26', async (request) => {
    const url = new URL(request.url);
    let pathname = decodeURIComponent(url.pathname || '/index.html');
    if (pathname === '/' || pathname === '') pathname = '/index.html';
    if (url.hostname && url.hostname !== 'app') pathname = '/' + url.hostname + pathname;
    const filePath = path.normalize(path.join(APP_ROOT, pathname));
    if (!isPathInside(filePath, APP_ROOT)) {
      return new Response('Forbidden', { status: 403 });
    }
    if (!fs.existsSync(filePath)) {
      return new Response('Not found: ' + pathname, { status: 404 });
    }
    return net.fetch(pathToFileURL(filePath).toString());
  });
}

function createWindow() {
  const mainWindow = new BrowserWindow({
    title: WINDOW_TITLE,
    width: 1280,
    height: 900,
    minWidth: 960,
    minHeight: 720,
    icon: path.join(APP_ROOT, 'assets', 'img', 'app-icon.ico'),
    backgroundColor: '#11131a',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  mainWindow.loadURL(`wwe2k26://app/${START_PAGE}`);
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^(https?:|mailto:)/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith('wwe2k26://')) {
      event.preventDefault();
      if (/^(https?:|mailto:)/i.test(url)) shell.openExternal(url);
    }
  });

  const template = [
    {
      label: 'File',
      submenu: [
        { label: 'Home', click: () => mainWindow.loadURL('wwe2k26://app/index.html') },
        { label: 'Projects', click: () => mainWindow.loadURL('wwe2k26://app/project-manager.html') },
        { label: 'Prompt Builders', click: () => mainWindow.loadURL('wwe2k26://app/creative-studios.html') },
        { label: 'Tools', click: () => mainWindow.loadURL('wwe2k26://app/tools.html') },
        { label: 'Tutorials', click: () => mainWindow.loadURL('wwe2k26://app/tutorials.html') },
        { label: 'Setup', click: () => mainWindow.loadURL('wwe2k26://app/setup.html') },
        { label: 'About', click: () => mainWindow.loadURL('wwe2k26://app/about.html') },
        { type: 'separator' },
        { label: 'Open Default Projects Folder', click: () => { ensureDir(defaultProjectsPath()); shell.openPath(defaultProjectsPath()); } },
        { label: 'Open Default Exports Folder', click: () => { ensureDir(defaultExportsPath()); shell.openPath(defaultExportsPath()); } },
        { type: 'separator' },
        { role: 'quit' }
      ]
    },
    { label: 'Edit', submenu: [{ role: 'undo' }, { role: 'redo' }, { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }] },
    { label: 'View', submenu: [{ role: 'reload' }, { type: 'separator' }, { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }, { role: 'togglefullscreen' }] },
    {
      label: 'Help',
      submenu: [
        { label: 'Tutorials', click: () => mainWindow.loadURL('wwe2k26://app/tutorials.html') },
        { type: 'separator' },
        { label: 'About', click: () => dialog.showMessageBox(mainWindow, { type: 'info', title: 'About Aurora Forge', message: 'Aurora Forge', detail: 'Version 1.7 Major RC1 · Prompt Builder Edition\nA WWE 2K26 prompt-building and workflow-preparation workspace. Aurora Forge prepares prompts and handoff packs; your chosen AI creates the result.' }) }
      ]
    }
  ];
  Menu.setApplicationMenu(STANDALONE_TOOL ? null : Menu.buildFromTemplate(template));
}

app.whenReady().then(() => {
  ensureDir(defaultProjectsPath());
  ensureDir(defaultExportsPath());
  registerAppProtocol();
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

ipcMain.handle('desktop:get-app-info', async () => ({
  name: app.getName(),
  version: app.getVersion(),
  electron: process.versions.electron,
  chrome: process.versions.chrome,
  node: process.versions.node,
  platform: process.platform,
  userDataPath: app.getPath('userData'),
  defaultProjectsPath: defaultProjectsPath(),
  defaultExportsPath: defaultExportsPath()
}));

ipcMain.handle('desktop:choose-project-folder', async () => {
  const result = await dialog.showOpenDialog({
    title: 'Choose Aurora Forge project folder',
    properties: ['openDirectory', 'createDirectory']
  });
  if (result.canceled || !result.filePaths.length) return { ok: false };
  return { ok: true, path: result.filePaths[0] };
});

ipcMain.handle('desktop:open-default-projects-folder', async () => {
  ensureDir(defaultProjectsPath());
  const error = await shell.openPath(defaultProjectsPath());
  return { ok: !error, error };
});

ipcMain.handle('desktop:open-default-exports-folder', async () => {
  ensureDir(defaultExportsPath());
  const error = await shell.openPath(defaultExportsPath());
  return { ok: !error, error };
});

ipcMain.handle('desktop:get-tool-config', async () => toolConfigForRenderer());

ipcMain.handle('desktop:choose-tool-path', async (_event, toolId) => {
  assertKnownToolId(toolId);
  const definition = TOOL_DEFINITIONS[toolId];
  const result = await dialog.showOpenDialog({
    title: 'Choose ' + definition.label,
    properties: definition.kind === 'directory' ? ['openDirectory', 'createDirectory'] : ['openFile'],
    filters: definition.kind === 'file'
      ? [{ name: 'Applications', extensions: ['exe', 'cmd', 'bat'] }, { name: 'All files', extensions: ['*'] }]
      : undefined
  });
  if (result.canceled || !result.filePaths.length) return { ok: false };
  const selectedPath = path.resolve(result.filePaths[0]);
  if (!fs.existsSync(selectedPath)) throw new Error('Selected path does not exist.');
  const stat = fs.statSync(selectedPath);
  if (definition.kind === 'directory' && !stat.isDirectory()) throw new Error('A folder is required for this entry.');
  if (definition.kind === 'file' && !stat.isFile()) throw new Error('An executable file is required for this entry.');
  const config = readToolConfig();
  config[toolId] = selectedPath;
  writeToolConfig(config);
  return { ok: true, tool: toolConfigForRenderer()[toolId] };
});

ipcMain.handle('desktop:clear-tool-path', async (_event, toolId) => {
  assertKnownToolId(toolId);
  const config = readToolConfig();
  delete config[toolId];
  writeToolConfig(config);
  return { ok: true, tool: toolConfigForRenderer()[toolId] };
});

ipcMain.handle('desktop:open-configured-tool', async (_event, toolId) => {
  assertKnownToolId(toolId);
  const config = readToolConfig();
  const configuredPath = config[toolId];
  if (!configuredPath || !fs.existsSync(configuredPath)) throw new Error('Configure this tool or folder first.');
  const error = await shell.openPath(configuredPath);
  return { ok: !error, error };
});

ipcMain.handle('desktop:check-cakehook', async () => {
  const config = readToolConfig();
  const gameFolder = config.gameFolder || '';
  const folderExists = Boolean(gameFolder && fs.existsSync(gameFolder) && fs.statSync(gameFolder).isDirectory());
  if (!folderExists) {
    return {
      ok: false,
      gameFolder,
      checks: [],
      summary: 'Choose the WWE 2K26 game folder first.'
    };
  }
  const gameExe = findCaseInsensitiveEntry(gameFolder, (entry) => entry.isFile() && /^wwe2k26.*\.exe$/i.test(entry.name));
  const loaderDll = findCaseInsensitiveEntry(gameFolder, (entry) => entry.isFile() && /^dinput8\.dll$/i.test(entry.name));
  const pluginsFolder = findCaseInsensitiveEntry(gameFolder, (entry) => entry.isDirectory() && /^plugins$/i.test(entry.name));
  const checks = [
    { id: 'gameExe', label: 'WWE 2K26 executable', found: Boolean(gameExe), path: gameExe },
    { id: 'loaderDll', label: 'dinput8.dll loader', found: Boolean(loaderDll), path: loaderDll },
    { id: 'pluginsFolder', label: 'Plugins folder', found: Boolean(pluginsFolder), path: pluginsFolder }
  ];
  const foundCount = checks.filter((item) => item.found).length;
  return {
    ok: foundCount === checks.length,
    gameFolder,
    checks,
    summary: foundCount + ' of ' + checks.length + ' expected CakeHook/game entries detected.'
  };
});

ipcMain.handle('desktop:dds-converter-status', async () => {
  const resolved = resolveTexconvPath();
  return { ready: Boolean(resolved.path), path: resolved.path, source: resolved.source, reason: resolved.reason || '' };
});

ipcMain.handle('desktop:cak-explorer-status', async () => {
  const config = readToolConfig();
  const gameFolder = config.gameFolder || '';
  const helper = cakHelperPath();
  const oodle = resolveOodlePath();
  let archives = [];
  if (gameFolder && fs.existsSync(gameFolder) && fs.statSync(gameFolder).isDirectory()) {
    archives = fs.readdirSync(gameFolder, { withFileTypes: true })
      .filter((entry) => entry.isFile() && /\.cak$/i.test(entry.name))
      .map((entry) => ({ name: entry.name, path: path.join(gameFolder, entry.name), bytes: fs.statSync(path.join(gameFolder, entry.name)).size }))
      .sort((left, right) => left.name.localeCompare(right.name, undefined, { numeric: true }));
  }
  return { ready: process.platform === 'win32' && fs.existsSync(helper), extractionSupported: process.platform === 'win32', platform: process.platform, gameFolder, oodle, archives, dictionaryEntries: Object.keys(readCakDictionary()).length };
});

ipcMain.handle('desktop:cak-explorer-choose-archive', async () => {
  const config = readToolConfig();
  const result = await dialog.showOpenDialog({
    title: 'Choose a WWE 2K26 CAK archive',
    defaultPath: config.gameFolder || undefined,
    properties: ['openFile'],
    filters: [{ name: 'WWE 2K archives', extensions: ['cak'] }]
  });
  if (result.canceled || !result.filePaths.length) return { ok: false };
  return { ok: true, path: path.resolve(result.filePaths[0]) };
});

ipcMain.handle('desktop:cak-explorer-open', async (_event, archivePath) => {
  const selected = path.resolve(String(archivePath || ''));
  currentCakSession = cakReader.openArchive(selected, readCakDictionary());
  return { ok: true, summary: cakReader.publicSummary(currentCakSession), results: cakReader.searchFiles(currentCakSession, { scope: 'resolved' }) };
});

ipcMain.handle('desktop:cak-explorer-open-all', async () => {
  const gameFolder = readToolConfig().gameFolder || '';
  if (!gameFolder || !fs.existsSync(gameFolder) || !fs.statSync(gameFolder).isDirectory()) throw new Error('Choose the WWE 2K26 game folder in Setup first.');
  const archivePaths = fs.readdirSync(gameFolder, { withFileTypes: true })
    .filter((entry) => entry.isFile() && /\.cak$/i.test(entry.name))
    .map((entry) => path.join(gameFolder, entry.name))
    .sort((left, right) => path.basename(left).localeCompare(path.basename(right), undefined, { numeric: true }));
  if (!archivePaths.length) throw new Error('No .cak archives were found in the configured WWE 2K26 game folder.');
  const dictionary = readCakDictionary();
  const sessions = archivePaths.map((archivePath) => cakReader.openArchive(archivePath, dictionary));
  const files = [];
  const folders = [];
  for (const session of sessions) {
    const folderOffset = folders.length;
    folders.push(...session.folders.map((folder) => ({ ...folder, archiveName: session.archiveName })));
    for (const file of session.files) files.push({
      ...file,
      id: files.length,
      sourceId: file.id,
      sourceArchivePath: session.archivePath,
      sourceArchiveName: session.archiveName,
      sourceArchiveKey: session.key,
      folderIndex: folderOffset + file.folderIndex
    });
  }
  currentCakSession = {
    archiveName: `All ${sessions.length} game archives`,
    archivePath: gameFolder,
    archiveSize: sessions.reduce((sum, session) => sum + session.archiveSize, 0),
    files,
    folders,
    sessions,
    keyRecovered: sessions.some((session) => session.keyRecovered),
    warnings: sessions.flatMap((session) => session.warnings.map((warning) => `${session.archiveName}: ${warning}`))
  };
  return { ok: true, archiveCount: sessions.length, summary: cakReader.publicSummary(currentCakSession), results: cakReader.searchFiles(currentCakSession, { scope: 'all' }) };
});

ipcMain.handle('desktop:cak-explorer-search', async (_event, options) => {
  if (!currentCakSession) throw new Error('Open a CAK archive first.');
  return cakReader.searchFiles(currentCakSession, options || {});
});

ipcMain.handle('desktop:cak-explorer-choose-output', async () => {
  const result = await dialog.showOpenDialog({ title: 'Choose a separate extraction folder', properties: ['openDirectory', 'createDirectory'] });
  if (result.canceled || !result.filePaths.length) return { ok: false };
  const selected = path.resolve(result.filePaths[0]);
  const gameFolder = readToolConfig().gameFolder || '';
  if (gameFolder && (selected.toLowerCase() === path.resolve(gameFolder).toLowerCase() || selected.toLowerCase().startsWith(path.resolve(gameFolder).toLowerCase() + path.sep))) {
    throw new Error('Choose an extraction folder outside the WWE 2K26 game folder.');
  }
  return { ok: true, path: selected };
});

ipcMain.handle('desktop:cak-explorer-extract', async (_event, payload) => {
  if (process.platform !== 'win32') throw new Error('Native CAK extraction is currently Windows-only because WWE 2K26 supplies a Windows Oodle library. Linux can still browse and search the archive catalog safely.');
  if (!currentCakSession) throw new Error('Open a CAK archive first.');
  const ids = [...new Set(payload && payload.all ? currentCakSession.files.filter((file) => file && file.nameResolved && file.extractable !== false).map((file) => Number(file.id)) : (Array.isArray(payload && payload.ids) ? payload.ids.map(Number) : []))];
  if (!ids.length || (!(payload && payload.all) && ids.length > 5000)) throw new Error('Choose between 1 and 5,000 files per extraction job.');
  const outputRoot = path.resolve(String(payload && payload.outputRoot || ''));
  if (!fs.existsSync(outputRoot) || !fs.statSync(outputRoot).isDirectory()) throw new Error('Choose a valid extraction folder.');
  const config = readToolConfig();
  if (config.gameFolder && (outputRoot.toLowerCase() === path.resolve(config.gameFolder).toLowerCase() || outputRoot.toLowerCase().startsWith(path.resolve(config.gameFolder).toLowerCase() + path.sep))) throw new Error('Extraction into the game folder is blocked.');
  const files = ids.map((id) => currentCakSession.files[id]).filter(Boolean);
  if (files.length !== ids.length) throw new Error('One or more selected entries no longer exist. Reopen the archive.');
  if (files.some((file) => !file.extractable)) throw new Error('One or more selected catalog entries store their payload in another archive and cannot be extracted from this CAK alone.');
  const totalBytes = files.reduce((sum, file) => sum + file.expandedSize, 0);
  if (!(payload && payload.all) && totalBytes > 20 * 1024 * 1024 * 1024) throw new Error('This extraction job is larger than 20 GB. Choose a smaller group.');
  if (typeof fs.statfsSync === 'function') {
    const storage = fs.statfsSync(outputRoot);
    const freeBytes = Number(storage.bavail) * Number(storage.bsize);
    if (freeBytes < totalBytes + 64 * 1024 * 1024) throw new Error('The output drive does not have enough free space for this extraction job.');
  }
  const oodlePath = resolveOodlePath(files[0].sourceArchivePath || currentCakSession.archivePath);
  if (files.some((file) => file.compressed) && !oodlePath) throw new Error('oo2core_9_win64.dll was not found. Choose the WWE 2K26 game folder in Setup.');
  const helper = cakHelperPath();
  if (!fs.existsSync(helper)) throw new Error('The included Aurora Forge extraction helper is missing.');
  const groups = new Map();
  for (const file of files) {
    const archivePath = file.sourceArchivePath || currentCakSession.archivePath;
    if (!groups.has(archivePath)) groups.set(archivePath, []);
    groups.get(archivePath).push(file);
  }
  const results = [];
  for (const [archivePath, archiveFiles] of groups) {
    const request = {
      archivePath,
      oodlePath: resolveOodlePath(archivePath),
      outputRoot,
      archiveKey: archiveFiles[0].sourceArchiveKey === undefined ? currentCakSession.key : archiveFiles[0].sourceArchiveKey,
      overwrite: Boolean(payload && payload.overwrite),
      entries: archiveFiles.map((file) => ({ id: file.sourceId === undefined ? file.id : file.sourceId, offset: Number(file.offset), storedSize: file.storedSize, expandedSize: file.expandedSize, compressed: file.compressed, protected: file.protected, relativePath: file.name }))
    };
    const requestPath = path.join(app.getPath('temp'), `aurora-cak-${process.pid}-${Date.now()}-${results.length}.json`);
    fs.writeFileSync(requestPath, JSON.stringify(request), 'utf8');
    try {
      const run = await runNativeProcess(helper, [requestPath]);
      let parsed;
      try { parsed = JSON.parse(String(run.stdout || '').trim()); } catch (_error) { throw new Error((run.stderr || run.stdout || 'The extraction helper returned no readable report.').trim()); }
      results.push(...(parsed.results || []).map((item) => ({ ok: Boolean(item.Ok), id: item.Id, archive: path.basename(archivePath), path: item.Path || '', bytes: item.Bytes || 0, error: item.Error || '' })));
    } finally { try { fs.unlinkSync(requestPath); } catch (_error) {} }
  }
    const succeeded = results.filter((item) => item.ok).length;
    lastCakOutputDir = outputRoot;
    const report = [
      'Aurora Forge CAK Extraction Report', '',
      'Archive source: ' + currentCakSession.archivePath,
      'Output: ' + outputRoot,
      `Requested: ${files.length}`, `Succeeded: ${succeeded}`, `Failed: ${results.length - succeeded}`, '',
      ...results.map((item) => item.ok ? `OK  ${item.archive || currentCakSession.archiveName}  ${item.id}  ${item.bytes} bytes  ${item.path}` : `FAILED  ${item.archive || currentCakSession.archiveName}  ${item.id}  ${item.error}`)
    ].join('\n');
    fs.writeFileSync(path.join(outputRoot, 'Aurora_Forge_Extraction_Report.txt'), report + '\n', 'utf8');
    return { ok: succeeded === results.length, succeeded, failed: results.length - succeeded, total: results.length, outputRoot, results };
});

ipcMain.handle('desktop:cak-explorer-open-output', async () => {
  if (!lastCakOutputDir || !fs.existsSync(lastCakOutputDir)) throw new Error('No extraction output folder is available yet.');
  const error = await shell.openPath(lastCakOutputDir);
  return { ok: !error, error };
});

ipcMain.handle('desktop:repackager-choose-source', async () => {
  const result = await dialog.showOpenDialog({ title: 'Choose the BakeMe folder to package', properties: ['openDirectory'] });
  return result.canceled || !result.filePaths.length ? { ok: false } : { ok: true, path: path.resolve(result.filePaths[0]) };
});

ipcMain.handle('desktop:repackager-build', async (_event, sourceRoot) => {
  const source = path.resolve(String(sourceRoot || ''));
  if (!fs.existsSync(source) || !fs.statSync(source).isDirectory()) throw new Error('Choose a readable BakeMe folder first.');
  const result = await dialog.showSaveDialog({ title: 'Save the new CAK archive', defaultPath: path.basename(source).replace(/^bakeme(?:_|-)?/i, '') || 'AuroraForge-Mod', filters: [{ name: 'WWE 2K26 CAK archive', extensions: ['cak'] }] });
  if (result.canceled || !result.filePath) return { ok: false };
  const built = archiveRepackager.buildCak(source, result.filePath.endsWith('.cak') ? result.filePath : result.filePath + '.cak');
  lastBuiltCakPath = built.outputPath;
  return { ok: true, ...built };
});

ipcMain.handle('desktop:repackager-verify', async () => {
  if (!lastBuiltCakPath || !fs.existsSync(lastBuiltCakPath)) throw new Error('Build a new CAK first.');
  return { ok: true, ...archiveRepackager.verifyCak(lastBuiltCakPath), outputPath: lastBuiltCakPath };
});

ipcMain.handle('desktop:repackager-open-output', async () => {
  if (!lastBuiltCakPath || !fs.existsSync(lastBuiltCakPath)) throw new Error('Build a new CAK first.');
  const error = await shell.openPath(path.dirname(lastBuiltCakPath));
  return { ok: !error, error };
});

ipcMain.handle('desktop:dds-converter-choose-inputs', async (_event, mode) => {
  const normalizedMode = mode === 'png-to-dds' ? 'png-to-dds' : 'dds-to-png';
  const extension = normalizedMode === 'png-to-dds' ? 'png' : 'dds';
  const result = await dialog.showOpenDialog({
    title: normalizedMode === 'png-to-dds' ? 'Choose PNG files to convert' : 'Choose DDS files to convert',
    properties: ['openFile', 'multiSelections'],
    filters: [{ name: extension.toUpperCase() + ' textures', extensions: [extension] }]
  });
  if (result.canceled || !result.filePaths.length) return { ok: false };
  const paths = assertExistingFiles(result.filePaths, '.' + extension);
  return { ok: true, paths, names: paths.map((item) => path.basename(item)) };
});

ipcMain.handle('desktop:dds-converter-choose-folder', async (_event, mode) => {
  const normalizedMode = mode === 'png-to-dds' ? 'png-to-dds' : 'dds-to-png';
  const extension = normalizedMode === 'png-to-dds' ? 'png' : 'dds';
  const result = await dialog.showOpenDialog({
    title: `Choose a folder containing ${extension.toUpperCase()} files`,
    properties: ['openDirectory']
  });
  if (result.canceled || !result.filePaths.length) return { ok: false };
  const folder = path.resolve(result.filePaths[0]);
  const paths = fs.readdirSync(folder, { withFileTypes: true })
    .filter((entry) => entry.isFile() && path.extname(entry.name).toLowerCase() === '.' + extension)
    .map((entry) => path.join(folder, entry.name))
    .sort((left, right) => left.localeCompare(right, undefined, { sensitivity: 'base' }));
  if (!paths.length) throw new Error(`No ${extension.toUpperCase()} files were found in that folder.`);
  return { ok: true, folder, paths, names: paths.map((item) => path.basename(item)) };
});

ipcMain.handle('desktop:dds-converter-choose-output', async () => {
  const result = await dialog.showOpenDialog({ title: 'Choose a separate output folder', properties: ['openDirectory', 'createDirectory'] });
  if (result.canceled || !result.filePaths.length) return { ok: false };
  return { ok: true, path: path.resolve(result.filePaths[0]) };
});

ipcMain.handle('desktop:dds-converter-choose-reference-folder', async () => {
  const result = await dialog.showOpenDialog({ title: 'Choose folder containing original DDS textures', properties: ['openDirectory'] });
  if (result.canceled || !result.filePaths.length) return { ok: false };
  return { ok: true, path: path.resolve(result.filePaths[0]) };
});

ipcMain.handle('desktop:dds-converter-run', async (_event, payload) => {
  const resolvedTool = resolveTexconvPath();
  if (!resolvedTool.path) throw new Error('The included DirectXTex converter could not be found. You can select another texconv.exe in Setup.');
  const mode = payload && payload.mode === 'png-to-dds' ? 'png-to-dds' : 'dds-to-png';
  const inputExtension = mode === 'png-to-dds' ? '.png' : '.dds';
  const inputs = assertExistingFiles(payload && payload.inputPaths, inputExtension);
  const outputValue = String(payload && payload.outputDir || '').trim();
  if (!outputValue) throw new Error('Choose a separate output folder.');
  const outputDir = path.resolve(outputValue);
  if (!fs.existsSync(outputDir) || !fs.statSync(outputDir).isDirectory()) throw new Error('Choose a valid output folder.');
  const duplicateNames = inputs.map((item) => path.basename(item).toLowerCase()).filter((name, index, all) => all.indexOf(name) !== index);
  if (duplicateNames.length) throw new Error('Selected files contain duplicate names from different folders. Convert each same-name group separately.');
  const overwrite = Boolean(payload && payload.overwrite);
  const referenceFolder = payload && payload.referenceFolder ? path.resolve(String(payload.referenceFolder)) : '';
  if (referenceFolder && (!fs.existsSync(referenceFolder) || !fs.statSync(referenceFolder).isDirectory())) throw new Error('The original DDS reference folder was not found.');
  if (referenceFolder && outputDir.toLowerCase() === referenceFolder.toLowerCase()) throw new Error('Choose an output folder that is separate from the original DDS reference folder.');
  const requestedFormat = String(payload && payload.manualFormat || '').toUpperCase();
  if (requestedFormat && !Object.prototype.hasOwnProperty.call(DDS_FORMATS, requestedFormat)) throw new Error('The selected DDS format is not allowed.');
  const mipMode = ['match', 'full', 'none'].includes(payload && payload.mipMode) ? payload.mipMode : 'match';
  const results = [];

  for (const inputPath of inputs) {
    const baseName = path.basename(inputPath, path.extname(inputPath));
    const outputExtension = mode === 'png-to-dds' ? '.dds' : '.png';
    const expectedOutput = path.join(outputDir, baseName + outputExtension);
    let reference = null;
    let format = '';
    let mipmaps = mipMode === 'none' ? 1 : 0;
    let note = '';
    try {
      if (fs.existsSync(expectedOutput) && !overwrite) throw new Error('Output already exists. Enable overwrite or choose another folder.');
      const args = ['-nologo'];
      if (overwrite) args.push('-y');
      if (mode === 'dds-to-png') {
        args.push('-ft', 'png', '-o', outputDir, inputPath);
      } else {
        const png = inspectPngFile(inputPath);
        if (referenceFolder) {
          const referencePath = path.join(referenceFolder, baseName + '.dds');
          if (fs.existsSync(referencePath)) {
            reference = inspectDdsFile(referencePath);
            if (path.resolve(expectedOutput).toLowerCase() === path.resolve(referencePath).toLowerCase()) {
              throw new Error('Output folder cannot overwrite the original DDS reference folder.');
            }
            if (png.width !== reference.width || png.height !== reference.height) {
              throw new Error(`PNG is ${png.width}x${png.height}; original DDS is ${reference.width}x${reference.height}. Resize or correct the PNG first.`);
            }
            format = reference.format;
            if (!format) throw new Error('Original DDS format is not recognized. Choose a manual format after checking the original.');
            if (mipMode === 'match') mipmaps = reference.mipmaps;
            if (reference.certainty === 'legacy-inferred') note = 'Legacy FourCC mapped to ' + format + '; verify color-space expectations.';
          }
        }
        if (!format) {
          format = requestedFormat;
          if (!format) throw new Error('No matching original DDS was found. Choose a manual output format.');
          if (mipMode === 'match') mipmaps = 0;
          note = referenceFolder ? 'No same-name original DDS found; manual format used.' : 'Manual format used.';
        }
        if (format.startsWith('BC') && (png.width % 4 !== 0 || png.height % 4 !== 0)) {
          throw new Error(`BC-compressed DDS textures require width and height divisible by 4. This PNG is ${png.width}x${png.height}.`);
        }
        args.push('-ft', 'dds', '-f', format, '-m', String(mipmaps), '-o', outputDir, inputPath);
      }
      const run = await runNativeProcess(resolvedTool.path, args);
      if (run.code !== 0) throw new Error((run.stderr || run.stdout || 'texconv returned an error.').trim());
      const created = fs.existsSync(expectedOutput);
      if (!created) throw new Error('texconv finished but the expected output file was not found.');
      results.push({ ok: true, input: inputPath, output: expectedOutput, format: format || 'PNG', mipmaps: mode === 'png-to-dds' ? mipmaps : null, reference, note });
    } catch (error) {
      results.push({ ok: false, input: inputPath, output: expectedOutput, format, mipmaps: mode === 'png-to-dds' ? mipmaps : null, reference, error: error.message, note });
    }
  }
  lastDdsConverterOutputDir = outputDir;
  const succeeded = results.filter((item) => item.ok).length;
  return { ok: succeeded === results.length, succeeded, failed: results.length - succeeded, total: results.length, tool: resolvedTool, outputDir, results };
});

ipcMain.handle('desktop:dds-converter-open-output', async () => {
  if (!lastDdsConverterOutputDir || !fs.existsSync(lastDdsConverterOutputDir)) throw new Error('No converter output folder is available yet.');
  const error = await shell.openPath(lastDdsConverterOutputDir);
  return { ok: !error, error };
});

ipcMain.handle('desktop:open-reference-models-folder', async () => {
  const modelRoot = defaultReferenceModelsPath();
  ensureDir(modelRoot);
  ensureDir(path.join(modelRoot, 'MCDS'));
  ensureDir(path.join(modelRoot, 'MTLS'));
  const readmePath = path.join(modelRoot, 'README.txt');
  if (!fs.existsSync(readmePath)) fs.writeFileSync(readmePath, [
    'Aurora Forge Reference Models',
    '',
    'Place downloaded reference-model folders in the matching locations:',
    '- MCD files and their character folders: MCDS/',
    '- MTLS reference files and folders: MTLS/',
    '',
    'Aurora Forge treats these as read-only reference points. Keep original downloads unchanged.'
  ].join('\n') + '\n', 'utf8');
  const error = await shell.openPath(modelRoot);
  return { ok: !error, path: modelRoot, error };
});

ipcMain.handle('desktop:save-text-file', async (_event, payload) => {
  const defaultName = sanitizeName(payload && payload.defaultName ? payload.defaultName : 'wwe2k26-note.txt');
  const result = await dialog.showSaveDialog({
    title: 'Save text file',
    defaultPath: path.join(defaultProjectsPath(), defaultName),
    filters: [{ name: 'Text files', extensions: ['txt'] }, { name: 'All files', extensions: ['*'] }]
  });
  if (result.canceled || !result.filePath) return { ok: false };
  fs.writeFileSync(result.filePath, String(payload && payload.text ? payload.text : ''), 'utf8');
  return { ok: true, path: result.filePath };
});

ipcMain.handle('desktop:create-project-folder', async (_event, payload) => {
  const root = defaultProjectsPath();
  ensureDir(root);
  const projectName = sanitizeName(payload && payload.name ? payload.name : 'New Luchador Mask Project');
  const projectPath = uniquePath(root, projectName);
  ensureDir(projectPath);
  const projectType = payload && payload.type ? payload.type : 'lmask';
  const folders = projectType === 'complete_caw'
    ? ['00_Backups', '01_References', '02_Model', '03_Textures', '04_Attire', '05_Audio', '06_Profiles_JSON', '07_Ready_To_Bake', '08_Test_Builds', '09_Screenshots']
    : ['approved-images', 'profiles', 'prompts', 'handoff-packs', 'outputs', 'exports', 'notes'];
  folders.forEach((folder) => ensureDir(path.join(projectPath, folder)));
  const project = {
    app: 'Aurora Forge',
    release: '1.7 Major RC1 Prompt Builder Edition',
    name: projectName,
    type: projectType,
    notes: payload && payload.notes ? payload.notes : '',
    created_at: new Date().toISOString(),
    expected_lmask_outputs: ['mask_color.png', 'mask_mask1.png', 'mask_nrm.png']
  };
  fs.writeFileSync(path.join(projectPath, 'project.json'), JSON.stringify(project, null, 2) + '\n', 'utf8');
  fs.writeFileSync(path.join(projectPath, 'README_PROJECT.txt'), [
    'Aurora Forge Project',
    '',
    'Project: ' + projectName,
    'Type: ' + project.type,
    '',
    'Created folders:',
    ...folders.map((folder) => '- ' + folder),
    '',
    'Suggested workflow:',
    '1. Keep untouched source and extracted files in a separate backup.',
    '2. Store project profiles, prompts, working images, DDS files, and reports in their matching folders.',
    '3. Use the Creator Suite plan and the current Knowledgebase workflow for the selected project type.',
    '4. Put final-chat handoff ZIPs in handoff-packs/.',
    '5. Put final PNG outputs in outputs/.',
    '',
    'Expected Luchador Mask outputs:',
    '- mask_color.png',
    '- mask_mask1.png',
    '- mask_nrm.png',
    '',
    'Notes:',
    project.notes
  ].join('\n') + '\n', 'utf8');
  await shell.openPath(projectPath);
  return { ok: true, projectPath };
});


ipcMain.handle('desktop:save-project-json', async (_event, payload) => {
  const project = payload && payload.project ? payload.project : {};
  assertProjectJsonShape(project);
  const defaultName = sanitizeName(payload && payload.defaultName ? payload.defaultName : 'project.json').replace(/\s+/g, '-').toLowerCase();
  let targetPath = payload && payload.existingPath ? String(payload.existingPath) : '';
  if (!targetPath) {
    const result = await dialog.showSaveDialog({
      title: 'Save Aurora Forge project.json',
      defaultPath: path.join(defaultProjectsPath(), defaultName.endsWith('.json') ? defaultName : defaultName + '.json'),
      filters: [{ name: 'Project JSON', extensions: ['json'] }, { name: 'All files', extensions: ['*'] }]
    });
    if (result.canceled || !result.filePath) return { ok: false };
    targetPath = result.filePath;
  }
  if (!safeInsideAllowedRoots(targetPath)) throw new Error('Selected save path is outside the allowed local document/desktop roots.');
  ensureDir(path.dirname(targetPath));
  fs.writeFileSync(targetPath, JSON.stringify(project, null, 2) + '\n', 'utf8');
  return { ok: true, path: targetPath };
});

ipcMain.handle('desktop:open-project-json', async () => {
  const result = await dialog.showOpenDialog({
    title: 'Open Aurora Forge project.json',
    defaultPath: defaultProjectsPath(),
    properties: ['openFile'],
    filters: [{ name: 'Project JSON', extensions: ['json'] }, { name: 'All files', extensions: ['*'] }]
  });
  if (result.canceled || !result.filePaths.length) return { ok: false };
  const filePath = result.filePaths[0];
  const raw = fs.readFileSync(filePath, 'utf8');
  const project = JSON.parse(raw);
  assertProjectJsonShape(project);
  return { ok: true, path: filePath, project };
});
