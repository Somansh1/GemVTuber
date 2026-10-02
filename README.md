# GemVTuber

An Electron desktop companion. A transparent, frameless, always-on-top window shows a Live2D avatar. You talk to it through a microphone; speech goes to Google's Gemini Live API over a WebSocket, and the avatar speaks back, changes expression, plays motions and lip-syncs to the returned audio.

Status: early (v0.1.0). Only Windows has been built and run, as far as this repository shows.

## What works today

- Real-time voice conversation with Gemini Live (mic audio out as 16 kHz PCM, audio back as 24 kHz PCM).
- Live2D avatar rendered with PixiJS. Expressions and motion groups are read from the loaded `.model3.json`.
- Gemini can set the avatar's expression (`set_avatar_emotion`) and play motions (`play_avatar_motion`) through function calling.
- Lip sync from audio analysis (volume plus frequency bands through an `AnalyserNode`).
- Eyes follow the mouse cursor across the whole desktop. This is cursor following, not webcam face tracking.
- Periodic screen capture (default every 7 minutes, configurable, can be turned off) so the model can comment on what you are doing. Gemini can also request a screenshot (`take_screenshot`).
- Personalities: caring, playful, sarcastic, strict, chill, or a custom prompt. Gemini can store notes about you (`remember_context`).
- Global hotkeys: hold Ctrl+` for push-to-talk, Ctrl+Space to toggle the mic, Ctrl+M (configurable in Settings) to minimize or restore. macOS would use Cmd, but macOS is untested.
- A second "chat mode": text chat against an OpenAI-compatible `/chat/completions` endpoint, with saved sessions (see limitations).
- A fallback procedural avatar if no Live2D model can be loaded.
- Tray icon, and click-through over empty areas of the window.

## Requirements

- Windows 10/11 (the only tested platform).
- Node.js 18 or newer and npm.
- A Gemini API key from [Google AI Studio](https://aistudio.google.com/apikey).
- Internet access at runtime. The renderer loads the Live2D Cubism Core from `cubism.live2d.com`, Tailwind from `cdn.tailwindcss.com`, and Google Fonts. It does not work offline.
- A microphone.

## Setup

```bash
git clone https://github.com/Somansh1/gem-companion-vtuber.git
cd gem-companion-vtuber
npm install
npm start
```

`npm start` builds the renderer bundle first, then launches Electron. Open Settings and paste your Gemini API key.

### Where the API key is stored

In `config.json` inside Electron's per-user data directory (on Windows `%APPDATA%\gem-vtuber`), never inside the repository. When the OS supports Electron's `safeStorage`, the key is encrypted (fields `encryptedApiKey`, `encryptedChatApiKey`). When it does not, the main process falls back to storing the key as plain text in the same file. Chat sessions and logs (chat log, screenshot log) are in the same directory.

The Gemini Live API takes the key as a `key=` query parameter on the WebSocket URL, so the key is part of that URL inside the app.

The app reads no environment variables, so there is no `.env` file.

### Models

The repository tracks one Live2D model in `models/default/`, which the app looks for at startup. Use Settings, then Load Model, to pick a different `.model3.json`. Check the licence of any model you use; see "Licences" below.

## Run and build

| Command | What it does |
|:---|:---|
| `npm start` | Bundle the renderer with esbuild, then run Electron |
| `npm run dev` | Same, with `--dev` |
| `npm run watch` | Rebuild the renderer bundle on change |
| `npm run build` | Renderer bundle only (`dist/renderer/bundle.js`) |
| `npm test` | Jest unit tests (`src/**/*.spec.js`) |
| `npm run package` | Windows installer and portable exe via electron-builder, into `release/` |

`package:mac` and `package:linux` exist but have never been run. There is no `.ico` or `.icns` icon in the repo (only `assets/icons/icon.png`), so `electron-builder.yml` no longer references them and installers use electron-builder's default icon. The packaging config was edited without a test build.

## Architecture

**Main process** (`src/main/`)
- `main.js` creates the transparent window, handles IPC, reads and writes `config.json`, stores chat sessions, registers global shortcuts, and registers a `local://` protocol for loading model files from disk. It polls `screen.getCursorScreenPoint()` every 16 ms and sends the position to the renderer as `global-mouse-move`; this is what drives eye follow.
- `preload.js` exposes a fixed `window.electronAPI` through `contextBridge` (context isolation on, node integration off). Main-to-renderer events include `global-mouse-move`, `ptt-key-down`, `ptt-key-up`, `ptt-toggle`, `minimize-toggle`.
- `screenCapture.js` takes screenshots on a timer; `tray.js` builds the tray menu.

**Renderer** (`src/renderer/`, bundled by esbuild into one IIFE)
- `index.js` wires everything together.
- `gemini/GeminiLiveSession.js` is the WebSocket client for the Gemini Live `BidiGenerateContent` endpoint. It sends setup (system instruction, tool declarations, audio response modality, voice), streams mic audio, and handles audio chunks, interruptions, transcripts and tool calls.
- `audio/` has mic capture (an AudioWorklet producing 16 kHz PCM) and the playback queue for 24 kHz PCM.
- `avatar/AvatarManager.js` loads the Live2D model, discovers its parameters, expressions and motion groups, and applies eye follow. `LipSync.js` maps analyser volume and frequency data to mouth parameters each frame. `DefaultAvatar.js` is the fallback.
- `gemini/ToolDefinitions.js` builds the function declarations and system instruction from the loaded model's capabilities. When Gemini returns a tool call, `index.js` runs it (expression, motion, screenshot, remember) and sends a tool response back.
- `gemini/PersonalityEngine.js`, `gemini/ScreenAnalyzer.js` and `ui/` cover personality and memory, screen capture requests, and the interface.

Data flow: mic, then `GeminiLiveSession`, then Gemini. Audio and tool calls come back; audio goes to the player and the analyser (lip sync); tool calls change the avatar.

## Known limitations

- Windows only in practice. Other platforms are untested.
- Needs a network connection for Gemini, the Cubism Core script, Tailwind and fonts.
- Live2D only. There is no VRM or other 3D model support.
- Eye tracking is cursor following. There is no webcam or face tracking.
- Chat mode: the Content-Security-Policy in `src/renderer/index.html` only allows connections to Gemini and `integrate.api.nvidia.com`. The default base URL in the code is OpenRouter, which that policy would block, so other endpoints need the policy edited. This comes from reading the code; it was not run.
- The Gemini model name is hard-coded in `GeminiLiveSession.js` (a native-audio preview model) and may be changed or retired by Google.
- Where `safeStorage` is unavailable, the API key is stored as plain text in `config.json`.
- Test coverage is small: two unit-test files (tool definitions, personality engine).

## Planned / not working yet

- AI-composed animations. The keyframe engine (`ProceduralAnimator.js`) exists, but the `animate_avatar` tool is deliberately not offered to Gemini, so it never runs.
- Custom actions from a `custom-actions.json`. `ProceduralAnimator.loadCustomActions()` is never called, so no custom actions are loaded and `play_custom_action` is never offered.
- VRM (3D model) support.
- Multi-monitor support, OBS capture source, plugin system, group chat.

## Licences

The project code is MIT, see [LICENSE](LICENSE). Third-party assets are not covered by it:

- `models/default/` is a fan-made Live2D model of a miHoYo character. Its bundled readme (Chinese) says the copyright belongs to miHoYo, redistribution is forbidden, and use for monetised live streaming is forbidden. Check whether you may redistribute it before reusing this repository's copy.
- The Live2D Cubism Core is not bundled; it is loaded from Live2D's CDN at runtime and is subject to [Live2D's licence](https://www.live2d.com/en/sdk/license/). Models you load have their own terms.
- `assets/icons/` images have no recorded source or licence.

See [CONTRIBUTING.md](CONTRIBUTING.md) for how to contribute.
