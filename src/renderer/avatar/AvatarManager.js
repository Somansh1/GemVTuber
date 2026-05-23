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

    this.app.ticker.maxFPS = 30;

    /** @type {import('./DefaultAvatar').DefaultAvatar|null} */
    this.defaultAvatar = null;

    /** @type {boolean} */
    this.eyeFollowEnabled = true;

    /** @type {object|null} */
    this.modelProfile = null;

    /** @type {boolean} */
    this._usingDefault = false;

    this._mouseX = window.innerWidth / 2;
    this._mouseY = window.innerHeight / 2;

    // Track mouse for eye follow (local window fallback)
    window.addEventListener('mousemove', (e) => {
      this._mouseX = e.clientX;
      this._mouseY = e.clientY;
    });

    // Track mouse globally across the entire desktop screen
    let globalCounter = 0;
    if (window.electronAPI && window.electronAPI.onGlobalMouseMove) {
      window.electronAPI.onGlobalMouseMove((coords) => {
        globalCounter++;
        if (globalCounter % 60 === 0) {
          console.log(`[RENDERER] Global Mouse Point received: ${coords.x}, ${coords.y}`);
        }
        this._mouseX = coords.x;
        this._mouseY = coords.y;
        this._updateEyeFollow();
      });
    }

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

    this._mouseX = window.innerWidth / 2;
    this._mouseY = window.innerHeight / 2;
    }

    try {
      this.model = await Live2DModel.from(modelPath, {
        autoHitTest: true,
        autoFocus: true,
        autoUpdate: true,
      });

      // Scale to fit window
      this._fitModelToWindow();

      this.app.stage.addChild(this.model);

      // Start idle animation
      this._startIdleAnimation();

      // Discover capabilities
      this.modelProfile = this.discoverCapabilities();

      // Force our dynamic tracking (Lipsync) to apply on the official hook recommended by pixi-live2d-display
      this.model.internalModel.on('afterModelUpdate', () => {
        if (this.onLipSync) this.onLipSync();
        // Force the WebAssembly core to recalculate the mesh with our overrides before the draw call!
        if (this.model.internalModel.coreModel && this.model.internalModel.coreModel.update) {
          this.model.internalModel.coreModel.update();
        }
      });

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
    
    // Support both Cubism 4 (ParamMouthForm) and Cubism 2 (PARAM_MOUTH_FORM)
    const mouthFormId = paramIds.find(id => id === 'ParamMouthForm' || id === 'PARAM_MOUTH_FORM');
    const mouthOpenYId = paramIds.find(id => id === 'ParamMouthOpenY' || id === 'PARAM_MOUTH_OPEN_Y');
    
    const hasBreathing = paramIds.some(id => id === 'ParamBreath' || id === 'PARAM_BREATH');
    const hasEyeFollow = paramIds.some(id => id === 'ParamAngleX' || id === 'PARAM_ANGLE_X' || id === 'ParamEyeBallX');

    this.modelProfile = {
      parameters,
      expressions,
      motionGroups,
      hasBody,
      hasMouthForm: !!mouthFormId,
      mouthFormId,
      hasMouthOpenY: !!mouthOpenYId,
      mouthOpenYId,
      hasBreathing,
      hasEyeFollow,
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
      const core = this.model.internalModel.coreModel;
      
      // Try official Cubism 4 API first
      if (typeof core.setParameterValueById === 'function') {
        core.setParameterValueById(id, value, weight);
        return;
      }
      
      // Fallback for Cubism 2
      if (typeof core.setParamFloat === 'function') {
        core.setParamFloat(id, value, weight);
        return;
      }
      
      // Final fallback: Direct array mutation
      const idx = this.modelProfile?.parameterIds?.indexOf(id);
      if (idx >= 0 && core.parameters && core.parameters.values) {
        core.parameters.values[idx] = value;
      }
    } catch (e) {
      // Ignore missing params
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
    
    // 1. Try exact match
    try {
      this.model.expression(name);
      return;
    } catch { }

    // 2. Try fuzzy match (e.g. LLM outputs "happy" and file is "Happy.exp3")
    if (this.modelProfile?.expressions) {
      const lowerName = name.toLowerCase().trim();
      const match = this.modelProfile.expressions.find(e => 
        e.toLowerCase().includes(lowerName) || lowerName.includes(e.toLowerCase())
      );
      
      if (match) {
        try { this.model.expression(match); return; } catch { }
      }
      
      // 3. Try index match if name is literally a number or mapped
      const idx = this.modelProfile.expressions.indexOf(name);
      if (idx >= 0) {
        try { this.model.expression(idx); } catch { /* ignore */ }
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
    } catch {
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
   * Sets the global scale multiplier for the avatar.
   * @param {number} scale
   */
  setScale(scale) {
    this.scaleMultiplier = scale;
    if (this.model) {
      this._fitModelToWindow();
    }
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
    const baseScale = Math.min(scaleX, scaleY) * 0.9; // Fit within window with 10% padding
    const finalScale = baseScale * (this.scaleMultiplier || 5.0);

    this.model.scale.set(finalScale);
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

  _updateEyeFollow() {
    if (!this.eyeFollowEnabled || !this.model || !this.modelProfile?.hasEyeFollow) return;

    const w = window.innerWidth;
    const h = window.innerHeight;
    // Convert screen coordinates into the model's local coordinate space
    let localX = this._mouseX;
    let localY = this._mouseY;

    // Calculate pixel distance from the center of the avatar window
    const deltaX = this._mouseX - (w / 2);
    const deltaY = this._mouseY - (h / 2);
    if (this.app && this.app.stage) {
      // Create a point and convert it
      const globalPoint = { x: this._mouseX, y: this._mouseY };
      const localPoint = this.model.toLocal(globalPoint);
      localX = localPoint.x;
      localY = localPoint.y;
    }

    // Normalize to -1..1 range (max out when mouse is 800px away)
    const nx = Math.max(-1, Math.min(1, deltaX / 800));
    const ny = Math.max(-1, Math.min(1, deltaY / 800));

    // Native focus controller handles smooth interpolation and idle blending
    // Native focus controller handles smooth interpolation, local transformation, and idle blending
    try {
      if (this.model.focus) {
        this.model.focus(nx, -ny);
        this.model.focus(localX, localY);
      } else if (this.model.internalModel?.focusController) {
        this.model.internalModel.focusController.focus(nx, -ny);
        this.model.internalModel.focusController.focus(localX, localY);
      }
    } catch { /* ignore */ }
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
