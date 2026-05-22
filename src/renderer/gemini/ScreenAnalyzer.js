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

    // Send to Gemini with a contextual prompt
    if (this.session.isConnected()) {
      // First send the image
      this.session.sendImage(base64Jpeg);

      // Then send a text prompt asking Gemini to process it naturally
      this.session.sendText(
        '[System: A periodic screenshot was just taken. Observe what the user is doing. ' +
        'If anything interesting, funny, or concerning is happening, mention it naturally in your next response. ' +
        'If the user seems to be doing the same thing for a long time, you may comment on it. ' +
        'Do NOT describe the screenshot literally — just absorb the context and react naturally if relevant. ' +
        'If nothing noteworthy, just continue as normal.]'
      );
    }
  }

  /**
   * Triggers an on-demand screen capture via electronAPI.
   * @returns {Promise<string|null>} Base64 JPEG or null
   */
  async requestCapture() {
    if (!window.electronAPI) return null;

    const base64 = await window.electronAPI.captureScreen(1280, 720);
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
