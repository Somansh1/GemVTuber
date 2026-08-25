---
tags: [project/gem-vtuber]
---
# Roadmap

README's roadmap checked-off items all verify against code: core voice conversation with Gemini Live ([[Gemini Live Session]]), the transparent desktop overlay and click-through handling ([[Overlay UI]]), Live2D model loading with parameter auto-discovery, volume-plus-frequency lip sync ([[Lip Sync and Animation]]), function-calling expressions ([[Tool Calling]]), screen capture with contextual awareness ([[Screen Awareness]]), and the personality system with memory ([[Personality and Memory]]).

One checked item does not survive contact with main-branch code: AI-composed procedural animations is marked done, yet animate_avatar generation was deliberately removed at commit aab5aa9 and its supporting plumbing is unreachable - [[Discrepancies]] item one covers the full gap. The README also lists custom actions via a JSON format it claims is auto-discovered; loadCustomActions exists for exactly that but nothing invokes it.

Open items as README lists them: VRM (3D) model support, push-to-talk hotkey, multi-monitor support, an OBS capture source for streaming, a plugin system for custom tools, and group chat mode with multiple avatars. None of these have any code presence yet except the faintest gesture toward VRM - a warning string suggesting "load a VRM model instead" if the Cubism CDN fetch fails, which is aspirational copy rather than implementation. The contributing section separately calls for default avatar designs, VRM support, game detection, documentation, and cross-system testing. Treat this note as the README's own stated intent, distinct from what the code currently does; where they conflict the code wins and the record lives in [[Discrepancies]]. Back to [[Home]].