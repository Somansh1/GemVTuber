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
    this.modelSelectBtn = document.getElementById('model-select-btn');
    this.modelNameDisplay = document.getElementById('model-name-display') || document.getElementById('model-name');
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
    if (config.personality) this.personalitySelect.value = config.personality;
    if (config.customPrompt) this.customPersonality.value = config.customPrompt;
    if (config.screenCaptureEnabled !== undefined) this.screenCaptureToggle.checked = config.screenCaptureEnabled;
    if (config.captureIntervalMinutes) {
      this.captureInterval.value = config.captureIntervalMinutes;
      this.captureIntervalLabel.textContent = `~${config.captureIntervalMinutes} min`;
    }
    if (config.volume !== undefined) {
      this.volumeSlider.value = config.volume;
      this.volumeLabel.textContent = `${config.volume}%`;
    }
    if (config.modelName) {
      this.modelNameDisplay.textContent = config.modelName;
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
      personality: this.personalitySelect.value,
      customPrompt: this.customPersonality.value,
      screenCaptureEnabled: this.screenCaptureToggle.checked,
      captureIntervalMinutes: parseInt(this.captureInterval.value, 10),
      volume: parseInt(this.volumeSlider.value, 10),
      micDeviceId: this.micSelect.value,
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
