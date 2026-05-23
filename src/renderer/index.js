/**
 * GemVTuber — Main Entry Point
 * Wires together all modules: Avatar, Audio, Gemini, UI.
 */

import { AvatarManager } from './avatar/AvatarManager.js';
import { DefaultAvatar } from './avatar/DefaultAvatar.js';
import { LipSync } from './avatar/LipSync.js';
import { ProceduralAnimator } from './avatar/ProceduralAnimator.js';
import { MicCapture } from './audio/MicCapture.js';
import { AudioPlayer } from './audio/AudioPlayer.js';
import { GeminiLiveSession } from './gemini/GeminiLiveSession.js';
import { generateTools, generateSystemInstruction } from './gemini/ToolDefinitions.js';
import { PersonalityEngine } from './gemini/PersonalityEngine.js';
import { ScreenAnalyzer } from './gemini/ScreenAnalyzer.js';
import { SettingsPanel } from './ui/SettingsPanel.js';
import { InteractionOverlay } from './ui/InteractionOverlay.js';

// ─── Global State ───────────────────────────────────────────────────────────

let avatarManager, defaultAvatar, lipSync, proceduralAnimator;
let micCapture, audioPlayer;
let geminiSession, personalityEngine, screenAnalyzer;
let settingsPanel, overlay;

// ─── Initialization ─────────────────────────────────────────────────────────

async function init() {
  console.log('🚀 GemVTuber starting...');

  // 1. Initialize UI
  settingsPanel = new SettingsPanel();
  overlay = new InteractionOverlay();

  // 2. Initialize Avatar
  const canvas = document.getElementById('avatar-canvas');
  const fallbackCanvas = document.getElementById('fallback-canvas');
  avatarManager = new AvatarManager();
  await avatarManager.init(canvas);
  proceduralAnimator = new ProceduralAnimator(avatarManager);

  // Start with default avatar
  defaultAvatar = new DefaultAvatar(fallbackCanvas);
    if (window.electronAPI) {
      const defaultModelPath = await window.electronAPI.findDefaultModel();
      if (defaultModelPath) {
        try {
          const localUrl = 'local://' + defaultModelPath.replace(/\\/g, '/');
          await avatarManager.loadLive2DModel(localUrl);
          overlay.setStatus('idle', 'Model loaded!');
        } catch (err) {
          console.error('Failed to load default model', err, err.stack);
          avatarManager.useDefaultAvatar(defaultAvatar);
        }
      } else {
        avatarManager.useDefaultAvatar(defaultAvatar);
      }
    }

  // 3. Initialize Audio
  audioPlayer = new AudioPlayer(24000);
  micCapture = new MicCapture();

  // 4. Initialize Lip Sync (connected to audio output)
  lipSync = new LipSync(audioPlayer);

  // 5. Personality Engine
  personalityEngine = new PersonalityEngine();

  // 6. Load saved config
  await loadSavedConfig();

  // 7. Setup UI callbacks
  setupUICallbacks();

  // 8. Start lip sync loop
  startLipSyncLoop();

  // 9. Try auto-connecting if API key exists
  await tryAutoConnect();

  console.log('✅ GemVTuber ready!');
}

// ─── Config ─────────────────────────────────────────────────────────────────

async function loadSavedConfig() {
  try {
    if (!window.electronAPI) return;
    const config = await window.electronAPI.getConfig();
    if (config) {
      // Also fetch the API key and pass it in config
      const apiKey = await window.electronAPI.getApiKey();
      if (apiKey) config.apiKey = apiKey;

      settingsPanel.loadSettings(config);
      if (config.personality) personalityEngine.setPersonality(config.personality);
      if (config.customPrompt) personalityEngine.setCustomPrompt(config.customPrompt);
      if (config.volume) audioPlayer.setVolume(config.volume / 100);
      if (config.avatarScale !== undefined) avatarManager.setScale(config.avatarScale);
    }

    // Populate mic devices
    const devices = await MicCapture.getDevices();
    settingsPanel.populateMicDevices(devices);
  } catch (e) {
    console.warn('Failed to load config:', e);
  }
}

// ─── UI Callbacks ───────────────────────────────────────────────────────────

function setupUICallbacks() {
  // Settings changes
  settingsPanel.onSave(async (config) => {
    const oldPersonality = personalityEngine.personalityType;
    const oldCustomPrompt = personalityEngine.customPrompt;

    personalityEngine.setPersonality(config.personality);
    if (config.customPrompt !== undefined) {
      personalityEngine.setCustomPrompt(config.customPrompt);
    }
    audioPlayer.setVolume(config.volume / 100);
    if (config.avatarScale !== undefined) avatarManager.setScale(config.avatarScale);

    if (window.electronAPI) {
      await window.electronAPI.saveConfig(config);
    }

    // If personality changed, we must reconnect to send the new system prompt to the Live API
    if (geminiSession?.isConnected()) {
      if (oldPersonality !== config.personality || oldCustomPrompt !== config.customPrompt) {
        overlay.showSubtitle('Updating personality...', 2000);
        await reconnectGemini();
      }
    }
  });

  // Model selection
  settingsPanel.onModelSelect(async (filePath) => {
    try {
      overlay.showSubtitle('Loading model...', 0);
      const localUrl = 'local://' + filePath.replace(/\\/g, '/');
      await avatarManager.loadLive2DModel(localUrl);
      overlay.showSubtitle('Model loaded! ✨', 3000);

      // Reconnect Gemini with new model profile if connected
      if (geminiSession?.isConnected()) {
        await reconnectGemini();
      }
    } catch (err) {
      console.error(err);
      let msg = `Failed to load model: ${err.message}`;
      if (err.message.includes('Unknown error') || err.message.includes('moc3')) {
        msg = 'Failed: Cubism 5 models are not supported. Please export for Cubism 4.2 in Live2D Editor.';
      }
      overlay.showSubtitle(msg, 7000);
    }
  });

  // Context menu actions
  overlay.onContextMenuAction((action) => {
    switch (action) {
      case 'settings':
        settingsPanel.toggle();
        break;
      case 'lock':
        overlay.lockModel();
        break;
      case 'screenshot':
        if (screenAnalyzer) screenAnalyzer.requestCapture();
        overlay.showSubtitle('📸 Screen captured!', 2000);
        break;
      case 'logs':
        if (window.electronAPI) window.electronAPI.openLogsFolder();
        break;
      case 'mute':
        if (micCapture.isMuted()) {
          micCapture.unmute();
          overlay.setMicState('on');
        } else {
          micCapture.mute();
          overlay.setMicState('muted');
        }
        break;
      case 'change-model':
        settingsPanel.show();
        break;
      case 'quit':
        if (window.electronAPI) window.electronAPI.quitApp();
        break;
    }
  });

  // Settings gear button in the status bar (primary way to access settings)
  overlay.onSettingsClick(() => {
    settingsPanel.toggle();
  });

  // Mic indicator click
  document.getElementById('mic-indicator')?.addEventListener('click', () => {
    if (micCapture.isMuted()) {
      micCapture.unmute();
      overlay.setMicState('on');
    } else {
      micCapture.mute();
      overlay.setMicState('muted');
    }
  });
}

// ─── Gemini Connection ──────────────────────────────────────────────────────

async function tryAutoConnect() {
  if (!window.electronAPI) return;

  const apiKey = await window.electronAPI.getApiKey();
  if (!apiKey) {
    overlay.setStatus('idle');
    overlay.showSubtitle('Welcome! Open Settings to add your Gemini API key 🔑', 8000);
    return;
  }

  await connectGemini(apiKey);
}

async function connectGemini(apiKey) {
  try {
    overlay.setStatus('idle');
    overlay.showSubtitle('Connecting to Gemini...', 0);

    // Build tools from model profile
    const modelProfile = avatarManager.discoverCapabilities();
    const customActions = proceduralAnimator.getCustomActionNames();
    const tools = generateTools(modelProfile, customActions);
    const systemInstruction = generateSystemInstruction(
      modelProfile,
      personalityEngine.getPersonalityPrompt(),
      personalityEngine.getScreenContext(),
      personalityEngine.getMemories()
    );

    // Create session
    geminiSession = new GeminiLiveSession(apiKey);

    // Wire up callbacks BEFORE connecting
    geminiSession.onAudioResponse((base64Audio) => {
      overlay.setStatus('speaking');
      // Decode base64 to Int16Array
      const binary = atob(base64Audio);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      const int16 = new Int16Array(bytes.buffer);
      audioPlayer.playChunk(int16);
    });

    geminiSession.onToolCall(async ({ name, args, callId }) => {
      let result = { success: true };

      switch (name) {
        case 'set_avatar_emotion':
          avatarManager.triggerExpression(args.emotion);
          result.message = `Expression set to ${args.emotion}`;
          break;

        case 'play_avatar_motion':
          avatarManager.triggerMotion(args.group, args.index || 0);
          result.message = `Playing motion ${args.group}`;
          break;

        case 'animate_avatar':
          proceduralAnimator.playAnimation(args);
          result.message = 'Animation playing';
          break;

        case 'play_custom_action':
          proceduralAnimator.playCustomAction(args.name);
          result.message = `Playing custom action ${args.name}`;
          break;

        case 'take_screenshot':
          if (screenAnalyzer) {
            await screenAnalyzer.requestCapture();
            result.message = 'Screenshot taken and sent';
          }
          break;

        case 'remember_context':
          personalityEngine.addMemory(args.note);
          result.message = `Noted: ${args.note}`;
          break;

        default:
          result = { success: false, message: `Unknown tool: ${name}` };
      }

      geminiSession.sendToolResponse(callId, result);
    });

    geminiSession.onInterrupted(() => {
      audioPlayer.clearQueue();
      overlay.setStatus('listening');
    });

    geminiSession.onTextResponse((text, role) => {
      // Show in the floating chat UI instead of the subtitle overlay
      overlay.appendChatMessage(text, role || 'gemini');
    });

    geminiSession.onError((err) => {
      console.error('Gemini error:', err);
      overlay.setStatus('error');
    });

    geminiSession.onClose(() => {
      overlay.setStatus('idle');
    });

    // Connect
    await geminiSession.connect({
      systemInstruction,
      tools,
    });

    overlay.setStatus('connected');
    overlay.showSubtitle('Connected! Start talking 🎙️', 3000);

    // Start mic capture
    await audioPlayer.resume();
    await micCapture.start();
    overlay.setMicState('on');

    // Stream mic audio to Gemini
    micCapture.onAudioData((pcmChunk) => {
      if (geminiSession?.isConnected()) {
        overlay.setStatus('listening');
        geminiSession.sendAudio(pcmChunk);
      }
    });

    // Start screen analyzer
    screenAnalyzer = new ScreenAnalyzer(geminiSession, personalityEngine);
    screenAnalyzer.startPeriodicCapture();

  } catch (err) {
    console.error('Failed to connect to Gemini:', err);
    overlay.setStatus('error');
    overlay.showSubtitle(`Connection failed: ${err.message}`, 8000);
  }
}

async function reconnectGemini() {
  const apiKey = await window.electronAPI?.getApiKey();
  if (apiKey && geminiSession) {
    geminiSession.disconnect();
    await connectGemini(apiKey);
  }
}

// ─── Lip Sync Loop ──────────────────────────────────────────────────────────

function startLipSyncLoop() {
  // Bind directly for Live2D models so it syncs perfectly before physics
  avatarManager.onLipSync = () => {
    lipSync.update(avatarManager);
  };

  // Fallback ticker for DefaultAvatar when no Live2D model is loaded
  function tick() {
    if (!avatarManager.model) {
      lipSync.update(avatarManager);
    }
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

// ─── Start ──────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', init);
