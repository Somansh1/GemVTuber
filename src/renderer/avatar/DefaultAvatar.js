/**
 * DefaultAvatar — A cute, animated canvas-based fallback avatar.
 * Works WITHOUT any Live2D model or SDK. Renders a charming character
 * using Canvas2D with expressions, lip sync, and eye tracking.
 */
export class DefaultAvatar {
  /**
   * @param {HTMLCanvasElement} canvas
   */
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.animationId = null;

    // State
    this.emotion = 'neutral';
    this.mouthOpen = 0;
    this.eyeTargetX = 0;
    this.eyeTargetY = 0;
    this._eyeX = 0;
    this._eyeY = 0;

    // Animation state
    this._breathPhase = 0;
    this._blinkTimer = 0;
    this._blinkDuration = 0;
    this._isBlinking = false;
    this._lastTime = 0;

    // Colors
    this.colors = {
      face: '#ffeaa7',
      faceGradient: '#fdcb6e',
      cheeks: 'rgba(255, 107, 157, 0.35)',
      eyeWhite: '#ffffff',
      pupil: '#2d3436',
      pupilHighlight: '#ffffff',
      mouthLine: '#636e72',
      mouthOpen: '#e17055',
    };

    // Sizing
    this.cx = 0;
    this.cy = 0;
    this.radius = 0;
    this.resize(canvas.width, canvas.height);
  }

  /**
   * Sets the avatar's emotion.
   * @param {'happy'|'sad'|'surprised'|'thinking'|'excited'|'neutral'|'angry'|'confused'} emotion
   */
  setEmotion(emotion) {
    this.emotion = emotion;
  }

  /**
   * Sets mouth opening for lip sync.
   * @param {number} value - 0 (closed) to 1 (fully open)
   */
  setMouthOpen(value) {
    this.mouthOpen = Math.max(0, Math.min(1, value));
  }

  /**
   * Sets the eye target point (pupils look towards this).
   * @param {number} x - Normalized -1 to 1
   * @param {number} y - Normalized -1 to 1
   */
  setEyeTarget(x, y) {
    this.eyeTargetX = x;
    this.eyeTargetY = y;
  }

  /**
   * Mimics Live2D setParameter for compatibility.
   * @param {string} id - Parameter ID
   * @param {number} value - Value
   */
  setParameter(id, value) {
    if (id === 'ParamMouthOpenY') this.setMouthOpen(value);
    else if (id === 'ParamMouthForm') { /* could be used for smile vs O */ }
    else if (id === 'ParamEyeBallX') this.eyeTargetX = value;
    else if (id === 'ParamEyeBallY') this.eyeTargetY = value;
  }

  /** Starts the render loop. */
  startAnimation() {
    this._lastTime = performance.now();
    this._tick = this._tick.bind(this);
    this._tick(performance.now());
  }

  /** Stops the render loop. */
  stopAnimation() {
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
  }

  /**
   * Adjusts to canvas size.
   * @param {number} width
   * @param {number} height
   */
  resize(width, height) {
    this.canvas.width = width;
    this.canvas.height = height;
    this.cx = width / 2;
    this.cy = height / 2;
    this.radius = Math.min(width, height) * 0.25;
  }

  /**
   * Returns a model profile compatible with Live2D's discoverCapabilities().
   * @returns {object}
   */
  getCapabilities() {
    return {
      parameters: [
        { id: 'ParamMouthOpenY', min: 0, max: 1, default: 0 },
        { id: 'ParamMouthForm', min: -1, max: 1, default: 0 },
        { id: 'ParamEyeBallX', min: -1, max: 1, default: 0 },
        { id: 'ParamEyeBallY', min: -1, max: 1, default: 0 },
      ],
      expressions: ['happy', 'sad', 'surprised', 'thinking', 'excited', 'neutral', 'angry', 'confused'],
      motionGroups: { idle: 1 },
      hasBody: false,
      hasMouthForm: true,
      hasBreathing: true,
      parameterIds: ['ParamMouthOpenY', 'ParamMouthForm', 'ParamEyeBallX', 'ParamEyeBallY'],
      isDefault: true,
    };
  }

  // ─── Private Rendering ──────────────────────────────────────────

  /** @private Main animation tick. */
  _tick(now) {
    const dt = (now - this._lastTime) / 1000;
    this._lastTime = now;

    this._updateAnimations(dt);
    this._draw();

    this.animationId = requestAnimationFrame(this._tick);
  }

  /** @private Update animation state. */
  _updateAnimations(dt) {
    // Breathing
    this._breathPhase += dt * 1.8;

    // Blinking
    this._blinkTimer -= dt;
    if (this._blinkTimer <= 0 && !this._isBlinking) {
      this._isBlinking = true;
      this._blinkDuration = 0.12;
    }
    if (this._isBlinking) {
      this._blinkDuration -= dt;
      if (this._blinkDuration <= 0) {
        this._isBlinking = false;
        this._blinkTimer = 2 + Math.random() * 4; // Blink every 2-6 seconds
      }
    }

    // Smooth eye movement
    this._eyeX += (this.eyeTargetX - this._eyeX) * 0.12;
    this._eyeY += (this.eyeTargetY - this._eyeY) * 0.12;
  }

  /** @private Draw the full avatar. */
  _draw() {
    const { ctx, cx, cy, radius } = this;
    const breath = Math.sin(this._breathPhase) * 0.015;

    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.save();

    // Apply breathing scale
    ctx.translate(cx, cy);
    ctx.scale(1, 1 + breath);
    ctx.translate(-cx, -cy);

    this._drawFace();
    this._drawEyes();
    this._drawMouth();
    this._drawCheeks();

    // Emotion-specific decorations
    if (this.emotion === 'excited' || this.emotion === 'happy') {
      this._drawSparkles();
    }
    if (this.emotion === 'thinking') {
      this._drawThinkingDots();
    }
    if (this.emotion === 'angry') {
      this._drawAngerMark();
    }

    ctx.restore();
  }

  /** @private */
  _drawFace() {
    const { ctx, cx, cy, radius } = this;
    const grad = ctx.createRadialGradient(cx - radius * 0.2, cy - radius * 0.3, 0, cx, cy, radius);
    grad.addColorStop(0, '#fff5d4');
    grad.addColorStop(0.7, this.colors.face);
    grad.addColorStop(1, this.colors.faceGradient);

    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fillStyle = grad;
    ctx.fill();

    // Subtle outline
    ctx.strokeStyle = 'rgba(0,0,0,0.08)';
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  /** @private */
  _drawEyes() {
    const { ctx, cx, cy, radius, _eyeX, _eyeY, _isBlinking, emotion } = this;
    const eyeSpacing = radius * 0.35;
    const eyeY = cy - radius * 0.12;
    const eyeRadius = radius * 0.16;

    const eyeOpenness = _isBlinking ? 0.05 : (emotion === 'surprised' ? 1.3 : 1);
    const eyeDroop = emotion === 'sad' ? 0.65 : 1;

    for (const side of [-1, 1]) {
      const ex = cx + eyeSpacing * side;

      // Eye white
      ctx.beginPath();
      ctx.ellipse(ex, eyeY, eyeRadius, eyeRadius * eyeOpenness * eyeDroop, 0, 0, Math.PI * 2);
      ctx.fillStyle = this.colors.eyeWhite;
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.12)';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      if (!_isBlinking) {
        // Pupil
        const pupilRadius = eyeRadius * 0.55;
        const pupilOffsetX = _eyeX * eyeRadius * 0.3;
        const pupilOffsetY = _eyeY * eyeRadius * 0.25;
        ctx.beginPath();
        ctx.arc(ex + pupilOffsetX, eyeY + pupilOffsetY, pupilRadius, 0, Math.PI * 2);
        ctx.fillStyle = this.colors.pupil;
        ctx.fill();

        // Highlight
        ctx.beginPath();
        ctx.arc(ex + pupilOffsetX + pupilRadius * 0.3, eyeY + pupilOffsetY - pupilRadius * 0.3,
          pupilRadius * 0.3, 0, Math.PI * 2);
        ctx.fillStyle = this.colors.pupilHighlight;
        ctx.fill();
      }

      // Eyebrow
      if (emotion === 'angry') {
        ctx.beginPath();
        ctx.moveTo(ex - eyeRadius, eyeY - eyeRadius * 1.5 + (side > 0 ? 4 : -4));
        ctx.lineTo(ex + eyeRadius, eyeY - eyeRadius * 1.5 - (side > 0 ? 4 : -4));
        ctx.strokeStyle = '#636e72';
        ctx.lineWidth = 3;
        ctx.stroke();
      }
    }
  }

  /** @private */
  _drawMouth() {
    const { ctx, cx, cy, radius, mouthOpen, emotion } = this;
    const mouthY = cy + radius * 0.3;
    const mouthWidth = radius * 0.3;

    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    if (mouthOpen > 0.08) {
      // Open mouth (talking)
      const openHeight = mouthOpen * radius * 0.22;
      ctx.beginPath();
      ctx.ellipse(cx, mouthY, mouthWidth * (0.5 + mouthOpen * 0.5), openHeight, 0, 0, Math.PI * 2);
      ctx.fillStyle = this.colors.mouthOpen;
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.15)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    } else if (emotion === 'happy' || emotion === 'excited') {
      // Happy curve
      ctx.beginPath();
      ctx.moveTo(cx - mouthWidth, mouthY);
      ctx.quadraticCurveTo(cx, mouthY + radius * 0.18, cx + mouthWidth, mouthY);
      ctx.strokeStyle = this.colors.mouthLine;
      ctx.lineWidth = 2.5;
      ctx.stroke();
    } else if (emotion === 'sad') {
      // Sad frown
      ctx.beginPath();
      ctx.moveTo(cx - mouthWidth * 0.8, mouthY + radius * 0.08);
      ctx.quadraticCurveTo(cx, mouthY - radius * 0.1, cx + mouthWidth * 0.8, mouthY + radius * 0.08);
      ctx.strokeStyle = this.colors.mouthLine;
      ctx.lineWidth = 2.5;
      ctx.stroke();
    } else if (emotion === 'surprised') {
      // O-shaped
      ctx.beginPath();
      ctx.ellipse(cx, mouthY, mouthWidth * 0.35, radius * 0.12, 0, 0, Math.PI * 2);
      ctx.fillStyle = this.colors.mouthOpen;
      ctx.fill();
    } else {
      // Neutral line with slight curve
      ctx.beginPath();
      ctx.moveTo(cx - mouthWidth * 0.6, mouthY);
      ctx.quadraticCurveTo(cx, mouthY + radius * 0.04, cx + mouthWidth * 0.6, mouthY);
      ctx.strokeStyle = this.colors.mouthLine;
      ctx.lineWidth = 2.5;
      ctx.stroke();
    }
  }

  /** @private */
  _drawCheeks() {
    const { ctx, cx, cy, radius } = this;
    const cheekY = cy + radius * 0.12;
    const cheekSpacing = radius * 0.55;
    const cheekRadius = radius * 0.13;

    for (const side of [-1, 1]) {
      const grad = ctx.createRadialGradient(
        cx + cheekSpacing * side, cheekY, 0,
        cx + cheekSpacing * side, cheekY, cheekRadius
      );
      grad.addColorStop(0, this.colors.cheeks);
      grad.addColorStop(1, 'transparent');
      ctx.beginPath();
      ctx.arc(cx + cheekSpacing * side, cheekY, cheekRadius, 0, Math.PI * 2);
      ctx.fillStyle = grad;
      ctx.fill();
    }
  }

  /** @private */
  _drawSparkles() {
    const { ctx, cx, cy, radius } = this;
    const sparklePositions = [
      { x: cx - radius * 1.1, y: cy - radius * 0.8 },
      { x: cx + radius * 1.1, y: cy - radius * 0.6 },
      { x: cx + radius * 0.8, y: cy - radius * 1.1 },
    ];
    const phase = performance.now() / 600;
    for (let i = 0; i < sparklePositions.length; i++) {
      const s = sparklePositions[i];
      const alpha = (Math.sin(phase + i * 2.1) + 1) / 2;
      const size = 3 + alpha * 3;
      ctx.save();
      ctx.globalAlpha = alpha * 0.8;
      ctx.fillStyle = '#ffd700';
      this._drawStar(ctx, s.x, s.y, size);
      ctx.restore();
    }
  }

  /** @private */
  _drawStar(ctx, x, y, size) {
    ctx.beginPath();
    for (let i = 0; i < 4; i++) {
      const angle = (i / 4) * Math.PI * 2 - Math.PI / 4;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      ctx.moveTo(x, y);
      ctx.lineTo(x + cos * size, y + sin * size);
    }
    ctx.strokeStyle = '#ffd700';
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  /** @private */
  _drawThinkingDots() {
    const { ctx, cx, cy, radius } = this;
    const dotY = cy - radius * 1.3;
    const phase = performance.now() / 400;
    for (let i = 0; i < 3; i++) {
      const alpha = (Math.sin(phase - i * 0.8) + 1) / 2;
      ctx.beginPath();
      ctx.arc(cx + (i - 1) * 12, dotY - i * 4, 3 + alpha * 2, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(124, 92, 252, ${0.3 + alpha * 0.5})`;
      ctx.fill();
    }
  }

  /** @private */
  _drawAngerMark() {
    const { ctx, cx, cy, radius } = this;
    const markX = cx + radius * 0.7;
    const markY = cy - radius * 0.8;
    ctx.strokeStyle = '#d63031';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(markX - 5, markY - 5);
    ctx.lineTo(markX + 5, markY + 5);
    ctx.moveTo(markX + 5, markY - 5);
    ctx.lineTo(markX - 5, markY + 5);
    ctx.stroke();
  }
}
