/**
 * AudioPlayer — Plays streamed PCM audio chunks with gapless scheduling.
 * Exposes an AnalyserNode for lip sync integration.
 */
export class AudioPlayer {
  /**
   * @param {number} [sampleRate=24000] - Sample rate of incoming audio
   */
  constructor(sampleRate = 24000) {
    this.sampleRate = sampleRate;
    this.audioContext = new AudioContext({ sampleRate });

    // Gain node for volume control
    this.gainNode = this.audioContext.createGain();

    // Analyser for lip sync
    this.analyser = this.audioContext.createAnalyser();
    this.analyser.fftSize = 2048;
    this.analyser.smoothingTimeConstant = 0.6;

    // Chain: source → analyser → gain → destination
    this.analyser.connect(this.gainNode);
    this.gainNode.connect(this.audioContext.destination);

    /** @type {number} Next scheduled playback time */
    this.nextStartTime = 0;

    /** @type {AudioBufferSourceNode[]} Active sources for cleanup on barge-in */
    this._activeSources = [];
  }

  /**
   * Returns the AnalyserNode for lip sync to tap into.
   * @returns {AnalyserNode}
   */
  getAnalyser() {
    return this.analyser;
  }

  /**
   * Queues a PCM chunk for gapless playback.
   * @param {Int16Array|ArrayBuffer} data - 16-bit PCM audio data
   */
  playChunk(data) {
    const int16 = data instanceof Int16Array ? data : new Int16Array(data);
    const float32 = AudioPlayer.int16ToFloat32(int16);

    const buffer = this.audioContext.createBuffer(1, float32.length, this.sampleRate);
    buffer.getChannelData(0).set(float32);

    const source = this.audioContext.createBufferSource();
    source.buffer = buffer;
    source.connect(this.analyser);

    // Gapless scheduling
    const currentTime = this.audioContext.currentTime;
    const startTime = Math.max(currentTime + 0.01, this.nextStartTime);
    source.start(startTime);
    this.nextStartTime = startTime + buffer.duration;

    // Track for cleanup
    this._activeSources.push(source);
    source.onended = () => {
      const idx = this._activeSources.indexOf(source);
      if (idx >= 0) this._activeSources.splice(idx, 1);
    };
  }

  /**
   * Clears the playback queue immediately (for barge-in / interruption).
   */
  clearQueue() {
    for (const source of this._activeSources) {
      try { source.stop(); } catch (_) { /* already stopped */ }
    }
    this._activeSources = [];
    this.nextStartTime = 0;
  }

  /**
   * Sets playback volume.
   * @param {number} level - 0 (mute) to 1 (full volume)
   */
  setVolume(level) {
    this.gainNode.gain.setValueAtTime(
      Math.max(0, Math.min(1, level)),
      this.audioContext.currentTime
    );
  }

  /** Resumes the AudioContext if suspended (needed after user gesture). */
  async resume() {
    if (this.audioContext.state === 'suspended') {
      await this.audioContext.resume();
    }
  }

  /** Clean up. */
  destroy() {
    this.clearQueue();
    this.audioContext.close();
  }

  /**
   * Converts Int16 PCM to Float32 for Web Audio API.
   * @param {Int16Array} int16
   * @returns {Float32Array}
   */
  static int16ToFloat32(int16) {
    const float32 = new Float32Array(int16.length);
    for (let i = 0; i < int16.length; i++) {
      float32[i] = int16[i] / (int16[i] < 0 ? 0x8000 : 0x7FFF);
    }
    return float32;
  }
}
