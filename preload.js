const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  detectDiscs: () => ipcRenderer.invoke('detect-discs'),
  startRip: (data) => ipcRenderer.send('start-rip', data),
  onLog: (cb) => ipcRenderer.on('log', (_, d) => cb(d)),
  selectFolder: () => ipcRenderer.invoke('select-folder'),
  getConfig: () => ipcRenderer.invoke('get-config'),
  saveConfig: (cfg) => ipcRenderer.invoke('save-config', cfg),
  onConfigUpdate: (cb) => ipcRenderer.on('config-updated', cb),
  onActivityToggle: (cb) => ipcRenderer.on('toggle-activity', (_, v) => cb(v))
});