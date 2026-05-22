/**
 * MicCapture — Captures microphone audio as 16kHz mono Int16 PCM.
 */
export class MicCapture {
  constructor() {
    /** @type {AudioContext|null} */
    this.audioContext = null;
    /** @type {MediaStream|null} */
    this.stream = null;
    /** @type {AudioWorkletNode|null} */
    this.workletNode = null;
    /** @type {function|null} */
    this._onAudioData = null;
    this._muted = false;
  }

  /**
   * Starts capturing from the microphone.
   * @param {string} [deviceId] - Specific audio input device ID
   */
  async start(deviceId) {
    const constraints = {
      audio: {
        sampleRate: 16000,
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
      },
    };

    this.stream = await navigator.mediaDevices.getUserMedia(constraints);
    this.audioContext = new AudioContext({ sampleRate: 16000 });

    // Load AudioWorklet processor
    // pcm-processor.js is copied to dist/renderer/ during build
    const processorUrl = '../../dist/renderer/pcm-processor.js';
    await this.audioContext.audioWorklet.addModule(processorUrl);

    const source = this.audioContext.createMediaStreamSource(this.stream);
    this.workletNode = new AudioWorkletNode(this.audioContext, 'pcm-processor');

    source.connect(this.workletNode);
    // Don't connect to destination — avoids echo

    this.workletNode.port.onmessage = (event) => {
      if (!this._muted && this._onAudioData) {
        this._onAudioData(new Int16Array(event.data));
      }
    };
  }

  /**
   * Registers a callback for PCM audio data.
   * @param {function(Int16Array): void} callback
   */
  onAudioData(callback) {
    this._onAudioData = callback;
  }

  /** Stops capture and releases resources. */
  async stop() {
    if (this.workletNode) {
      this.workletNode.disconnect();
      this.workletNode = null;
    }
    if (this.stream) {
      this.stream.getTracks().forEach((t) => t.stop());
      this.stream = null;
    }
    if (this.audioContext) {
      await this.audioContext.close();
      this.audioContext = null;
    }
  }

  /** Mutes the microphone (stops sending data). */
  mute() {
    this._muted = true;
    if (this.stream) {
      this.stream.getAudioTracks().forEach((t) => (t.enabled = false));
    }
  }

  /** Unmutes the microphone. */
  unmute() {
    this._muted = false;
    if (this.stream) {
      this.stream.getAudioTracks().forEach((t) => (t.enabled = true));
    }
  }

  /** @returns {boolean} */
  isMuted() {
    return this._muted;
  }

  /**
   * Lists available audio input devices.
   * @returns {Promise<MediaDeviceInfo[]>}
   */
  static async getDevices() {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices.filter((d) => d.kind === 'audioinput');
  }
}