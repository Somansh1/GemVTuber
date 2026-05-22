/**
 * InteractionOverlay — Manages status indicators, subtitles, context menu,
 * window dragging, resize handles, window focus border, and click-through.
 */
export class InteractionOverlay {
  constructor() {
    this.statusIndicator = document.getElementById('status-indicator');
    this.statusDot = this.statusIndicator?.querySelector('.status-dot');
    this.statusText = this.statusIndicator?.querySelector('.status-text');
    this.micIndicator = document.getElementById('mic-indicator');
    this.settingsBtn = document.getElementById('settings-open-btn');
    this.lockBtn = document.getElementById('lock-btn');
    this.subtitleContainer = document.getElementById('subtitle-container');
    this.subtitleText = document.getElementById('subtitle-text');
    this.contextMenu = document.getElementById('context-menu');
    this.canvas = document.getElementById('avatar-canvas');
    this.windowBorder = document.getElementById('window-border');
    this.settingsPanel = document.getElementById('settings-panel');
    this.statusBar = document.getElementById('status-bar');

    this._subtitleTimer = null;
    this._contextMenuCallback = null;
    this._settingsCallback = null;

    // Drag state
    this._isDragging = false;
    this._dragStartX = 0;
    this._dragStartY = 0;

    this._setupWindowDragging();
    this._setupContextMenu();
    this._setupResizeHandles();
    this._setupClickThrough();
    this._setupWindowFocus();
    this._setupSettingsButton();
    this._setupUIToggle();
  }

  _setupUIToggle() {
    // Hide UI by default
    document.body.classList.add('ui-hidden');
    let hideTimer = null;

    const resetHideTimer = () => {
      document.body.classList.remove('ui-hidden');
      if (hideTimer) clearTimeout(hideTimer);
      
      // Auto-hide after 2.5 seconds of inactivity
      hideTimer = setTimeout(() => {
        const isSettingsOpen = this.settingsPanel && !this.settingsPanel.classList.contains('hidden');
        if (!isSettingsOpen) {
          document.body.classList.add('ui-hidden');
        }
      }, 2500);
    };

    // Use mousemove/mouseenter/contextmenu because mousedown is swallowed by -webkit-app-region: drag on Windows
    window.addEventListener('mousemove', resetHideTimer);
    window.addEventListener('mouseenter', resetHideTimer);
    window.addEventListener('contextmenu', resetHideTimer);
    
    // Initial timer start
    resetHideTimer();
  }

  _setupWindowDragging() {
    // We rely on -webkit-app-region: drag in CSS for dragging.
    // Ensure we don't accidentally handle manual drag.
  }

  // ─── Public API ────────────────────────────────────────────────

  setStatus(status) {
    if (!this.statusIndicator) return;
    this.statusIndicator.className = `status-${status}`;
    const labels = { idle: 'Idle', connected: 'Ready', listening: 'Listening', speaking: 'Speaking', error: 'Error' };
    if (this.statusText) this.statusText.textContent = labels[status] || status;
  }

  setMicState(state) {
    if (!this.micIndicator) return;
    this.micIndicator.classList.remove('mic-on', 'mic-off', 'mic-muted');
    this.micIndicator.classList.add(`mic-${state}`);
    
    // Update the actual icon text
    const iconSpan = this.micIndicator.querySelector('.material-symbols-outlined');
    if (iconSpan) {
      if (state === 'muted' || state === 'off') {
        iconSpan.textContent = 'mic_off';
        this.micIndicator.style.color = 'var(--error)';
      } else {
        iconSpan.textContent = 'mic';
        this.micIndicator.style.color = '';
      }
    }
  }

  showSubtitle(text, duration = 5000) {
    if (!this.subtitleContainer || !this.subtitleText) return;
    this.subtitleText.textContent = text;
    this.subtitleContainer.classList.remove('hidden');
    if (this._subtitleTimer) clearTimeout(this._subtitleTimer);
    if (duration > 0) {
      this._subtitleTimer = setTimeout(() => this.hideSubtitle(), duration);
    }
  }

  hideSubtitle() {
    if (this.subtitleContainer) this.subtitleContainer.classList.add('hidden');
    if (this._subtitleTimer) {
      clearTimeout(this._subtitleTimer);
      this._subtitleTimer = null;
    }
  }

  appendChatMessage(text, role) {
    if (!this.chatPanel) {
      this.chatPanel = document.getElementById('chat-panel');
    }
    if (!this.chatPanel) return;

    // Show the panel
    this.chatPanel.style.opacity = '1';

    const msgDiv = document.createElement('div');
    msgDiv.className = 'px-3 py-2 rounded-lg text-[13px] font-body-md animate-slideInRight max-w-[90%] shadow-lg ';
    
    if (role === 'user') {
      msgDiv.className += 'bg-surface-variant text-on-surface self-end rounded-br-sm';
    } else {
      msgDiv.className += 'bg-primary-container text-on-primary-container self-start rounded-bl-sm';
    }

    msgDiv.textContent = text;
    this.chatPanel.appendChild(msgDiv);
    
    // Auto scroll
    this.chatPanel.scrollTop = this.chatPanel.scrollHeight;

    // Limit messages
    while (this.chatPanel.children.length > 20) {
      this.chatPanel.removeChild(this.chatPanel.firstChild);
    }

    // Hide chat after 15 seconds of inactivity
    if (this._chatTimer) clearTimeout(this._chatTimer);
    this._chatTimer = setTimeout(() => {
      this.chatPanel.style.opacity = '0';
      setTimeout(() => {
        if (this.chatPanel.style.opacity === '0') {
          this.chatPanel.innerHTML = '';
        }
      }, 500);
    }, 15000);
  }

  showContextMenu(x, y) {
    if (!this.contextMenu) return;
    this.contextMenu.classList.remove('hidden');
    this.contextMenu.style.left = `${x}px`;
    this.contextMenu.style.top = `${y}px`;

    requestAnimationFrame(() => {
      const rect = this.contextMenu.getBoundingClientRect();
      if (rect.right > window.innerWidth) this.contextMenu.style.left = `${window.innerWidth - rect.width - 8}px`;
      if (rect.bottom > window.innerHeight) this.contextMenu.style.top = `${window.innerHeight - rect.height - 8}px`;
    });
  }

  hideContextMenu() {
    if (this.contextMenu) this.contextMenu.classList.add('hidden');
  }

  onContextMenuAction(callback) {
    this._contextMenuCallback = callback;
  }

  onSettingsClick(callback) {
    this._settingsCallback = callback;
  }

  // ─── Private Setup ────────────────────────────────────────────

  _setupSettingsButton() {
    this.settingsBtn?.addEventListener('click', () => {
      if (this._settingsCallback) this._settingsCallback();
    });
    this.lockBtn?.addEventListener('click', () => {
      this.lockModel();
    });

    // Listen for unlock from tray
    if (window.electronAPI?.onLockStateChanged) {
      window.electronAPI.onLockStateChanged((locked) => {
        if (!locked) {
          this.showSubtitle("🔓 Model unlocked.", 2000);
        }
      });
    }
  }

  lockModel() {
    if (window.electronAPI?.lockModel) {
      window.electronAPI.lockModel(true);
      this.showSubtitle("🔒 Model locked. Use system tray to unlock.");
      setTimeout(() => this.hideSubtitle(), 4000);
    }
  }

  _setupContextMenu() {
    // Single document-level handler ensures context menu works EVERYWHERE
    document.addEventListener('contextmenu', (e) => {
      // Don't override right-click inside settings panel
      if (this.settingsPanel && !this.settingsPanel.classList.contains('hidden') && this.settingsPanel.contains(e.target)) return;
      if (this.contextMenu?.contains(e.target)) return;
      e.preventDefault();
      this.showContextMenu(e.clientX, e.clientY);
    });

    document.addEventListener('click', (e) => {
      if (!this.contextMenu?.contains(e.target)) {
        this.hideContextMenu();
      }
    });

    this.contextMenu?.querySelectorAll('.ctx-item').forEach((item) => {
      item.addEventListener('click', () => {
        const action = item.dataset.action;
        this.hideContextMenu();
        if (this._contextMenuCallback) this._contextMenuCallback(action);
      });
    });
  }

  _setupResizeHandles() {
    document.querySelectorAll('.resize-handle').forEach((handle) => {
      handle.addEventListener('mousedown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this._isResizing = true;
        this._resizeDirection = handle.dataset.direction;
        this._resizeStartX = e.screenX;
        this._resizeStartY = e.screenY;
        document.body.classList.add('window-resizing');
      });
    });

    window.addEventListener('mousemove', (e) => {
      if (this._isResizing && window.electronAPI) {
        const deltaX = e.screenX - this._resizeStartX;
        const deltaY = e.screenY - this._resizeStartY;
        this._resizeStartX = e.screenX;
        this._resizeStartY = e.screenY;
        window.electronAPI.resizeWindow(this._resizeDirection, deltaX, deltaY);
      }
    });

    window.addEventListener('mouseup', () => {
      if (this._isResizing) {
        this._isResizing = false;
        document.body.classList.remove('window-resizing');
      }
    });
  }

  _setupWindowFocus() {
    window.addEventListener('focus', () => {
      document.body.classList.add('window-focused');
    });

    window.addEventListener('blur', () => {
      document.body.classList.remove('window-focused');
      document.body.classList.remove('window-resizing');
    });

    if (document.hasFocus()) {
      document.body.classList.add('window-focused');
    }
  }

  _setupClickThrough() {
    if (!window.electronAPI) return;
    
    // We disable the manual click-through hit-testing because it inherently conflicts 
    // with both PixiJS event handling and UI overlays, causing the window to become 
    // immovable or buttons to become unclickable.
    // By keeping mouse events enabled, the user can always reliably drag the avatar 
    // and click the settings gear.
    window.electronAPI.setIgnoreMouseEvents(false);
  }
}
