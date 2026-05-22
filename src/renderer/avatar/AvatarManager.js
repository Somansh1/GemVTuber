import * as PIXI from 'pixi.js';
import { Live2DModel, Live2DPlugin } from 'untitled-pixi-live2d-engine/cubism';

// Register the PixiJS ticker for Live2D animation updates
Live2DModel.registerTicker(PIXI.Ticker);

/**
 * Manages the Live2D avatar rendering, parameter discovery, and control.
 * Falls back to DefaultAvatar when no Live2D model is loaded.
 */
export class AvatarManager {
  /**
   * @param {HTMLCanvasElement} canvas - The canvas element to render on
   */
  constructor() {
    this.app = new PIXI.Application();

    /** @type {Live2DModel|null} */
    this.model = null;

    this.onLipSync = null;

    // We will initialize in init()
  }

  async init(canvas) {
    // Register the Live2D render pipe before creating Pixi renderer
    PIXI.extensions.add(Live2DPlugin);

    await this.app.init({
      view: canvas,
      backgroundAlpha: 0,
      antialias: true,
      autoDensity: true,
      resolution: window.devicePixelRatio || 1,
      resizeTo: window,
    });

    /** @type {import('./DefaultAvatar').DefaultAvatar|null} */
    this.defaultAvatar = null;

    /** @type {boolean} */
    this.eyeFollowEnabled = true;

    /** @type {object|null} */
    this.modelProfile = null;

    /** @type {boolean} */
    this._usingDefault = false;

    // Track mouse for eye follow
    this._mouseX = 0;
    this._mouseY = 0;
    window.addEventListener('mousemove', (e) => {
      this._mouseX = e.clientX;
      this._mouseY = e.clientY;
    });

    // Handle window resize
    window.addEventListener('resize', () => this.resize());

    // Eye follow ticker
    this.app.ticker.add(() => this._updateEyeFollow());
  }

  /**
   * Loads a Live2D model from a model3.json path.
   * @param {string} modelPath - Path or URL to the model3.json file
   * @returns {Promise<object>} The model profile
   */
  async loadLive2DModel(modelPath) {
    // Check for Cubism Core
    if (!window.Live2DCubismCore) {
      await this._loadCubismCore();
    }

    // Remove previous model
    if (this.model) {
      this.app.stage.removeChild(this.model);
      this.model.destroy();
      this.model = null;
    }

    // Remove default avatar if active
    if (this._usingDefault && this.defaultAvatar) {
      this.defaultAvatar.stopAnimation();
      this._usingDefault = false;
    }

    try {
      this.model = await Live2DModel.from(modelPath, {
        autoInteract: false,
        autoUpdate: true,
      });

      // Scale to fit window
      this._fitModelToWindow();

      this.app.stage.addChild(this.model);

      // Start idle animation
      this._startIdleAnimation();

      // Discover capabilities
      this.modelProfile = this.discoverCapabilities();

      return this.modelProfile;
    } catch (err) {
      console.error('Failed to load Live2D model:', err);
      throw err;
    }
  }

  /**
   * Discovers all parameters, expressions, and motions available on the loaded model.
   * @returns {object} Model profile describing capabilities
   */
  discoverCapabilities() {
    if (!this.model) {
      if (this.defaultAvatar) return this.defaultAvatar.getCapabilities();
      return { parameters: [], expressions: [], motionGroups: [], hasBody: false, hasMouthForm: false };
    }

    const coreModel = this.model.internalModel.coreModel;
    const settings = this.model.internalModel.settings;

    // Enumerate parameters
    const parameters = [];
    const paramCount = coreModel.parameters ? coreModel.parameters.count : coreModel.getParameterCount();
    for (let i = 0; i < paramCount; i++) {
      let paramId = '';
      if (coreModel.parameters && coreModel.parameters.ids) {
        paramId = coreModel.parameters.ids[i];
      } else {
        paramId = coreModel.getParameterId(i);
      }
      
      if (i === 0) console.log('RAW PARAM ID:', paramId, typeof paramId, Object.keys(paramId || {}));
      
      // Force it to string regardless of where it came from
      if (paramId && typeof paramId === 'object') {
        paramId = paramId.s || paramId.id || paramId._id || paramId[0] || String(paramId);
      } else {
        paramId = String(paramId);
      }
      
      parameters.push({
        id: paramId,
        min: coreModel.parameters ? coreModel.parameters.minimumValues[i] : coreModel.getParameterMinimumValue(i),
        max: coreModel.parameters ? coreModel.parameters.maximumValues[i] : coreModel.getParameterMaximumValue(i),
        default: coreModel.parameters ? coreModel.parameters.defaultValues[i] : coreModel.getParameterDefaultValue(i),
      });
    }

    // Enumerate expressions
    const expressions = [];
    if (settings.expressions) {
      for (const expr of settings.expressions) {
        expressions.push(expr.Name || expr.name || `expression_${expressions.length}`);
      }
    }

    // Enumerate motion groups
    const motionGroups = {};
    if (settings.motions) {
      for (const [group, motions] of Object.entries(settings.motions)) {
        motionGroups[group] = Array.isArray(motions) ? motions.length : 0;
      }
    }

    // Detect capabilities from parameter IDs
    const paramIds = parameters.map(p => {
      if (typeof p.id === 'string') return p.id;
      if (p.id && typeof p.id.s === 'string') return p.id.s;
      return String(p.id);
    });
    console.log('PARAM IDS:', paramIds);
    const hasBody = paramIds.some(id => id && typeof id.includes === 'function' && id.includes('Body'));
    const hasMouthForm = paramIds.some(id => id === 'ParamMouthForm');
    const hasBreathing = paramIds.some(id => id === 'ParamBreath');

    this.modelProfile = {
      parameters,
      expressions,
      motionGroups,
      hasBody,
      hasMouthForm,
      hasBreathing,
      parameterIds: paramIds,
    };

    return this.modelProfile;
  }

  /**
   * Sets a Live2D parameter value.
   * @param {string} id - Parameter ID (e.g., 'ParamMouthOpenY')
   * @param {number} value - Target value
   * @param {number} [weight=1] - Blending weight
   */
  setParameter(id, value, weight = 1) {
    if (!this.model) {
      if (this.defaultAvatar) this.defaultAvatar.setParameter(id, value);
      return;
    }
    try {
      this.model.internalModel.coreModel.setParameterValueById(id, value, weight);
    } catch (e) {
      // Parameter might not exist on this model — that's fine
    }
  }

  /**
   * Triggers an expression by name.
   * @param {string} name - Expression name
   */
  triggerExpression(name) {
    if (!this.model) {
      if (this.defaultAvatar) this.defaultAvatar.setEmotion(name);
      return;
    }
    try {
      this.model.expression(name);
    } catch (e) {
      // Try by index if name doesn't match
      const idx = this.modelProfile?.expressions?.indexOf(name);
      if (idx >= 0) {
        try { this.model.expression(idx); } catch (_) { /* ignore */ }
      }
    }
  }

  /**
   * Plays a motion from a group.
   * @param {string} group - Motion group name
   * @param {number} [index=0] - Motion index within the group
   */
  triggerMotion(group, index = 0) {
    if (!this.model) return;
    try {
      this.model.motion(group, index);
    } catch (e) {
      console.warn(`Motion ${group}[${index}] not available`);
    }
  }

  /**
   * Enables or disables eye/head follow of the mouse cursor.
   * @param {boolean} enabled
   */
  setEyeFollow(enabled) {
    this.eyeFollowEnabled = enabled;
  }

  /**
   * Switches to the default canvas avatar.
   * @param {import('./DefaultAvatar').DefaultAvatar} defaultAvatar
   */
  useDefaultAvatar(defaultAvatar) {
    // Remove Live2D model if loaded
    if (this.model) {
      this.app.stage.removeChild(this.model);
      this.model.destroy();
      this.model = null;
    }

    this.defaultAvatar = defaultAvatar;
    this._usingDefault = true;
    this.defaultAvatar.startAnimation();
    this.modelProfile = this.defaultAvatar.getCapabilities();
  }

  /** @returns {boolean} Whether a Live2D model is loaded */
  isLive2DLoaded() {
    return this.model !== null;
  }

  /** @returns {object|null} Current model reference */
  getModel() {
    return this.model;
  }

  /** Handle window resize — refit and recenter model. */
  resize() {
    if (this.model) {
      this._fitModelToWindow();
    }
    if (this._usingDefault && this.defaultAvatar) {
      this.defaultAvatar.resize(window.innerWidth, window.innerHeight);
    }
  }

  /** Clean up everything. */
  destroy() {
    if (this.model) {
      this.model.destroy();
      this.model = null;
    }
    if (this.defaultAvatar) {
      this.defaultAvatar.stopAnimation();
    }
    this.app.destroy(false);
  }

  // ─── Private Helpers ──────────────────────────────────────────────

  /** @private Fit model to window while maintaining aspect ratio. */
  _fitModelToWindow() {
    if (!this.model) return;
    const w = window.innerWidth;
    const h = window.innerHeight;
    
    // Prevent exponential scaling loops by calculating from the unscaled dimensions
    const unscaledWidth = this.model.width / this.model.scale.x;
    const unscaledHeight = this.model.height / this.model.scale.y;

    const scaleX = w / unscaledWidth;
    const scaleY = h / unscaledHeight;
    const scale = Math.min(scaleX, scaleY) * 5; // Scaled up 3x as requested

    this.model.scale.set(scale);
    this.model.anchor.set(0.5, 0.5);
    this.model.x = w / 2;
    // Shift slightly down so the character's head is closer to the center if it's a full-body model
    this.model.y = h / 2; 
  }

  /** @private Start idle motion loop. */
  _startIdleAnimation() {
    if (!this.model || !this.modelProfile) return;
    const motionGroups = this.modelProfile.motionGroups || {};
    // Look for idle-like motion groups
    const idleGroup = Object.keys(motionGroups).find(g =>
      g.toLowerCase().includes('idle') || g.toLowerCase().includes('breathe')
    );
    if (idleGroup) {
      this.model.motion(idleGroup);
    }
  }

  /** @private Update eye follow based on mouse position. */
  _updateEyeFollow() {
    if (!this.eyeFollowEnabled || !this.model) return;

    const w = window.innerWidth;
    const h = window.innerHeight;

    // Normalize mouse position to -1..1 range relative to window center
    const nx = ((this._mouseX / w) - 0.5) * 2;
    const ny = ((this._mouseY / h) - 0.5) * 2;

    // Map to model parameters with smooth interpolation
    const core = this.model.internalModel.coreModel;
    try {
      core.setParameterValueById('ParamAngleX', nx * 30, 0.15);
      core.setParameterValueById('ParamAngleY', -ny * 30, 0.15);
      core.setParameterValueById('ParamEyeBallX', nx, 0.2);
      core.setParameterValueById('ParamEyeBallY', -ny, 0.2);
    } catch (e) { /* parameters may not exist */ }
  }

  /** @private Attempt to load Cubism Core from CDN. */
  async _loadCubismCore() {
    return new Promise((resolve, reject) => {
      if (window.Live2DCubismCore) return resolve();

      const script = document.createElement('script');
      script.src = 'https://cubism.live2d.com/sdk-web/cubismcore/live2dcubismcore.min.js';
      script.onload = () => {
        console.log('Cubism Core loaded from CDN');
        resolve();
      };
      script.onerror = () => {
        console.warn('Could not load Cubism Core from CDN. Live2D models will not work.');
        console.warn('Place live2dcubismcore.min.js in src/renderer/lib/ or load a VRM model instead.');
        resolve(); // Don't reject — we'll fall back to default avatar
      };
      document.head.appendChild(script);
    });
  }
}
