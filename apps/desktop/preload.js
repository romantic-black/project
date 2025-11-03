const { contextBridge, ipcRenderer } = require('electron');

let config = {};

try {
  config = ipcRenderer.sendSync('desktop:get-config') ?? {};
} catch (error) {
  console.warn('Failed to retrieve desktop config:', error);
  config = {};
}

contextBridge.exposeInMainWorld('desktop', {
  platform: process.platform,
  versions: process.versions,
  config
});
