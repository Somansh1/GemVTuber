---
tags: [project/gem-vtuber]
---
# Home

Hub note for the **gem-vtuber architecture project**: a complete, code-verified map of GemVTuber, the MIT-licensed Electron desktop companion that renders a Live2D avatar on a transparent always-on-top window and drives it entirely from a Gemini Live native-audio session - sub-second voice conversation, function-called expressions and motions, periodic screen awareness, and persistent personality memory. Built under the fable-5 documentation standard: every claim here was read out of source code or repo documents, never invented.

Start with [[Overview]] for the product and why this vault exists, [[Workspace Files]] for what sits on disk, and [[Timeline]] for the commit-by-commit record of the May 2026 build-and-optimize campaign.

The architecture is mapped one domain per note in 02 Architecture Map: [[System Overview]], [[Electron Main Process]], [[Gemini Live Session]], [[Tool Calling]], [[Personality and Memory]], [[Screen Awareness]], [[Audio Pipeline]], [[Avatar Rendering]], [[Lip Sync and Animation]], and [[Overlay UI]].

Reference deliverables sit in 03 Artifacts: [[Roadmap]], [[Test Suite]], and [[Discrepancies]] - the last records every place the README's promises currently diverge from what main-branch code actually does, including the retired AI-composed animation tool. Supporting plumbing lives in 04 Infrastructure: [[Local Development]], [[Build and Packaging]], and [[Data and Storage]].

Tip: press Ctrl+G for Graph View - every edge in this vault is a real wikilink, and coloring groups by folder makes the four clusters pop.