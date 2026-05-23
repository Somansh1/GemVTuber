const { app, BrowserWindow } = require('electron');
const path = require('path');

function createWindow() {
  const win = new BrowserWindow({
    width: 1000,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: false,
      webSecurity: false // Allow loading local file:// models
    }
  });

  win.loadFile(path.join(__dirname, 'mouth-test.html'));
  win.webContents.openDevTools();

  win.webContents.on('console-message', (event, level, message, line, sourceId) => {
    console.log('[Renderer]', message, 'at', sourceId + ':' + line);
  });
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
