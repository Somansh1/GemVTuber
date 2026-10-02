const { app, BrowserWindow, ipcMain, shell, dialog, nativeImage, safeStorage, protocol, globalShortcut } = require('electron');
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

// ─── Push-to-Talk State ─────────────────────────────────────────────────────
let pttKeyDown = false;

const CONFIG_PATH = path.join(app.getPath('userData'), 'config.json');
const CHAT_HISTORY_PATH = path.join(app.getPath('userData'), 'chatHistory.json');
const SESSIONS_DIR = path.join(app.getPath('userData'), 'sessions');
const SESSIONS_META_PATH = path.join(SESSIONS_DIR, 'metadata.json');
const logsDir = path.join(app.getPath('userData'), 'logs');
const screenshotsDir = path.join(logsDir, 'screenshots');
let chatLogStream = null;

async function ensureSessionsDir() {
  try { await fs.promises.mkdir(SESSIONS_DIR, { recursive: true }); } catch (e) {}
}

async function getSessionMetadata() {
  await ensureSessionsDir();
  try {
    const data = await fs.promises.readFile(SESSIONS_META_PATH, 'utf-8');
    return JSON.parse(data);
  } catch {
    return [];
  }
}

async function saveSessionMetadata(metadata) {
  await ensureSessionsDir();
  await fs.promises.writeFile(SESSIONS_META_PATH, JSON.stringify(metadata), 'utf-8');
}

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
    skipTaskbar: true,
    backgroundColor: '#00000000',
    icon: getAppIcon(),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webSecurity: true,
      backgroundThrottling: true,
    },
  });

  mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  mainWindow.setAlwaysOnTop(true, 'floating');

  if (process.argv.includes('--dev')) {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }

  mainWindow.webContents.on('console-message', (event, level, message, line, sourceId) => {
    console.log(`[RENDERER] ${message} (${sourceId}:${line})`);
  });

  mainWindow.on('system-context-menu', (event) => {
    event.preventDefault();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
    if (mainWindow?._mouseTracker) clearInterval(mainWindow._mouseTracker);
  });

  const { screen } = require('electron');
  mainWindow._mouseTracker = setInterval(() => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      const point = screen.getCursorScreenPoint();
      const bounds = mainWindow.getBounds();

      // console.log(`[MAIN] Global Mouse Point: ${point.x}, ${point.y}`);

      mainWindow.webContents.send('global-mouse-move', {
        x: point.x - bounds.x,
        y: point.y - bounds.y
      });
    }
  }, 16);
}

function getAppIcon() {
  const canvas = nativeImage.createEmpty();
  try {
    const iconPath = path.join(__dirname, '..', '..', 'assets', 'icons', 'icon.png');
    if (fs.existsSync(iconPath)) {
      return nativeImage.createFromPath(iconPath);
    }
  } catch { }
  return canvas;
}

// ─── Stream Initialization ──────────────────────────────────────────────────

function getChatLogStream() {
  if (!chatLogStream) {
    if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });
    const logFile = path.join(logsDir, 'chat.log');
    chatLogStream = fs.createWriteStream(logFile, { flags: 'a', encoding: 'utf8' });
  }
  return chatLogStream;
}

function ensureScreenshotsDir() {
  if (!fs.existsSync(screenshotsDir)) {
    fs.mkdirSync(screenshotsDir, { recursive: true });
  }
}

// ─── IPC Handlers ───────────────────────────────────────────────────────────

function setupIPC() {
  ipcMain.on('set-ignore-mouse-events', (event, ignore, options) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win) win.setIgnoreMouseEvents(ignore, options || {});
  });

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

  ipcMain.on('move-window', (event, deltaX, deltaY) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return;
    const [x, y] = win.getPosition();
    win.setPosition(x + deltaX, y + deltaY);
  });

  ipcMain.handle('get-screen-source-id', async () => {
    try {
      const { desktopCapturer } = require('electron');
      const sources = await desktopCapturer.getSources({
        types: ['screen'],
        thumbnailSize: { width: 0, height: 0 },
        fetchWindowIcons: false,
      });
      if (sources.length > 0) return sources[0].id;
    } catch (e) {
      console.error('Failed to get screen source id:', e);
    }
    return null;
  });

  ipcMain.handle('capture-screen', async (event, width, height) => {
    if (screenCapture) {
      return await screenCapture.captureNow(width, height);
    }
    return null;
  });

  ipcMain.handle('get-api-key', async () => {
    try {
      const config = await loadConfig();
      if (config.encryptedApiKey && safeStorage.isEncryptionAvailable()) {
        const decrypted = safeStorage.decryptString(Buffer.from(config.encryptedApiKey, 'base64'));
        return decrypted;
      }
      return config.apiKey || null;
    } catch {
      return null;
    }
  });

  ipcMain.handle('set-api-key', async (event, key) => {
    try {
      const config = await loadConfig();
      if (safeStorage.isEncryptionAvailable()) {
        const encrypted = safeStorage.encryptString(key);
        config.encryptedApiKey = encrypted.toString('base64');
        delete config.apiKey;
      } else {
        config.apiKey = key; 
      }
      saveConfig(config);
      return true;
    } catch {
      return false;
    }
  });

  ipcMain.handle('get-chat-api-key', async () => {
    try {
      const config = await loadConfig();
      if (config.encryptedChatApiKey && safeStorage.isEncryptionAvailable()) {
        const decrypted = safeStorage.decryptString(Buffer.from(config.encryptedChatApiKey, 'base64'));
        return decrypted;
      }
      return config.chatApiKey || null;
    } catch {
      return null;
    }
  });

  ipcMain.handle('set-chat-api-key', async (event, key) => {
    try {
      const config = await loadConfig();
      if (safeStorage.isEncryptionAvailable()) {
        const encrypted = safeStorage.encryptString(key);
        config.encryptedChatApiKey = encrypted.toString('base64');
        delete config.chatApiKey;
      } else {
        config.chatApiKey = key; 
      }
      saveConfig(config);
      return true;
    } catch {
      return false;
    }
  });

  ipcMain.handle('get-chat-sessions', async () => {
    let meta = await getSessionMetadata();
    
    // Migration: If no sessions exist, but old chatHistory.json does, migrate it.
    if (meta.length === 0 && fs.existsSync(CHAT_HISTORY_PATH)) {
      try {
        const oldData = await fs.promises.readFile(CHAT_HISTORY_PATH, 'utf-8');
        const oldMessages = JSON.parse(oldData);
        if (oldMessages && oldMessages.length > 0) {
          const id = Date.now().toString();
          const title = oldMessages[0]?.content?.substring(0, 30) || 'Imported Session';
          meta = [{ id, title, updatedAt: Date.now() }];
          await saveSessionMetadata(meta);
          await fs.promises.writeFile(path.join(SESSIONS_DIR, `${id}.json`), JSON.stringify(oldMessages), 'utf-8');
          // Optionally delete old file, but we'll leave it for safety
        }
      } catch (e) {
        console.error('Migration failed:', e);
      }
    }
    
    return meta;
  });

  ipcMain.handle('get-chat-session', async (event, id) => {
    try {
      const sessionPath = path.join(SESSIONS_DIR, `${id}.json`);
      const data = await fs.promises.readFile(sessionPath, 'utf-8');
      return JSON.parse(data);
    } catch {
      return [];
    }
  });

  ipcMain.handle('save-chat-session', async (event, id, title, messages) => {
    try {
      let meta = await getSessionMetadata();
      const existingIdx = meta.findIndex(m => m.id === id);
      
      const sessionData = {
        id,
        title: title || 'New Chat',
        updatedAt: Date.now()
      };

      if (existingIdx >= 0) {
        meta[existingIdx] = sessionData;
      } else {
        meta.unshift(sessionData); // Add to top
      }
      
      // Sort by newest first
      meta.sort((a, b) => b.updatedAt - a.updatedAt);
      
      await saveSessionMetadata(meta);
      const sessionPath = path.join(SESSIONS_DIR, `${id}.json`);
      await fs.promises.writeFile(sessionPath, JSON.stringify(messages), 'utf-8');
      return true;
    } catch (e) {
      console.error('Save session failed:', e);
      return false;
    }
  });

  ipcMain.handle('delete-chat-session', async (event, id) => {
    try {
      let meta = await getSessionMetadata();
      meta = meta.filter(m => m.id !== id);
      await saveSessionMetadata(meta);
      
      const sessionPath = path.join(SESSIONS_DIR, `${id}.json`);
      if (fs.existsSync(sessionPath)) {
        await fs.promises.unlink(sessionPath);
      }
      return true;
    } catch {
      return false;
    }
  });

  ipcMain.handle('find-default-model', async () => {
    try {
      const modelsDir = path.join(__dirname, '..', '..', 'models');
      if (!fs.existsSync(modelsDir)) return null;
      
      // Optimize: Use fs.promises.readdir to avoid blocking the event loop
      // during deeply nested directory traversals. Expected impact: eliminates
      // main thread stuttering when the application searches for models.
      const searchRecursiveAsync = async (dir) => {
        try {
          const entries = await fs.promises.readdir(dir, { withFileTypes: true });
          for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            if (entry.isDirectory()) {
              const found = await searchRecursiveAsync(fullPath);
              if (found) return found;
            } else if (entry.name.endsWith('.model3.json')) {
              return fullPath;
            }
          }
        } catch {}
        return null;
      };

      const defaultDir = path.join(modelsDir, 'default');
      const foundInDefault = await searchRecursiveAsync(defaultDir);
      if (foundInDefault) return foundInDefault;

      return await searchRecursiveAsync(modelsDir);
    } catch (e) {
      console.error('Error finding default model:', e);
      return null;
    }
  });

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

  ipcMain.on('open-external-link', (event, url) => {
    try {
      const parsedUrl = new URL(url);
      if (parsedUrl.protocol === 'http:' || parsedUrl.protocol === 'https:') {
        shell.openExternal(url);
      } else {
        console.error('Invalid URL protocol for external link:', parsedUrl.protocol);
      }
    } catch (error) {
      console.error('Failed to parse external link URL:', error);
    }
  });

  ipcMain.handle('get-config', async () => {
    const config = await loadConfig();
    const { 
      encryptedApiKey: _encryptedApiKey, 
      apiKey: _apiKey, 
      encryptedChatApiKey: _encryptedChatApiKey,
      chatApiKey: _chatApiKey,
      ...safeConfig 
    } = config;
    return safeConfig;
  });

  ipcMain.handle('save-config', async (event, config) => {
    const existing = await loadConfig();
    const merged = { ...existing, ...config };
    saveConfig(merged);

    // Dynamically update screen capture service
    if (screenCapture) {
      screenCapture.stop();
      if (merged.screenCaptureEnabled !== false) {
        screenCapture.start(merged.captureIntervalMinutes || 7);
      }
    }

    return true;
  });

  ipcMain.on('quit-app', () => {
    app.quit();
  });

  // Changed to ipcMain.on for fire-and-forget to clear IPC queue bottleneck
  ipcMain.on('save-chat-log', (event, role, text) => {
    try {
      const stream = getChatLogStream();
      const timestamp = new Date().toISOString();
      const logLine = `[${timestamp}] ${role.toUpperCase()}: ${text}\n`;
      stream.write(logLine);
    } catch (e) {
      console.error('Failed to save chat log:', e);
    }
  });

  ipcMain.handle('save-screenshot-log', async (event, base64Data) => {
    try {
      ensureScreenshotsDir();
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

  ipcMain.on('toggle-settings', () => {
    if (mainWindow) {
      mainWindow.webContents.send('toggle-settings');
    }
  });

  ipcMain.on('minimize-window', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.isMinimized()) {
        mainWindow.restore();
      } else {
        mainWindow.minimize();
      }
    }
  });

  ipcMain.on('update-minimize-shortcut', (event, shortcut) => {
    registerMinimizeShortcut(shortcut);
  });
}

// ─── Config Helpers ─────────────────────────────────────────────────────────

async function loadConfig() {
  try {
    const data = await fs.promises.readFile(CONFIG_PATH, 'utf-8');
    return JSON.parse(data);
  } catch (e) { }
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

app.whenReady().then(async () => {
  protocol.registerFileProtocol('local', (request, callback) => {
    let url = request.url.substring(8); 
    url = decodeURIComponent(url);
    const qIndex = url.indexOf('?');
    if (qIndex > -1) url = url.substring(0, qIndex);
    if (url.match(/^[a-zA-Z]\//)) {
      url = url[0] + ':' + url.substring(1);
    }
    callback({ path: path.normalize(url) });
  });

  setupIPC();
  createWindow();
  tray = createTray(mainWindow);
  screenCapture = new ScreenCaptureService(mainWindow);

  const config = await loadConfig();
  if (config.screenCaptureEnabled !== false) {
    screenCapture.start(config.captureIntervalMinutes || 7);
  }

  // Register global shortcuts (minimize + push-to-talk)
  registerMinimizeShortcut(config.minimizeShortcut || 'Ctrl+M');
  registerPTTHotkey();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

app.on('before-quit', () => {
  globalShortcut.unregisterAll();
  if (screenCapture) screenCapture.stop();
  if (chatLogStream) chatLogStream.end();
});

let minimizeAccelerator = null;

// ─── Global Shortcut Helper ─────────────────────────────────────────────────

function registerMinimizeShortcut(shortcut) {
  try {
    if (minimizeAccelerator) globalShortcut.unregister(minimizeAccelerator);
    minimizeAccelerator = null;
    if (!shortcut) return;

    // Convert friendly names to Electron accelerator format
    const accelerator = shortcut
      .replace('Ctrl', 'CommandOrControl')
      .replace('Super', 'Super');

    const registered = globalShortcut.register(accelerator, () => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        if (mainWindow.isMinimized()) {
          mainWindow.restore();
          mainWindow.focus();
        } else {
          mainWindow.minimize();
        }
        mainWindow.webContents.send('minimize-toggle');
      }
    });

    if (registered) minimizeAccelerator = accelerator;
    else {
      console.warn(`[MAIN] Failed to register shortcut: ${shortcut}`);
    }
  } catch (e) {
    console.error(`[MAIN] Error registering shortcut '${shortcut}':`, e.message);
  }
}

// ─── Push-to-Talk Hotkey Logic ──────────────────────────────────────────────

function registerPTTHotkey() {
  // ── Ctrl+` : Hold to talk (PTT) ─────────────────────────────────────────
  const pttAccelerator = 'CommandOrControl+`';
  let lastRepeatTime = 0;
  let releaseChecker = null;

  const pttOk = globalShortcut.register(pttAccelerator, () => {
    lastRepeatTime = Date.now();

    if (!pttKeyDown) {
      // First press — unmute
      pttKeyDown = true;

      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('ptt-key-down');
      }

      // Detect release via gap in keyboard-repeat events
      releaseChecker = setInterval(() => {
        if (Date.now() - lastRepeatTime > 250) {
          clearInterval(releaseChecker);
          releaseChecker = null;
          pttKeyDown = false;

          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('ptt-key-up');
          }
        }
      }, 50);
    }
  });

  if (!pttOk) {
    console.warn('[PTT] Failed to register hold-to-talk hotkey:', pttAccelerator);
  } else {
    console.log('[PTT] Hold-to-talk registered: Ctrl+`');
  }

  // ── Ctrl+Space : Toggle mic on/off ──────────────────────────────────────
  const toggleAccelerator = 'CommandOrControl+Space';

  const toggleOk = globalShortcut.register(toggleAccelerator, () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('ptt-toggle');
    }
  });

  if (!toggleOk) {
    console.warn('[PTT] Failed to register toggle hotkey:', toggleAccelerator);
  } else {
    console.log('[PTT] Mic toggle registered: Ctrl+Space');
  }
}