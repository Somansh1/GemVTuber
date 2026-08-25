---
tags: [project/gem-vtuber]
---
# Discrepancies

Places where repo documents and main-branch code disagree, preserved rather than harmonized. Each item states the evidence; none has been silently fixed in code or docs.

1. **AI-composed animations advertised but removed.** README's feature list, comparison table row ("Custom animations - AI composes them on-the-fly"), how-it-works section, and a checked roadmap box all sell procedural animation, yet generateTools dropped animate_avatar at commit aab5aa9 with an explicit comment that LLM-generated keyframes were unreliable. index.js keeps only a dead dispatch case for it.
2. **Custom actions are unreachable.** The README's custom-actions JSON example claims GemVTuber "auto-discovers these and makes them available to Gemini as callable tools." ProceduralAnimator.loadCustomActions parses such JSON but no code anywhere calls it, so getCustomActionNames() is always empty and play_custom_action is never offered to Gemini. Both animation tools are dormant; ProceduralAnimator survives as dead-but-tested plumbing ([[Lip Sync and Animation]]).
3. **Stale test expectations.** ToolDefinitions.spec.js still asserts animate_avatar appears (even first) in generateTools output, which cannot pass against current code; the suite is red-on-arrival once jest is installed ([[Test Suite]]).
4. **Dead duplicate tool factories.** ToolDefinitions.js carries an entire unused create* family below generateSystemInstruction (enum-constrained emotion/motion tools, animate tool, screenshot/remember factories) that generateTools never references - leftovers of the pre-aab5aa9 design.
5. **update_ui.js is invalid JavaScript.** A two-line stub whose second line assigns a bare HTML comment, sitting in src/renderer and referenced by nothing; harmless to the bundle but guaranteed to break any parser that touches it.
6. **captureScreen bridge method unused.** preload exposes captureScreen and main registers capture-screen serving ScreenCaptureService.captureNow, yet every live capture flows through ScreenAnalyzer's renderer-side getUserMedia path instead ([[Screen Awareness]]) - two parallel capture implementations, one orphaned.
7. **Lock handler placement.** lock-model is handled inside tray.js rather than main's setupIPC, so the IPC table in main.js reads incompletely; functional, just surprising ([[Electron Main Process]]).
8. **Placeholder repository URLs.** package.json and README both point at github.com/user/gem-vtuber while actual origin history shows the Somansh1 account merging PRs #1-#20.
9. **bolt.md dating.** .jules/bolt.md entries carry 2024-05-22 headers inside a repository whose first commit is 2026-05-22 ([[Timeline]]).
10. **Marketing latency claims.** The sub-second voice and comparison-table quality rows are plausible given native-audio architecture but are not statically verifiable from this codebase; treat them as product claims, not audited facts.

Also worth knowing though not a doc/code conflict: models/default ships a 符玄 (Fu Xuan) Live2D model locally while .gitignore excludes models/* entirely, so find-default-model's preferred model exists only on machines where a user supplied it ([[Data and Storage]]). Back to [[Home]].