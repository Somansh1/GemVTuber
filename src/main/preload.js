const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // ─── Window Management ──────────────────────────────────────────────
  setIgnoreMouseEvents: (ignore, options) => {
    ipcRenderer.send('set-ignore-mouse-events', ignore, options);
  },

  resizeWindow: (direction, deltaX, deltaY) => {
    ipcRenderer.send('resize-window', direction, deltaX, deltaY);
  },

  moveWindow: (deltaX, deltaY) => {
    ipcRenderer.send('move-window', deltaX, deltaY);
  },

  onGlobalMouseMove: (callback) => {
    ipcRenderer.on('global-mouse-move', (event, coords) => callback(coords));
  },

  // ─── Screen Capture ─────────────────────────────────────────────────
  getScreenSourceId: () => {
    return ipcRenderer.invoke('get-screen-source-id');
  },

  captureScreen: (width, height) => {
    return ipcRenderer.invoke('capture-screen', width, height);
  },

  onScreenCapture: (callback) => {
    ipcRenderer.on('trigger-periodic-capture', () => callback());
  },

  // ─── Logging ────────────────────────────────────────────────────────
  // Changed to ipcRenderer.send to stop blocking the renderer process
  saveChatLog: (role, text) => ipcRenderer.send('save-chat-log', role, text),
  saveScreenshotLog: (base64Data) => ipcRenderer.invoke('save-screenshot-log', base64Data),
  openLogsFolder: () => ipcRenderer.send('open-logs-folder'),

  // ─── API Key ────────────────────────────────────────────────────────
  getApiKey: () => ipcRenderer.invoke('get-api-key'),
  setApiKey: (key) => ipcRenderer.invoke('set-api-key', key),
  getChatApiKey: () => ipcRenderer.invoke('get-chat-api-key'),
  setChatApiKey: (key) => ipcRenderer.invoke('set-chat-api-key', key),

  // ─── Chat Sessions ───────────────────────────────────────────────────
  getChatSessions: () => ipcRenderer.invoke('get-chat-sessions'),
  getChatSession: (id) => ipcRenderer.invoke('get-chat-session', id),
  saveChatSession: (id, title, messages) => ipcRenderer.invoke('save-chat-session', id, title, messages),
  deleteChatSession: (id) => ipcRenderer.invoke('delete-chat-session', id),

  // ─── Model Selection ───────────────────────────────────────────────
  selectModelFile: () => ipcRenderer.invoke('select-model-file'),
  findDefaultModel: () => ipcRenderer.invoke('find-default-model'),

  // ─── Config Persistence ─────────────────────────────────────────────
  getConfig: () => ipcRenderer.invoke('get-config'),
  saveConfig: (config) => ipcRenderer.invoke('save-config', config),

  // ─── External Links ────────────────────────────────────────────────
  openExternalLink: (url) => {
    ipcRenderer.send('open-external-link', url);
  },

  // ─── App Control ───────────────────────────────────────────────────
  quitApp: () => {
    ipcRenderer.send('quit-app');
  },

  minimizeWindow: () => {
    ipcRenderer.send('minimize-window');
  },

  updateMinimizeShortcut: (shortcut) => {
    ipcRenderer.send('update-minimize-shortcut', shortcut);
  },

  onMinimizeToggle: (callback) => {
    ipcRenderer.on('minimize-toggle', () => callback());
  },

  // ─── Events from Main Process ──────────────────────────────────────
  onToggleSettings: (callback) => {
    ipcRenderer.on('toggle-settings', () => callback());
  },

  // ─── Lock Model ───────────────────────────────────────────────────
  lockModel: (locked) => {
    ipcRenderer.send('lock-model', locked);
  },

  onLockStateChanged: (callback) => {
    ipcRenderer.on('lock-state-changed', (event, locked) => callback(locked));
  },
});