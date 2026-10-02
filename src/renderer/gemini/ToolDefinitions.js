/**
 * ToolDefinitions — Dynamically generates Gemini function-calling tools
 * based on the loaded model's capabilities.
 */

function getEmotionTool(modelProfile) {
  if (modelProfile.expressions?.length > 0) {
    return {
      name: 'set_avatar_emotion',
      description: 'Changes the avatar facial expression to match your mood.',
      parameters: {
        type: 'OBJECT',
        properties: {
          emotion: {
            type: 'STRING',
            description: 'The semantic emotion to display (e.g. happy, sad, angry, surprised, neutral, blush, smirk)',
          },
        },
        required: ['emotion'],
      },
    };
  }
  return null;
}

function getMotionTool(modelProfile) {
  const motionGroups = Object.keys(modelProfile.motionGroups || {});
  if (motionGroups.length > 0) {
    return {
      name: 'play_avatar_motion',
      description: 'Plays a physical animation/gesture on the avatar.',
      parameters: {
        type: 'OBJECT',
        properties: {
          group: {
            type: 'STRING',
            description: 'The semantic motion to play (e.g. idle, wave, nod, shake, agree, reject)',
          },
          index: {
            type: 'INTEGER',
            description: 'Motion index (0 for random)',
          },
        },
        required: ['group'],
      },
    };
  }
  return null;
}

function getCustomActionTool(customActions) {
  if (customActions.length > 0) {
    return {
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
    };
  }
  return null;
}

function getScreenshotTool() {
  return {
    name: 'take_screenshot',
    description: 'Captures a screenshot of the user\'s screen. Use this when you want to see what the user is doing, when they ask you to look at something, or when you\'re curious about their activity.',
    parameters: {
      type: 'OBJECT',
      properties: {},
    },
  };
}

function getRememberContextTool() {
  return {
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
  };
}

/**
 * Generates Gemini function declaration tools from a model profile.
 * @param {object} modelProfile - From AvatarManager.discoverCapabilities()
 * @param {string[]} [customActions=[]] - Names of custom actions
 * @returns {Array} Array of function declarations for Gemini
 */
export function generateTools(modelProfile, customActions = []) {
  return [
    getEmotionTool(modelProfile),
    getMotionTool(modelProfile),
    getCustomActionTool(customActions),
    getScreenshotTool(),
    getRememberContextTool()
  ].filter(Boolean);
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
