/**
 * ScreenAnalyzer — Manages periodic screen captures and sends context to Gemini.
 */
export class ScreenAnalyzer {
  /**
   * @param {import('./GeminiLiveSession').GeminiLiveSession} geminiSession
   * @param {import('./PersonalityEngine').PersonalityEngine} personalityEngine
   */
  constructor(geminiSession, personalityEngine) {
    this.session = geminiSession;
    this.personality = personalityEngine;
    this._listening = false;
  }

  /**
   * Starts listening for periodic screen captures from the main process.
   */
  startPeriodicCapture() {
    if (this._listening) return;
    this._listening = true;

    if (window.electronAPI) {
      window.electronAPI.onScreenCapture(async () => {
        await this.requestCapture();
      });
    }
  }

  /**
   * Handles a captured screen frame.
   * @param {string} base64Jpeg - Base64-encoded JPEG
   */
  onCapture(base64Jpeg) {
    const timestamp = Date.now();

    // Store in personality engine for context tracking
    this.personality.addScreenCapture(base64Jpeg, timestamp);

    // Send to Gemini with a contextual prompt bundled synchronously
    if (this.session.isConnected()) {
      const prompt = '[SYSTEM: Observe the attached screenshot of the user\'s desktop. ONLY speak if there is a critical, highly significant, or concerning change in activity. Do NOT describe the screen literally. Do NOT hallucinate details. If there is nothing drastically noteworthy, you MUST output nothing and remain silent.]';
      this.session.sendImageWithPrompt(base64Jpeg, prompt);
    }
  }

  /**
   * Triggers an on-demand screen capture via electronAPI.
   * @returns {Promise<string|null>} Base64 JPEG or null
   */
  async requestCapture() {
    if (!window.electronAPI) return null;

    try {
      const sourceId = await window.electronAPI.getScreenSourceId();
      if (!sourceId) return null;

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          mandatory: {
            chromeMediaSource: 'desktop',
            chromeMediaSourceId: sourceId,
            minWidth: 854,
            maxWidth: 854,
            minHeight: 480,
            maxHeight: 480,
          }
        }
      });

      const video = document.createElement('video');
      video.srcObject = stream;
      await video.play();

      const canvas = document.createElement('canvas');
      canvas.width = 854;
      canvas.height = 480;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      // Clean up stream
      stream.getTracks().forEach(track => track.stop());
      video.srcObject = null;

      const dataUrl = canvas.toDataURL('image/jpeg', 0.4);
      const base64 = dataUrl.split(',')[1];

      // Save it to disk in main process in background
      window.electronAPI.saveScreenshotLog(base64);

      this.onCapture(base64);
      return base64;
    } catch (e) {
      console.error('Renderer screenshot capture failed:', e);
      return null;
    }
  }

  /** Stops listening for captures. */
  stop() {
    this._listening = false;
  }
}