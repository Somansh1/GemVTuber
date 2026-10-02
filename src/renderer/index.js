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
import { ChatApp } from './ui/ChatApp.js';

// ─── Global State ───────────────────────────────────────────────────────────

let avatarManager, defaultAvatar, lipSync, proceduralAnimator;
let micCapture, audioPlayer;
let geminiSession, personalityEngine, screenAnalyzer;
let settingsPanel, overlay, chatApp;
let currentMode = 'live';

// ─── Initialization ─────────────────────────────────────────────────────────

async function init() {
  console.log('🚀 GemVTuber starting...');

  // 1. Initialize UI
  settingsPanel = new SettingsPanel();
  overlay = new InteractionOverlay();
  chatApp = new ChatApp(overlay, () => settingsPanel.getSettings());
  await chatApp.init();

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

  // 10. Auto-resume audio contexts on first user interaction to satisfy Autoplay Policies
  const resumeAudioOnGesture = async () => {
    if (audioPlayer) {
      await audioPlayer.resume();
    }
    if (micCapture && micCapture.audioContext) {
      if (micCapture.audioContext.state === 'suspended') {
        await micCapture.audioContext.resume();
      }
    }
    document.removeEventListener('click', resumeAudioOnGesture);
    document.removeEventListener('keydown', resumeAudioOnGesture);
  };
  document.addEventListener('click', resumeAudioOnGesture);
  document.addEventListener('keydown', resumeAudioOnGesture);

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

      // Update minimize shortcut if it changed
      if (config.minimizeShortcut) {
        window.electronAPI.updateMinimizeShortcut(config.minimizeShortcut);
      }
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
  document.getElementById('settings-open-btn')?.addEventListener('click', () => {
    settingsPanel.show();
  });
  document.getElementById('chat-app-settings-btn')?.addEventListener('click', () => {
    settingsPanel.show();
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

  // Live / Chat Mode Toggle
  const modeLiveBtn = document.getElementById('mode-live-btn');
  const modeChatBtn = document.getElementById('mode-chat-btn');
  const modeActiveBg = document.getElementById('mode-active-bg');

  // Initialize slider width
  setTimeout(() => {
    if (modeActiveBg && modeLiveBtn) {
      modeActiveBg.style.width = `${modeLiveBtn.offsetWidth}px`;
    }
  }, 100);

  modeLiveBtn?.addEventListener('click', async () => {
    if (currentMode === 'live') return;
    currentMode = 'live';
    
    document.body.classList.remove('chat-mode');
    document.getElementById('chat-sessions-pill')?.classList.add('hidden');
    document.getElementById('chat-sessions-panel')?.classList.add('hidden');

    // update button UI
    if (modeActiveBg) {
      modeActiveBg.style.transform = `translateX(0px)`;
      modeActiveBg.style.width = `${modeLiveBtn.offsetWidth}px`;
    }
    modeLiveBtn.className = 'relative z-10 px-4 py-1.5 rounded-full font-label-md text-[13px] transition-colors duration-300 text-primary font-medium';
    modeChatBtn.className = 'relative z-10 px-4 py-1.5 rounded-full font-label-md text-[13px] transition-colors duration-300 text-on-surface-variant hover:text-on-surface';

    // hide chat app
    chatApp.hide();

    // Enable work mode features
    if (micCapture.isMuted()) {
      micCapture.unmute();
      overlay.setMicState('on');
    }
    avatarManager.setEyeFollow(true);

    // Connect Gemini
    await tryAutoConnect();
  });

  modeChatBtn?.addEventListener('click', () => {
    if (currentMode === 'chat') return;
    currentMode = 'chat';

    document.body.classList.add('chat-mode');
    document.getElementById('chat-sessions-pill')?.classList.remove('hidden');

    // update button UI
    if (modeActiveBg) {
      modeActiveBg.style.transform = `translateX(${modeLiveBtn.offsetWidth}px)`;
      modeActiveBg.style.width = `${modeChatBtn.offsetWidth}px`;
    }
    modeChatBtn.className = 'relative z-10 px-4 py-1.5 rounded-full font-label-md text-[13px] transition-colors duration-300 text-primary font-medium';
    modeLiveBtn.className = 'relative z-10 px-4 py-1.5 rounded-full font-label-md text-[13px] transition-colors duration-300 text-on-surface-variant hover:text-on-surface';

    // disconnect Gemini session if connected
    if (geminiSession) {
      geminiSession.disconnect();
    }
    if (screenAnalyzer) {
      screenAnalyzer.stop();
    }
    audioPlayer.clearQueue();
    overlay.setStatus('idle');

    // Disable work mode features
    if (!micCapture.isMuted()) {
      micCapture.mute();
      overlay.setMicState('muted');
    }
    avatarManager.setEyeFollow(false);

    // show chat app
    chatApp.show();
  });

  // Reconnect button
  document.getElementById('reconnect-btn')?.addEventListener('click', async () => {
    if (currentMode === 'live') {
      await reconnectGemini();
    }
  });

  // Chat Sessions UI
  const chatSessionsPanel = document.getElementById('chat-sessions-panel');
  const chatSessionsList = document.getElementById('chat-sessions-list');
  
  document.getElementById('chat-session-new-btn')?.addEventListener('click', () => {
    chatApp.createNewSession();
    renderChatSessions();
  });
  
  document.getElementById('chat-session-list-btn')?.addEventListener('click', () => {
    chatSessionsPanel?.classList.toggle('hidden');
    if (!chatSessionsPanel?.classList.contains('hidden')) {
      renderChatSessions();
    }
  });

  document.getElementById('chat-sessions-close')?.addEventListener('click', () => {
    chatSessionsPanel?.classList.add('hidden');
  });

  document.getElementById('chat-minimize-btn')?.addEventListener('click', () => {
    if (window.electronAPI) {
      window.electronAPI.minimizeWindow();
    }
  });

  window.addEventListener('chat-sessions-updated', () => {
    if (!chatSessionsPanel?.classList.contains('hidden')) {
      renderChatSessions();
    }
  });

  async function renderChatSessions() {
    if (!window.electronAPI || !chatSessionsList) return;
    const sessions = await window.electronAPI.getChatSessions();
    chatSessionsList.innerHTML = '';
    
    if (sessions.length === 0) {
      chatSessionsList.innerHTML = '<div class="text-on-surface-variant text-[12px] p-2 text-center">No sessions found</div>';
      return;
    }

    sessions.forEach(session => {
      const btn = document.createElement('button');
      btn.className = `w-full text-left p-3 rounded-lg transition-colors flex flex-col gap-1 ${
        session.id === chatApp.currentSessionId 
          ? 'bg-primary-container text-on-primary-container' 
          : 'hover:bg-surface-variant text-on-surface'
      }`;
      
      const title = document.createElement('div');
      title.className = 'font-body-md text-[13px] truncate font-medium';
      title.textContent = session.title || 'New Chat';
      
      const date = document.createElement('div');
      date.className = 'font-label-sm text-[10px] opacity-70';
      date.textContent = new Date(session.updatedAt).toLocaleString();
      
      btn.appendChild(title);
      btn.appendChild(date);
      
      btn.addEventListener('click', async () => {
        await chatApp.loadSession(session.id);
        renderChatSessions();
      });
      
      chatSessionsList.appendChild(btn);
    });
  }

  // Push-to-Talk hotkeys
  setupPTTHotkey();
}

// ─── Push-to-Talk ───────────────────────────────────────────────────────────

function setupPTTHotkey() {
  if (!window.electronAPI?.onPTTKeyDown) return;

  // Track the mic state before a PTT hold so we can restore it on release
  let prePTTMuted = false;

  // ── Ctrl+` : Hold to talk ─────────────────────────────────────────────
  window.electronAPI.onPTTKeyDown(() => {
    prePTTMuted = micCapture.isMuted();
    if (prePTTMuted) {
      micCapture.unmute();
      overlay.setMicState('on');
    }
  });

  window.electronAPI.onPTTKeyUp(() => {
    // Release → restore previous mute state
    if (prePTTMuted) {
      micCapture.mute();
      overlay.setMicState('muted');
    }
  });

  // ── Ctrl+Space : Toggle mic on/off ────────────────────────────────────
  if (window.electronAPI.onPTTToggle) {
    window.electronAPI.onPTTToggle(() => {
      if (micCapture.isMuted()) {
        micCapture.unmute();
        overlay.setMicState('on');
        overlay.showSubtitle('🎙️ Mic on', 1500);
      } else {
        micCapture.mute();
        overlay.setMicState('muted');
        overlay.showSubtitle('🔇 Mic muted', 1500);
      }
    });
  }
}

// ─── Gemini Connection ──────────────────────────────────────────────────────

async function tryAutoConnect() {
  if (currentMode !== 'live') return;
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

    if (currentMode !== 'live') {
      geminiSession.disconnect();
      return;
    }

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
  if (currentMode !== 'live') return;
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
