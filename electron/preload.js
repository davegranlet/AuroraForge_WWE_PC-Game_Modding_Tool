const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('WWE2K26Desktop', {
  getAppInfo: () => ipcRenderer.invoke('desktop:get-app-info'),
  chooseProjectFolder: () => ipcRenderer.invoke('desktop:choose-project-folder'),
  openDefaultProjectsFolder: () => ipcRenderer.invoke('desktop:open-default-projects-folder'),
  openDefaultExportsFolder: () => ipcRenderer.invoke('desktop:open-default-exports-folder'),
  saveTextFile: (payload) => ipcRenderer.invoke('desktop:save-text-file', payload),
  createProjectFolder: (payload) => ipcRenderer.invoke('desktop:create-project-folder', payload),
  saveProjectJson: (payload) => ipcRenderer.invoke('desktop:save-project-json', payload),
  openProjectJson: () => ipcRenderer.invoke('desktop:open-project-json'),
  getToolConfig: () => ipcRenderer.invoke('desktop:get-tool-config'),
  chooseToolPath: (toolId) => ipcRenderer.invoke('desktop:choose-tool-path', toolId),
  clearToolPath: (toolId) => ipcRenderer.invoke('desktop:clear-tool-path', toolId),
  openConfiguredTool: (toolId) => ipcRenderer.invoke('desktop:open-configured-tool', toolId),
  checkCakeHook: () => ipcRenderer.invoke('desktop:check-cakehook'),
  getDdsConverterStatus: () => ipcRenderer.invoke('desktop:dds-converter-status'),
  chooseDdsConverterInputs: (mode) => ipcRenderer.invoke('desktop:dds-converter-choose-inputs', mode),
  chooseDdsConverterFolder: (mode) => ipcRenderer.invoke('desktop:dds-converter-choose-folder', mode),
  chooseDdsConverterOutput: () => ipcRenderer.invoke('desktop:dds-converter-choose-output'),
  chooseDdsReferenceFolder: () => ipcRenderer.invoke('desktop:dds-converter-choose-reference-folder'),
  runDdsConversion: (payload) => ipcRenderer.invoke('desktop:dds-converter-run', payload),
  openDdsConverterOutput: () => ipcRenderer.invoke('desktop:dds-converter-open-output')
  ,openReferenceModelsFolder: () => ipcRenderer.invoke('desktop:open-reference-models-folder')
  ,getCakExplorerStatus: () => ipcRenderer.invoke('desktop:cak-explorer-status')
  ,chooseCakArchive: () => ipcRenderer.invoke('desktop:cak-explorer-choose-archive')
  ,openCakArchive: (archivePath) => ipcRenderer.invoke('desktop:cak-explorer-open', archivePath)
  ,openAllCakArchives: () => ipcRenderer.invoke('desktop:cak-explorer-open-all')
  ,searchCakArchive: (options) => ipcRenderer.invoke('desktop:cak-explorer-search', options)
  ,chooseCakOutput: () => ipcRenderer.invoke('desktop:cak-explorer-choose-output')
   ,extractCakEntries: (payload) => ipcRenderer.invoke('desktop:cak-explorer-extract', payload)
  ,openCakOutput: () => ipcRenderer.invoke('desktop:cak-explorer-open-output')
  ,chooseRepackSource: () => ipcRenderer.invoke('desktop:repackager-choose-source')
  ,buildRepackPackage: (sourceRoot) => ipcRenderer.invoke('desktop:repackager-build', sourceRoot)
  ,verifyRepackPackage: () => ipcRenderer.invoke('desktop:repackager-verify')
  ,openRepackOutput: () => ipcRenderer.invoke('desktop:repackager-open-output')
});
