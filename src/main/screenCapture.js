const { desktopCapturer, app } = require('electron');
const fs = require('fs');
const path = require('path');

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
    this.screenshotsDir = path.join(app.getPath('userData'), 'logs', 'screenshots');
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
   * Decreased resolution to 854x480 for optimization.
   * Disables fetchWindowIcons to prevent memory overhead and blocking.
   * @param {number} [width=854] - Thumbnail width
   * @param {number} [height=480] - Thumbnail height
   * @returns {Promise<string|null>} Base64 JPEG data or null
   */
  async captureNow(width = 854, height = 480) {
    try {
      const sources = await desktopCapturer.getSources({
        types: ['screen'],
        thumbnailSize: { width, height },
        fetchWindowIcons: false,
      });

      if (sources.length === 0) return null;

      const screenshot = sources[0].thumbnail;
      // Reduced JPEG quality to 40 for bandwidth optimization
      const jpegBuffer = screenshot.toJPEG(40);
      
      // Save directly to disk to prevent IPC echo chamber
      this._saveToDisk(jpegBuffer);

      return jpegBuffer.toString('base64');
    } catch (err) {
      console.error('Screen capture failed:', err);
      return null;
    }
  }

  /**
   * @private Fire and forget async write for screenshots
   */
  _saveToDisk(buffer) {
    try {
      if (!fs.existsSync(this.screenshotsDir)) {
        fs.mkdirSync(this.screenshotsDir, { recursive: true });
      }
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filePath = path.join(this.screenshotsDir, `screenshot_${timestamp}.jpg`);
      
      fs.promises.writeFile(filePath, buffer).catch(err => {
        console.error('Failed to write screenshot log:', err);
      });
    } catch (e) {
      console.error('Failed to prepare screenshot directory:', e);
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