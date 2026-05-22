/**
 * Audio-driven lip sync engine.
 * Analyzes audio output via AnalyserNode and maps volume + frequency
 * to Live2D mouth parameters for natural-looking lip sync.
 */
export class LipSync {
  /**
   * @param {AnalyserNode} analyserNode - Web Audio API AnalyserNode connected to audio output
   */
  constructor(analyserNode) {
    this.analyser = analyserNode;
    this.analyser.fftSize = 2048;
    this.analyser.smoothingTimeConstant = 0.6;

    this.timeData = new Uint8Array(this.analyser.fftSize);
    this.freqData = new Uint8Array(this.analyser.frequencyBinCount);

    this.smoothingFactor = 0.35;
    this.enabled = true;

    this._currentVolume = 0;
    this._currentMouthForm = 0;
    this._silenceFrames = 0;
  }

  /**
   * Called every frame to update mouth parameters on the model.
   * @param {object} model - Live2D model (or DefaultAvatar) with setParameter capability
   * @param {import('./AvatarManager').AvatarManager} avatarManager - Avatar manager for setParameter
   */
  update(avatarManager) {
    if (!this.enabled || !this.analyser) return;

    // ── Volume-based mouth opening ──
    this.analyser.getByteTimeDomainData(this.timeData);

    let sum = 0;
    // ⚡ Bolt Optimization: Hoisted division out of the hot loop to save 2048 float operations per frame
    // Since (val/128)^2 === (val^2)/16384, we sum the squares first and divide by 16384 outside the loop.
    for (let i = 0; i < this.timeData.length; i++) {
      const val = this.timeData[i] - 128;
      sum += val * val;
    }
    const rms = Math.sqrt((sum / 16384) / this.timeData.length);
    const targetVolume = Math.min(rms * 4.5, 1.0);

    // Smooth transition
    this._currentVolume += (targetVolume - this._currentVolume) * this.smoothingFactor;

    // Handle silence — close mouth gracefully
    if (targetVolume < 0.02) {
      this._silenceFrames++;
      if (this._silenceFrames > 10) {
        this._currentVolume *= 0.85; // Fade out
      }
    } else {
      this._silenceFrames = 0;
    }

    // Apply to model
    avatarManager.setParameter('ParamMouthOpenY', Math.max(0, this._currentVolume));

    // ── Frequency-based mouth form (vowel shape) ──
    this.analyser.getByteFrequencyData(this.freqData);

    const lowEnergy = this._avgRange(0, 8);    // ~0-350 Hz
    const midEnergy = this._avgRange(8, 24);   // ~350-1050 Hz
    const highEnergy = this._avgRange(24, 50); // ~1050-2200 Hz

    // Rough vowel estimation:
    // High low + low high → "ah" / "oh" (mouth round, form negative)
    // Low low + high high → "ee" / "ih" (mouth wide, form positive)
    const totalEnergy = lowEnergy + midEnergy + highEnergy + 0.01;
    const formTarget = ((highEnergy - lowEnergy) / totalEnergy) * 0.8;

    this._currentMouthForm += (formTarget - this._currentMouthForm) * 0.25;

    // Only apply mouth form if the model supports it and there's audio
    if (this._currentVolume > 0.05) {
      avatarManager.setParameter('ParamMouthForm', this._currentMouthForm);
    }
  }

  /**
   * Sets the smoothing factor for lip sync transitions.
   * @param {number} factor - 0 (very smooth) to 1 (instant)
   */
  setSmoothingFactor(factor) {
    this.smoothingFactor = Math.max(0.05, Math.min(1.0, factor));
  }

  /**
   * Enables or disables lip sync processing.
   * @param {boolean} enabled
   */
  setEnabled(enabled) {
    this.enabled = enabled;
    if (!enabled) {
      this._currentVolume = 0;
      this._currentMouthForm = 0;
    }
  }

  /**
   * Returns the current audio volume level (0-1).
   * @returns {number}
   */
  getVolume() {
    return this._currentVolume;
  }

  /**
   * @private Average frequency data in a range of bins.
   * @param {number} start - Start bin index
   * @param {number} end - End bin index (exclusive)
   * @returns {number} Average value (0-255)
   */
  _avgRange(start, end) {
    let sum = 0;
    const clampEnd = Math.min(end, this.freqData.length);
    for (let i = start; i < clampEnd; i++) {
      sum += this.freqData[i];
    }
    return sum / (clampEnd - start || 1);
  }
}
