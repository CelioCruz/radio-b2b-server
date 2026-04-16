const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  submitLicense: (key) => ipcRenderer.invoke('submit-license', key),
  getHWID: () => ipcRenderer.invoke('get-hwid'),
  onLicenseStatus: (callback) => {
    // Mock inicial
    setTimeout(() => callback({ valid: false, showInput: true }), 100);
  }
});