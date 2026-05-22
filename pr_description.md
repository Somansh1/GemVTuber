🎯 **What:**
Extracted the large inline tool array definitions inside `generateTools` into separate helper functions (`createEmotionTool`, `createMotionTool`, `createAnimateTool`, `createCustomActionTool`, `createScreenshotTool`, and `createRememberContextTool`).

💡 **Why:**
The previous implementation defined multiple large objects inline, making the `generateTools` function unnecessarily long and difficult to read. Extracting these configurations into well-named helper functions dramatically reduces the cognitive load required to understand the logic and makes the codebase easier to maintain.

✅ **Verification:**
Verified that the existing Jest tests pass (`npm test`). Started the application headlessly utilizing Xvfb to ensure `generateTools` modifications didn't introduce unexpected crashes. Validated via `cat` that there were no syntax errors.

✨ **Result:**
The `generateTools` function is now much cleaner, solely containing conditional logic for invoking these helper methods. The refactoring improved maintainability while preserving the original functionality entirely.
