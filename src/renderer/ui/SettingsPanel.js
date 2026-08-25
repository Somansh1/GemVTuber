/**
 * SettingsPanel — Manages the settings UI panel.
 */
export class SettingsPanel {
  constructor() {
    // Cache DOM elements
    this.panel = document.getElementById('settings-panel');
    this.closeBtn = document.getElementById('settings-close');
    this.apiKeyInput = document.getElementById('api-key-input');
    this.apiKeyToggle = document.getElementById('api-key-toggle');
    this.chatApiKeyInput = document.getElementById('chat-api-key-input');
    this.chatApiKeyToggle = document.getElementById('chat-api-key-toggle');
    this.chatBaseUrlInput = document.getElementById('chat-base-url-input');
    this.chatModelNameInput = document.getElementById('chat-model-name-input');
    this.chatMaxTokensInput = document.getElementById('chat-max-tokens-input');
    this.modelSelectBtn = document.getElementById('model-select-btn');
    this.modelNameDisplay = document.getElementById('model-name-display') || document.getElementById('model-name');
    this.modelScaleSlider = document.getElementById('model-scale-slider');
    this.modelScaleLabel = document.getElementById('model-scale-label');
    this.personalitySelect = document.getElementById('personality-select');
    this.customPersonality = document.getElementById('custom-personality');
    this.screenCaptureToggle = document.getElementById('screen-capture-toggle');
    this.captureInterval = document.getElementById('capture-interval');
    this.captureIntervalLabel = document.getElementById('capture-interval-label');
    this.micSelect = document.getElementById('mic-select');
    this.volumeSlider = document.getElementById('volume-slider');
    this.volumeLabel = document.getElementById('volume-label');
    this.aiStudioLink = document.getElementById('ai-studio-link');
    this.saveBtn = document.getElementById('settings-save-btn');
    this.minimizeShortcutInput = document.getElementById('minimize-shortcut-input');
    this.minimizeShortcutRecordBtn = document.getElementById('minimize-shortcut-record-btn');
    this._isRecordingShortcut = false;

    this._onSaveCallback = null;
    this._onModelSelect = null;

    this._setupEventListeners();
  }

  /** Shows the settings panel. */
  show() {
    this.panel.classList.remove('hidden');
    this.panel.style.animation = 'slideInRight 0.35s ease';
  }

  /** Hides the settings panel. */
  hide() {
    this.panel.classList.add('hidden');
  }

  /** Toggles panel visibility. */
  toggle() {
    if (this.panel.classList.contains('hidden')) {
      this.show();
    } else {
      this.hide();
    }
  }

  /**
   * Populates fields from a config object.
   * @param {object} config
   */
  loadSettings(config) {
    if (config.apiKey) this.apiKeyInput.value = config.apiKey;
    if (config.chatApiKey) this.chatApiKeyInput.value = config.chatApiKey;
    if (config.chatBaseUrl) this.chatBaseUrlInput.value = config.chatBaseUrl;
    if (config.chatModelName) this.chatModelNameInput.value = config.chatModelName;
    if (config.chatMaxTokens) this.chatMaxTokensInput.value = config.chatMaxTokens;
    if (config.personality) this.personalitySelect.value = config.personality;
    if (config.customPrompt) this.customPersonality.value = config.customPrompt;
    if (config.screenCaptureEnabled !== undefined) this.screenCaptureToggle.checked = config.screenCaptureEnabled;
    if (config.captureIntervalMinutes) {
      this.captureInterval.value = config.captureIntervalMinutes;
      this.captureIntervalLabel.textContent = `~${config.captureIntervalMinutes} min`;
    }
    if (config.avatarScale !== undefined) {
      this.modelScaleSlider.value = config.avatarScale;
      this.modelScaleLabel.textContent = `${Number(config.avatarScale).toFixed(1)}x`;
    }
    if (config.volume !== undefined) {
      this.volumeSlider.value = config.volume;
      this.volumeLabel.textContent = `${config.volume}%`;
    }
    if (config.modelName) {
      this.modelNameDisplay.textContent = config.modelName;
    }
    if (config.minimizeShortcut) {
      this.minimizeShortcutInput.value = config.minimizeShortcut;
    }

    // Show/hide custom personality
    this.customPersonality.classList.toggle('hidden', this.personalitySelect.value !== 'custom');
  }

  /**
   * Reads all fields and returns a config object.
   * @returns {object}
   */
  getSettings() {
    return {
      chatBaseUrl: this.chatBaseUrlInput.value,
      chatModelName: this.chatModelNameInput.value,
      chatMaxTokens: parseInt(this.chatMaxTokensInput.value, 10) || 4096,
      personality: this.personalitySelect.value,
      customPrompt: this.customPersonality.value,
      screenCaptureEnabled: this.screenCaptureToggle.checked,
      captureIntervalMinutes: parseInt(this.captureInterval.value, 10),
      avatarScale: parseFloat(this.modelScaleSlider.value),
      volume: parseInt(this.volumeSlider.value, 10),
      micDeviceId: this.micSelect.value,
      minimizeShortcut: this.minimizeShortcutInput.value || 'Ctrl+M',
    };
  }

  /**
   * Registers a callback for when settings change.
   * @param {function(object): void} callback
   */
  onSave(callback) {
    this._onSaveCallback = callback;
  }

  /**
   * Registers a callback for model selection.
   * @param {function(string): void} callback
   */
  onModelSelect(callback) {
    this._onModelSelect = callback;
  }

  /**
   * Populates the microphone dropdown with available devices.
   * @param {MediaDeviceInfo[]} devices
   */
  populateMicDevices(devices) {
    this.micSelect.innerHTML = '<option value="">Default microphone</option>';
    for (const device of devices) {
      const opt = document.createElement('option');
      opt.value = device.deviceId;
      opt.textContent = device.label || `Microphone ${device.deviceId.slice(0, 8)}`;
      this.micSelect.appendChild(opt);
    }
  }

  // ─── Private ──────────────────────────────────────────────────

  _setupEventListeners() {
    // Close button
    this.closeBtn?.addEventListener('click', () => this.hide());

    // Save button
    this.saveBtn?.addEventListener('click', () => {
      this._emitChange();
      
      // Visual feedback
      const originalHtml = this.saveBtn.innerHTML;
      this.saveBtn.innerHTML = '<span class="material-symbols-outlined">check</span> Saved!';
      this.saveBtn.style.background = 'var(--success)';
      this.saveBtn.style.color = 'var(--bg-dark)';
      
      setTimeout(() => {
        this.saveBtn.innerHTML = originalHtml;
        this.saveBtn.style.background = '';
        this.saveBtn.style.color = '';
        this.hide();
      }, 500);
    });

    // API key show/hide toggle
    this.apiKeyToggle?.addEventListener('click', () => {
      const isPassword = this.apiKeyInput.type === 'password';
      this.apiKeyInput.type = isPassword ? 'text' : 'password';
      const icon = this.apiKeyToggle.querySelector('.material-symbols-outlined');
      if (icon) icon.textContent = isPassword ? 'visibility_off' : 'visibility';
    });

    // API key save on blur
    this.apiKeyInput?.addEventListener('change', async () => {
      const key = this.apiKeyInput.value.trim();
      if (key && window.electronAPI) {
        await window.electronAPI.setApiKey(key);
      }
      this._emitChange();
    });

    // Chat API key show/hide toggle
    this.chatApiKeyToggle?.addEventListener('click', () => {
      const isPassword = this.chatApiKeyInput.type === 'password';
      this.chatApiKeyInput.type = isPassword ? 'text' : 'password';
      const icon = this.chatApiKeyToggle.querySelector('.material-symbols-outlined');
      if (icon) icon.textContent = isPassword ? 'visibility_off' : 'visibility';
    });

    // Chat API key save on blur
    this.chatApiKeyInput?.addEventListener('change', async () => {
      const key = this.chatApiKeyInput.value.trim();
      if (key && window.electronAPI) {
        await window.electronAPI.setChatApiKey(key);
      }
      this._emitChange();
    });

    // Chat settings changes
    this.chatBaseUrlInput?.addEventListener('change', () => this._emitChange());
    this.chatModelNameInput?.addEventListener('change', () => this._emitChange());
    this.chatMaxTokensInput?.addEventListener('change', () => this._emitChange());

    // Model selection
    this.modelSelectBtn?.addEventListener('click', async () => {
      if (window.electronAPI) {
        const filePath = await window.electronAPI.selectModelFile();
        if (filePath) {
          const name = filePath.split(/[/\\]/).pop();
          this.modelNameDisplay.textContent = name;
          if (this._onModelSelect) this._onModelSelect(filePath);
        }
      }
    });

    // Model scale slider
    this.modelScaleSlider?.addEventListener('input', () => {
      this.modelScaleLabel.textContent = `${Number(this.modelScaleSlider.value).toFixed(1)}x`;
    });
    this.modelScaleSlider?.addEventListener('change', () => this._emitChange());

    // Personality select
    this.personalitySelect?.addEventListener('change', () => {
      this.customPersonality.classList.toggle('hidden', this.personalitySelect.value !== 'custom');
      this._emitChange();
    });

    // Custom personality
    this.customPersonality?.addEventListener('change', () => this._emitChange());

    // Screen capture toggle
    this.screenCaptureToggle?.addEventListener('change', () => this._emitChange());

    // Capture interval slider
    this.captureInterval?.addEventListener('input', () => {
      this.captureIntervalLabel.textContent = `~${this.captureInterval.value} min`;
    });
    this.captureInterval?.addEventListener('change', () => this._emitChange());

    // Volume slider
    this.volumeSlider?.addEventListener('input', () => {
      this.volumeLabel.textContent = `${this.volumeSlider.value}%`;
    });
    this.volumeSlider?.addEventListener('change', () => this._emitChange());

    // AI Studio link
    this.aiStudioLink?.addEventListener('click', (e) => {
      e.preventDefault();
      if (window.electronAPI) {
        window.electronAPI.openExternalLink('https://aistudio.google.com/apikey');
      }
    });

    // Mic select
    this.micSelect?.addEventListener('change', () => this._emitChange());

    // Minimize shortcut recording
    this.minimizeShortcutRecordBtn?.addEventListener('click', () => {
      if (this._isRecordingShortcut) return;
      this._isRecordingShortcut = true;
      this.minimizeShortcutInput.value = 'Press keys...';
      this.minimizeShortcutInput.classList.add('border-primary', 'ring-1', 'ring-primary');
      this.minimizeShortcutRecordBtn.textContent = 'Listening...';

      const handler = (e) => {
        e.preventDefault();
        e.stopPropagation();

        // Ignore standalone modifier keys
        if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) return;

        const parts = [];
        if (e.ctrlKey) parts.push('Ctrl');
        if (e.altKey) parts.push('Alt');
        if (e.shiftKey) parts.push('Shift');
        if (e.metaKey) parts.push('Super');

        let key = e.key;
        // Normalize key names
        if (key === ' ') key = 'Space';
        else if (key.length === 1) key = key.toUpperCase();
        else if (key === 'ArrowUp') key = 'Up';
        else if (key === 'ArrowDown') key = 'Down';
        else if (key === 'ArrowLeft') key = 'Left';
        else if (key === 'ArrowRight') key = 'Right';

        parts.push(key);

        this.minimizeShortcutInput.value = parts.join('+');
        this.minimizeShortcutInput.classList.remove('border-primary', 'ring-1', 'ring-primary');
        this.minimizeShortcutRecordBtn.textContent = 'Record';
        this._isRecordingShortcut = false;
        document.removeEventListener('keydown', handler, true);
        this._emitChange();
      };

      document.addEventListener('keydown', handler, true);
    });

    // Listen for toggle from tray
    if (window.electronAPI) {
      window.electronAPI.onToggleSettings(() => this.toggle());
    }
  }

  _emitChange() {
    if (this._onSaveCallback) {
      this._onSaveCallback(this.getSettings());
    }
  }
}
