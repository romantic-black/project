const { contextBridge } = require('electron');
const fs = require('fs');
const path = require('path');

function loadConfig() {
  const configPath = path.join(__dirname, 'config.json');

  try {
    if (fs.existsSync(configPath)) {
      const raw = fs.readFileSync(configPath, 'utf8');
      return JSON.parse(raw);
    }
  } catch (error) {
    console.warn('Failed to load desktop config:', error);
  }

  return {};
}

const config = loadConfig();

contextBridge.exposeInMainWorld('desktop', {
  platform: process.platform,
  versions: process.versions,
  config
});
