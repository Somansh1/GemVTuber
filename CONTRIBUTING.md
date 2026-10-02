# Contributing to GemVTuber

Thanks for your interest in contributing! Here's how to get started.

## 🛠️ Dev Setup

```bash
# Clone
git clone https://github.com/Somansh1/gem-companion-vtuber.git
cd gem-companion-vtuber

# Install dependencies
npm install

# Run in dev mode (opens DevTools)
npm run dev
```

## 📁 Project Structure

```
gem-companion-vtuber/
├── src/
│   ├── main/                    # Electron main process
│   │   ├── main.js              # Window creation, IPC, lifecycle
│   │   ├── preload.js           # Context bridge (renderer ↔ main)
│   │   ├── tray.js              # System tray
│   │   └── screenCapture.js     # Periodic screen capture service
│   └── renderer/                # Electron renderer (the UI)
│       ├── index.html           # Main HTML shell
│       ├── index.js             # Bootstrapper — wires everything together
│       ├── styles/main.css      # All CSS (glassmorphism dark theme)
│       ├── avatar/              # Avatar rendering
│       │   ├── AvatarManager.js # Live2D model management
│       │   ├── LipSync.js       # Audio-driven lip sync
│       │   ├── DefaultAvatar.js # Canvas fallback avatar
│       │   └── ProceduralAnimator.js # Keyframe animation engine
│       ├── audio/               # Audio pipeline
│       │   ├── MicCapture.js    # Mic → 16kHz PCM
│       │   ├── AudioPlayer.js   # PCM → Speaker (gapless)
│       │   └── pcm-processor.js # AudioWorklet
│       ├── gemini/              # Gemini Live API integration
│       │   ├── GeminiLiveSession.js  # WebSocket client
│       │   ├── ToolDefinitions.js    # Dynamic function tools
│       │   ├── PersonalityEngine.js  # Context & personality
│       │   └── ScreenAnalyzer.js     # Screen capture analysis
│       └── ui/                  # UI components
│           ├── SettingsPanel.js
│           └── InteractionOverlay.js
├── models/                      # User's Live2D models go here
├── assets/                      # Icons, sounds
├── package.json
├── README.md
└── CONTRIBUTING.md              # You are here!
```

## 📝 Code Style

- **JavaScript** (ES modules in renderer, CommonJS in main process)
- **JSDoc** comments on all public methods
- Descriptive variable names
- Keep files focused — one class/concern per file
- Handle errors gracefully — never crash the app

## 🔀 Submitting PRs

1. Fork the repo
2. Create a feature branch: `git checkout -b feature/my-feature`
3. Make your changes
4. Test locally with `npm run dev`
5. Commit with a clear message: `feat: add push-to-talk hotkey`
6. Push and open a PR

## 🎯 Areas for Contribution

| Area | Difficulty | Description |
|:---|:---|:---|
| **Default avatars** | 🟢 Easy | Design cute canvas-based fallback characters |
| **VRM support** | 🟡 Medium | Add Three.js + @pixiv/three-vrm rendering path |
| **Hotkeys** | 🟢 Easy | Global hotkey for push-to-talk, show/hide |
| **Game detection** | 🟡 Medium | Detect running games from process list |
| **OBS output** | 🟡 Medium | Virtual camera source for streaming |
| **Docs & guides** | 🟢 Easy | Tutorials, setup guides, model recommendations |
| **Testing** | 🟢 Easy | Test on different Windows versions, GPUs |
| **Localization** | 🟡 Medium | i18n for settings panel |

## ❓ Questions?

Open an issue or start a discussion! We're friendly. 😊
