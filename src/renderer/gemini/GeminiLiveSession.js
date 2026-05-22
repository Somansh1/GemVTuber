/**
 * GeminiLiveSession — Direct WebSocket client for Gemini Multimodal Live API.
 * No SDK dependency — just raw WebSocket for maximum control and minimal bundle size.
 */
export class GeminiLiveSession {
  /**
   * @param {string} apiKey - Google AI API key
   */
  constructor(apiKey) {
    this.apiKey = apiKey;
    /** @type {WebSocket|null} */
    this.ws = null;
    this._connected = false;
    this._setupComplete = false;

    // Callbacks
    this._onAudioResponse = null;
    this._onToolCall = null;
    this._onInterrupted = null;
    this._onError = null;
    this._onClose = null;
    this._onTextResponse = null;

    // Reconnection
    this._retryCount = 0;
    this._maxRetries = 3;
    this._config = null;
  }

  /**
   * Opens a Gemini Live session.
   * @param {object} config
   * @param {string} config.systemInstruction - System prompt
   * @param {Array} config.tools - Function declarations
   * @param {string} [config.model] - Model name
   * @param {string} [config.voiceName] - Voice name (Aoede, Charon, Fenrir, Kore, Puck)
   * @returns {Promise<void>} Resolves when setup is complete
   */
  async connect(config) {
    this._config = config;
    const model = config.model || 'models/gemini-2.5-flash-native-audio-preview-12-2025';

    const wsUrl = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${this.apiKey}`;

    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(wsUrl);

        this.ws.onopen = () => {
          this._connected = true;

          // Send setup message
          const configMsg = {
            setup: {
              model,
              generationConfig: {
                responseModalities: ['AUDIO'],
                speechConfig: {
                  voiceConfig: {
                    prebuiltVoiceConfig: {
                      voiceName: config.voiceName || 'Aoede',
                    },
                  },
                },
              },
              systemInstruction: {
                parts: [{ text: config.systemInstruction || '' }],
              },
              tools: config.tools?.length > 0
                ? [{ functionDeclarations: config.tools }]
                : undefined,
            },
          };

          console.log(`[GeminiLive] Connecting with model: ${model}`);
          this.ws.send(JSON.stringify(configMsg));
        };

        this.ws.onmessage = async (event) => {
          try {
            let data = event.data;
            if (data instanceof Blob) {
              data = await data.text();
            }
            const msg = JSON.parse(data);
            this._handleMessage(msg, resolve);
          } catch (err) {
            console.error('Failed to parse Gemini message:', err);
          }
        };

        this.ws.onerror = (event) => {
          console.error('WebSocket error:', event);
          if (this._onError) this._onError(event);
          if (!this._setupComplete) reject(new Error('WebSocket connection failed'));
        };

        this.ws.onclose = (event) => {
          this._connected = false;
          this._setupComplete = false;
          if (this._onClose) this._onClose(event);

          // Auto-reconnect if unexpected close
          if (event.code !== 1000 && this._retryCount < this._maxRetries) {
            this._retryCount++;
            const delay = Math.pow(2, this._retryCount) * 1000;
            console.log(`Reconnecting in ${delay}ms (attempt ${this._retryCount})...`);
            setTimeout(() => this.connect(this._config).catch(() => {}), delay);
          }
        };
      } catch (err) {
        reject(err);
      }
    });
  }

  /**
   * Sends microphone audio to the session.
   * @param {Int16Array} pcmChunk - 16kHz 16-bit PCM audio
   */
  sendAudio(pcmChunk) {
    if (!this._connected || !this.ws) return;

    // Convert Int16Array to base64
    const base64 = this._int16ToBase64(pcmChunk);

    const msg = {
      realtimeInput: {
        mediaChunks: [{
          mimeType: 'audio/pcm;rate=16000',
          data: base64,
        }],
      },
    };

    this.ws.send(JSON.stringify(msg));
  }

  /**
   * Sends a screen capture image to the session.
   * @param {string} base64Jpeg - Base64-encoded JPEG image
   */
  sendImage(base64Jpeg) {
    if (!this._connected || !this.ws) return;

    const msg = {
      realtimeInput: {
        mediaChunks: [{
          mimeType: 'image/jpeg',
          data: base64Jpeg,
        }],
      },
    };

    this.ws.send(JSON.stringify(msg));
  }

  /**
   * Sends a text message.
   * @param {string} text
   */
  sendText(text) {
    if (!this._connected || !this.ws) return;

    const msg = {
      clientContent: {
        turns: [{
          role: 'user',
          parts: [{ text }],
        }],
        turnComplete: true,
      },
    };

    this.ws.send(JSON.stringify(msg));
  }

  /**
   * Sends a function response back to Gemini after executing a tool call.
   * @param {string} callId - The function call ID
   * @param {object} result - The result to send back
   */
  sendToolResponse(callId, result) {
    if (!this._connected || !this.ws) return;

    const msg = {
      toolResponse: {
        functionResponses: [{
          id: callId,
          response: { output: result },
        }],
      },
    };

    this.ws.send(JSON.stringify(msg));
  }

  // ─── Callback Registration ────────────────────────────────────────

  /** @param {function(string): void} callback - Receives base64 PCM audio chunks (24kHz) */
  onAudioResponse(callback) { this._onAudioResponse = callback; }

  /** @param {function({name: string, args: object, callId: string}): void} callback */
  onToolCall(callback) { this._onToolCall = callback; }

  /** @param {function(): void} callback - Called on barge-in/interruption */
  onInterrupted(callback) { this._onInterrupted = callback; }

  /** @param {function(Event): void} callback */
  onError(callback) { this._onError = callback; }

  /** @param {function(CloseEvent): void} callback */
  onClose(callback) { this._onClose = callback; }

  /** @param {function(string): void} callback - Receives text content */
  onTextResponse(callback) { this._onTextResponse = callback; }

  // ─── Control ──────────────────────────────────────────────────────

  /** Disconnects the WebSocket cleanly. */
  disconnect() {
    this._maxRetries = 0; // Prevent auto-reconnect
    if (this.ws) {
      this.ws.close(1000, 'User disconnect');
      this.ws = null;
    }
    this._connected = false;
    this._setupComplete = false;
  }

  /** @returns {boolean} */
  isConnected() {
    return this._connected && this._setupComplete;
  }

  // ─── Private ──────────────────────────────────────────────────────

  /**
   * @private Handles incoming WebSocket messages.
   * @param {object} msg - Parsed JSON message
   * @param {function} onSetupComplete - Resolve callback for connect()
   */
  _handleMessage(msg, onSetupComplete) {
    // Setup complete
    if (msg.setupComplete) {
      this._setupComplete = true;
      this._retryCount = 0; // Reset retries only after successful setup
      console.log('Gemini Live session established');
      if (onSetupComplete) onSetupComplete();
      return;
    }

    // Server content (audio, text, interruptions)
    if (msg.serverContent) {
      const content = msg.serverContent;

      // Interruption
      if (content.interrupted) {
        if (this._onInterrupted) this._onInterrupted();
        return;
      }

      // Model turn
      if (content.modelTurn?.parts) {
        for (const part of content.modelTurn.parts) {
          // Audio response
          if (part.inlineData?.mimeType?.startsWith('audio/')) {
            if (this._onAudioResponse) {
              this._onAudioResponse(part.inlineData.data);
            }
          }
          // Text response
          if (part.text) {
            if (window.electronAPI) window.electronAPI.saveChatLog('gemini', part.text);
            if (this._onTextResponse) {
              this._onTextResponse(part.text, 'gemini');
            }
          }
        }
      }

      // Transcriptions (User Voice)
      // The API may send user voice transcriptions here
      if (content.modelTurn?.parts?.some(p => p.text)) {
        // already handled above
      }

      // Actually, Live API sends transcriptions in a specific format for some models. 
      // If it's a direct text response, it's in modelTurn.parts[].text.
      // If there are explicit input/output transcriptions:
      if (content.inputTranscription) {
        if (window.electronAPI) window.electronAPI.saveChatLog('user', content.inputTranscription.text);
        if (this._onTextResponse) {
          this._onTextResponse(content.inputTranscription.text, 'user');
        }
      }
      if (content.outputTranscription) {
        // sometimes output transcription comes here instead of modelTurn
        if (window.electronAPI) window.electronAPI.saveChatLog('gemini', content.outputTranscription.text);
        if (this._onTextResponse) {
          this._onTextResponse(content.outputTranscription.text, 'gemini');
        }
      }
    }

    // Tool calls
    if (msg.toolCall?.functionCalls) {
      for (const fc of msg.toolCall.functionCalls) {
        if (this._onToolCall) {
          this._onToolCall({
            name: fc.name,
            args: fc.args || {},
            callId: fc.id,
          });
        }
      }
    }
  }

  /**
   * @private Converts Int16Array to base64 string.
   * @param {Int16Array} int16
   * @returns {string}
   */
  _int16ToBase64(int16) {
    const bytes = new Uint8Array(int16.buffer, int16.byteOffset, int16.byteLength);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }
}