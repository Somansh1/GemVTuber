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
      window.electronAPI.onScreenCapture((base64Jpeg) => {
        this.onCapture(base64Jpeg);
      });
    }
  }

  /**
   * Handles a captured screen frame.
   * @param {string} base64Jpeg - Base64-encoded JPEG
   */
  onCapture(base64Jpeg) {
    const timestamp = Date.now();

    // Log the screenshot to disk for monitoring
    if (window.electronAPI) {
      window.electronAPI.saveScreenshotLog(base64Jpeg);
    }

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

    const base64 = await window.electronAPI.captureScreen(854, 480);
    if (base64) {
      this.onCapture(base64);
    }
    return base64;
  }

  /** Stops listening for captures. */
  stop() {
    this._listening = false;
  }
}