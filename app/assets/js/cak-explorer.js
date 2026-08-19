(function () {
  'use strict';
  const api = window.WWE2K26Desktop;
  const state = { archivePath: '', outputPath: '', page: 0, pages: 1, pageSize: 100, query: '', type: '', scope: 'resolved', items: [], selected: new Set() };
  const byId = (id) => document.getElementById(id);
  const formatBytes = (value) => {
    let bytes = Number(value) || 0;
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let unit = 0;
    while (bytes >= 1024 && unit < units.length - 1) { bytes /= 1024; unit += 1; }
    return `${bytes >= 100 || unit === 0 ? bytes.toFixed(0) : bytes.toFixed(1)} ${units[unit]}`;
  };
  function message(id, text, kind) { const el = byId(id); el.textContent = text || ''; el.className = `cak-message ${kind || ''}`; }
  function updateSelected() {
    byId('cakSelectedCount').textContent = String(state.selected.size);
    byId('cakExtract').disabled = !state.selected.size || !state.outputPath;
  }
  function renderRows(result) {
    state.items = result.items || [];
    state.pages = result.pages || 1;
    byId('cakResults').replaceChildren(...state.items.map((item) => {
      const row = document.createElement('tr');
      const boxCell = document.createElement('td');
      const box = document.createElement('input');
      box.type = 'checkbox'; box.checked = state.selected.has(item.id); box.disabled = item.extractable === false || !item.nameResolved; box.setAttribute('aria-label', !item.nameResolved ? 'This entry needs a real filename before extraction' : (item.extractable === false ? `${item.name} is stored in another archive` : `Select ${item.name}`));
      box.addEventListener('change', () => { if (box.checked) state.selected.add(item.id); else state.selected.delete(item.id); updateSelected(); });
      boxCell.appendChild(box);
      const values = [item.extractable === false ? `${item.name} (linked)` : item.name, item.type || 'bin', formatBytes(item.storedSize), formatBytes(item.expandedSize), item.folderName || `Unresolved folder ${item.folderIndex}`];
      row.appendChild(boxCell);
      values.forEach((value, index) => { const cell = document.createElement('td'); cell.textContent = value; if (index === 0) { cell.title = item.hash; if (item.nameResolved) cell.classList.add('cak-known-name'); } row.appendChild(cell); });
      return row;
    }));
    const typeSelect = byId('cakType');
    if (typeSelect.options.length === 1) (result.types || []).forEach((type) => { const option = document.createElement('option'); option.value = type; option.textContent = type.toUpperCase(); typeSelect.appendChild(option); });
    byId('cakPageLabel').textContent = `Page ${state.page + 1} of ${state.pages} - ${result.total.toLocaleString()} result(s)`;
    byId('cakPrevious').disabled = state.page <= 0;
    byId('cakNext').disabled = state.page + 1 >= state.pages;
    byId('cakSelectPage').checked = state.items.length > 0 && state.items.every((item) => state.selected.has(item.id));
    updateSelected();
  }
  async function search() {
    const result = await api.searchCakArchive({ query: state.query, type: state.type, scope: state.scope, page: state.page, pageSize: state.pageSize });
    renderRows(result);
  }
  function applyOpen(result) {
    const summary = result.summary;
    byId('cakBrowserPanel').hidden = false; byId('cakExtractPanel').hidden = false;
    byId('cakSummaryFiles').textContent = summary.fileCount.toLocaleString();
    byId('cakSummaryFolders').textContent = summary.folderCount.toLocaleString();
    byId('cakSummarySize').textContent = formatBytes(summary.totalExpanded);
    byId('cakSummaryNames').textContent = summary.resolvedNames.toLocaleString();
    byId('cakDevDetails').textContent = JSON.stringify(summary, null, 2);
    state.page = 0; state.selected.clear(); renderRows(result.results);
  }
  async function initialize() {
    if (!api) { message('cakOpenMessage', 'Open this page inside the portable Aurora Forge app.', 'bad'); return; }
    try {
      const status = await api.getCakExplorerStatus();
      const ready = status.ready && Boolean(status.oodle);
      byId('cakReadyBadge').textContent = ready ? 'Ready' : 'Setup needed';
      byId('cakReadyBadge').classList.toggle('ready', ready);
      byId('cakReadyText').textContent = status.extractionSupported === false
        ? 'Linux supports safe CAK catalog browsing and search. Extraction remains Windows-only because the game provides a Windows Oodle library.'
        : (ready ? `${status.archives.length} archive(s) found. The game decompressor is ready.` : 'Choose your WWE 2K26 game folder in Setup so Aurora Forge can find Oodle.');
      if (status.extractionSupported === false) byId('cakExtractAllArchives').disabled = true;
      const select = byId('cakArchiveSelect');
      status.archives.forEach((archive) => { const option = document.createElement('option'); option.value = archive.path; option.textContent = `${archive.name} (${formatBytes(archive.bytes)})`; select.appendChild(option); });
      byId('cakDevDetails').textContent = JSON.stringify(status, null, 2);
    } catch (error) { message('cakOpenMessage', error.message, 'bad'); }
  }
  byId('cakArchiveSelect').addEventListener('change', (event) => { state.archivePath = event.target.value; byId('cakArchivePath').textContent = state.archivePath || 'No archive selected.'; byId('cakOpenArchive').disabled = !state.archivePath; });
  byId('cakBrowseArchive').addEventListener('click', async () => { try { const result = await api.chooseCakArchive(); if (!result.ok) return; state.archivePath = result.path; byId('cakArchivePath').textContent = result.path; byId('cakOpenArchive').disabled = false; } catch (error) { message('cakOpenMessage', error.message, 'bad'); } });
  byId('cakOpenArchive').addEventListener('click', async () => { message('cakOpenMessage', 'Reading the archive catalog...', 'working'); byId('cakOpenArchive').disabled = true; try { const result = await api.openCakArchive(state.archivePath); applyOpen(result); message('cakOpenMessage', `${result.summary.archiveName} is ready with ${result.summary.resolvedNames.toLocaleString()} safely named file(s).`, 'good'); } catch (error) { message('cakOpenMessage', error.message, 'bad'); } finally { byId('cakOpenArchive').disabled = false; } });
  byId('cakExtractAllArchives').addEventListener('click', async () => {
    const paths = [...byId('cakArchiveSelect').options].map((option) => option.value).filter(Boolean);
    if (!paths.length) { message('cakOpenMessage', 'Set the WWE 2K26 game folder in Setup first.', 'bad'); return; }
    const chosen = await api.chooseCakOutput();
    if (!chosen || !chosen.ok) return;
    if (!window.confirm(`Extract every safely named file from all ${paths.length} CAK archives?\n\nOutput: ${chosen.path}\n\nThe original archives will not be changed.`)) return;
    const button = byId('cakExtractAllArchives');
    button.disabled = true;
    let succeeded = 0;
    let failed = 0;
    try {
      for (let index = 0; index < paths.length; index += 1) {
        const opened = await api.openCakArchive(paths[index]);
        message('cakOpenMessage', `Archive ${index + 1} of ${paths.length}: ${opened.summary.archiveName}...`, 'working');
        const result = await api.extractCakEntries({ all: true, outputRoot: chosen.path, overwrite: true });
        succeeded += result.succeeded || 0;
        failed += result.failed || 0;
      }
      message('cakOpenMessage', `Finished all ${paths.length} archives: ${succeeded.toLocaleString()} files extracted; ${failed.toLocaleString()} failed.`, failed ? 'bad' : 'good');
      byId('cakOpenOutput').disabled = false;
    } catch (error) {
      message('cakOpenMessage', `Stopped after ${succeeded.toLocaleString()} files: ${error.message}`, 'bad');
    } finally {
      button.disabled = false;
    }
  });
  byId('cakSearchButton').addEventListener('click', async () => { state.query = byId('cakSearch').value.trim(); state.type = byId('cakType').value; state.scope = byId('cakScope').value; state.page = 0; state.selected.clear(); try { await search(); } catch (error) { message('cakOpenMessage', error.message, 'bad'); } });
  byId('cakScope').addEventListener('change', () => byId('cakSearchButton').click());
  byId('cakSearch').addEventListener('keydown', (event) => { if (event.key === 'Enter') byId('cakSearchButton').click(); });
  byId('cakPrevious').addEventListener('click', async () => { if (state.page > 0) { state.page -= 1; await search(); } });
  byId('cakNext').addEventListener('click', async () => { if (state.page + 1 < state.pages) { state.page += 1; await search(); } });
  byId('cakSelectPage').addEventListener('change', (event) => { state.items.filter((item) => item.extractable !== false && item.nameResolved).forEach((item) => event.target.checked ? state.selected.add(item.id) : state.selected.delete(item.id)); renderRows({ items: state.items, pages: state.pages, page: state.page, total: Number(byId('cakPageLabel').textContent.match(/- ([\d,]+)/)?.[1].replace(/,/g, '') || state.items.length), types: [] }); });
  byId('cakChooseOutput').addEventListener('click', async () => { try { const result = await api.chooseCakOutput(); if (!result.ok) return; state.outputPath = result.path; byId('cakOutputPath').textContent = result.path; updateSelected(); } catch (error) { message('cakExtractMessage', error.message, 'bad'); } });
  byId('cakExtract').addEventListener('click', async () => { const count = state.selected.size; if (!count || !state.outputPath) return; if (!window.confirm(`Extract ${count} selected file(s) into the separate output folder?\n\nThe CAK will not be changed.`)) return; byId('cakExtract').disabled = true; message('cakExtractMessage', 'Extracting and checking files. Large files can take a little while...', 'working'); try { const result = await api.extractCakEntries({ ids: [...state.selected], outputRoot: state.outputPath, overwrite: byId('cakOverwrite').checked }); message('cakExtractMessage', `${result.succeeded} succeeded; ${result.failed} failed. An extraction report was saved with the files.`, result.failed ? 'bad' : 'good'); byId('cakOpenOutput').disabled = false; } catch (error) { message('cakExtractMessage', error.message, 'bad'); } finally { updateSelected(); } });
  byId('cakOpenOutput').addEventListener('click', async () => { try { await api.openCakOutput(); } catch (error) { message('cakExtractMessage', error.message, 'bad'); } });
  initialize();
}());
