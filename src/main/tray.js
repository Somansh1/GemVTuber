const { Tray, Menu, nativeImage, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

/**
 * Creates the system tray icon with a context menu.
 * Lock state is synced between tray and renderer via IPC.
 * @param {Electron.BrowserWindow} win - The main window
 * @returns {Electron.Tray}
 */
function createTray(win) {
  // Try to load icon, or create a simple placeholder
  let icon;
  const iconPath = path.join(__dirname, '..', '..', 'assets', 'icons', 'tray.png');
  
  if (fs.existsSync(iconPath)) {
    icon = nativeImage.createFromPath(iconPath);
  } else {
    icon = nativeImage.createFromBuffer(createPlaceholderIcon(), { width: 16, height: 16 });
  }

  const tray = new Tray(icon.resize({ width: 16, height: 16 }));
  tray.setToolTip('GemVTuber — Your AI Desktop Companion');

  // Mutable lock state shared between tray and renderer
  let isLocked = false;

  function rebuildMenu() {
    const contextMenu = Menu.buildFromTemplate([
      {
        label: 'Show / Hide',
        click: () => {
          if (win.isVisible()) {
            win.hide();
          } else {
            win.show();
            win.focus();
          }
        },
      },
      {
        label: 'Settings',
        click: () => {
          win.show();
          win.focus();
          win.webContents.send('toggle-settings');
        },
      },
      { type: 'separator' },
      {
        label: 'Lock Model (Click-through)',
        type: 'checkbox',
        checked: isLocked,
        click: (menuItem) => {
          isLocked = menuItem.checked;
          if (isLocked) {
            win.setIgnoreMouseEvents(true, { forward: true });
          } else {
            win.setIgnoreMouseEvents(false);
          }
          // Tell renderer about the state change
          win.webContents.send('lock-state-changed', isLocked);
          rebuildMenu();
        }
      },
      { type: 'separator' },
      {
        label: 'Quit',
        click: () => {
          require('electron').app.quit();
        },
      },
    ]);
    tray.setContextMenu(contextMenu);
  }

  rebuildMenu();

  // Listen for lock requests FROM the renderer (lock button / context menu)
  ipcMain.on('lock-model', (event, locked) => {
    isLocked = locked;
    if (isLocked) {
      win.setIgnoreMouseEvents(true, { forward: true });
    } else {
      win.setIgnoreMouseEvents(false);
    }
    rebuildMenu();
  });

  // Click tray icon to toggle visibility
  tray.on('click', () => {
    if (win.isVisible()) {
      win.hide();
    } else {
      win.show();
      win.focus();
    }
  });

  return tray;
}

/**
 * Creates a tiny purple PNG buffer for the tray placeholder.
 */
function createPlaceholderIcon() {
  const width = 16;
  const height = 16;
  const buffer = Buffer.alloc(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    buffer[i * 4 + 0] = 0x7c; // R
    buffer[i * 4 + 1] = 0x5c; // G
    buffer[i * 4 + 2] = 0xfc; // B
    buffer[i * 4 + 3] = 0xff; // A
  }
  return buffer;
}

module.exports = { createTray };
