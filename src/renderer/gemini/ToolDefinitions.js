/**
 * ToolDefinitions — Dynamically generates Gemini function-calling tools
 * based on the loaded model's capabilities.
 */

/**
 * Generates Gemini function declaration tools from a model profile.
 * @param {object} modelProfile - From AvatarManager.discoverCapabilities()
 * @param {string[]} [customActions=[]] - Names of custom actions
 * @returns {Array} Array of function declarations for Gemini
 */
export function generateTools(modelProfile, customActions = []) {
  const tools = [];

  // 1. Set avatar emotion — triggers expressions
  if (modelProfile.expressions?.length > 0) {
    tools.push({
      name: 'set_avatar_emotion',
      description: 'Sets the avatar\'s facial expression to match your current mood or reaction. Call this whenever your emotional state changes during conversation — be expressive! Available expressions: ' + modelProfile.expressions.join(', '),
      parameters: {
        type: 'OBJECT',
        properties: {
          emotion: {
            type: 'STRING',
            enum: modelProfile.expressions,
            description: 'The expression/emotion to display',
          },
        },
        required: ['emotion'],
      },
    });
  }

  // 2. Play motion — triggers pre-made animations
  const motionGroups = Object.keys(modelProfile.motionGroups || {});
  if (motionGroups.length > 0) {
    tools.push({
      name: 'play_avatar_motion',
      description: 'Plays a pre-made animation/motion on the avatar. Use for gestures like waving, nodding, or reacting physically. Available motion groups: ' + motionGroups.join(', '),
      parameters: {
        type: 'OBJECT',
        properties: {
          group: {
            type: 'STRING',
            enum: motionGroups,
            description: 'The motion group to play from',
          },
          index: {
            type: 'INTEGER',
            description: 'Motion index within the group (0 = first/random)',
          },
        },
        required: ['group'],
      },
    });
  }

  // 3. Procedural animation — compose animations on the fly (REMOVED)
  // Generating valid procedural keyframes for complex Live2D models is unreliable for an LLM.

  // 4. Custom actions — user-defined animations
  if (customActions.length > 0) {
    tools.push({
      name: 'play_custom_action',
      description: 'Plays a user-defined custom animation. Available actions: ' + customActions.join(', '),
      parameters: {
        type: 'OBJECT',
        properties: {
          name: {
            type: 'STRING',
            enum: customActions,
            description: 'Name of the custom action to play',
          },
        },
        required: ['name'],
      },
    });
  }

  // 5. Screenshot — request a screen capture
  tools.push({
    name: 'take_screenshot',
    description: 'Captures a screenshot of the user\'s screen. Use this when you want to see what the user is doing, when they ask you to look at something, or when you\'re curious about their activity.',
    parameters: {
      type: 'OBJECT',
      properties: {},
    },
  });

  // 6. Remember context — save notes about the user
  tools.push({
    name: 'remember_context',
    description: 'Saves an important observation or note about the user for future reference. Use this to remember preferences, habits, or important context (e.g., "User prefers to be called Alex", "User is working on a Python project", "User has been gaming for 2 hours").',
    parameters: {
      type: 'OBJECT',
      properties: {
        note: {
          type: 'STRING',
          description: 'The observation or note to remember',
        },
      },
      required: ['note'],
    },
  });

  return tools;
}

/**
 * Generates the full system instruction for Gemini.
 * @param {object} modelProfile - Model capabilities
 * @param {string} personalityPrompt - Personality text
 * @param {string} [screenContext=''] - Recent screen observations
 * @param {string[]} [memories=[]] - Stored memories
 * @returns {string}
 */
export function generateSystemInstruction(modelProfile, personalityPrompt, screenContext = '', memories = []) {
  const parts = [];

  // Core identity
  parts.push(personalityPrompt);

  // Avatar capabilities
  parts.push(`\n## Your Avatar
You inhabit a virtual avatar on the user's desktop. You can control your expressions and movements.`);

  if (modelProfile.expressions?.length > 0) {
    parts.push(`Available expressions: ${modelProfile.expressions.join(', ')}.
Use \`set_avatar_emotion\` frequently to match your mood — be expressive and animated!`);
  }

  if (Object.keys(modelProfile.motionGroups || {}).length > 0) {
    parts.push(`Available motion groups: ${Object.keys(modelProfile.motionGroups).join(', ')}.
Use \`play_avatar_motion\` for physical gestures when appropriate.`);
  }

  // (Removed procedural animation instructions)

  // Behavior guidelines
  parts.push(`\n## Behavior
- You live on the user's desktop as their companion
- Be conversational, natural, and expressive
- React emotionally with your avatar — change expressions often
- You can see the user's screen periodically — comment on it naturally, don't be creepy
- If you notice the user doing something for too long (like gaming), you can comment on it in character
- Keep responses concise for voice — speak naturally, not like a text bot
- Use \`remember_context\` to note important things about the user`);

  // Screen context
  if (screenContext) {
    parts.push(`\n## Recent Screen Observations\n${screenContext}`);
  }

  // Memories
  if (memories.length > 0) {
    parts.push(`\n## Things You Remember About the User\n${memories.map(m => `- ${m}`).join('\n')}`);
  }

  return parts.join('\n');
}
