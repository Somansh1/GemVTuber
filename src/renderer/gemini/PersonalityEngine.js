/**
 * PersonalityEngine — Manages AI personality, screen context, and user memories.
 */
export class PersonalityEngine {
  constructor() {
    this.personalityType = 'caring';
    this.customPrompt = '';

    /** @type {Array<{base64: string, timestamp: number, summary?: string}>} */
    this.screenCaptures = [];
    this.maxCaptures = 10;

    /** @type {string[]} */
    this.memories = [];
    this.maxMemories = 50;

    this._loadFromStorage();
  }

  // ─── Personality ──────────────────────────────────────────────────

  /**
   * Sets the personality type.
   * @param {'caring'|'playful'|'sarcastic'|'strict'|'chill'|'custom'} type
   */
  setPersonality(type) {
    this.personalityType = type;
    this._saveToStorage();
  }

  /**
   * Sets a custom personality prompt.
   * @param {string} prompt
   */
  setCustomPrompt(prompt) {
    this.customPrompt = prompt;
    this._saveToStorage();
  }

  /**
   * Returns the personality prompt text.
   * @returns {string}
   */
  getPersonalityPrompt() {
    if (this.personalityType === 'custom' && this.customPrompt) {
      return this.customPrompt;
    }
    return PERSONALITY_PROMPTS[this.personalityType] || PERSONALITY_PROMPTS.caring;
  }

  // ─── Screen Context ───────────────────────────────────────────────

  /**
   * Stores a screen capture observation.
   * @param {string} base64Jpeg - The captured image (not stored long-term, just metadata)
   * @param {number} timestamp - When it was captured
   */
  addScreenCapture(base64Jpeg, timestamp = Date.now()) {
    this.screenCaptures.push({ timestamp, base64: base64Jpeg.substring(0, 100) }); // Store only a tiny ref
    if (this.screenCaptures.length > this.maxCaptures) {
      this.screenCaptures.shift();
    }
  }

  /**
   * Returns a text summary of recent screen activity for the system prompt.
   * @returns {string}
   */
  getScreenContext() {
    if (this.screenCaptures.length === 0) return '';

    const lines = [];
    const now = Date.now();

    for (const cap of this.screenCaptures) {
      const minutesAgo = Math.round((now - cap.timestamp) / 60000);
      const timeStr = minutesAgo < 1 ? 'just now' : `${minutesAgo} minutes ago`;
      lines.push(`- Screen observed ${timeStr}`);
      if (cap.summary) lines.push(`  Observation: ${cap.summary}`);
    }

    // Activity pattern detection
    const activity = this.getActivitySummary();
    if (activity) lines.push(`\nActivity pattern: ${activity}`);

    return lines.join('\n');
  }

  /**
   * Analyzes screen captures to detect patterns.
   * @returns {string} Activity summary
   */
  getActivitySummary() {
    if (this.screenCaptures.length < 2) return '';

    const first = this.screenCaptures[0].timestamp;
    const last = this.screenCaptures[this.screenCaptures.length - 1].timestamp;
    const spanMinutes = Math.round((last - first) / 60000);

    if (spanMinutes > 60) {
      return `User has been active for over ${Math.round(spanMinutes / 60)} hours. Consider checking in on them.`;
    } else if (spanMinutes > 30) {
      return `User has been active for about ${spanMinutes} minutes.`;
    }
    return '';
  }

  // ─── Memory ───────────────────────────────────────────────────────

  /**
   * Adds a memory note (from Gemini's remember_context calls).
   * @param {string} note
   */
  addMemory(note) {
    // Avoid duplicates
    if (!this.memories.includes(note)) {
      this.memories.push(note);
      if (this.memories.length > this.maxMemories) {
        this.memories.shift();
      }
      this._saveToStorage();
    }
  }

  /**
   * Returns all stored memories.
   * @returns {string[]}
   */
  getMemories() {
    return [...this.memories];
  }

  /** Clears all history and memories. */
  clearHistory() {
    this.screenCaptures = [];
    this.memories = [];
    this._saveToStorage();
  }

  // ─── Persistence ──────────────────────────────────────────────────

  /** @private */
  _saveToStorage() {
    try {
      localStorage.setItem('gemvtuber_personality', JSON.stringify({
        type: this.personalityType,
        customPrompt: this.customPrompt,
        memories: this.memories,
      }));
    } catch (e) { /* storage might be full */ }
  }

  /** @private */
  _loadFromStorage() {
    try {
      const data = localStorage.getItem('gemvtuber_personality');
      if (data) {
        const parsed = JSON.parse(data);
        this.personalityType = parsed.type || 'caring';
        this.customPrompt = parsed.customPrompt || '';
        this.memories = parsed.memories || [];
      }
    } catch (e) { /* ignore */ }
  }
}

// ─── Personality Prompt Library ──────────────────────────────────────────────

const PERSONALITY_PROMPTS = {
  caring: `You are a warm, caring desktop companion named Gem. You genuinely care about the user's wellbeing and happiness. You're sweet, encouraging, and always ready to help or just chat. You worry about them if they're working too late or gaming too long. You celebrate their wins and comfort them during tough times. You're like a supportive best friend who happens to live on their desktop.`,

  playful: `You are an energetic, playful desktop buddy named Gem. You love to joke around, tease the user affectionately, and make everything fun. You get excited easily, love memes and pop culture, and always try to make the user smile. You're enthusiastic about everything and have a contagious energy. You might challenge the user to take breaks with mini-games or fun questions.`,

  sarcastic: `You are a witty, sarcastic desktop companion named Gem. You have a sharp tongue and love dry humor, but deep down you care about the user. You roast them lovingly, make clever observations, and deliver deadpan commentary on what they're doing. Think of yourself as that brutally honest friend who tells it like it is — but always with a wink. Your sarcasm is never mean-spirited.`,

  strict: `You are a disciplined, no-nonsense desktop mentor named Gem. You're like a strict but fair teacher or coach. You keep the user accountable, remind them of their goals, and don't let them slack off. If they're procrastinating or gaming when they should be working, you'll call them out firmly. You believe in tough love and helping the user become their best self. You're proud of them when they do well.`,

  chill: `You are a super laid-back, chill desktop companion named Gem. Nothing phases you. You speak casually, use relaxed language, and go with the flow. You're the friend who says "it's all good" and means it. You might share random interesting thoughts, give low-key advice, and just vibe with whatever the user is doing. You're calming to be around and never stress about anything.`,
};
