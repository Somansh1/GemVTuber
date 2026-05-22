
## Performance Optimization: ProceduralAnimator.js

**Date:** 2024-05-22
**File:** `src/renderer/avatar/ProceduralAnimator.js`

**Learning:**
In the `_runKeyframes` method, an animation loop driven by `requestAnimationFrame` repeatedly instantiated `Set` objects and called `Object.keys()` to determine which parameters to interpolate. This caused unnecessary garbage collection pressure and CPU overhead on every tick.

**Edge Cases / Considerations:**
*   **Segment Parameter Calculation:** Keyframes are an array of objects. The interpolation only happens between the *before* and *after* keyframes corresponding to the current time. We must precompute the parameters for *every segment* (adjacent pairs of keyframes) rather than one single set for all keyframes to perfectly match the original behavior and avoid unnecessary interpolations.
*   **Fallback Case:** If the `easedProgress` doesn't fall between any segments (e.g. edge cases where progress is completely out of bounds, though unlikely due to `Math.min`), the code falls back to interpolating between the first and last keyframe. The precomputed parameters must also cover this fallback case.
*   **Array over Set:** The precomputed sets were converted to Arrays via `Array.from()` to further optimize the iteration speed within the `for...of` loop during the animation tick.
