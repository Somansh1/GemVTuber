const { desktopCapturer } = require('electron');

/**
 * Periodic screen capture service.
 * Captures the screen at random intervals and sends frames to the renderer.
 */
class ScreenCaptureService {
  /**
   * @param {Electron.BrowserWindow} win - The main window
   */
  constructor(win) {
    this.win = win;
    this.timer = null;
    this.running = false;
    this.baseIntervalMinutes = 7;
  }

  /**
   * Starts periodic screen capture.
   * @param {number} intervalMinutes - Base interval in minutes (actual varies ±30%)
   */
  start(intervalMinutes = 7) {
    this.baseIntervalMinutes = intervalMinutes;
    this.running = true;
    this._scheduleNext();
  }

  /** Stops periodic capture. */
  stop() {
    this.running = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  /**
   * Captures the screen immediately.
   * @param {number} [width=1280] - Thumbnail width
   * @param {number} [height=720] - Thumbnail height
   * @returns {Promise<string|null>} Base64 JPEG data or null
   */
  async captureNow(width = 1280, height = 720) {
    try {
      const sources = await desktopCapturer.getSources({
        types: ['screen'],
        thumbnailSize: { width, height },
      });

      if (sources.length === 0) return null;

      const screenshot = sources[0].thumbnail;
      const jpegBuffer = screenshot.toJPEG(65);
      return jpegBuffer.toString('base64');
    } catch (err) {
      console.error('Screen capture failed:', err);
      return null;
    }
  }

  /** @private Schedules the next capture with randomized interval. */
  _scheduleNext() {
    if (!this.running) return;

    // Randomize interval: base ± 30%
    const baseMs = this.baseIntervalMinutes * 60 * 1000;
    const variance = baseMs * 0.3;
    const delayMs = baseMs + (Math.random() * variance * 2 - variance);

    this.timer = setTimeout(async () => {
      if (!this.running) return;

      const base64 = await this.captureNow();
      if (base64 && this.win && !this.win.isDestroyed()) {
        this.win.webContents.send('screen-captured', base64);
      }

      this._scheduleNext();
    }, delayMs);
  }
}

module.exports = { ScreenCaptureService };
