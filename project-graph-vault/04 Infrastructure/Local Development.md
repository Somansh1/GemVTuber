---
tags: [project/gem-vtuber]
---
# Local Development

Prerequisites per README and CONTRIBUTING: Node.js 18+ and a Google AI API key from aistudio.google.com (free tier works). The loop is npm install, then npm start - which runs the prestart build hook before electron . - or npm run dev for --dev mode, where main.js detaches DevTools and mirrors renderer console-message events to the terminal. npm run watch keeps esbuild rebuilding dist/renderer/bundle.js on save; note that preload.js, screenCapture.js, and tray.js are CommonJS loaded directly by Electron, so only the renderer bundle needs building.

First run behavior is deliberately zero-config: with no saved key the avatar appears (default model if models/ contains one, Canvas2D character otherwise), a welcome subtitle points at Settings, and pasting an API key there encrypts it via safeStorage before anything connects; tryAutoConnect fires on every launch once a key exists. Mic access triggers Electron's permission prompt on first use.

Platform notes: development here is Windows (the safeStorage DPAPI path, tray click behavior, and the CSS drag-region comment all assume it), while electron-builder targets exist for mac and linux. One environment quirk surfaced in this workspace: PowerShell's default execution policy blocks the npm.ps1 shim, so scripts must run via cmd or node directly. For headless CLI testing of Electron under Linux, .jules/bolt.md recommends Xvfb with DISPLAY=:99 ([[Timeline]]). Running jest additionally requires installing devDependencies that are absent from this checkout's node_modules ([[Test Suite]]). Back to [[Home]].