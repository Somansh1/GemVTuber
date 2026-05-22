/**
 * ProceduralAnimator — Keyframe animation engine for Live2D parameters.
 * Enables Gemini to compose custom animations on-the-fly,
 * and supports user-defined custom actions from a JSON file.
 */
export class ProceduralAnimator {
  /**
   * @param {import('./AvatarManager').AvatarManager} avatarManager
   */
  constructor(avatarManager) {
    this.avatarManager = avatarManager;
    /** @type {Map<string, object>} */
    this.customActions = new Map();
    /** @type {Set<number>} Active animation frame IDs */
    this._activeAnimations = new Set();
  }

  /**
   * Plays a keyframe animation.
   * @param {object} animation - Animation definition
   * @param {number} animation.duration_ms - Total duration in ms
   * @param {string} [animation.easing='linear'] - Easing function name
   * @param {number} [animation.repeat=1] - Number of times to repeat
   * @param {Array<{t: number, params: object}>} animation.keyframes - Keyframes (t: 0-1)
   * @returns {Promise<void>} Resolves when animation completes
   */
  async playAnimation(animation) {
    const { duration_ms = 500, easing = 'linear', repeat = 1, keyframes } = animation;
    if (!keyframes || keyframes.length < 2) return;

    // Sort keyframes by time
    const sorted = [...keyframes].sort((a, b) => a.t - b.t);
    const easingFn = this._getEasingFunction(easing);

    for (let rep = 0; rep < repeat; rep++) {
      await this._runKeyframes(sorted, duration_ms, easingFn);
    }
  }

  /**
   * Plays a named custom action from the loaded custom actions.
   * @param {string} name - Action name
   * @returns {Promise<void>}
   */
  async playCustomAction(name) {
    const action = this.customActions.get(name);
    if (!action) {
      console.warn(`Custom action "${name}" not found`);
      return;
    }
    await this.playAnimation(action);
  }

  /**
   * Loads custom action definitions from a JSON file path.
   * @param {string} jsonText - JSON string of custom actions
   */
  loadCustomActions(jsonText) {
    try {
      const actions = JSON.parse(jsonText);
      for (const [name, definition] of Object.entries(actions)) {
        this.customActions.set(name, definition);
      }
    } catch (err) {
      console.error('Failed to parse custom actions:', err);
    }
  }

  /**
   * Returns the list of available custom action names.
   * @returns {string[]}
   */
  getCustomActionNames() {
    return Array.from(this.customActions.keys());
  }

  /** Stops all currently playing animations. */
  stopAll() {
    for (const id of this._activeAnimations) {
      cancelAnimationFrame(id);
    }
    this._activeAnimations.clear();
  }

  // ─── Private Helpers ──────────────────────────────────────────────

  /**
   * @private Runs a set of sorted keyframes over a duration.
   * @param {Array} keyframes
   * @param {number} durationMs
   * @param {function} easingFn
   * @returns {Promise<void>}
   */
  _runKeyframes(keyframes, durationMs, easingFn) {
    return new Promise((resolve) => {
      const startTime = performance.now();

      const tick = (now) => {
        const elapsed = now - startTime;
        const progress = Math.min(elapsed / durationMs, 1.0);
        const easedProgress = easingFn(progress);

        // Find the two keyframes to interpolate between
        let kfBefore = keyframes[0];
        let kfAfter = keyframes[keyframes.length - 1];

        for (let i = 0; i < keyframes.length - 1; i++) {
          if (easedProgress >= keyframes[i].t && easedProgress <= keyframes[i + 1].t) {
            kfBefore = keyframes[i];
            kfAfter = keyframes[i + 1];
            break;
          }
        }

        // Calculate local interpolation factor between the two keyframes
        const range = kfAfter.t - kfBefore.t;
        const localT = range > 0 ? (easedProgress - kfBefore.t) / range : 1;

        // Interpolate each parameter
        const allParams = new Set([
          ...Object.keys(kfBefore.params || {}),
          ...Object.keys(kfAfter.params || {}),
        ]);

        for (const paramId of allParams) {
          const fromVal = kfBefore.params?.[paramId] ?? 0;
          const toVal = kfAfter.params?.[paramId] ?? fromVal;
          const interpolated = fromVal + (toVal - fromVal) * localT;
          this.avatarManager.setParameter(paramId, interpolated);
        }

        if (progress < 1.0) {
          const id = requestAnimationFrame(tick);
          this._activeAnimations.add(id);
        } else {
          resolve();
        }
      };

      const id = requestAnimationFrame(tick);
      this._activeAnimations.add(id);
    });
  }

  /**
   * @private Returns an easing function by name.
   * @param {string} name
   * @returns {function}
   */
  _getEasingFunction(name) {
    const easings = {
      'linear': (t) => t,
      'ease-in': (t) => t * t,
      'ease-out': (t) => t * (2 - t),
      'ease-in-out': (t) => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t,
      'ease-out-bounce': (t) => {
        if (t < 1 / 2.75) return 7.5625 * t * t;
        if (t < 2 / 2.75) { t -= 1.5 / 2.75; return 7.5625 * t * t + 0.75; }
        if (t < 2.5 / 2.75) { t -= 2.25 / 2.75; return 7.5625 * t * t + 0.9375; }
        t -= 2.625 / 2.75;
        return 7.5625 * t * t + 0.984375;
      },
    };
    return easings[name] || easings['linear'];
  }
}
