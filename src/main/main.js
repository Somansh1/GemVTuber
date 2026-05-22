const { app, BrowserWindow, ipcMain, shell, dialog, nativeImage, safeStorage, protocol } = require('electron');
const path = require('path');
const fs = require('fs');

const { createTray } = require('./tray');

protocol.registerSchemesAsPrivileged([
  { scheme: 'local', privileges: { standard: true, secure: true, bypassCSP: true, supportFetchAPI: true, corsEnabled: true } }
]);

const { ScreenCaptureService } = require('./screenCapture');

let mainWindow = null;
let tray = null;
let screenCapture = null;

const CONFIG_PATH = path.join(app.getPath('userData'), 'config.json');

// ─── Window Creation ────────────────────────────────────────────────────────

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 400,
    height: 600,
    minWidth: 200,
    minHeight: 200,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    hasShadow: false,
    resizable: true,
    skipTaskbar: false,
    backgroundColor: '#00000000',
    icon: getAppIcon(),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webSecurity: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  mainWindow.setAlwaysOnTop(true, 'floating');

  // Open DevTools in dev mode
  if (process.argv.includes('--dev')) {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }

  mainWindow.webContents.on('console-message', (event, level, message, line, sourceId) => {
    console.log(`[RENDERER] ${message} (${sourceId}:${line})`);
  });

  // Prevent native Windows system context menu on right-click in drag regions
  // This allows the renderer's custom context menu to handle ALL right-clicks
  mainWindow.on('system-context-menu', (event) => {
    event.preventDefault();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function getAppIcon() {
  // Return a simple colored icon as placeholder
  const size = 32;
  const canvas = nativeImage.createEmpty();
  try {
    const iconPath = path.join(__dirname, '..', '..', 'assets', 'icons', 'icon.png');
    if (fs.existsSync(iconPath)) {
      return nativeImage.createFromPath(iconPath);
    }
  } catch (e) { /* ignore */ }
  return canvas;
}

// ─── IPC Handlers ───────────────────────────────────────────────────────────

function setupIPC() {
  // Click-through management
  ipcMain.on('set-ignore-mouse-events', (event, ignore, options) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win) win.setIgnoreMouseEvents(ignore, options || {});
  });

  // Frameless resize
  ipcMain.on('resize-window', (event, direction, deltaX, deltaY) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return;
    
    const bounds = win.getBounds();
    let { x, y, width, height } = bounds;
    
    if (direction.includes('left')) {
      x += deltaX;
      width -= deltaX;
    }
    if (direction.includes('right')) {
      width += deltaX;
    }
    if (direction.includes('top')) {
      y += deltaY;
      height -= deltaY;
    }
    if (direction.includes('bottom')) {
      height += deltaY;
    }

    // Enforce minimum size
    const minWidth = 200;
    const minHeight = 200;
    
    if (width < minWidth) {
      if (direction.includes('left')) x -= (minWidth - width);
      width = minWidth;
    }
    if (height < minHeight) {
      if (direction.includes('top')) y -= (minHeight - height);
      height = minHeight;
    }
    
    win.setBounds({ x, y, width, height });
  });

  // Manual window dragging to avoid native resize bugs
  ipcMain.on('move-window', (event, deltaX, deltaY) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return;
    const [x, y] = win.getPosition();
    win.setPosition(x + deltaX, y + deltaY);
  });

  // Screen capture (on-demand)
  ipcMain.handle('capture-screen', async (event, width, height) => {
    if (screenCapture) {
      return await screenCapture.captureNow(width, height);
    }
    return null;
  });

  // API key management (encrypted via safeStorage)
  ipcMain.handle('get-api-key', async () => {
    try {
      const config = loadConfig();
      if (config.encryptedApiKey && safeStorage.isEncryptionAvailable()) {
        const decrypted = safeStorage.decryptString(Buffer.from(config.encryptedApiKey, 'base64'));
        return decrypted;
      }
      return config.apiKey || null; // Fallback to plaintext if encryption unavailable
    } catch (e) {
      return null;
    }
  });

  ipcMain.handle('set-api-key', async (event, key) => {
    try {
      const config = loadConfig();
      if (safeStorage.isEncryptionAvailable()) {
        const encrypted = safeStorage.encryptString(key);
        config.encryptedApiKey = encrypted.toString('base64');
        delete config.apiKey;
      } else {
        config.apiKey = key; // Fallback
      }
      saveConfig(config);
      return true;
    } catch (e) {
      return false;
    }
  });

  // Find default model
  ipcMain.handle('find-default-model', async () => {
    try {
      const modelsDir = path.join(__dirname, '..', '..', 'models');
      if (!fs.existsSync(modelsDir)) return null;
      
      // Basic recursive search for first .model3.json
      const searchRecursive = (dir) => {
        if (!fs.existsSync(dir)) return null;
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            const found = searchRecursive(fullPath);
            if (found) return found;
          } else if (entry.name.endsWith('.model3.json')) {
            return fullPath;
          }
        }
        return null;
      };

      // 1. Check models/default first
      const defaultDir = path.join(modelsDir, 'default');
      const foundInDefault = searchRecursive(defaultDir);
      if (foundInDefault) return foundInDefault;

      // 2. Fallback to any model in models/
      return searchRecursive(modelsDir);
    } catch (e) {
      console.error('Error finding default model:', e);
      return null;
    }
  });

  // Model file selection
  ipcMain.handle('select-model-file', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Select Live2D Model',
      filters: [
        { name: 'Live2D Model', extensions: ['model3.json', 'json'] },
        { name: 'All Files', extensions: ['*'] },
      ],
      properties: ['openFile'],
    });
    if (!result.canceled && result.filePaths.length > 0) {
      return result.filePaths[0];
    }
    return null;
  });

  // Open external links
  ipcMain.on('open-external-link', (event, url) => {
    shell.openExternal(url);
  });

  // Config persistence
  ipcMain.handle('get-config', async () => {
    const config = loadConfig();
    // Don't send the encrypted key back
    const { encryptedApiKey, apiKey, ...safeConfig } = config;
    return safeConfig;
  });

  ipcMain.handle('save-config', async (event, config) => {
    const existing = loadConfig();
    const merged = { ...existing, ...config };
    saveConfig(merged);
    return true;
  });

  // Quit
  ipcMain.on('quit-app', () => {
    app.quit();
  });

  // ─── Logging ────────────────────────────────────────────────────────
  const logsDir = path.join(app.getPath('userData'), 'logs');
  const screenshotsDir = path.join(logsDir, 'screenshots');

  ipcMain.handle('save-chat-log', async (event, role, text) => {
    try {
      if (!fs.existsSync(logsDir)) await fs.promises.mkdir(logsDir, { recursive: true });
      const logFile = path.join(logsDir, 'chat.log');
      const timestamp = new Date().toISOString();
      const logLine = `[${timestamp}] ${role.toUpperCase()}: ${text}\n`;
      await fs.promises.appendFile(logFile, logLine, 'utf8');
      return true;
    } catch (e) {
      console.error('Failed to save chat log:', e);
      return false;
    }
  });

  ipcMain.handle('save-screenshot-log', async (event, base64Data) => {
    try {
      if (!fs.existsSync(screenshotsDir)) await fs.promises.mkdir(screenshotsDir, { recursive: true });
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `screenshot_${timestamp}.jpg`;
      const filePath = path.join(screenshotsDir, filename);
      
      const buffer = Buffer.from(base64Data, 'base64');
      await fs.promises.writeFile(filePath, buffer);
      return filePath;
    } catch (e) {
      console.error('Failed to save screenshot log:', e);
      return null;
    }
  });

  ipcMain.on('open-logs-folder', () => {
    if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });
    shell.openPath(logsDir);
  });

  // Toggle settings (from tray)
  ipcMain.on('toggle-settings', () => {
    if (mainWindow) {
      mainWindow.webContents.send('toggle-settings');
    }
  });
}

// ─── Config Helpers ─────────────────────────────────────────────────────────

function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
    }
  } catch (e) { /* ignore corrupt config */ }
  return {};
}

function saveConfig(config) {
  try {
    fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf-8');
  } catch (e) {
    console.error('Failed to save config:', e);
  }
}

// ─── App Lifecycle ──────────────────────────────────────────────────────────

app.whenReady().then(() => {
  protocol.registerFileProtocol('local', (request, callback) => {
    let url = request.url.substring(8); // strip local://
    url = decodeURIComponent(url);
    // Remove query params if any
    const qIndex = url.indexOf('?');
    if (qIndex > -1) url = url.substring(0, qIndex);
    // Fix Windows drive letter (e.g., C/Users -> C:/Users)
    if (url.match(/^[a-zA-Z]\//)) {
      url = url[0] + ':' + url.substring(1);
    }
    // ensure absolute path works on Windows
    callback({ path: path.normalize(url) });
  });

  setupIPC();
  createWindow();
  tray = createTray(mainWindow);
  screenCapture = new ScreenCaptureService(mainWindow);

  // Load saved screen capture interval
  const config = loadConfig();
  if (config.screenCaptureEnabled !== false) {
    screenCapture.start(config.captureIntervalMinutes || 7);
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

app.on('before-quit', () => {
  if (screenCapture) screenCapture.stop();
});